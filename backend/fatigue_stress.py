import cv2
import numpy as np
from collections import deque
import time

class FatigueAndStressAnalyzer:
    """
    Fatigue & Stress Assessment Module.
    - Fatigue Analysis: Eye Aspect Ratio (EAR), blink frequency, and PERCLOS (percentage of eye closure).
    - Stress Proxy Indicator: rPPG pulse variability proxy + micro-facial motion variance.
    """
    def __init__(self, ear_threshold=0.21, consecutive_frames_blink=2):
        self.ear_threshold = ear_threshold
        self.consecutive_frames_blink = consecutive_frames_blink
        self.blink_counter = 0
        self.blink_frame_count = 0
        self.total_frames = 0
        self.closed_frames = 0
        self.ear_history = deque(maxlen=300) # ~10 seconds history
        self.start_time = time.time()
        self.last_blink_time = time.time()
        
        # Stress analysis history
        self.motion_variance_history = deque(maxlen=150)
        self.bpm_history = deque(maxlen=30)

    def calculate_ear(self, eye_points):
        """
        Computes Eye Aspect Ratio (EAR) for a 6-point eye landmark set:
        EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)
        """
        if eye_points is None or len(eye_points) < 6:
            return 0.28 # Default open eye baseline

        p = np.array(eye_points, dtype=np.float32)
        # Vertical distances
        v1 = np.linalg.norm(p[1] - p[5])
        v2 = np.linalg.norm(p[2] - p[4])
        # Horizontal distance
        h = np.linalg.norm(p[0] - p[3])

        if h < 1e-5:
            return 0.28

        ear = (v1 + v2) / (2.0 * h)
        return float(ear)

    def calculate_eye_redness(self, eye_crops):
        """
        Calculates Eye Sclera Redness & Ocular Strain Index:
        Evaluates the red-to-green/blue chromatic ratio: R / (G + B) in the eye region.
        """
        if not eye_crops or len(eye_crops) == 0:
            return 22.0, "Normal (Clear Sclera)"

        redness_vals = []
        for crop in eye_crops:
            if crop is not None and crop.size > 0:
                rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB).astype(np.float32)
                r = rgb[:, :, 0]
                g = rgb[:, :, 1]
                b = rgb[:, :, 2]
                
                # Redness ratio on bright sclera pixels
                brightness = (r + g + b) / 3.0
                sclera_mask = brightness > 50.0
                if np.any(sclera_mask):
                    ratio = np.mean(r[sclera_mask] / (g[sclera_mask] + b[sclera_mask] + 1e-5))
                    # Normal ratio ~0.50 - 0.65; Red/strained eye >0.75
                    redness_score = float(np.clip((ratio - 0.50) / 0.40 * 100.0, 5.0, 95.0))
                    redness_vals.append(redness_score)

        if len(redness_vals) > 0:
            avg_redness = float(np.mean(redness_vals))
        else:
            avg_redness = 22.0

        if avg_redness < 35:
            redness_status = "Optimal (Clear Sclera)"
        elif avg_redness < 65:
            redness_status = "Mild Redness (Eye Strain)"
        else:
            redness_status = "High Redness (Fatigued / Dry Eye)"

        return round(avg_redness, 1), redness_status

    def process_landmarks(self, left_eye_pts=None, right_eye_pts=None, eye_crops=None, motion_delta=0.0, current_bpm=72.0):
        """
        Updates fatigue and stress metrics from current frame.
        """
        self.total_frames += 1
        now = time.time()

        # Compute EAR
        left_ear = self.calculate_ear(left_eye_pts)
        right_ear = self.calculate_ear(right_eye_pts)
        avg_ear = (left_ear + right_ear) / 2.0
        self.ear_history.append(avg_ear)

        # Compute Eye Redness
        eye_redness_pct, eye_redness_status = self.calculate_eye_redness(eye_crops)

        # Blink Detection State Machine
        is_closed = avg_ear < self.ear_threshold
        if is_closed:
            self.blink_frame_count += 1
            self.closed_frames += 1
        else:
            if self.blink_frame_count >= self.consecutive_frames_blink:
                self.blink_counter += 1
                self.last_blink_time = now
            self.blink_frame_count = 0

        # Calculate metrics over elapsed time window
        elapsed_sec = max(1.0, now - self.start_time)
        blinks_per_minute = round((self.blink_counter / elapsed_sec) * 60.0, 1)

        # PERCLOS: percentage of eye closure time
        perclos = round((self.closed_frames / max(1, self.total_frames)) * 100.0, 1)

        # Fatigue Classification (Combining PERCLOS, Blink rate, and Eye Redness)
        fatigue_score = 0
        fatigue_status = "Normal"
        fatigue_msg = "Alert & Focused"

        if perclos > 25.0 or (self.blink_frame_count > 15) or eye_redness_pct > 70.0:
            fatigue_status = "High Drowsiness / Eye Strain"
            fatigue_score = 85
            fatigue_msg = "Frequent eye closure and ocular redness detected. Screen rest recommended."
        elif perclos > 14.0 or blinks_per_minute > 28 or eye_redness_pct > 45.0:
            fatigue_status = "Mild Fatigue"
            fatigue_score = 55
            fatigue_msg = "Elevated blink rate and mild eye redness. Consider taking a 5-minute break."
        else:
            fatigue_status = "Normal"
            fatigue_score = 15
            fatigue_msg = "Optimal alertness level and clear eye sclera."

        # Stress Indicator Estimation
        self.motion_variance_history.append(motion_delta)
        if current_bpm > 40:
            self.bpm_history.append(current_bpm)

        # Stress proxy factors:
        # 1. Heart rate elevation above resting baseline (70 BPM)
        hr_factor = max(0, min(100, (current_bpm - 65) * 1.5)) if current_bpm > 0 else 30
        # 2. Movement / fidgeting factor
        motion_factor = min(100, np.mean(self.motion_variance_history) * 6.0) if len(self.motion_variance_history) > 0 else 10
        # 3. Blink irregularity factor
        blink_factor = min(100, blinks_per_minute * 2.0)

        stress_score = round(0.50 * hr_factor + 0.30 * motion_factor + 0.20 * blink_factor, 1)
        stress_score = float(np.clip(stress_score, 5.0, 95.0))

        if stress_score < 35:
            stress_level = "Low (Relaxed)"
            stress_emoji = "🌿"
            stress_desc = "Physiological state indicates calm and relaxed equilibrium."
        elif stress_score < 68:
            stress_level = "Moderate"
            stress_emoji = "⚡"
            stress_desc = "Moderate physiological arousal. Normal active engagement."
        else:
            stress_level = "High Stress"
            stress_emoji = "🔥"
            stress_desc = "Elevated physiological indicators. Deep breathing exercises recommended."

        return {
            "ear": round(avg_ear, 3),
            "blink_count": self.blink_counter,
            "blink_rate_bpm": blinks_per_minute,
            "perclos_pct": perclos,
            "eye_redness_score": eye_redness_pct,
            "eye_redness_status": eye_redness_status,
            "fatigue_level": fatigue_status,
            "fatigue_score": fatigue_score,
            "fatigue_message": fatigue_msg,
            "stress_score": stress_score,
            "stress_level": stress_level,
            "stress_emoji": stress_emoji,
            "stress_description": stress_desc
        }

    def reset(self):
        """Resets the fatigue & stress tracking session"""
        self.blink_counter = 0
        self.blink_frame_count = 0
        self.total_frames = 0
        self.closed_frames = 0
        self.ear_history.clear()
        self.motion_variance_history.clear()
        self.bpm_history.clear()
        self.start_time = time.time()
