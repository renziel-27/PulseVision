import json
import uuid
import csv
import io
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.trial import Trial
from app.models.user import User
from app.security.auth import get_optional_user, get_current_user
from app.schemas.trial import TrialCreateRequest, TrialCompleteRequest, TrialOut, TrialDetailOut
from app.signal_processing import run_multi_algorithm_consensus, estimate_respiratory_rate

router = APIRouter(prefix="/trials", tags=["Trials Management"])

@router.post("/create", response_model=TrialOut)
def create_trial(
    payload: TrialCreateRequest,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user)
):
    """
    Initializes a new empirical trial record.
    Always generates a unique UUID-based trial UID to avoid duplicate-key collisions.
    """
    user_id = user.id if user else (payload.user_id or 1)
    base_uid = payload.trial_uid or f"PV-TR-{uuid.uuid4().hex[:8].upper()}"
    trial_uid = base_uid
    existing = db.query(Trial).filter(Trial.trial_uid == trial_uid).first()
    if existing:
        trial_uid = f"PV-TR-{uuid.uuid4().hex[:8].upper()}"

    trial = Trial(
        trial_uid=trial_uid,
        user_id=user_id,
        trial_name=payload.trial_name or "60s rPPG Trial",
        participant_code=payload.participant_code or "P01",
        condition=payload.condition or "Resting Baseline",
        lighting_condition=payload.lighting_condition or "Normal Indoor (300-500 lux)",
        movement_condition=payload.movement_condition or "Stationary",
        requested_duration_sec=payload.requested_duration_sec,
        status="READY",
        reference_source=payload.reference_source or "Finger Pulse Oximeter",
        reference_bpm=payload.reference_bpm,
        reference_systolic_bp=payload.reference_systolic_bp,
        reference_diastolic_bp=payload.reference_diastolic_bp,
        notes=payload.notes,
        created_at=datetime.utcnow()
    )
    try:
        db.add(trial)
        db.commit()
        db.refresh(trial)
    except Exception:
        db.rollback()
        # Retry with a completely fresh UID
        trial.trial_uid = f"PV-TR-{uuid.uuid4().hex[:10].upper()}"
        db.add(trial)
        db.commit()
        db.refresh(trial)
    return TrialOut.model_validate(trial)

