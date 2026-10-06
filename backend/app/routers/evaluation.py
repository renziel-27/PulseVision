import io
import csv
import numpy as np
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.scan import Scan
from app.models.reference import ReferenceMeasurement
from app.schemas.evaluation import (
    ReferenceCreate,
    ValidationTrialOut,
    ValidationTrialUpdate,
    ValidationStatsOut,
    BulkDeleteRequest,
    BulkUpdateRequest
)
from app.security.auth import get_optional_user

router = APIRouter(tags=["Smartwatch Heart-Rate Validation & Benchmark"])

@router.post("/scans/{scan_id}/reference", response_model=ValidationTrialOut)
@router.post("/validation/trial", response_model=ValidationTrialOut)
@router.post("/evaluation/record-trial", response_model=ValidationTrialOut)
def record_validation_trial(
    payload: ReferenceCreate,
    scan_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    sw_bpm = payload.smartwatch_bpm if payload.smartwatch_bpm is not None else payload.reference_bpm
    if sw_bpm is None:
        raise HTTPException(status_code=422, detail="Smartwatch BPM is required and must be between 30 and 240.")

    if payload.pulsevision_bpm is None or payload.pulsevision_bpm <= 0:
        raise HTTPException(status_code=422, detail="PulseVision BPM must be a valid positive heart-rate value.")

    abs_err = round(abs(float(sw_bpm) - float(payload.pulsevision_bpm)), 2)
    target_scan_id = scan_id or payload.scan_id

    # Auto-generate unique Trial Code (e.g. T001, T002...) if not provided
    trial_code = payload.trial_code
    if not trial_code or trial_code == "Validation Trial":
        count = db.query(ReferenceMeasurement).count()
        trial_code = f"T{count + 1:03d}"

    # Determine validity
    trial_status = payload.status or "VALID"
    invalid_reason = payload.invalid_reason
    if payload.signal_quality is not None and payload.signal_quality < 0.35:
        trial_status = "INVALID"
        invalid_reason = invalid_reason or "Poor signal quality"
    elif payload.pulsevision_bpm < 40 or payload.pulsevision_bpm > 200:
        trial_status = "INVALID"
        invalid_reason = invalid_reason or "PulseVision BPM out of physiological range"

    trial = ReferenceMeasurement(
        user_id=current_user.id if current_user else 1,
        scan_id=target_scan_id,
        trial_name=trial_code,
        trial_code=trial_code,
        participant_code=payload.participant_code or "P01",
        reference_source="Smartwatch",
        condition=payload.condition or "Resting",
        lighting_condition=payload.lighting_condition or "Normal Light",
        movement_condition=payload.movement_condition or "Stationary",
        reference_bpm=float(sw_bpm),
        pulsevision_bpm=float(payload.pulsevision_bpm),
        absolute_error=abs_err,
        measurement_duration=float(payload.measurement_duration or 30.0),
        algorithm="CONSENSUS_ENSEMBLE",
        signal_quality=float(payload.signal_quality or 1.0),
        status=trial_status,
        invalid_reason=invalid_reason,
        notes=payload.notes,
        timestamp=datetime.utcnow()
    )
    db.add(trial)
    db.commit()
    db.refresh(trial)
    return ValidationTrialOut.model_validate(trial)

@router.get("/validation/trials")
@router.get("/evaluation/trials")
def get_validation_trials(db: Session = Depends(get_db)):
    trials = db.query(ReferenceMeasurement).order_by(ReferenceMeasurement.timestamp.desc()).all()
    next_trial_code = f"T{len(trials) + 1:03d}"

    if len(trials) == 0:
        return {
            "success": True,
            "next_trial_code": "T001",
            "trials": [],
            "stats": {
                "total_trials": 0,
                "valid_trials": 0,
                "invalid_trials": 0,
                "status": "No paired validation data available.",
                "message": "No valid paired validation trials yet. Record your first trial above.",
                "mae": None,
                "rmse": None,
                "pearson_r": None,
                "mean_bias": None,
                "mean_smartwatch": None,
                "mean_reference": None,
                "mean_pulsevision": None,
                "max_error": None,
                "min_error": None,
                "bland_altman_mean_diff": None,
                "loa_upper": None,
                "loa_lower": None
            }
        }

    # Only include VALID trials in statistical calculations
    valid_trials = [t for t in trials if (t.status or "VALID") == "VALID"]
    invalid_count = len(trials) - len(valid_trials)

    if len(valid_trials) == 0:
        return {
            "success": True,
            "next_trial_code": next_trial_code,
            "trials": [ValidationTrialOut.model_validate(t) for t in trials],
            "stats": {
                "total_trials": len(trials),
                "valid_trials": 0,
                "invalid_trials": invalid_count,
                "status": "No valid paired validation trials yet.",
                "message": "All recorded trials are currently flagged as invalid.",
                "mae": None,
                "rmse": None,
                "pearson_r": None,
                "mean_bias": None,
                "mean_smartwatch": None,
                "mean_reference": None,
                "mean_pulsevision": None,
                "max_error": None,
                "min_error": None,
                "bland_altman_mean_diff": None,
                "loa_upper": None,
                "loa_lower": None
            }
        }

    refs = np.array([float(t.reference_bpm) for t in valid_trials])
    pv = np.array([float(t.pulsevision_bpm) for t in valid_trials])
    diffs = np.abs(pv - refs)
    signed_diffs = pv - refs  # PulseVision - Smartwatch (Bias)

    mae = round(float(np.mean(diffs)), 2)
    rmse = round(float(np.sqrt(np.mean((pv - refs) ** 2))), 2)
    mean_bias = round(float(np.mean(signed_diffs)), 2)
    mean_ref = round(float(np.mean(refs)), 1)
    mean_pv = round(float(np.mean(pv)), 1)
    max_err = round(float(np.max(diffs)), 2)
    min_err = round(float(np.min(diffs)), 2)

    # Pearson correlation r (only honest when N >= 2 and variation exists)
    pearson_r = None
    if len(valid_trials) >= 2:
        std_ref = float(np.std(refs))
        std_pv = float(np.std(pv))
        if std_ref > 1e-4 and std_pv > 1e-4:
            r_val = float(np.corrcoef(refs, pv)[0, 1])
            pearson_r = round(r_val, 4)
        elif np.allclose(refs, pv):
            pearson_r = 1.0

    # Bland-Altman Limits of Agreement (mean_diff ± 1.96 * SD)
    ba_mean_diff = mean_bias
    loa_upper = None
    loa_lower = None
    if len(valid_trials) >= 3:
        sd_diff = float(np.std(signed_diffs, ddof=1))
        loa_upper = round(ba_mean_diff + 1.96 * sd_diff, 2)
        loa_lower = round(ba_mean_diff - 1.96 * sd_diff, 2)

    return {
        "success": True,
        "next_trial_code": next_trial_code,
        "trials": [ValidationTrialOut.model_validate(t) for t in trials],
        "stats": {
            "total_trials": len(trials),
            "valid_trials": len(valid_trials),
            "invalid_trials": invalid_count,
            "mae": mae,
            "rmse": rmse,
            "pearson_r": pearson_r,
            "mean_bias": mean_bias,
            "mean_smartwatch": mean_ref,
            "mean_reference": mean_ref,
            "mean_pulsevision": mean_pv,
            "max_error": max_err,
            "min_error": min_err,
            "bland_altman_mean_diff": ba_mean_diff,
            "loa_upper": loa_upper,
            "loa_lower": loa_lower,
            "status": "Calculated from real database records.",
            "message": f"Evaluated across {len(valid_trials)} valid paired smartwatch trials."
        }
    }

@router.put("/validation/trial/{trial_id}", response_model=ValidationTrialOut)
def update_validation_trial(trial_id: int, payload: ValidationTrialUpdate, db: Session = Depends(get_db)):
    trial = db.query(ReferenceMeasurement).filter(ReferenceMeasurement.id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=404, detail=f"Validation trial #{trial_id} not found.")

    if payload.smartwatch_bpm is not None:
        trial.reference_bpm = float(payload.smartwatch_bpm)
    if payload.pulsevision_bpm is not None:
        trial.pulsevision_bpm = float(payload.pulsevision_bpm)
    if payload.participant_code is not None:
        trial.participant_code = payload.participant_code
    if payload.condition is not None:
        trial.condition = payload.condition
    if payload.measurement_duration is not None:
        trial.measurement_duration = float(payload.measurement_duration)
    if payload.status is not None:
        trial.status = payload.status
    if payload.invalid_reason is not None:
        trial.invalid_reason = payload.invalid_reason
    if payload.notes is not None:
        trial.notes = payload.notes

    trial.absolute_error = round(abs(float(trial.reference_bpm) - float(trial.pulsevision_bpm)), 2)
    db.commit()
    db.refresh(trial)
    return ValidationTrialOut.model_validate(trial)

@router.get("/validation/trial/{trial_id}", response_model=ValidationTrialOut)
def get_single_validation_trial(trial_id: int, db: Session = Depends(get_db)):
    trial = db.query(ReferenceMeasurement).filter(ReferenceMeasurement.id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=404, detail=f"Validation trial #{trial_id} not found.")
    return ValidationTrialOut.model_validate(trial)

@router.post("/validation/bulk-delete")
def bulk_delete_validation_trials(payload: BulkDeleteRequest, db: Session = Depends(get_db)):
    if not payload.trial_ids:
        return {"success": True, "deleted_count": 0, "message": "No trials specified for deletion."}
    
    trials = db.query(ReferenceMeasurement).filter(ReferenceMeasurement.id.in_(payload.trial_ids)).all()
    count = len(trials)
    for t in trials:
        db.delete(t)
    db.commit()
    return {"success": True, "deleted_count": count, "message": f"Successfully deleted {count} validation trials."}

@router.post("/validation/bulk-update")
def bulk_update_validation_trials(payload: BulkUpdateRequest, db: Session = Depends(get_db)):
    if not payload.trial_ids:
        return {"success": True, "updated_count": 0, "message": "No trials specified for update."}

    trials = db.query(ReferenceMeasurement).filter(ReferenceMeasurement.id.in_(payload.trial_ids)).all()
    count = len(trials)
    for t in trials:
        if payload.condition is not None:
            t.condition = payload.condition
        if payload.status is not None:
            t.status = payload.status
        if payload.invalid_reason is not None:
            t.invalid_reason = payload.invalid_reason
        if payload.notes is not None:
            t.notes = payload.notes
    db.commit()
    return {"success": True, "updated_count": count, "message": f"Successfully updated {count} validation trials."}

@router.delete("/validation/trial/{trial_id}")
def delete_validation_trial(trial_id: int, db: Session = Depends(get_db)):
    trial = db.query(ReferenceMeasurement).filter(ReferenceMeasurement.id == trial_id).first()
    if not trial:
        raise HTTPException(status_code=404, detail=f"Validation trial #{trial_id} not found.")

    db.delete(trial)
    db.commit()
    return {"success": True, "message": f"Validation trial #{trial_id} deleted successfully."}

@router.get("/validation/latest-scan")
def get_latest_pulsevision_scan(db: Session = Depends(get_db)):
    """
    Returns the latest valid completed PulseVision scan from the database
    to automatically populate PulseVision BPM, duration, and signal quality.
    """
    latest_scan = (
        db.query(Scan)
        .filter(Scan.accepted == True, Scan.estimated_bpm != None, Scan.estimated_bpm > 30)
        .order_by(Scan.started_at.desc())
        .first()
    )

    if not latest_scan:
        return {
            "success": True,
            "has_scan": False,
            "bpm": None,
            "duration_seconds": 30.0,
            "signal_quality": "Moderate",
            "message": "No completed Live Scan found. Please complete a Live Scan first."
        }

    return {
        "success": True,
        "has_scan": True,
        "scan_id": latest_scan.id,
        "bpm": round(float(latest_scan.estimated_bpm), 1),
        "duration_seconds": float(latest_scan.duration_seconds or 30.0),
        "signal_quality": latest_scan.signal_quality or "Good",
        "completed_at": latest_scan.completed_at.isoformat() if latest_scan.completed_at else None,
        "message": f"Loaded latest valid scan #{latest_scan.id} ({round(latest_scan.estimated_bpm, 1)} BPM)"
    }

@router.get("/evaluation/summary")
@router.get("/evaluation/stats")
@router.get("/validation/stats")
def get_evaluation_summary(db: Session = Depends(get_db)):
    res = get_validation_trials(db)
    return res["stats"]

@router.get("/validation/export-csv")
@router.get("/evaluation/export-csv")
def export_validation_csv(trial_ids: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(ReferenceMeasurement)
    if trial_ids:
        try:
            ids = [int(i.strip()) for i in trial_ids.split(",") if i.strip().isdigit()]
            if ids:
                query = query.filter(ReferenceMeasurement.id.in_(ids))
        except Exception:
            pass
    trials = query.order_by(ReferenceMeasurement.timestamp.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Trial ID", "Trial Code", "Participant Code", "Reference Source",
        "Condition", "Smartwatch BPM", "PulseVision BPM",
        "Absolute Error (BPM)", "Duration (s)", "Signal Quality",
        "Status", "Invalid Reason", "Notes", "Timestamp (UTC)"
    ])

    for t in trials:
        trial_code = getattr(t, 'trial_code', None) or f"T{t.id:03d}"
        status_val = getattr(t, 'status', None) or "VALID"
        inv_reason = getattr(t, 'invalid_reason', None) or ""
        duration = getattr(t, 'measurement_duration', None) or 30.0

        writer.writerow([
            t.id,
            trial_code,
            t.participant_code or "P01",
            "Smartwatch",
            t.condition or "Resting",
            t.reference_bpm,
            t.pulsevision_bpm,
            t.absolute_error,
            duration,
            t.signal_quality if t.signal_quality is not None else 1.0,
            status_val,
            inv_reason,
            t.notes or "",
            t.timestamp.strftime("%Y-%m-%d %H:%M:%S") if t.timestamp else ""
        ])

    csv_content = output.getvalue()
    filename = f"pulsevision_smartwatch_validation_trials_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
