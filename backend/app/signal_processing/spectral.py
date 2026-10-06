import numpy as np
from scipy import signal

def calculate_fft_bpm_and_sqi(bvp_signal, fs=30.0, low_hz=0.75, high_hz=2.5):
    """
    Fast Fourier Transform (FFT) cardiac frequency spectrum & Signal Quality Index (SQI).
    Identifies the dominant spectral peak and computes Signal-to-Noise Ratio (SNR).
    """
    bvp = np.asarray(bvp_signal, dtype=np.float64).flatten()
    if len(bvp) < 30:
        return {
            "bpm": 0.0,
            "confidence": 0.0,
            "sqi": 0.0,
            "snr_db": -10.0,
            "is_valid": False,
            "rejection_reason": "Insufficient frame count (need at least 30 frames)",
            "spectrum": {"bpm": [], "power": []}
        }

    # Zero-pad to nearest power of 2 for high frequency resolution
    N = 1 if len(bvp) == 0 else 2 ** (len(bvp) - 1).bit_length()
    N = max(N, 512)

    freqs, pxx = signal.periodogram(bvp, fs=fs, nfft=N, detrend=False)

    # Physiological mask (0.75 Hz to 2.5 Hz -> 45 to 150 BPM)
    mask = (freqs >= low_hz) & (freqs <= high_hz)
    cardiac_freqs = freqs[mask]
    cardiac_pxx = pxx[mask]

    if len(cardiac_pxx) == 0 or np.max(cardiac_pxx) == 0:
        return {
            "bpm": 0.0,
            "confidence": 0.0,
            "sqi": 0.0,
            "snr_db": -10.0,
            "is_valid": False,
            "rejection_reason": "No spectral power detected in physiological range",
            "spectrum": {"bpm": [], "power": []}
        }

    # Peak dominant frequency
    peak_idx = np.argmax(cardiac_pxx)
    dominant_hz = cardiac_freqs[peak_idx]
    estimated_bpm = round(float(dominant_hz * 60.0), 1)

    # Compute Signal-to-Noise Ratio (SNR): power around peak (+- 0.15 Hz) vs noise
    peak_band = (cardiac_freqs >= (dominant_hz - 0.15)) & (cardiac_freqs <= (dominant_hz + 0.15))
    signal_power = np.sum(cardiac_pxx[peak_band])
    noise_power = np.sum(cardiac_pxx[~peak_band]) + 1e-8
    snr_ratio = signal_power / noise_power
    snr_db = round(float(10.0 * np.log10(max(1e-4, snr_ratio))), 1)

    # Signal Quality Index (0.0 to 1.0) based on SNR and peak prominence
    sqi = float(np.clip((snr_db + 2.0) / 12.0, 0.05, 0.98))
    confidence = round(sqi * 100.0, 1)

    # Strict Quality Rejection Guard
    is_valid = (snr_db >= -2.0) and (45.0 <= estimated_bpm <= 160.0)
    rejection_reason = ""
    if not is_valid:
        if snr_db < -2.0:
            rejection_reason = "Low signal-to-noise ratio. Please improve lighting and avoid movement."
        elif estimated_bpm < 45.0 or estimated_bpm > 160.0:
            rejection_reason = "Detected frequency outside normal physiological range."

    # Normalized spectrum for UI chart
    spectrum_power = (cardiac_pxx / np.max(cardiac_pxx)).tolist()
    spectrum_bpm = (cardiac_freqs * 60.0).tolist()

    return {
        "bpm": estimated_bpm if is_valid else 0.0,
        "raw_bpm": estimated_bpm,
        "confidence": confidence,
        "sqi": round(sqi, 3),
        "snr_db": snr_db,
        "is_valid": is_valid,
        "rejection_reason": rejection_reason,
        "dominant_hz": round(float(dominant_hz), 3),
        "spectrum": {
            "bpm": [round(b, 1) for b in spectrum_bpm],
            "power": [round(p, 4) for p in spectrum_power]
        }
    }
