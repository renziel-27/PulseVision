import numpy as np
from sklearn.decomposition import FastICA
from scipy import signal
from app.signal_processing.filter import bandpass_filter, detrend_signal

def compute_ica(rgb_series, fs=30.0):
    """
    Independent Component Analysis (FastICA) rPPG method (Poh et al., IEEE TBME 2010).
    Decomposes normalized temporal RGB skin reflectance channels into statistically
    independent source signals, selecting the component with the highest spectral peak
    within the physiological cardiac bandwidth (0.75 - 2.5 Hz / 45 - 150 BPM).
    """
    RGB = np.asarray(rgb_series, dtype=np.float64)
    N = RGB.shape[0]
    if N < 45:
        return np.zeros(N)

    # 1. Temporal normalization (zero-mean, unit variance)
    means = np.mean(RGB, axis=0)
    stds = np.std(RGB, axis=0)
    stds[stds == 0] = 1e-6
    norm_rgb = (RGB - means) / stds

    # 2. FastICA source separation
    try:
        ica = FastICA(n_components=3, max_iter=500, random_state=42, tol=1e-3)
        sources = ica.fit_transform(norm_rgb) # shape (N, 3)
    except Exception:
        # Fallback to green channel if ICA optimization diverges
        return bandpass_filter(norm_rgb[:, 1], fs=fs, low_hz=0.75, high_hz=2.5)

    # 3. Select component with strongest cardiac peak power in 0.75 - 2.5 Hz
    best_component_idx = 0
    max_peak_power = -1.0
    nyq = 0.5 * fs

    for c in range(3):
        comp = sources[:, c]
        comp = detrend_signal(comp, lambda_val=100)
        filtered = bandpass_filter(comp, fs=fs, low_hz=0.75, high_hz=2.5)

        freqs, pxx = signal.periodogram(filtered, fs=fs, nfft=max(512, N))
        mask = (freqs >= 0.75) & (freqs <= 2.5)
        if np.any(mask) and np.max(pxx[mask]) > max_peak_power:
            max_peak_power = float(np.max(pxx[mask]))
            best_component_idx = c

    selected = sources[:, best_component_idx]
    detrended = detrend_signal(selected, lambda_val=100)
    bvp = bandpass_filter(detrended, fs=fs, low_hz=0.75, high_hz=2.5)
    return bvp

def extract_fastica_bpm(rgb_series, fs=30.0):
    from app.signal_processing.spectral import calculate_fft_bpm_and_sqi
    bvp = compute_ica(rgb_series, fs=fs)
    res = calculate_fft_bpm_and_sqi(bvp, fs=fs)
    return res["bpm"], res["sqi"]

