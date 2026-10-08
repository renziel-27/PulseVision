import numpy as np
from collections import deque

class FatigueAndStressAnalyzer:
    """
    Experimental facial fatigue and stress indicator.
    Calculates Eye Aspect Ratio (EAR), blink dynamics, PERCLOS, and physiological stress proxies.
    Clearly labeled as an estimated research indicator, not a medical diagnosis.
    """
    def __init__(self, ear_threshold=0.21, consecutive_frames=2):
        self.ear_threshold = ear_threshold
        self.consecutive_frames = consecutive_frames
        
        self.frame_counter = 0
        self.blink_count = 0
        self.blink_history = deque(maxlen=300) # last 10 seconds at 30 fps
        self.ear_history = deque(maxlen=300)
        self.closed_frames_total = 0
        self.total_frames_analyzed = 0

    def reset(self):
        """Resets blink counters, state machine, and rolling histories for a new scan session."""
        self.frame_counter = 0
        self.blink_count = 0
        self.blink_history.clear()
        self.ear_history.clear()
        self.closed_frames_total = 0
        self.total_frames_analyzed = 0

    def calculate_ear(self, eye_pts):
        """
        Calculates Eye Aspect Ratio (EAR) from 6 2D facial landmark points.
        p1: outer corner, p4: inner corner
        p2, p3: top lid; p6, p5: bottom lid
        """
        if eye_pts is None or len(eye_pts) < 6:
            return 0.28 # Normal baseline default

        pts = np.array(eye_pts, dtype=np.float32)
        # Vertical distances
        v1 = np.linalg.norm(pts[1] - pts[5])
        v2 = np.linalg.norm(pts[2] - pts[4])
        # Horizontal distance
        h = np.linalg.norm(pts[0] - pts[3])

        if h < 1e-4:
            return 0.28
        ear = (v1 + v2) / (2.0 * h)
        return float(ear)

    def process_frame(self, left_eye_pts, right_eye_pts, motion_delta=0.0, current_bpm=72.0):
        ear_left = self.calculate_ear(left_eye_pts)
        ear_right = self.calculate_ear(right_eye_pts)
        avg_ear = (ear_left + ear_right) / 2.0

        self.ear_history.append(avg_ear)
        self.total_frames_analyzed += 1

        # Blink state machine
        if avg_ear < self.ear_threshold:
            self.frame_counter += 1
            self.closed_frames_total += 1
        else:
            if self.frame_counter >= self.consecutive_frames:
                self.blink_count += 1
                self.blink_history.append(1)
            self.frame_counter = 0

        # PERCLOS: percentage of time eyes are >= 80% closed
        perclos = (self.closed_frames_total / max(1, self.total_frames_analyzed)) * 100.0

        # Fatigue & Alertness classification
        has_eyes = (left_eye_pts is not None and right_eye_pts is not None)
        if not has_eyes:
            fatigue_level = "Normal"
            fatigue_score = 15
            fatigue_msg = "Facial landmarks tracking."
            alertness_status = "Alert"
            alertness_badge = "🟢 Alert"
        elif perclos > 30.0 or (len(self.ear_history) > 60 and np.mean(self.ear_history) < 0.20):
            fatigue_level = "High Drowsiness"
            fatigue_score = 80
            fatigue_msg = "Noticeable drowsiness signs detected. Consider taking a break."
            alertness_status = "Drowsiness indicators detected"
            alertness_badge = "🔴 Drowsiness indicators detected"
        elif perclos > 15.0 or self.blink_count > 25:
            fatigue_level = "Mild Fatigue"
            fatigue_score = 45
            fatigue_msg = "Mild eye strain or elevated blinking observed."
            alertness_status = "Possible drowsiness"
            alertness_badge = "🟡 Possible drowsiness"
        else:
            fatigue_level = "Normal"
            fatigue_score = 15
            fatigue_msg = "Optimal alertness and eye blink dynamic."
            alertness_status = "Alert"
            alertness_badge = "🟢 Alert"

        # Stress estimation: proxy combining heart rate elevation, pulse variance, and motion jitter
        bpm_component = max(0.0, min(1.0, (current_bpm - 65.0) / 45.0)) # 65-110 range
        motion_component = min(1.0, motion_delta / 15.0)
        stress_val = int(np.clip((0.6 * bpm_component + 0.4 * motion_component) * 100.0, 10, 95))

        if stress_val > 70:
            stress_level = "High"
            stress_desc = "Physiological markers indicate elevated autonomic activation."
        elif stress_val > 40:
            stress_level = "Moderate"
            stress_desc = "Mild physiological activation observed."
        else:
            stress_level = "Low (Relaxed)"
            stress_desc = "Physiological state indicates calm and relaxed equilibrium."

        return {
            "ear": round(avg_ear, 3) if has_eyes else 0.28,
            "blink_count": self.blink_count,
            "perclos": round(perclos, 1),
            "fatigue_level": fatigue_level,
            "fatigue_score": fatigue_score,
            "fatigue_message": fatigue_msg,
            "alertness_status": alertness_status,
            "alertness_badge": alertness_badge,
            "stress_score": stress_val,
            "stress_level": stress_level,
            "stress_description": stress_desc,
            "disclaimer": "Estimated indicator only, not a clinical diagnosis."
        }
