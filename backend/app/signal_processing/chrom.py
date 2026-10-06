import math
import numpy as np
from scipy import signal

def compute_chrom(rgb_series, fs=30.0):
    """
    Chrominance-based rPPG method (de Haan & Jeanne, IEEE TBME 2013).
    Eliminates specular reflections using normalized chrominance signals:
    Xs = 3R - 2G, Ys = 1.5R + G - 1.5B with adaptive standard deviation scaling.
    """
    LPF = 0.75
    HPF = 2.5
    WinSec = 1.6

    RGB = np.asarray(rgb_series, dtype=np.float64)
    FN = RGB.shape[0]
    if FN < 30:
        return np.zeros(FN)

    NyquistF = 0.5 * fs
    b_filter, a_filter = signal.butter(3, [LPF / NyquistF, HPF / NyquistF], 'bandpass')

    WinL = math.ceil(WinSec * fs)
    if WinL % 2:
        WinL += 1
    NWin = math.floor((FN - WinL // 2) / (WinL // 2))
    WinS = 0
    WinM = int(WinS + WinL // 2)
    WinE = WinS + WinL
    totallen = (WinL // 2) * (NWin + 1)
    S = np.zeros(totallen)

    for i in range(NWin):
        base = np.mean(RGB[WinS:WinE, :], axis=0)
        base[base == 0] = 1e-6
        RGBNorm = np.true_divide(RGB[WinS:WinE], base)

        Xs = np.squeeze(3 * RGBNorm[:, 0] - 2 * RGBNorm[:, 1])
        Ys = np.squeeze(1.5 * RGBNorm[:, 0] + RGBNorm[:, 1] - 1.5 * RGBNorm[:, 2])

        Xf = signal.filtfilt(b_filter, a_filter, Xs, axis=0)
        Yf = signal.filtfilt(b_filter, a_filter, Ys)

        std_yf = np.std(Yf)
        if std_yf == 0:
            std_yf = 1e-6
        Alpha = np.std(Xf) / std_yf

        SWin = Xf - Alpha * Yf
        SWin = np.multiply(SWin, signal.windows.hann(WinL))

        S[WinS:WinM] = S[WinS:WinM] + SWin[:int(WinL // 2)]
        S[WinM:WinE] = SWin[int(WinL // 2):]
        WinS = WinM
        WinM = WinS + WinL // 2
        WinE = WinS + WinL

    res = S[:FN]
    if len(res) < FN:
        res = np.pad(res, (0, FN - len(res)), mode='edge')
    return res
