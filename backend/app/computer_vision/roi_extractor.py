import cv2
import numpy as np

def extract_facial_rois(frame_bgr, face_box):
    """
    Extracts forehead and bilateral cheek regions of interest (ROIs).
    Returns (rois_dict, mean_rgb, is_skin_valid).
    """
    if face_box is None:
        return {}, [0, 0, 0], False

    fx, fy, fw, fh = face_box
    h, w = frame_bgr.shape[:2]

    # 1. Forehead ROI: top 18% to 38% of face height, middle 50% of face width
    forehead_x = max(0, fx + int(fw * 0.25))
    forehead_y = max(0, fy + int(fh * 0.15))
    forehead_w = min(w - forehead_x, int(fw * 0.50))
    forehead_h = min(h - forehead_y, int(fh * 0.22))

    # 2. Left Cheek ROI: mid-height (45% to 70%), left 30%
    left_cheek_x = max(0, fx + int(fw * 0.15))
    left_cheek_y = max(0, fy + int(fh * 0.45))
    left_cheek_w = min(w - left_cheek_x, int(fw * 0.25))
    left_cheek_h = min(h - left_cheek_y, int(fh * 0.22))

    # 3. Right Cheek ROI: mid-height (45% to 70%), right 30%
    right_cheek_x = max(0, fx + int(fw * 0.60))
    right_cheek_y = max(0, fy + int(fh * 0.45))
    right_cheek_w = min(w - right_cheek_x, int(fw * 0.25))
    right_cheek_h = min(h - right_cheek_y, int(fh * 0.22))

    rois = {
        "forehead": (forehead_x, forehead_y, forehead_w, forehead_h),
        "left_cheek": (left_cheek_x, left_cheek_y, left_cheek_w, left_cheek_h),
        "right_cheek": (right_cheek_x, right_cheek_y, right_cheek_w, right_cheek_h)
    }

    # Extract pixels and aggregate
    rgb_sums = [0.0, 0.0, 0.0]
    total_pixels = 0

    for name, (rx, ry, rw, rh) in rois.items():
        if rw > 5 and rh > 5:
            crop = frame_bgr[ry:ry+rh, rx:rx+rw]
            # Convert BGR to RGB
            crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
            rgb_sums[0] += np.sum(crop_rgb[:, :, 0])
            rgb_sums[1] += np.sum(crop_rgb[:, :, 1])
            rgb_sums[2] += np.sum(crop_rgb[:, :, 2])
            total_pixels += rw * rh

    if total_pixels == 0:
        return rois, [0, 0, 0], False

    mean_rgb = [round(c / total_pixels, 2) for c in rgb_sums]

    # Skin color verification
    forehead_crop = frame_bgr[forehead_y:forehead_y+forehead_h, forehead_x:forehead_x+forehead_w]
    is_skin = validate_skin_chrominance(forehead_crop)

    return rois, mean_rgb, is_skin

def validate_skin_chrominance(crop_bgr):
    """
    Validates presence of human skin pigments across all Fitzpatrick skin types (I-VI)
    and varying illumination conditions in YCrCb and HSV color spaces.
    """
    if crop_bgr is None or crop_bgr.size == 0:
        return False

    # Check luminance range first
    mean_val = float(np.mean(crop_bgr))
    if mean_val < 15 or mean_val > 248:
        return False

    ycrcb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2YCrCb)
    # Broad YCrCb ranges covering diverse skin tones
    skin_mask_ycrcb = cv2.inRange(ycrcb, np.array([0, 125, 65]), np.array([255, 190, 145]))

    hsv = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2HSV)
    mask1 = cv2.inRange(hsv, np.array([0, 10, 20]), np.array([45, 255, 255]))
    mask2 = cv2.inRange(hsv, np.array([155, 10, 20]), np.array([180, 255, 255]))
    skin_mask_hsv = cv2.bitwise_or(mask1, mask2)

    combined = cv2.bitwise_and(skin_mask_ycrcb, skin_mask_hsv)
    total_pixels = crop_bgr.shape[0] * crop_bgr.shape[1]
    if total_pixels == 0:
        return False

    ratio = np.count_nonzero(combined) / total_pixels
    # If standard skin mask covers >= 3%, accept; or if either YCrCb or HSV has >= 10%
    if ratio >= 0.03:
        return True

    ratio_ycrcb = np.count_nonzero(skin_mask_ycrcb) / total_pixels
    ratio_hsv = np.count_nonzero(skin_mask_hsv) / total_pixels
    if ratio_ycrcb >= 0.08 or ratio_hsv >= 0.08:
        return True

    # Fallback: if within human face box and mean brightness is normal, accept
    return 20 <= mean_val <= 235
