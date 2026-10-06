import math
import numpy as np
from app.signal_processing.filter import detrend_signal, bandpass_filter

def compute_pos(rgb_series, fs=30.0):
    """
    Plane-Orthogonal-to-Skin (POS) algorithm (Wang et al., IEEE TBME 2017).
    Projects normalized RGB temporal skin signals onto a 2D plane orthogonal
    to the skin reflection vector, tuning dynamic standard deviation weighting.
    """
    WinSec = 1.6
    RGB = np.asarray(rgb_series, dtype=np.float64)
    N = RGB.shape[0]
    if N < 30:
        return np.zeros(N)

    H = np.zeros(N)
    l = math.ceil(WinSec * fs)

    for n in range(N):
        m = n - l
        if m >= 0:
            mean_base = np.mean(RGB[m:n, :], axis=0)
            mean_base[mean_base == 0] = 1e-6
            Cn = np.true_divide(RGB[m:n, :], mean_base).T # shape (3, WinL)
            
            # Projection matrix S = [[0, 1, -1], [-2, 1, 1]]
            proj = np.array([[0.0, 1.0, -1.0], [-2.0, 1.0, 1.0]])
            S = np.matmul(proj, Cn) # (2, WinL)
            
            s1_std = np.std(S[1, :])
            if s1_std == 0:
                s1_std = 1e-6
            h = S[0, :] + (np.std(S[0, :]) / s1_std) * S[1, :]
            h = h - np.mean(h)
            H[m:n] = H[m:n] + h

    BVP = detrend_signal(H, lambda_val=100)
    BVP = bandpass_filter(BVP, fs=fs, low_hz=0.75, high_hz=2.5)
    return BVP
