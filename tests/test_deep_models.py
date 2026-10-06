import sys
import os
import numpy as np
import torch
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from app.ml import ml_registry

def test_ml_registry_status():
    status = ml_registry.get_status()
    assert "available_models" in status
    models = status["available_models"]
    assert len(models) >= 3

    # Verify TSCAN-1D is loaded
    tscan1d = ml_registry.get_model("tscan_1d")
    assert tscan1d is not None
    assert tscan1d.is_loaded

    # Verify TS-CAN 2D is loaded
    tscan2d = ml_registry.get_model("tscan_2d")
    assert tscan2d is not None
    assert tscan2d.is_loaded

    # Verify DeepPhys is loaded
    deepphys = ml_registry.get_model("deepphys")
    assert deepphys is not None
    assert deepphys.is_loaded

def test_tscan1d_forward_pass():
    model = ml_registry.get_model("tscan_1d")
    # Feed 150 points of RGB
    rgb_dummy = np.random.rand(150, 3) * 100.0 + 50.0
    res = model.predict(rgb_dummy)
    assert "bpm" in res
    assert 45.0 <= res["bpm"] <= 160.0
    assert len(res["waveform"]) > 0
    assert res["latency_ms"] >= 0.0

def test_tscan2d_forward_pass():
    model = ml_registry.get_model("tscan_2d")
    # Feed 30 face frames of 72x72
    frames = [np.random.randint(0, 255, (72, 72, 3), dtype=np.uint8) for _ in range(30)]
    res = model.predict(frames)
    assert "bpm" in res
    assert len(res["waveform"]) > 0
    assert res["latency_ms"] >= 0.0
