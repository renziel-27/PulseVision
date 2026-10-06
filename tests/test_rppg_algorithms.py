import sys
import os
import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from app.signal_processing import compute_pos, compute_chrom, compute_green, calculate_fft_bpm_and_sqi

def generate_synthetic_rppg(bpm=72.0, duration_sec=10.0, fs=30.0, noise_std=0.002):
    """Generates synthetic multi-wavelength facial skin reflection signal."""
    N = int(duration_sec * fs)
    t = np.linspace(0, duration_sec, N)
    f0 = bpm / 60.0
    pulse = np.sin(2 * np.pi * f0 * t) + 0.3 * np.sin(4 * np.pi * f0 * t)

    # Green channel modulates most strongly (~1.5%), Red least (~0.5%)
    r = 180.0 * (1.0 - 0.005 * pulse + np.random.normal(0, noise_std, N))
    g = 120.0 * (1.0 - 0.015 * pulse + np.random.normal(0, noise_std, N))
    b = 90.0 * (1.0 - 0.008 * pulse + np.random.normal(0, noise_std, N))

    return np.stack([r, g, b], axis=1)

def test_pos_algorithm_accuracy():
    # Test 72 BPM
    rgb_72 = generate_synthetic_rppg(bpm=72.0, duration_sec=10.0, fs=30.0)
    bvp = compute_pos(rgb_72, fs=30.0)
    assert len(bvp) == len(rgb_72)
    stats = calculate_fft_bpm_and_sqi(bvp, fs=30.0)
    assert stats["is_valid"]
    assert abs(stats["bpm"] - 72.0) <= 2.5

    # Test 95 BPM
    rgb_95 = generate_synthetic_rppg(bpm=95.0, duration_sec=10.0, fs=30.0)
    bvp_95 = compute_pos(rgb_95, fs=30.0)
    stats_95 = calculate_fft_bpm_and_sqi(bvp_95, fs=30.0)
    assert stats_95["is_valid"]
    assert abs(stats_95["bpm"] - 95.0) <= 2.5

def test_chrom_algorithm_accuracy():
    rgb_80 = generate_synthetic_rppg(bpm=80.0, duration_sec=10.0, fs=30.0)
    bvp = compute_chrom(rgb_80, fs=30.0)
    assert len(bvp) == len(rgb_80)
    stats = calculate_fft_bpm_and_sqi(bvp, fs=30.0)
    assert stats["is_valid"]
    assert abs(stats["bpm"] - 80.0) <= 3.0

def test_green_algorithm():
    rgb_65 = generate_synthetic_rppg(bpm=65.0, duration_sec=10.0, fs=30.0)
    bvp = compute_green(rgb_65, fs=30.0)
    assert len(bvp) == len(rgb_65)
    stats = calculate_fft_bpm_and_sqi(bvp, fs=30.0)
    assert abs(stats["raw_bpm"] - 65.0) <= 3.0
