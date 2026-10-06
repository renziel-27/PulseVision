import sys
import os
import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from app.computer_vision import PreflightGuard
from app.signal_processing.spectral import calculate_fft_bpm_and_sqi

def test_preflight_rejections():
    guard = PreflightGuard()

    # 1. No face box
    res_no_face = guard.check_quality(np.zeros((480, 640, 3), dtype=np.uint8), None)
    assert not res_no_face["ready"]
    assert "No face detected" in res_no_face["message"]

    # 2. Dim lighting
    dim_frame = np.ones((480, 640, 3), dtype=np.uint8) * 15 # very dark
    face_box = (200, 150, 200, 200)
    res_dim = guard.check_quality(dim_frame, face_box)
    assert not res_dim["ready"]
    assert not res_dim["lighting_ok"]
    assert "dim" in res_dim["message"].lower()

    # 3. Proper lighting and centered
    good_frame = np.ones((480, 640, 3), dtype=np.uint8) * 130
    good_frame[150:350, 200:400] = np.random.randint(90, 160, (200, 200, 3), dtype=np.uint8)
    res_good = guard.check_quality(good_frame, face_box)
    assert res_good["ready"]
    assert res_good["lighting_ok"]
    assert res_good["position_ok"]

def test_sqi_low_quality_rejection():
    # Pure noise signal (no cardiac peak)
    noise_bvp = np.random.normal(0, 1.0, 150)
    stats = calculate_fft_bpm_and_sqi(noise_bvp, fs=30.0)
    # Low SNR must reject instead of guessing a normal BPM
    assert stats["snr_db"] < 2.0
