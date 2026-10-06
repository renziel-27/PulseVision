import sys
import os
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from app.main import app
from app.reporting import generate_health_report_pdf

client = TestClient(app)

def test_generate_pdf_report_direct():
    scan_dict = {
        "id": 999,
        "started_at": "2026-10-03 21:00:00",
        "duration_seconds": 15.0,
        "algorithm_name": "TS-CAN",
        "estimated_bpm": 74.5,
        "signal_quality": "High",
        "confidence": 92.0,
        "classification": "Normal Range",
        "stress_level": "Low (Relaxed)",
        "fatigue_level": "Normal",
        "ear_value": 0.29,
        "reference": {
            "reference_source": "Finger Pulse Oximeter (SpO2)",
            "reference_bpm": 75.0,
            "pulsevision_bpm": 74.5,
            "absolute_error": 0.5
        }
    }
    user_dict = {
        "name": "Dr. Alex Rivera",
        "email": "alex.rivera@pulsevision.ai"
    }

    test_pdf_path = "/tmp/test_pulsevision_report.pdf"
    output = generate_health_report_pdf(scan_dict, user_dict, output_path=test_pdf_path)
    assert os.path.exists(output)
    assert os.path.getsize(output) > 1000

    # Check valid PDF magic header %PDF-
    with open(output, "rb") as f:
        header = f.read(5)
        assert header == b"%PDF-"

    os.remove(test_pdf_path)

def test_pdf_report_api():
    # 1. Create a scan
    scan_res = client.post("/api/scans", json={"algorithm_name": "POS", "duration_seconds": 15.0})
    assert scan_res.status_code == 200
    scan_id = scan_res.json()["id"]

    # 2. Complete scan
    client.post(f"/api/scans/{scan_id}/complete", json={
        "bpm": 72.0,
        "confidence": 88.0,
        "signal_quality": "High",
        "sqi_score": 0.9,
        "algorithm_used": "POS",
        "classification": "Normal Range"
    })

    # 3. Request report creation
    rep_res = client.post("/api/reports", json={"scan_id": scan_id})
    assert rep_res.status_code == 200
    report_id = rep_res.json()["id"]

    # 4. Download report
    dl_res = client.get(f"/api/reports/{report_id}/download")
    assert dl_res.status_code == 200
    assert dl_res.headers["content-type"] == "application/pdf"
    assert dl_res.content[:5] == b"%PDF-"
