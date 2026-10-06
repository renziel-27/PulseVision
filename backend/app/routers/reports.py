import os
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.scan import Scan
from app.models.report import Report
from app.schemas.report import ReportOut
from app.security.auth import get_optional_user
from app.reporting import generate_health_report_pdf

router = APIRouter(tags=["Reports & PDF"])

@router.post("/reports/save")
@router.post("/reports/generate")
@router.post("/reports")
def create_report(payload: dict, db: Session = Depends(get_db), current_user: User = Depends(get_optional_user)):
    user_id = payload.get("user_id") or (current_user.id if current_user else 1)
    scan_id = payload.get("scan_id")

    # If scan_id provided, look up scan; otherwise create a scan record from payload
    if scan_id:
        scan = db.query(Scan).filter(Scan.id == scan_id).first()
    else:
        scan = Scan(
            user_id=user_id,
            estimated_bpm=float(payload.get("bpm", 72.0)),
            confidence=float(payload.get("confidence", 85.0)),
            stress_level=payload.get("stress_level", "Low (Relaxed)"),
            fatigue_level=payload.get("fatigue_level", "Normal"),
            ear_value=float(payload.get("ear_value", 0.28)),
            signal_quality=payload.get("signal_quality", "High (Optimal)"),
            algorithm_name=payload.get("algorithm_used", "POS"),
            classification=payload.get("classification", "Normal Range"),
            notes=payload.get("notes", "")
        )
        db.add(scan)
        db.commit()
        db.refresh(scan)

    user = db.query(User).filter(User.id == user_id).first()
    user_dict = {
        "name": user.name if user else "Research Participant",
        "email": user.email if user else "participant@pulsevision.ai"
    }
    scan_dict = {
        "id": scan.id,
        "started_at": scan.started_at.strftime("%Y-%m-%d %H:%M:%S") if scan.started_at else "N/A",
        "duration_seconds": scan.duration_seconds,
        "algorithm_name": scan.algorithm_name,
        "estimated_bpm": scan.estimated_bpm,
        "signal_quality": scan.signal_quality,
        "confidence": scan.confidence,
        "classification": scan.classification,
        "stress_level": scan.stress_level,
        "fatigue_level": scan.fatigue_level,
        "ear_value": scan.ear_value,
        "reference": {
            "reference_device": scan.reference.reference_device,
            "smartwatch_bpm": scan.reference.smartwatch_bpm,
            "pulsevision_bpm": scan.reference.pulsevision_bpm,
            "absolute_error": scan.reference.absolute_error
        } if scan.reference else None
    }

    pdf_path = generate_health_report_pdf(scan_dict, user_dict)
    filename = os.path.basename(pdf_path)

    report = Report(
        user_id=user_id,
        scan_id=scan.id,
        file_path=pdf_path,
        file_name=filename
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {
        "success": True,
        "scan_id": scan.id,
        "id": report.id,
        "file_name": filename,
        "download_url": f"/api/reports/{report.id}/download"
    }

@router.get("/reports")
def list_reports(user_id: Optional[int] = 1, db: Session = Depends(get_db)):
    scans = db.query(Scan).filter(Scan.user_id == user_id).order_by(Scan.started_at.desc()).all()
    reports = db.query(Report).filter(Report.user_id == user_id).order_by(Report.created_at.desc()).all()
    
    return {
        "success": True,
        "scans": [
            {
                "id": s.id,
                "bpm": s.estimated_bpm,
                "confidence": s.confidence,
                "stress_level": s.stress_level,
                "fatigue_level": s.fatigue_level,
                "signal_quality": s.signal_quality,
                "algorithm_used": s.algorithm_name,
                "classification": s.classification,
                "timestamp": s.started_at.strftime("%Y-%m-%d %H:%M:%S") if s.started_at else "N/A"
            }
            for s in scans
        ],
        "reports": [
            {
                "id": r.id,
                "scan_id": r.scan_id,
                "file_name": r.file_name,
                "download_url": f"/api/reports/{r.id}/download",
                "created_at": r.created_at.strftime("%Y-%m-%d %H:%M:%S") if r.created_at else "N/A"
            }
            for r in reports
        ]
    }

@router.get("/reports/{report_id}/download")
@router.get("/reports/download/{report_id}")
def download_report(report_id: int, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report or not os.path.exists(report.file_path):
        raise HTTPException(status_code=404, detail="Report PDF file not found")

    return FileResponse(
        report.file_path,
        media_type="application/pdf",
        filename=report.file_name
    )

@router.delete("/reports/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    if report.file_path and os.path.exists(report.file_path):
        try:
            os.remove(report.file_path)
        except OSError:
            pass
    db.delete(report)
    db.commit()
    return {"success": True, "message": f"Report #{report_id} deleted successfully."}

