import uuid
import pytest
import numpy as np
from fastapi.testclient import TestClient
from app.main import app
from app.signal_processing.ica import extract_fastica_bpm
from app.signal_processing.respiratory import estimate_respiratory_rate
from app.signal_processing.consensus import compute_multi_algorithm_consensus

client = TestClient(app)

def generate_synthetic_ppg(bpm=72.0, fs=30.0, duration_sec=60.0):
    t = np.linspace(0, duration_sec, int(fs * duration_sec))
    pulse = np.sin(2 * np.pi * (bpm / 60.0) * t)
    # Generate RGB channels with varying phase/amplitude
    r = 120.0 + 3.0 * pulse + 0.1 * np.random.randn(len(t))
    g = 140.0 + 8.0 * pulse + 0.1 * np.random.randn(len(t))
    b = 100.0 + 1.5 * pulse + 0.1 * np.random.randn(len(t))
    return np.column_stack([r, g, b])

def test_fastica_extraction():
    rgb = generate_synthetic_ppg(bpm=75.0, fs=30.0, duration_sec=30.0)
    bpm, snr = extract_fastica_bpm(rgb, fs=30.0)
    assert 40.0 <= bpm <= 180.0
    assert abs(bpm - 75.0) < 6.0

def test_respiratory_rate_estimation():
    fs = 30.0
    duration_sec = 60.0
    t = np.linspace(0, duration_sec, int(fs * duration_sec))
    target_brpm = 18.0
    # 18 BrPM = 0.3 Hz
    motion = 200.0 + 5.0 * np.sin(2 * np.pi * (target_brpm / 60.0) * t) + 0.2 * np.random.randn(len(t))
    
    resp_data = estimate_respiratory_rate(motion, fs=fs)
    assert resp_data["is_valid"] is True
    assert 6.0 <= resp_data["brpm"] <= 30.0
    assert abs(resp_data["brpm"] - target_brpm) < 3.0
    assert resp_data["snr"] > 1.0

def test_consensus_concordant():
    rgb = generate_synthetic_ppg(bpm=70.0, fs=30.0, duration_sec=60.0)
    result = compute_multi_algorithm_consensus(rgb, fs=30.0)
    
    assert result["consensus_status"] in ["ACCEPTED", "CONCORDANT"]
    assert result["consensus_bpm"] > 0.0
    assert abs(result["consensus_bpm"] - 70.0) < 6.0
    assert result["spread_bpm"] <= 12.0
    assert len(result["contributing_algorithms"]) >= 3

def test_trial_lifecycle_api():
    uid1 = f"PV-TR-{uuid.uuid4().hex[:6].upper()}"
    # 1. Create trial
    create_res = client.post("/api/trials/create", json={
        "trial_uid": uid1,
        "participant_code": "P99",
        "condition": "Resting Baseline",
        "reference_bpm": 72.0,
        "reference_systolic_bp": 120,
        "reference_diastolic_bp": 80
    })
    assert create_res.status_code == 200
    trial = create_res.json()
    assert trial["trial_uid"] == uid1
    assert trial["status"] == "READY"
    trial_id = trial["id"]

    # 2. Start trial
    start_res = client.post(f"/api/trials/{trial_id}/start")
    assert start_res.status_code == 200
    assert start_res.json()["status"] == "RUNNING"

    # 3. Reject completion if duration < 60s (Requirement 2)
    short_complete = client.post(f"/api/trials/{trial_id}/complete", json={
        "actual_duration_sec": 25.0
    })
    assert short_complete.status_code == 400
    assert "minimum 60" in short_complete.json()["detail"].lower()

    # 4. Cancel trial
    cancel_res = client.post(f"/api/trials/{trial_id}/cancel", json={
        "reason": "Test early abort"
    })
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "CANCELLED"

    # 5. Complete a 60s trial with synthetic RGB history
    uid2 = f"PV-TR-{uuid.uuid4().hex[:6].upper()}"
    rgb = generate_synthetic_ppg(bpm=72.0, fs=30.0, duration_sec=60.0).tolist()
    motion = [200.0 + 2.0 * np.sin(2 * np.pi * 0.3 * (i / 30.0)) for i in range(1800)]
    
    trial2_res = client.post("/api/trials/create", json={
        "trial_uid": uid2,
        "participant_code": "P99"
    })
    trial2_id = trial2_res.json()["id"]
    client.post(f"/api/trials/{trial2_id}/start")

    complete_res = client.post(f"/api/trials/{trial2_id}/complete", json={
        "actual_duration_sec": 60.0,
        "rgb_history": rgb,
        "motion_history": motion
    })
    assert complete_res.status_code == 200
    completed_trial = complete_res.json()
    assert completed_trial["status"] == "COMPLETED"
    assert completed_trial["consensus_bpm"] > 0.0

    # 6. List trials
    list_res = client.get("/api/trials")
    assert list_res.status_code == 200
    trials = list_res.json()
    assert any(t["id"] == trial_id for t in trials)

    # 7. Export CSV
    csv_res = client.get("/api/trials/export-csv")
    assert csv_res.status_code == 200
    assert "PV-TR-" in csv_res.text
