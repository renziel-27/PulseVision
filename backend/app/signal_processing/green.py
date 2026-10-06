import numpy as np
from app.signal_processing.filter import bandpass_filter

def compute_green(rgb_series, fs=30.0):
    """
    Green channel rPPG method (Verkruysse et al., Optics Express 2008).
    Extracts the green component corresponding to peak hemoglobin absorption.
    """
    RGB = np.asarray(rgb_series, dtype=np.float64)
    if RGB.shape[0] < 30:
        return np.zeros(RGB.shape[0])
    
    g = RGB[:, 1]
    g = g - np.mean(g)
    filtered = bandpass_filter(g, fs=fs, low_hz=0.75, high_hz=2.5)
    return filtered
