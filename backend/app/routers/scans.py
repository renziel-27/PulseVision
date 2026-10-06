import io
import csv
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.scan import Scan
from app.models.reference import ReferenceMeasurement
from app.schemas.scan import ScanCreate, ScanComplete, ScanOut
from app.security.auth import get_current_user

router = APIRouter(tags=["Scans & Dashboard"])

@router.get("/dashboard/summary")
def get_dashboard_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    scans = db.query(Scan).filter(Scan.user_id == current_user.id).order_by(Scan.started_at.desc()).all()
    trials = db.query(ReferenceMeasurement).filter(ReferenceMeasurement.user_id == current_user.id).all()

    latest_scan = scans[0] if scans else None
    accepted_scans = [s for s in scans if s.accepted and s.estimated_bpm]

    avg_bpm = round(sum(s.estimated_bpm for s in accepted_scans) / len(accepted_scans), 1) if accepted_scans else None

    return {
        "user_name": current_user.name,
        "total_scans": len(scans),
        "accepted_scans_count": len(accepted_scans),
        "latest_bpm": latest_scan.estimated_bpm if (latest_scan and latest_scan.accepted) else None,
        "latest_signal_quality": latest_scan.signal_quality if latest_scan else "No data",
        "average_resting_bpm": avg_bpm,
        "total_validation_trials": len(trials),
        "total_smartwatch_trials": len(trials),  # Legacy compatibility
        "recent_scans": [ScanOut.model_validate(s) for s in scans[:5]]
    }

@router.get("/scans", response_model=List[ScanOut])
def get_scans(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    scans = db.query(Scan).filter(Scan.user_id == current_user.id).order_by(Scan.started_at.desc()).all()
    return [ScanOut.model_validate(s) for s in scans]

@router.get("/scans/export-csv")
def export_scans_csv(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    scans = db.query(Scan).filter(Scan.user_id == current_user.id).order_by(Scan.started_at.desc()).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Scan ID", "Timestamp (UTC)", "Duration (s)", "Algorithm",
        "Estimated BPM", "Status", "Confidence (%)", "Signal Quality",
        "Classification", "Stress Level", "Fatigue Level", "EAR Value",
        "Rejection Reason", "Notes"
    ])
    for s in scans:
        writer.writerow([
            s.id,
            s.started_at.strftime("%Y-%m-%d %H:%M:%S") if s.started_at else "",
            s.duration_seconds,
            s.algorithm_name,
            s.estimated_bpm if (s.accepted and s.estimated_bpm) else "N/A (Rejected)",
            "Accepted" if s.accepted else "Rejected",
            s.confidence,
            s.signal_quality,
            s.classification,
            s.stress_level,
            s.fatigue_level,
            s.ear_value,
            s.rejection_reason or "",
            s.notes or ""
        ])
    csv_content = output.getvalue()
    filename = f"pulsevision_scans_{current_user.id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/scans/{scan_id}", response_model=ScanOut)
def get_scan(scan_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    scan = db.query(Scan).filter(Scan.id == scan_id, Scan.user_id == current_user.id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan record not found")
    return ScanOut.model_validate(scan)

@router.post("/scans", response_model=ScanOut)
def create_scan(payload: ScanCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    scan = Scan(
        user_id=current_user.id,
        started_at=datetime.utcnow(),
        duration_seconds=payload.duration_seconds,
        algorithm_name=payload.algorithm_name,
        model_version="v2.0-Production"
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)
    return ScanOut.model_validate(scan)

@router.post("/scans/{scan_id}/complete", response_model=ScanOut)
def complete_scan(scan_id: int, payload: ScanComplete, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    scan = db.query(Scan).filter(Scan.id == scan_id, Scan.user_id == current_user.id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan record not found")

    is_valid = payload.bpm > 40.0 and payload.bpm < 180.0
    scan.completed_at = datetime.utcnow()
    scan.estimated_bpm = payload.bpm if is_valid else None
    scan.confidence = payload.confidence
    scan.signal_quality = payload.signal_quality
    scan.sqi_score = payload.sqi_score
    scan.accepted = is_valid
    scan.rejection_reason = "" if is_valid else "Signal quality low or heart rate outside physiological bounds."
    scan.algorithm_used = payload.algorithm_used
    scan.classification = payload.classification
    scan.stress_level = payload.stress_level
    scan.fatigue_level = payload.fatigue_level
    scan.ear_value = payload.ear_value
    scan.notes = payload.notes

    db.commit()
    db.refresh(scan)
    return ScanOut.model_validate(scan)

@router.post("/scans/{scan_id}/cancel")
def cancel_scan(scan_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    scan = db.query(Scan).filter(Scan.id == scan_id, Scan.user_id == current_user.id).first()
    if scan:
        db.delete(scan)
        db.commit()
    return {"success": True, "message": "Scan cancelled."}

@router.delete("/scans/{scan_id}")
def delete_scan(scan_id: int, db: Session = Depends(get_db)):
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan record not found.")
    db.delete(scan)
    db.commit()
    return {"success": True, "message": f"Scan #{scan_id} deleted successfully."}

