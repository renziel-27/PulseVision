import os
import cv2
import threading
from app.config import settings

# Disable OpenCV OpenCL acceleration on macOS to prevent multithreading segfaults in CascadeClassifier
cv2.ocl.setUseOpenCL(False)

class FaceDetector:
    def __init__(self):
        self._lock = threading.Lock()
        face_xml = os.path.join(settings.CASCADES_DIR, 'haarcascade_frontalface_default.xml')
        eye_xml = os.path.join(settings.CASCADES_DIR, 'haarcascade_eye.xml')

        def safe_load(path):
            if os.path.exists(path):
                c = cv2.CascadeClassifier(path)
                if not c.empty():
                    return c
            # Fallback to OpenCV default data path
            default_path = os.path.join(cv2.data.haarcascades, os.path.basename(path))
            return cv2.CascadeClassifier(default_path)

        self.face_cascade = safe_load(face_xml)
        self.eye_cascade = safe_load(eye_xml)
        self.locked_face = None
        self.lost_frames = 0

    def reset(self):
        """Resets single-subject tracking state when camera is turned off."""
        with self._lock:
            self.locked_face = None
            self.lost_frames = 0

    def detect_face(self, frame_bgr):
        """
        Detects and locks onto ONLY ONE face (the primary user).
        Thread-safe execution to prevent macOS memory corruption.
        """
        if frame_bgr is None:
            return None
        with self._lock:
            try:
                return self._detect_face_impl(frame_bgr)
            except Exception as e:
                return None

    def _detect_face_impl(self, frame_bgr):
        h, w = frame_bgr.shape[:2]
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        gray_eq = cv2.equalizeHist(gray)

        # Multi-pass detection
        faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(35, 35))
        if len(faces) == 0:
            faces = self.face_cascade.detectMultiScale(gray_eq, scaleFactor=1.05, minNeighbors=3, minSize=(28, 28))
        if len(faces) == 0:
            faces = self.face_cascade.detectMultiScale(gray_eq, scaleFactor=1.03, minNeighbors=2, minSize=(22, 22))

        if len(faces) > 0:
            # If no face is locked, choose the primary face: largest and closest to center
            if self.locked_face is None:
                cx_frame, cy_frame = w / 2.0, h / 2.0
                def score_primary(f):
                    fx, fy, fw, fh = f
                    area = fw * fh
                    dist_to_center = ((fx + fw/2.0 - cx_frame)**2 + (fy + fh/2.0 - cy_frame)**2)**0.5
                    # Favor larger area and closeness to center
                    return area / max(1.0, dist_to_center * 0.5 + 50.0)

                best = max(faces, key=score_primary)
                self.locked_face = tuple(float(v) for v in best)
                self.lost_frames = 0
                return tuple(int(round(v)) for v in self.locked_face)
            else:
                # We already have a locked face. Find the candidate that best matches the locked face
                lx, ly, lw, lh = self.locked_face
                lcx, lcy = lx + lw / 2.0, ly + lh / 2.0

                def match_score(f):
                    fx, fy, fw, fh = f
                    fcx, fcy = fx + fw / 2.0, fy + fh / 2.0
                    dist = ((fcx - lcx)**2 + (fcy - lcy)**2)**0.5
                    scale_diff = abs(fw - lw) / max(1.0, lw)
                    # Lower score is better match
                    return dist + scale_diff * 100.0

                best_candidate = min(faces, key=match_score)
                bx, by, bw, bh = best_candidate
                bcx, bcy = bx + bw / 2.0, by + bh / 2.0
                dist_best = ((bcx - lcx)**2 + (bcy - lcy)**2)**0.5

                # Threshold to ensure we don't jump to an entirely different person across the screen
                if dist_best < max(w * 0.45, lw * 2.5):
                    # Exponential Moving Average smoothing (65% new, 35% previous) for buttery smooth overlay
                    alpha = 0.65
                    sx = alpha * bx + (1.0 - alpha) * lx
                    sy = alpha * by + (1.0 - alpha) * ly
                    sw = alpha * bw + (1.0 - alpha) * lw
                    sh = alpha * bh + (1.0 - alpha) * lh
                    self.locked_face = (sx, sy, sw, sh)
                    self.lost_frames = 0
                    return tuple(int(round(v)) for v in self.locked_face)

        # No match found in current frame
        if self.locked_face is not None:
            self.lost_frames += 1
            # Retain previous locked position for up to 4 frames to avoid intermittent dropouts
            if self.lost_frames <= 4:
                return tuple(int(round(v)) for v in self.locked_face)
            else:
                self.locked_face = None
                self.lost_frames = 0

        return None

    def detect_eyes(self, face_crop_gray):
        """Detects eyes inside upper 60% of face region (thread-safe)."""
        if face_crop_gray is None or face_crop_gray.size == 0:
            return []
        with self._lock:
            try:
                h = face_crop_gray.shape[0]
                upper_half = face_crop_gray[:int(h * 0.6), :]
                eyes = self.eye_cascade.detectMultiScale(upper_half, scaleFactor=1.1, minNeighbors=4, minSize=(20, 20))
                if len(eyes) >= 2:
                    eyes = sorted(eyes, key=lambda e: e[0]) # left to right
                    return [tuple(int(v) for v in e) for e in eyes[:2]]
            except Exception:
                return []
        return []
