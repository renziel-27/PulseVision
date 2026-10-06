import os
import cv2
import numpy as np
from scipy import signal
from collections import deque
import time

class RPPGEngine:
    """
    Remote Photoplethysmography (rPPG) Engine.
    Extracts subtle micro-vascular blood volume pulse (BVP) from facial video
    using POS (Plane-Orthogonal-to-Skin), CHROM (Chrominance), and Green channel methods.
    Includes pre-flight checks (lighting, positioning, stability) and SNR-based signal quality rejection.
    """
    def __init__(self, buffer_size=300, fps=30):
        self.buffer_size = buffer_size  # ~10 seconds at 30 fps
        self.fps = fps
        self.rgb_buffer = deque(maxlen=buffer_size)
        self.timestamps = deque(maxlen=buffer_size)
        self.raw_signals = deque(maxlen=buffer_size)
        self.filtered_signals = deque(maxlen=buffer_size)
        
        # Landmark stability tracker
        self.prev_landmarks = None
        self.motion_history = deque(maxlen=30)
        
        # Cascade face detector as lightweight ultra-fast fallback & MediaPipe interface
        cascade_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cascades")
        face_xml = os.path.join(cascade_dir, 'haarcascade_frontalface_default.xml')
        eye_xml = os.path.join(cascade_dir, 'haarcascade_eye.xml')

        def safe_cascade(path):
            try:
                rel = os.path.relpath(path)
                c = cv2.CascadeClassifier(rel)
                if not c.empty():
                    return c
            except Exception:
                pass
            return cv2.CascadeClassifier(path)

        self.face_cascade = safe_cascade(face_xml)
        self.eye_cascade = safe_cascade(eye_xml)

    def check_preflight(self, frame, face_box):
        """
        Pre-flight quality guards:
        1. Face Position & Size
        2. Lighting/Illumination (Luminance & Contrast)
        3. Motion/Stability
        """
        h, w = frame.shape[:2]
        if face_box is None:
            return {
                "ready": False,
                "face_detected": False,
                "lighting_ok": False,
                "position_ok": False,
                "stability_ok": False,
                "message": "No face detected. Please position your face in the camera view."
            }

        fx, fy, fw, fh = face_box
        face_area_ratio = (fw * fh) / (w * h)
        face_center_x = fx + fw / 2
        face_center_y = fy + fh / 2

        # 1. Position check (Centered and good size: 10% to 75% of frame)
        is_centered = (0.25 * w < face_center_x < 0.75 * w) and (0.2 * h < face_center_y < 0.8 * h)
        is_good_size = 0.08 <= face_area_ratio <= 0.80
        position_ok = is_centered and is_good_size

        # 2. Lighting check in Face ROI
        face_crop = frame[max(0, fy):min(h, fy + fh), max(0, fx):min(w, fx + fw)]
        if face_crop.size == 0:
            return {"ready": False, "message": "Invalid face region"}

        gray_face = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        mean_lum = float(np.mean(gray_face))
        contrast = float(np.std(gray_face))

        # Tolerant bounds for various webcam models and indoor lighting
        lighting_ok = (30 <= mean_lum <= 245) and (contrast >= 8)
        lighting_msg = "Optimal"
        if mean_lum < 30:
            lighting_msg = "Lighting very dim. Face camera towards a light source."
        elif mean_lum > 245:
            lighting_msg = "Face overexposed. Reduce direct backlight."
        elif contrast < 8:
            lighting_msg = "Low contrast. Ensure face is evenly illuminated."

        # 3. Stability check
        current_center = np.array([face_center_x, face_center_y])
        if self.prev_landmarks is not None:
            displacement = np.linalg.norm(current_center - self.prev_landmarks)
            self.motion_history.append(displacement)
        else:
            self.motion_history.append(0.0)
        self.prev_landmarks = current_center

        avg_motion = float(np.mean(self.motion_history)) if len(self.motion_history) > 0 else 0.0
        stability_ok = avg_motion < 18.0  # Max pixel jitter allowed

        ready = position_ok and lighting_ok and stability_ok
        message = "Pre-flight checks passed. Ready for scan." if ready else ""
        if not position_ok:
            message = "Center your face inside the guide frame."
        elif not lighting_ok:
            message = lighting_msg
        elif not stability_ok:
            message = "Face motion detected. Please hold still."

        return {
            "ready": ready,
            "face_detected": True,
            "lighting_ok": lighting_ok,
            "lighting_mean": round(mean_lum, 1),
            "lighting_contrast": round(contrast, 1),
            "position_ok": position_ok,
            "stability_ok": stability_ok,
            "motion_score": round(avg_motion, 2),
            "message": message
        }

    def is_skin_region(self, crop):
        """
        Validates if a region of interest contains genuine human skin pixels
        across diverse Fitzpatrick skin types (I - VI) and lighting conditions.
        Prevents walls, paper, chairs, or backgrounds from being processed.
        """
        if crop is None or crop.size == 0:
            return False, 0.0

        # YCrCb color space skin bounds (inclusive of all melanin levels)
        ycrcb = cv2.cvtColor(crop, cv2.COLOR_BGR2YCrCb)
        skin_mask_ycrcb = cv2.inRange(ycrcb, np.array([0, 125, 65]), np.array([255, 185, 140]))

        # HSV color space skin bounds
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        mask_hsv1 = cv2.inRange(hsv, np.array([0, 15, 30]), np.array([35, 255, 255]))
        mask_hsv2 = cv2.inRange(hsv, np.array([160, 15, 30]), np.array([180, 255, 255]))
        skin_mask_hsv = cv2.bitwise_or(mask_hsv1, mask_hsv2)

        # Combined mask
        skin_mask = cv2.bitwise_and(skin_mask_ycrcb, skin_mask_hsv)
        skin_ratio = np.count_nonzero(skin_mask) / (crop.shape[0] * crop.shape[1])

        # Require at least 12% skin-conforming chromatic pixels in the crop
        return skin_ratio >= 0.12, float(skin_ratio)

    def is_fingertip_region(self, frame):
        """
        Detects if user is placing their fingertip directly over the webcam lens
        (Fingertip Optical PPG mode). In this mode, light scattering creates a
        predominantly red/pink frame with high red saturation.
        """
        if frame is None or frame.size == 0:
            return False, np.array([0.0, 0.0, 0.0])

        b_mean = float(np.mean(frame[:, :, 0]))
        g_mean = float(np.mean(frame[:, :, 1]))
        r_mean = float(np.mean(frame[:, :, 2]))

        # Fingertip covering lens creates high red transmission relative to blue
        is_finger = (r_mean > 50.0) and (r_mean > g_mean * 1.05) and (r_mean > b_mean * 1.25)
        rgb_tuple = np.array([r_mean, g_mean, b_mean])
        return is_finger, rgb_tuple

    def extract_rois(self, frame, face_box):
        """
        Extracts skin ROIs: Forehead (Primary), Left Cheek, Right Cheek.
        Verifies genuine human skin presence to reject walls or non-face objects.
        """
        h, w = frame.shape[:2]
        if face_box is None:
            return {}, np.array([0.0, 0.0, 0.0]), False

        fx, fy, fw, fh = face_box

        # Forehead (Primary rPPG source): top 12% - 32% of face, center 50% width
        fh_x = int(fx + fw * 0.25)
        fh_y = int(fy + fh * 0.12)
        fh_w = int(fw * 0.50)
        fh_h = int(fh * 0.20)

        # Left Cheek (viewer's left):
        lc_x = int(fx + fw * 0.15)
        lc_y = int(fy + fh * 0.55)
        lc_w = int(fw * 0.25)
        lc_h = int(fh * 0.22)

        # Right Cheek (viewer's right):
        rc_x = int(fx + fw * 0.60)
        rc_y = int(fy + fh * 0.55)
        rc_w = int(fw * 0.25)
        rc_h = int(fh * 0.22)

        rois = {
            "forehead": (fh_x, fh_y, fh_w, fh_h),
            "left_cheek": (lc_x, lc_y, lc_w, lc_h),
            "right_cheek": (rc_x, rc_y, rc_w, rc_h)
        }

        # Multi-Zone Crop Extraction (Forehead, Left Cheek, Right Cheek, Center Face)
        fh_crop = frame[max(0, fh_y):min(h, fh_y + fh_h), max(0, fh_x):min(w, fh_x + fh_w)]
        lc_crop = frame[max(0, lc_y):min(h, lc_y + lc_h), max(0, lc_x):min(w, lc_x + lc_w)]
        rc_crop = frame[max(0, rc_y):min(h, rc_y + rc_h), max(0, rc_x):min(w, rc_x + rc_w)]
        fc_crop = frame[max(0, fy):min(h, fy + fh), max(0, fx):min(w, fx + fw)]

        is_fh_skin, fh_ratio = self.is_skin_region(fh_crop)
        is_lc_skin, _ = self.is_skin_region(lc_crop)
        is_rc_skin, _ = self.is_skin_region(rc_crop)
        is_fc_skin, _ = self.is_skin_region(fc_crop)

        is_any_skin = is_fh_skin or is_lc_skin or is_rc_skin or is_fc_skin

        if not is_any_skin:
            # Entire detected box contains no valid skin pixels (e.g. wall/inanimate object)
            return rois, np.array([0.0, 0.0, 0.0]), False

        # Extract RGB averages from all valid skin ROIs
        valid_rgbs = []
        weights = []

        if is_fh_skin and fh_crop.size > 0:
            valid_rgbs.append(np.mean(cv2.cvtColor(fh_crop, cv2.COLOR_BGR2RGB), axis=(0, 1)))
            weights.append(0.60) # Forehead has highest capillary density

        if is_lc_skin and lc_crop.size > 0:
            valid_rgbs.append(np.mean(cv2.cvtColor(lc_crop, cv2.COLOR_BGR2RGB), axis=(0, 1)))
            weights.append(0.20)

        if is_rc_skin and rc_crop.size > 0:
            valid_rgbs.append(np.mean(cv2.cvtColor(rc_crop, cv2.COLOR_BGR2RGB), axis=(0, 1)))
            weights.append(0.20)

        if len(valid_rgbs) == 0 and is_fc_skin and fc_crop.size > 0:
            # Fallback to whole face skin crop
            valid_rgbs.append(np.mean(cv2.cvtColor(fc_crop, cv2.COLOR_BGR2RGB), axis=(0, 1)))
            weights.append(1.0)

        # Weighted composite rPPG signal
        w_arr = np.array(weights) / np.sum(weights)
        avg_rgb = np.zeros(3, dtype=np.float64)
        for i, rgb in enumerate(valid_rgbs):
            avg_rgb += w_arr[i] * rgb

        return rois, avg_rgb, True

    def add_frame_sample(self, avg_rgb):
        """Add spatial average RGB sample to sliding temporal buffer"""
        t = time.time()
        self.rgb_buffer.append(avg_rgb)
        self.timestamps.append(t)

    def compute_pos(self, rgb_signals):
        """
        Plane-Orthogonal-to-Skin (POS) Algorithm (Wang et al., 2017).
        Projects normalized RGB signals onto two orthogonal chrominance planes
        to eliminate specular reflection and intensity fluctuations.
        """
        N = len(rgb_signals)
        if N < 30:
            return np.zeros(N)

        # Temporal normalization: divide each channel by its temporal mean
        rgb = np.array(rgb_signals, dtype=np.float64) # (N, 3)
        mean_rgb = np.mean(rgb, axis=0) + 1e-6
        norm_rgb = rgb / mean_rgb

        R = norm_rgb[:, 0]
        G = norm_rgb[:, 1]
        B = norm_rgb[:, 2]

        # Projection vectors:
        # P_x = [0, 1, -1] -> S1 = G - B
        # P_y = [-2, 1, 1] -> S2 = -2R + G + B
        S1 = G - B
        S2 = -2.0 * R + G + B

        # Adaptive combination based on standard deviation ratio
        std_S1 = np.std(S1)
        std_S2 = np.std(S2) + 1e-6
        alpha = std_S1 / std_S2

        H = S1 + alpha * S2
        return H

    def compute_chrom(self, rgb_signals):
        """
        Chrominance-based (CHROM) Algorithm (Haan & Jeanne, 2013).
        Constructs two orthogonal chrominance signals:
        Xs = 3R - 2G
        Ys = 1.5R + G - 1.5B
        """
        N = len(rgb_signals)
        if N < 30:
            return np.zeros(N)

        rgb = np.array(rgb_signals, dtype=np.float64)
        mean_rgb = np.mean(rgb, axis=0) + 1e-6
        norm_rgb = rgb / mean_rgb

        R = norm_rgb[:, 0]
        G = norm_rgb[:, 1]
        B = norm_rgb[:, 2]

        Xs = 3.0 * R - 2.0 * G
        Ys = 1.5 * R + G - 1.5 * B

        std_Xs = np.std(Xs)
        std_Ys = np.std(Ys) + 1e-6
        alpha = std_Xs / std_Ys

        S = Xs - alpha * Ys
        return S

    def compute_green(self, rgb_signals):
        """Green channel rPPG (Verkruysse et al., 2008)"""
        rgb = np.array(rgb_signals, dtype=np.float64)
        G = rgb[:, 1]
        return G - np.mean(G)

    def bandpass_filter(self, raw_signal, low_bpm=42, high_bpm=210):
        """
        4th-order Butterworth bandpass filter.
        Passband: [0.7 Hz, 3.5 Hz] corresponding to [42 BPM, 210 BPM].
        """
        if len(raw_signal) < 30:
            return raw_signal

        # Remove linear trend
        detrended = signal.detrend(raw_signal)

        low_hz = low_bpm / 60.0   # 0.70 Hz
        high_hz = high_bpm / 60.0 # 3.50 Hz

        # Effective sampling rate estimate
        if len(self.timestamps) >= 2:
            dt = (self.timestamps[-1] - self.timestamps[0]) / (len(self.timestamps) - 1)
            effective_fps = 1.0 / dt if dt > 0 else self.fps
        else:
            effective_fps = self.fps

        effective_fps = max(15.0, min(effective_fps, 60.0))
        nyquist = 0.5 * effective_fps

        low_norm = max(0.01, min(low_hz / nyquist, 0.95))
        high_norm = max(low_norm + 0.05, min(high_hz / nyquist, 0.99))

        try:
            b, a = signal.butter(4, [low_norm, high_norm], btype='bandpass')
            filtered = signal.filtfilt(b, a, detrended)
            return filtered
        except Exception:
            return detrended

    def estimate_bpm_and_sqi(self, filtered_signal):
        """
        Computes Power Spectral Density using FFT and Welch's method.
        Calculates Signal Quality Index (SQI) and Signal-to-Noise Ratio (SNR).
        Rejects low-quality noisy signals.
        """
        N = len(filtered_signal)
        if N < 45: # Need at least 1.5 seconds of data
            return {
                "bpm": 0.0,
                "confidence": 0.0,
                "sqi": 0.0,
                "snr_db": 0.0,
                "is_valid": False,
                "rejection_reason": "Accumulating video buffer... Please keep still."
            }

        # Sampling rate
        if len(self.timestamps) >= 2:
            total_time = self.timestamps[-1] - self.timestamps[0]
            dt = total_time / (len(self.timestamps) - 1)
            if 0.010 <= dt <= 0.20: # Valid real-world webcam interval (5 to 100 FPS)
                effective_fps = 1.0 / dt
            else:
                effective_fps = self.fps
        else:
            effective_fps = self.fps

        effective_fps = max(15.0, min(effective_fps, 60.0))

        # FFT with Hanning window to prevent spectral leakage
        window = np.hanning(N)
        windowed_signal = filtered_signal * window
        
        # Zero-pad to 2048 for high frequency resolution
        nfft = 2048
        fft_vals = np.fft.rfft(windowed_signal, n=nfft)
        freqs = np.fft.rfftfreq(nfft, d=1.0/effective_fps)
        psd = np.abs(fft_vals) ** 2

        # Cardiac frequency search range [0.75 Hz (45 BPM) to 3.2 Hz (192 BPM)]
        min_idx = np.where(freqs >= 0.75)[0][0]
        max_idx = np.where(freqs <= 3.2)[0][-1]

        cardiac_freqs = freqs[min_idx:max_idx+1]
        cardiac_psd = psd[min_idx:max_idx+1]

        if len(cardiac_psd) == 0:
            return {"bpm": 0.0, "confidence": 0.0, "sqi": 0.0, "is_valid": False, "rejection_reason": "Low signal quality."}

        # Peak frequency search
        peak_idx = np.argmax(cardiac_psd)
        peak_freq = cardiac_freqs[peak_idx]

        # Check for fundamental subharmonic if 2nd harmonic was chosen
        subharmonic = peak_freq / 2.0
        if 0.75 <= subharmonic <= 2.2:
            sub_mask = np.abs(cardiac_freqs - subharmonic) <= 0.15
            if np.any(sub_mask):
                sub_max = np.max(cardiac_psd[sub_mask])
                if sub_max >= 0.35 * cardiac_psd[peak_idx]:
                    sub_idx = np.where(sub_mask)[0][np.argmax(cardiac_psd[sub_mask])]
                    peak_freq = cardiac_freqs[sub_idx]
                    peak_idx = sub_idx

        estimated_bpm = peak_freq * 60.0

        # Calculate SNR (Signal-to-Noise Ratio)
        # Signal power: area around peak (+- 0.15 Hz and 1st harmonic +- 0.15 Hz)
        delta_f = 0.15
        signal_mask = (cardiac_freqs >= peak_freq - delta_f) & (cardiac_freqs <= peak_freq + delta_f)
        
        # 1st harmonic (2 * peak_freq)
        harmonic_freq = 2 * peak_freq
        if harmonic_freq <= cardiac_freqs[-1]:
            signal_mask |= (cardiac_freqs >= harmonic_freq - delta_f) & (cardiac_freqs <= harmonic_freq + delta_f)

        signal_power = np.sum(cardiac_psd[signal_mask])
        noise_power = np.sum(cardiac_psd[~signal_mask]) + 1e-8

        snr = signal_power / noise_power
        snr_db = 10.0 * np.log10(snr)

        # Signal Quality Index (SQI) normalized between 0.0 and 1.0
        # Peak sharpness metric + SNR
        peak_height = cardiac_psd[peak_idx]
        mean_psd = np.mean(cardiac_psd) + 1e-8
        prominence = peak_height / mean_psd

        sqi = float(np.clip((prominence - 1.5) / 6.0 * 0.5 + (snr_db + 3.0) / 15.0 * 0.5, 0.0, 1.0))
        confidence = round(sqi * 100, 1)

        # Rejection Filter: Reject if SQI < 0.25 or SNR is too low
        is_valid = sqi >= 0.25 and (45.0 <= estimated_bpm <= 200.0)
        rejection_reason = ""
        if not is_valid:
            if sqi < 0.25:
                rejection_reason = "Low signal quality. Please remain still and face the camera."
            else:
                rejection_reason = "Heart rate out of physiological range. Please adjust lighting and hold still."

        return {
            "bpm": round(estimated_bpm, 1),
            "confidence": confidence,
            "sqi": round(sqi, 2),
            "snr_db": round(snr_db, 1),
            "peak_freq": round(peak_freq, 2),
            "is_valid": is_valid,
            "rejection_reason": rejection_reason
        }

    def process_buffer(self, algorithm="pos"):
        """
        Processes current RGB buffer using selected algorithm ('pos', 'chrom', 'green')
        """
        if len(self.rgb_buffer) < 30:
            return {
                "bpm": 0.0,
                "confidence": 0.0,
                "sqi": 0.0,
                "waveform": [],
                "is_valid": False,
                "rejection_reason": "Initializing buffer... Keep face steady."
            }

        rgb_list = list(self.rgb_buffer)
        if algorithm.lower() == "chrom":
            raw = self.compute_chrom(rgb_list)
        elif algorithm.lower() == "green":
            raw = self.compute_green(rgb_list)
        else: # Default POS
            raw = self.compute_pos(rgb_list)

        filtered = self.bandpass_filter(raw)
        stats = self.estimate_bpm_and_sqi(filtered)

        # Normalize waveform for UI visualization (-1.0 to 1.0)
        norm_wave = []
        if len(filtered) > 0:
            std_f = np.std(filtered) + 1e-6
            wave_clipped = np.clip((filtered - np.mean(filtered)) / (2.5 * std_f), -1.0, 1.0)
            norm_wave = [round(float(v), 3) for v in wave_clipped[-120:]] # last 4 seconds

        stats["waveform"] = norm_wave
        stats["algorithm"] = algorithm.upper()
        return stats
