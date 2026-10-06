import sys
import os
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from app.main import app

client = TestClient(app)

def test_validation_trial_recording_and_stats():
    # Record trial 1 with reference_bpm and participant_code
    t1 = client.post("/api/validation/trial", json={
        "reference_bpm": 75.0,
        "pulsevision_bpm": 74.0,
        "participant_code": "P01",
        "reference_source": "Finger Pulse Oximeter",
        "trial_name": "Resting Trial 1",
        "condition": "Resting Baseline"
    })
    assert t1.status_code == 200
    assert t1.json()["absolute_error"] == 1.0
    assert t1.json()["reference_bpm"] == 75.0

    # Record trial 2
    t2 = client.post("/api/validation/trial", json={
        "reference_bpm": 80.0,
        "pulsevision_bpm": 78.0,
        "participant_code": "P02",
        "reference_source": "Clinical Monitor",
        "trial_name": "Resting Trial 2",
        "condition": "Resting Baseline"
    })
    assert t2.status_code == 200
    assert t2.json()["absolute_error"] == 2.0

    # Get aggregate statistics
    res = client.get("/api/validation/trials")
    assert res.status_code == 200
    data = res.json()
    assert data["success"]
    stats = data["stats"]
    assert stats["total_trials"] >= 2
    assert stats["mae"] >= 0.0
    assert stats["rmse"] >= 0.0
    assert -1.0 <= stats["pearson_r"] <= 1.0

def test_validation_csv_export():
    res = client.get("/api/validation/export-csv")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "Trial ID" in res.text
    assert "Smartwatch BPM" in res.text
    assert "PulseVision BPM" in res.text

def test_validation_trial_crud_and_invalid_handling():
    # 1. Test creating an invalid trial with low signal quality
    inv = client.post("/api/validation/trial", json={
        "smartwatch_bpm": 70.0,
        "pulsevision_bpm": 68.0,
        "participant_code": "P99",
        "condition": "Resting",
        "signal_quality": 0.2, # Low signal quality
        "invalid_reason": "Poor signal quality"
    })
    assert inv.status_code == 200
    inv_data = inv.json()
    assert inv_data["status"] == "INVALID"
    trial_id = inv_data["id"]

    # 2. Test editing the trial to make it valid
    upd = client.put(f"/api/validation/trial/{trial_id}", json={
        "smartwatch_bpm": 72.0,
        "pulsevision_bpm": 71.0,
        "status": "VALID",
        "notes": "Corrected trial"
    })
    assert upd.status_code == 200
    upd_data = upd.json()
    assert upd_data["status"] == "VALID"
    assert upd_data["absolute_error"] == 1.0

    # 3. Test deleting the trial
    dele = client.delete(f"/api/validation/trial/{trial_id}")
    assert dele.status_code == 200
    assert dele.json()["success"]

def test_validation_bulk_operations_and_single_get():
    # Create two trials
    t1 = client.post("/api/validation/trial", json={
        "participant_code": "P88",
        "smartwatch_bpm": 80.0,
        "pulsevision_bpm": 81.0,
        "condition": "Resting"
    }).json()
    t2 = client.post("/api/validation/trial", json={
        "participant_code": "P89",
        "smartwatch_bpm": 82.0,
        "pulsevision_bpm": 84.0,
        "condition": "Resting"
    }).json()

    id1, id2 = t1["id"], t2["id"]

    # 1. Single get
    single_res = client.get(f"/api/validation/trial/{id1}")
    assert single_res.status_code == 200
    assert single_res.json()["participant_code"] == "P88"

    # 2. Bulk update
    upd_res = client.post("/api/validation/bulk-update", json={
        "trial_ids": [id1, id2],
        "condition": "Recovery",
        "notes": "Bulk updated test"
    })
    assert upd_res.status_code == 200
    assert upd_res.json()["updated_count"] == 2

    # Verify update
    assert client.get(f"/api/validation/trial/{id1}").json()["condition"] == "Recovery"
    assert client.get(f"/api/validation/trial/{id2}").json()["condition"] == "Recovery"

    # 3. Selective CSV export
    csv_res = client.get(f"/api/validation/export-csv?trial_ids={id1},{id2}")
    assert csv_res.status_code == 200
    assert "P88" in csv_res.text
    assert "P89" in csv_res.text

    # 4. Bulk delete
    del_res = client.post("/api/validation/bulk-delete", json={
        "trial_ids": [id1, id2]
    })
    assert del_res.status_code == 200
    assert del_res.json()["deleted_count"] == 2

    # Verify deleted
    assert client.get(f"/api/validation/trial/{id1}").status_code == 404
    assert client.get(f"/api/validation/trial/{id2}").status_code == 404

def test_latest_pulsevision_scan():
    res = client.get("/api/validation/latest-scan")
    assert res.status_code == 200
    data = res.json()
    assert data["success"]
    assert "has_scan" in data

def test_scans_csv_export():
    # Login as demo user
    login_res = client.post("/api/auth/login", json={
        "email": "demo@pulsevision.ai",
        "password": "demo1234"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    
    res = client.get("/api/scans/export-csv", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "Scan ID" in res.text
    assert "Estimated BPM" in res.text
