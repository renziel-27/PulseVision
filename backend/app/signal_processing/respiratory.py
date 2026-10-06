import numpy as np
from scipy import signal
from app.signal_processing.filter import bandpass_filter, detrend_signal

def estimate_respiratory_rate(motion_or_intensity_series, fs=30.0):
    """
    Estimates visual respiratory frequency and Breaths Per Minute (BrPM).
    Analyzes periodic chest expansion / vertical chin-nasal respiratory motion signals.
    Physiological breathing band: 0.10 Hz - 0.50 Hz (6 to 30 Breaths/Minute).
    """
    data = np.asarray(motion_or_intensity_series, dtype=np.float64).flatten()
    N = len(data)
    
    # Need at least 150 frames (5 seconds at 30 fps) for low-frequency respiratory cycle
    if N < 150:
        return {
            "brpm": 0.0,
            "confidence": 0.0,
            "is_valid": False,
            "status": "Unavailable",
            "message": "Collecting respiratory motion window (need >= 150 frames)...",
            "frequency_hz": 0.0
        }

    # 1. Detrend signal to remove baseline drift
    detrended = detrend_signal(data, lambda_val=500)

    # 2. Bandpass filter in respiratory range (0.10 Hz to 0.50 Hz)
    low_hz = 0.10
    high_hz = 0.50
    nyq = 0.5 * fs
    b, a = signal.butter(2, [low_hz / nyq, high_hz / nyq], btype='bandpass')
    resp_filtered = signal.filtfilt(b, a, detrended)

    # Variance check - if signal is virtually motionless
    variance = float(np.var(resp_filtered))
    if variance < 1e-5:
        return {
            "brpm": 0.0,
            "confidence": 0.0,
            "is_valid": False,
            "status": "Unavailable",
            "message": "Insufficient respiratory motion in frame. Position head and upper chest stably.",
            "frequency_hz": 0.0
        }

    # 3. FFT Periodogram with zero-padding for high sub-Hertz resolution
    nfft = max(1024, 2 ** (N - 1).bit_length())
    freqs, pxx = signal.periodogram(resp_filtered, fs=fs, nfft=nfft, detrend=False)

    mask = (freqs >= low_hz) & (freqs <= high_hz)
    resp_freqs = freqs[mask]
    resp_pxx = pxx[mask]

    if len(resp_pxx) == 0 or np.max(resp_pxx) <= 0:
        return {
            "brpm": 0.0,
            "confidence": 0.0,
            "is_valid": False,
            "status": "Unavailable",
            "message": "No respiratory spectral peak detected in physiological bandwidth.",
            "frequency_hz": 0.0
        }

    peak_idx = np.argmax(resp_pxx)
    dom_hz = float(resp_freqs[peak_idx])
    brpm = round(dom_hz * 60.0, 1)

    # Compute peak prominence / SNR
    peak_band = (resp_freqs >= (dom_hz - 0.04)) & (resp_freqs <= (dom_hz + 0.04))
    peak_power = np.sum(resp_pxx[peak_band])
    noise_power = np.sum(resp_pxx[~peak_band]) + 1e-8
    snr_ratio = peak_power / noise_power

    # Valid if SNR is distinct and BrPM is physiological (8 to 28 BrPM)
    is_valid = bool((snr_ratio > 1.4) and (8.0 <= brpm <= 28.0))
    confidence = round(float(np.clip((snr_ratio - 1.0) / 3.0 * 100.0, 10.0, 92.0)), 1)

    return {
        "brpm": brpm if is_valid else 0.0,
        "raw_brpm": brpm,
        "confidence": confidence if is_valid else 0.0,
        "snr": round(float(snr_ratio), 2),
        "is_valid": is_valid,
        "status": "Estimated Visual Respiratory Rate" if is_valid else "Unavailable",
        "message": "Experimental research estimate from subtle periodic motion (Non-Diagnostic)" if is_valid else "Insufficient respiratory periodicity detected",
        "frequency_hz": round(dom_hz, 3)
    }
