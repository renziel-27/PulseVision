# PulseVision REST API & Streaming Specification

The PulseVision FastAPI backend exposes RESTful endpoints at `/api` and provides interactive Swagger UI at `/docs`.

## 1. Authentication Endpoints

### `POST /api/auth/register`
Creates a new user profile and returns a JWT bearer token.
- **Request Body**:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "SecurePassword123!",
    "phone": "+15551234567"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "user": {
      "id": 2,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": "+15551234567"
    }
  }
  ```

### `POST /api/auth/login`
Authenticates existing credentials. Default demo credentials: `demo@pulsevision.ai` / `demo1234`.

---

## 2. Computer Vision & Pre-Flight Endpoints

### `POST /api/inference/preflight`
Evaluates frame quality and face position prior to measurement.
- **Request Body**:
  ```json
  {
    "frame_base64": "data:image/jpeg;base64,..."
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "ready": true,
    "face_detected": true,
    "lighting_ok": true,
    "lighting_mean": 138.4,
    "lighting_contrast": 42.1,
    "position_ok": true,
    "stability_ok": true,
    "motion_score": 1.8,
    "message": "Lighting and positioning optimal. Ready to scan."
  }
  ```

---

## 3. Real-Time rPPG Inference Endpoints

### `POST /api/inference/process-frame`
Processes a single video frame, computes skin chrominance signals, face/eye metrics, and updates temporal buffer.
- **Request Body**:
  ```json
  {
    "frame_base64": "data:image/jpeg;base64,...",
    "timestamp_ms": 1727980000.0,
    "algorithm": "pos"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "face_detected": true,
    "face_box": [140, 100, 220, 220],
    "ear_value": 0.284,
    "blink_detected": false,
    "total_blinks": 4,
    "perclos": 6.8,
    "rgb_means": [164.2, 132.8, 118.5],
    "estimated_bpm": 72.4,
    "confidence": 0.88,
    "sqi": 0.82,
    "accepted": true,
    "status": "Tracking forehead and cheek ROIs"
  }
  ```

### `POST /api/inference/batch-estimate`
Computes rPPG pulse estimate across a complete temporal window of normalized RGB signals or difference frames.
- **Algorithms**: `pos`, `chrom`, `green`, `tscan_1d`, `tscan_2d`, `deepphys_2d`.

---

## 4. Reference Standard Validation Endpoints

### `POST /api/validation/trial` (or `/api/evaluation/record-trial`)
Records paired reference ground truth (e.g. from finger pulse oximeter or clinical monitor) and PulseVision estimates for empirical benchmarking.
- **Request Body**:
  ```json
  {
    "trial_name": "Post-Walking Evaluation",
    "participant_code": "P01",
    "reference_source": "Finger Pulse Oximeter",
    "condition": "Post-Exercise Recovery",
    "reference_bpm": 86.0,
    "pulsevision_bpm": 84.5,
    "algorithm": "pos",
    "notes": "Subject rested for 1 minute before capture"
  }
  ```

### `GET /api/validation/trials`
Returns all recorded empirical trials with aggregate accuracy statistics.

### `GET /api/validation/stats` (or `/api/evaluation/stats`)
Computes aggregate empirical performance across all recorded validation trials.
- **Response `200 OK`**:
  ```json
  {
    "total_trials": 12,
    "mae": 1.85,
    "rmse": 2.41,
    "pearson_r": 0.942,
    "mean_reference": 74.2,
    "mean_pulsevision": 73.8,
    "max_error": 4.1,
    "min_error": 0.2
  }
  ```

### `GET /api/validation/export-csv`
Downloads all recorded validation trials as a standard `.csv` file.

### `GET /api/scans/export-csv`
Downloads the authenticated user's complete scan history as a `.csv` file.

---

## 5. Reports & Notification Endpoints

### `POST /api/reports/generate`
Compiles an official clinical research PDF report via ReportLab with embedded BVP waveform and spectral density charts.
- **Response**: Generates PDF in `reports_storage/` and returns metadata.

### `GET /api/reports/download/{report_id}`
Streams the generated PDF file directly to the client.

### `POST /api/notifications/send-sms`
Dispatches SMS summaries to registered mobile numbers via Twilio API or secure internal SQLite logging service.