@router.post("/{trial_id}/start", response_model=TrialOut)
def start_trial(trial_id: int, db: Session = Depends(get_db)):
    trial = db.query(Trial).filter(Trial.id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    
    trial.status = "RUNNING"
    trial.started_at = datetime.utcnow()
    db.commit()
    db.refresh(trial)
    return TrialOut.model_validate(trial)

@router.post("/{trial_id}/cancel", response_model=TrialOut)
def cancel_trial(trial_id: int, db: Session = Depends(get_db)):
    trial = db.query(Trial).filter(Trial.id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")

    trial.status = "CANCELLED"
    trial.completed_at = datetime.utcnow()
    trial.rejection_reason = "Trial was cancelled early by user before completing the required 60-second window."
    trial.final_bpm = None
    trial.consensus_status = "CANCELLED"
    db.commit()
    db.refresh(trial)
    return TrialOut.model_validate(trial)

@router.post("/{trial_id}/complete", response_model=TrialDetailOut)
def complete_trial(trial_id: int, payload: TrialCompleteRequest, db: Session = Depends(get_db)):
    trial = db.query(Trial).filter(Trial.id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")

    dur = payload.duration_seconds if payload.duration_seconds is not None else payload.actual_duration_sec
    trial.completed_at = datetime.utcnow()
    trial.actual_duration_sec = dur
    trial.total_frames = payload.total_frames
    trial.usable_frames = payload.usable_frames

    # Measurement Duration Guard (Minimum 10s continuous window):
    if dur < 10.0:
        trial.status = "REJECTED"
        trial.consensus_status = "REJECTED"
        trial.rejection_reason = f"Insufficient scan duration ({dur:.1f}s < 10s requirement). Complete at least 10 seconds of scanning."
        trial.final_bpm = None
        db.commit()
        raise HTTPException(
            status_code=400,
            detail=f"Scan incomplete — minimum 10 seconds of continuous data required (received {dur:.1f}s)."
        )

    raw_bpm = payload.final_bpm if payload.final_bpm is not None else payload.consensus_bpm
    rgb_history = payload.rgb_history or []
    total_frames = payload.total_frames
    usable_frames = payload.usable_frames

    # If client did not provide calculated consensus BPM and dur < 40s, enforce standard requirement
    if dur < 40.0 and raw_bpm is None:
        trial.status = "REJECTED"
        trial.consensus_status = "REJECTED"
        trial.rejection_reason = f"Insufficient scan duration ({dur:.1f}s < 45s requirement). Complete the automatic scan to produce valid physiological results."
        trial.final_bpm = None
        db.commit()
        raise HTTPException(
            status_code=400,
            detail=f"Scan incomplete — minimum 60 seconds of continuous data required (received {dur:.1f}s)."
        )

    # Frame and sample validation: total and usable frames must be positive
    if total_frames <= 0 or usable_frames <= 0:
        trial.status = "REJECTED"
        trial.consensus_status = "REJECTED"
        trial.rejection_reason = "Invalid frame count: total and usable frames must be greater than zero."
        trial.final_bpm = None
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Invalid frame count: total and usable frames must be greater than zero."
        )

    # Sufficient rgb_history/sample count validation (minimum 45 frames)
    if len(rgb_history) < 45:
        trial.status = "REJECTED"
        trial.consensus_status = "REJECTED"
        trial.rejection_reason = f"Insufficient facial skin frame buffer ({len(rgb_history)} frames) for multi-algorithm analysis. Ensure face is centered and lit during the scan."
        trial.final_bpm = None
        db.commit()
        db.refresh(trial)
        res = TrialDetailOut.model_validate(trial)
        res.algorithm_results = {}
        return res

    # Client-supplied consensus BPM from /api/estimate-ensemble
    if raw_bpm is not None:
        # Validate that final_bpm is numeric
        try:
            bpm_val = float(raw_bpm)
        except (ValueError, TypeError):
            trial.status = "REJECTED"
            trial.consensus_status = "REJECTED"
            trial.rejection_reason = "Non-numeric heart rate value provided."
            trial.final_bpm = None
            db.commit()
            raise HTTPException(status_code=422, detail="Non-numeric heart rate value provided.")

        # Validate that final_bpm is within physiological range (30-240 BPM)
        if bpm_val < 30.0 or bpm_val > 240.0:
            trial.status = "REJECTED"
            trial.consensus_status = "REJECTED"
            trial.rejection_reason = f"Calculated heart rate ({bpm_val:.1f} BPM) is outside physiological range (30–240 BPM)."
            trial.final_bpm = None
            db.commit()
            raise HTTPException(
                status_code=422,
                detail=f"Calculated heart rate ({bpm_val:.1f} BPM) is outside physiological range (30–240 BPM)."
            )

        trial.final_bpm = round(bpm_val, 1)
        # Store real measurement quality or None (do not invent default values like 0.85 or 88.0)
        trial.final_sqi = float(payload.final_sqi) if payload.final_sqi is not None else None
        trial.final_confidence = float(payload.final_confidence) if payload.final_confidence is not None else None
        trial.contributing_algorithms = str(payload.contributing_algorithms) if payload.contributing_algorithms else None
        trial.consensus_status = payload.consensus_status or "ACCEPTED"
        trial.rejection_reason = ""
        if payload.algorithm_results:
            trial.algorithm_results_json = json.dumps(payload.algorithm_results)
        else:
            trial.algorithm_results_json = None
        trial.status = "COMPLETED" if trial.consensus_status == "ACCEPTED" else "REJECTED"

        consensus_res = {
            "consensus_bpm": trial.final_bpm,
            "average_sqi": trial.final_sqi or 0.0,
            "consensus_confidence": trial.final_confidence or 0.0,
            "contributing_algorithms": [s.strip() for s in trial.contributing_algorithms.split(",")] if trial.contributing_algorithms else [],
            "consensus_status": trial.consensus_status,
            "rejection_reason": "",
            "algorithms": payload.algorithm_results or {},
            "spread_bpm": 0.0
        }
    else:
        # Fallback: compute multi-algorithm consensus directly on backend
        effective_fs = max(5.0, min(60.0, float(len(rgb_history)) / max(1.0, dur)))
        consensus_res = run_multi_algorithm_consensus(
            rgb_series=rgb_history,
            fs=effective_fs,
            requested_duration_sec=trial.requested_duration_sec
        )

        trial.final_bpm = consensus_res["consensus_bpm"] if consensus_res["consensus_status"] == "ACCEPTED" else None
        trial.final_sqi = consensus_res["average_sqi"]
        trial.final_confidence = consensus_res["consensus_confidence"]
        trial.contributing_algorithms = ", ".join(consensus_res["contributing_algorithms"])
        trial.consensus_status = consensus_res["consensus_status"]
        trial.rejection_reason = consensus_res["rejection_reason"]
        trial.algorithm_results_json = json.dumps(consensus_res["algorithms"])
        trial.status = "COMPLETED" if consensus_res["consensus_status"] == "ACCEPTED" else "REJECTED"

    # Compute Visual Respiratory Rate if motion data provided
    motion_series = payload.motion_history or []
    if len(motion_series) >= 60:
        motion_fs = max(5.0, min(60.0, float(len(motion_series)) / max(1.0, dur)))
        resp_res = estimate_respiratory_rate(motion_series, fs=motion_fs)
        trial.breathing_rate_brpm = resp_res["brpm"] if resp_res["is_valid"] else None
        trial.breathing_status = resp_res["status"]

    # Ingest Facial & Eye Indicators if present
    fi = payload.facial_indicators
    if isinstance(fi, dict):
        trial.avg_ear = fi.get("ear", 0.28)
        trial.blink_count = fi.get("blink_count", 0)
        trial.eye_closure_sec = fi.get("eye_closure_sec", 0.0)
        trial.estimated_expression = fi.get("estimated_expression", "Neutral")
        trial.stress_level = fi.get("stress_level", "Low (Relaxed)")
        trial.fatigue_level = fi.get("fatigue_level", "Normal")
        trial.eye_redness_status = fi.get("eye_redness_indicator", "Normal")
    elif isinstance(fi, list) and len(fi) > 0:
        from collections import Counter
        counts = Counter(fi)
        trial.estimated_expression = counts.most_common(1)[0][0]

    # Ingest Reference Measurements & Absolute Error
    ref_bpm = payload.reference_bpm or trial.reference_bpm
    if ref_bpm:
        trial.reference_bpm = ref_bpm
        if trial.final_bpm:
            trial.absolute_error_bpm = round(abs(trial.final_bpm - ref_bpm), 2)

    if payload.reference_systolic_bp:
        trial.reference_systolic_bp = payload.reference_systolic_bp
    if payload.reference_diastolic_bp:
        trial.reference_diastolic_bp = payload.reference_diastolic_bp

    db.commit()
    res = TrialDetailOut.model_validate(trial)
    res.consensus_bpm = trial.final_bpm
    res.spread_bpm = consensus_res.get("spread_bpm", 0.0)
    res.contributing_algorithms = consensus_res.get("contributing_algorithms", [])
    res.multi_algorithm_bpm = consensus_res.get("algorithms", {})
    res.algorithm_results = consensus_res.get("algorithms", {})
    return res

@router.get("", response_model=List[TrialOut])
def list_trials(
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user)
):
    """Retrieves all empirical trials belonging to the active user (or all trials for research demo)."""
    user_id = user.id if user else 1
    # Return user's trials, newest first
    trials = db.query(Trial).filter(
        (Trial.user_id == user_id) | (Trial.user_id == 1)
    ).order_by(Trial.created_at.desc()).limit(100).all()
    return [TrialOut.model_validate(t) for t in trials]

@router.get("/export-csv", response_class=Response)
def export_trials_csv(db: Session = Depends(get_db)):
    """Exports all recorded trials and multi-algorithm consensus benchmarks to CSV."""
    trials = db.query(Trial).order_by(Trial.created_at.desc()).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Trial UID", "Trial Label", "Participant", "Status",
        "Requested Duration (s)", "Actual Duration (s)", "Total Frames", "Usable Frames",
        "Consensus BPM", "Consensus Status", "Contributing Algorithms",
        "Signal Quality (SQI)", "Breathing Rate (BrPM)", "Blink Count",
        "Estimated Expression", "Reference Source", "Reference BPM",
        "Reference Systolic BP (mmHg)", "Reference Diastolic BP (mmHg)",
        "Absolute Error (BPM)", "Created At"
    ])

    for t in trials:
        writer.writerow([
            t.trial_uid, t.trial_name, t.participant_code, t.status,
            t.requested_duration_sec, t.actual_duration_sec, t.total_frames, t.usable_frames,
            t.final_bpm if t.final_bpm else "N/A", t.consensus_status, t.contributing_algorithms,
            f"{t.final_sqi:.2f}" if t.final_sqi else "0.0",
            t.breathing_rate_brpm if t.breathing_rate_brpm else "N/A",
            t.blink_count, t.estimated_expression,
            t.reference_source, t.reference_bpm if t.reference_bpm else "N/A",
            t.reference_systolic_bp if t.reference_systolic_bp else "N/A",
            t.reference_diastolic_bp if t.reference_diastolic_bp else "N/A",
            t.absolute_error_bpm if t.absolute_error_bpm is not None else "N/A",
            t.created_at.isoformat() if t.created_at else ""
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=PulseVision_Trials_Report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"}
    )

@router.get("/{trial_id}", response_model=TrialDetailOut)
def get_trial_detail(trial_id: int, db: Session = Depends(get_db)):
    trial = db.query(Trial).filter(Trial.id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=404, detail="Trial not found")
    
    res = TrialDetailOut.model_validate(trial)
    try:
        res.algorithm_results = json.loads(trial.algorithm_results_json) if trial.algorithm_results_json else {}
    except Exception:
        res.algorithm_results = {}
    return res
