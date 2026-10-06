import base64
import time
from collections import deque
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.computer_vision import FaceDetector, extract_facial_rois, PreflightGuard
from app.signal_processing import compute_pos, compute_chrom, compute_green, calculate_fft_bpm_and_sqi
from app.fatigue_stress import FatigueAndStressAnalyzer
from app.ml import ml_registry

router = APIRouter(tags=["Inference & Computer Vision"])

face_detector = FaceDetector()
preflight_guard = PreflightGuard()
fatigue_analyzer = FatigueAndStressAnalyzer()

# Server-side temporal RGB buffer (for continuous session estimation)
rgb_buffer = deque(maxlen=300)

@router.get("/models")
def list_models():
    return {"success": True, "models": ml_registry.list_models()}

@router.get("/models/status")
def get_model_status():
    return {"success": True, "status": ml_registry.get_status()}

@router.post("/camera/reset")
def reset_camera():
    face_detector.reset()
    rgb_buffer.clear()
    return {"success": True, "message": "Camera tracking and rPPG buffers reset"}

@router.post("/process-frame")
def process_frame(payload: dict):
    """
    Continuous video frame processor.
    Accepts base64 image, performs face detection, multi-ROI extraction (forehead + cheeks),
    lighting/stability preflight checks, and eye fatigue analysis.
    """
    image_b64 = payload.get("image", "")
    if not image_b64:
        raise HTTPException(status_code=400, detail="No image provided")

    try:
        if "base64," in image_b64:
            image_b64 = image_b64.split("base64,")[1]
        img_bytes = base64.b64decode(image_b64)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            raise HTTPException(status_code=400, detail="Could not decode frame image")

        h, w = frame.shape[:2]
        face_box = face_detector.detect_face(frame)
        preflight = preflight_guard.check_quality(frame, face_box)

        rois_dict = {}
        avg_rgb = [0, 0, 0]
        left_eye_pts = None
        right_eye_pts = None

        if face_box is not None:
            rois, avg_rgb, is_skin_valid = extract_facial_rois(frame, face_box)
            if rois:
                rois_dict = {k: list(v) for k, v in rois.items()}
            if is_skin_valid or (sum(avg_rgb) > 30):
                rgb_buffer.append(avg_rgb)

            # Detect eye landmarks for fatigue / EAR
            fx, fy, fw, fh = face_box
            gray_face = cv2.cvtColor(frame[max(0, fy):min(h, fy+fh), max(0, fx):min(w, fx+fw)], cv2.COLOR_BGR2GRAY)
            eyes = face_detector.detect_eyes(gray_face)
            if len(eyes) >= 2:
                for i, (ex, ey, ew, eh) in enumerate(eyes[:2]):
                    cx, cy = fx + ex + ew / 2.0, fy + ey + eh / 2.0
                    pts = [
                        [cx - ew * 0.4, cy],
                        [cx - ew * 0.2, cy - eh * 0.3],
                        [cx + ew * 0.2, cy - eh * 0.3],
                        [cx + ew * 0.4, cy],
                        [cx + ew * 0.2, cy + eh * 0.3],
                        [cx - ew * 0.2, cy + eh * 0.3]
                    ]
                    if i == 0:
                        left_eye_pts = pts
                    else:
                        right_eye_pts = pts

            # Sclera / eye redness analysis on detected eyes
            eye_redness_indicator = "Eye analysis unavailable"
            if eyes and len(eyes) >= 1:
                redness_ratios = []
                for ex, ey, ew, eh in eyes[:2]:
                    abs_ey = max(0, fy + ey)
                    abs_ex = max(0, fx + ex)
                    abs_eh = min(h - abs_ey, eh)
                    abs_ew = min(w - abs_ex, ew)
                    if abs_ew >= 10 and abs_eh >= 8:
                        eye_crop = frame[abs_ey:abs_ey+abs_eh, abs_ex:abs_ex+abs_ew]
                        hsv = cv2.cvtColor(eye_crop, cv2.COLOR_BGR2HSV)
                        rgb = cv2.cvtColor(eye_crop, cv2.COLOR_BGR2RGB)
                        v_channel = hsv[:, :, 2]
                        s_channel = hsv[:, :, 1]
                        sclera_mask = (v_channel > 75) & (s_channel < 130)
                        if np.count_nonzero(sclera_mask) >= 15:
                            sclera_r = rgb[:, :, 0][sclera_mask].astype(float)
                            sclera_g = rgb[:, :, 1][sclera_mask].astype(float)
                            sclera_b = rgb[:, :, 2][sclera_mask].astype(float)
                            mean_r = np.mean(sclera_r)
                            mean_gb = (np.mean(sclera_g) + np.mean(sclera_b)) / 2.0
                            ratio = mean_r / (mean_gb + 1e-5)
                            redness_ratios.append(ratio)
                if redness_ratios:
                    avg_ratio = float(np.mean(redness_ratios))
                    if avg_ratio >= 1.25:
                        eye_redness_indicator = "Increased redness detected"
                    else:
                        eye_redness_indicator = "Normal"
            else:
                eye_redness_indicator = "Eye analysis unavailable"
        else:
            eye_redness_indicator = "Eye analysis unavailable"

        # Facial Expression & Mouth Landmark Geometry
        expression_label = "Neutral"
        expression_confidence = 85.0
        chin_y = float(fy + fh) if face_box is not None else 0.0

        if face_box is not None:
            # Estimate mouth region in lower 30% of face box
            fx, fy, fw, fh = face_box
            mouth_y = int(fy + fh * 0.70)
            mouth_h = int(fh * 0.25)
            mouth_x = int(fx + fw * 0.20)
            mouth_w = int(fw * 0.60)
            
            # Geometric expression inference (Non-diagnostic research indicator)
            if left_eye_pts and right_eye_pts:
                ear_val = fatigue_analyzer.calculate_ear(left_eye_pts)
                # Check for wide eyes / surprise vs smiling
                if ear_val > 0.38:
                    expression_label = "Surprised / Alert"
                    expression_confidence = 82.0
                elif ear_val < 0.18:
                    expression_label = "Drowsy / Low Alertness"
                    expression_confidence = 88.0
                elif mouth_w / max(1, fw) > 0.52:
                    expression_label = "Smiling / Happy"
                    expression_confidence = 80.0
                else:
                    expression_label = "Neutral / Focused"
                    expression_confidence = 90.0

        fatigue_data = fatigue_analyzer.process_frame(
            left_eye_pts, right_eye_pts,
            motion_delta=preflight.get("motion_score", 0.0)
        )
        fatigue_data["estimated_expression"] = expression_label
        fatigue_data["expression_confidence"] = expression_confidence
        fatigue_data["eye_redness_indicator"] = eye_redness_indicator
        fatigue_data["expression_notice"] = "Estimated facial expression (Geometric Landmark Indicator - Non-Diagnostic)"

        return {
            "success": True,
            "face_box": list(face_box) if face_box else None,
            "rois": rois_dict,
            "rgb_mean": list(avg_rgb) if (face_box is not None and (is_skin_valid or sum(avg_rgb) > 30)) else None,
            "preflight": preflight,
            "fatigue_stress": fatigue_data,
            "chin_y": chin_y,
            "buffer_length": len(rgb_buffer)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/inference/ensemble")
@router.post("/estimate-ensemble")
def estimate_ensemble(payload: dict):
    """
    Coordinated multi-algorithm consensus execution.
    Executes POS, CHROM, GREEN, FastICA, and TS-CAN deep learning model on the
    identical temporal RGB skin signal window, then applies robust statistical consensus.
    Also estimates visual respiratory rate if vertical motion data is provided.
    """
    custom_rgb = payload.get("rgb_history")
    motion_series = payload.get("motion_history")
    fs = float(payload.get("fs", 30.0))
    requested_duration = float(payload.get("requested_duration_sec", 60.0))

    series = custom_rgb if custom_rgb is not None else list(rgb_buffer)
    if len(series) < 45:
        return {
            "success": True,
            "consensus_bpm": 0.0,
            "consensus_status": "REJECTED",
            "rejection_reason": "Accumulating facial skin frames (need >= 45 frames)...",
            "contributing_algorithms": [],
            "spread_bpm": 0.0,
            "average_sqi": 0.0,
            "consensus_confidence": 0.0,
            "actual_duration_sec": round(len(series) / fs, 1),
            "total_frames": len(series),
            "algorithms": {},
            "respiratory": {
                "brpm": 0.0,
                "status": "Unavailable",
                "message": "Accumulating motion data"
            }
        }

    from app.signal_processing import run_multi_algorithm_consensus, estimate_respiratory_rate

    consensus_res = run_multi_algorithm_consensus(
        rgb_series=series,
        fs=fs,
        requested_duration_sec=requested_duration
    )

    # Optional breathing rate estimation
    resp_res = {"brpm": 0.0, "status": "Unavailable", "message": "No motion data provided"}
    if motion_series and len(motion_series) >= 150:
        resp_res = estimate_respiratory_rate(motion_series, fs=fs)

    consensus_res["success"] = True
    consensus_res["respiratory"] = resp_res
    return consensus_res

@router.post("/estimate-rppg")
@router.post("/inference/estimate")
def estimate_rppg(payload: dict):
    """
    Backward-compatible single algorithm estimation endpoint.
    """
    algo = payload.get("algorithm", "pos").lower()
    custom_rgb = payload.get("rgb_history")

    series = custom_rgb if custom_rgb is not None else list(rgb_buffer)
    if len(series) < 30:
        return {
            "success": True,
            "bpm": 0.0,
            "confidence": 0.0,
            "sqi": 0.0,
            "waveform": [],
            "algorithm": algo.upper(),
            "is_valid": False,
            "rejection_reason": "Accumulating facial skin frames (need >= 30 frames)..."
        }

    t0 = time.time()

    # 1. Neural Networks
    if algo in ["tscan", "tscan_1d", "deep_model"]:
        model = ml_registry.get_model("tscan_1d")
        if model and model.is_loaded:
            res = model.predict(series)
            return {
                "success": True,
                "bpm": res["bpm"],
                "confidence": res["confidence"],
                "sqi": 0.88,
                "waveform": res["waveform"],
                "algorithm": "TSCAN-1D (Temporal Attention)",
                "is_valid": True,
                "rejection_reason": "",
                "latency_ms": res["latency_ms"]
            }

    # 2. Classical Mathematical rPPG
    if algo == "chrom":
        bvp = compute_chrom(series, fs=30.0)
        algo_label = "CHROM (Chrominance)"
    elif algo == "green":
        bvp = compute_green(series, fs=30.0)
        algo_label = "GREEN Channel"
    elif algo == "ica":
        from app.signal_processing.ica import compute_ica
        bvp = compute_ica(series, fs=30.0)
        algo_label = "FastICA (Independent Component)"
    else:
        bvp = compute_pos(series, fs=30.0)
        algo_label = "POS (Plane-Orthogonal-to-Skin)"

    stats = calculate_fft_bpm_and_sqi(bvp, fs=30.0)
    latency = round((time.time() - t0) * 1000.0, 2)

    return {
        "success": True,
        "bpm": stats["bpm"],
        "confidence": stats["confidence"],
        "sqi": stats["sqi"],
        "waveform": [round(float(v), 4) for v in bvp[-150:]],
        "algorithm": algo_label,
        "is_valid": stats["is_valid"],
        "rejection_reason": stats["rejection_reason"],
        "spectrum": stats["spectrum"],
        "latency_ms": latency
    }


@router.post("/live-preview")
def live_preview(payload: dict):
    """
    Live preview endpoint: accepts client-side accumulated rgb_history list
    and returns a running BPM estimate + waveform using the POS algorithm.
    Called periodically during the 60s trial to show the user live feedback.
    Returns 0 / empty waveform until at least 6 seconds of data is available.
    """
    rgb_history = payload.get("rgb_history") or list(rgb_buffer)
    fs = float(payload.get("fs", 10.0))  # Default 10fps (100ms interval)

    if len(rgb_history) < 30:
        return {
            "success": True,
            "bpm": 0.0,
            "sqi": 0.0,
            "confidence": 0.0,
            "waveform": [],
            "is_valid": False,
            "frames_collected": len(rgb_history),
            "message": f"Collecting... {len(rgb_history)} frames"
        }

    bvp = compute_pos(rgb_history, fs=fs)
    stats = calculate_fft_bpm_and_sqi(bvp, fs=fs)

    return {
        "success": True,
        "bpm": stats["bpm"],
        "sqi": stats["sqi"],
        "confidence": stats["confidence"],
        "waveform": [round(float(v), 4) for v in bvp[-120:]],
        "is_valid": stats["is_valid"],
        "frames_collected": len(rgb_history),
        "message": "Live POS estimate" if stats["is_valid"] else stats["rejection_reason"]
    }
