import numpy as np
import cv2
from collections import deque

class PreflightGuard:
    def __init__(self):
        self.prev_centroid = None
        self.motion_history = deque(maxlen=30)

    def check_quality(self, frame_bgr, face_box):
        h, w = frame_bgr.shape[:2]
        if face_box is None:
            return {
                "ready": False,
                "face_detected": False,
                "lighting_ok": False,
                "lighting_mean": 0.0,
                "lighting_contrast": 0.0,
                "position_ok": False,
                "stability_ok": False,
                "motion_score": 0.0,
                "message": "No face detected. Please position your face in the camera view."
            }

        fx, fy, fw, fh = face_box
        face_area_ratio = (fw * fh) / (w * h)
        cx = fx + fw / 2.0
        cy = fy + fh / 2.0

        # Position check: centered and filling 8% to 75% of view
        is_centered = (0.22 * w < cx < 0.78 * w) and (0.18 * h < cy < 0.82 * h)
        is_good_size = 0.07 <= face_area_ratio <= 0.80
        position_ok = is_centered and is_good_size

        # Lighting check in face crop
        face_crop = frame_bgr[max(0, fy):min(h, fy+fh), max(0, fx):min(w, fx+fw)]
        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        mean_lum = float(np.mean(gray))
        contrast = float(np.std(gray))
        lighting_ok = (30 <= mean_lum <= 245) and (contrast >= 8.0)

        # Motion / stability check
        current_centroid = np.array([cx, cy])
        if self.prev_centroid is not None:
            shift = float(np.linalg.norm(current_centroid - self.prev_centroid))
            self.motion_history.append(shift)
        else:
            self.motion_history.append(0.0)
        self.prev_centroid = current_centroid

        avg_motion = float(np.mean(self.motion_history)) if len(self.motion_history) > 0 else 0.0
        stability_ok = avg_motion < 18.0

        ready = position_ok and lighting_ok and stability_ok
        message = "Pre-flight checks passed. Ready for scan." if ready else ""
        if not position_ok:
            message = "Please center your face inside the bounding guide."
        elif not lighting_ok:
            if mean_lum < 30:
                message = "Lighting very dim. Face camera towards a light source."
            elif mean_lum > 245:
                message = "Face overexposed. Reduce direct backlight."
            else:
                message = "Low contrast. Ensure face is evenly illuminated."
        elif not stability_ok:
            message = "Excessive motion detected. Please hold steady."

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
