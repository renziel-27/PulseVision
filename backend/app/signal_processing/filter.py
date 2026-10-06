import numpy as np
from scipy import signal
from scipy import sparse

def detrend_signal(input_signal, lambda_val=100):
    """
    Tarvainen smoothness priors detrending filter.
    Removes low-frequency baseline drifts (e.g. respiration, minor subject shifts).
    """
    signal_arr = np.asarray(input_signal, dtype=np.float64).flatten()
    T = len(signal_arr)
    if T < 10:
        return signal_arr

    I = np.identity(T)
    # Second-order difference matrix
    ones = np.ones(T)
    minus_twos = -2 * np.ones(T)
    diags_data = np.array([ones, minus_twos, ones])
    diags_index = np.array([0, 1, 2])
    D = sparse.spdiags(diags_data, diags_index, (T - 2), T).toarray()

    filtered = np.dot(
        (I - np.linalg.inv(I + (lambda_val ** 2) * np.dot(D.T, D))), signal_arr
    )
    return filtered

def bandpass_filter(input_signal, fs=30.0, low_hz=0.75, high_hz=2.5, order=2):
    """
    Butterworth zero-phase bandpass filter targeting physiological heart rate range:
    0.75 Hz (45 BPM) to 2.5 Hz (150 BPM).
    """
    signal_arr = np.asarray(input_signal, dtype=np.float64).flatten()
    if len(signal_arr) < 15:
        return signal_arr

    nyquist = 0.5 * fs
    low = max(0.01, low_hz / nyquist)
    high = min(0.99, high_hz / nyquist)

    b, a = signal.butter(order, [low, high], btype='bandpass')
    filtered = signal.filtfilt(b, a, signal_arr)
    return filtered
