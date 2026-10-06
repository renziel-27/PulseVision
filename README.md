# PulseVision AI 2.0: Contactless Heart-Rate & Physiological Assessment System

[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688.svg)](https://fastapi.tiangolo.com)
[![React 18](https://img.shields.io/badge/React-18.3-61DAFB.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6.svg)](https://typescriptlang.org)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.0%2B-EE4C2C.svg)](https://pytorch.org)
[![Tests Passing](https://img.shields.io/badge/pytest-21%20passed-brightgreen.svg)](tests/)

PulseVision is a full-stack, research-grade, contactless photoplethysmography (rPPG) prototype. It uses standard webcams and video streams to detect facial blood-volume pulse (BVP) micro-blushes, deriving heart rate, signal quality, eye blink dynamics (EAR, PERCLOS), and research stress metrics without skin contact.

> **Research Prototype Disclaimer**: PulseVision is designed solely for scientific research, academic benchmarking, and non-contact wellness monitoring. It is not an FDA-cleared medical device and does not diagnose, treat, or prevent any cardiovascular condition.

---

## 1. Key Capabilities & Technical Highlights

- **Multi-Algorithm Signal Processing Engine**:
  - **POS (Plane-Orthogonal-to-Skin)**: Wang et al. (IEEE TBME 2017) skin-reflectance plane projection.
  - **CHROM (Chrominance rPPG)**: de Haan & Jeanne (IEEE TBME 2013) illumination-invariant chrominance decomposition.
  - **GREEN PPG**: Spatial-averaged optical absorption of hemoglobin in the green wavelength band.
  - **Temporal Filtering**: Tarvainen smoothness priors detrending ($\lambda=100$) and 4th-order Butterworth bandpass filter ($0.75\text{--}2.5\text{ Hz} \to 45\text{--}150\text{ BPM}$).
  - **Welch Periodogram FFT & SQI**: Peak heart rate extraction with signal-to-noise ratio (SNR) calculation.
- **Deep Learning Neural Inference**:
  - **TS-CAN 2D**: Temporal Shift Convolutional Attention Network (`PURE_TSCAN.pth`, 8.5 MB).
  - **DeepPhys 2D**: Dual-branch Motion and Appearance CNN (`PURE_DeepPhys.pth`, 8.5 MB).
  - **TSCAN-1D**: Real-time 1D temporal convolutional model (`rppg_tscan_best.pth`, 178 KB).
- **Pre-Flight Guards & Zero-Metric-Fabrication Policy**:
  - Validates ambient luminance ($40 \le \bar{Y} \le 220$), image contrast ($\sigma \ge 15.0$), facial centering/distance ($10\%\text{--}85\%$ frame width), and frame-to-frame motion jitter ($< 25.0$).
  - Never fabricates or randomizes pulse metrics; measurements failing quality guards or with $\text{SNR} < -6\text{ dB}$ are explicitly rejected with explanatory diagnostics.
- **Secondary Physiological Indicators**:
  - 6-point Eye Aspect Ratio (EAR), blink state machine, PERCLOS drowsiness tracking, and research stress index.
- **Empirical Reference Standard Validation Suite**:
  - Records paired trials with independent reference instruments (finger pulse oximeters, clinical vital signs monitors).
  - Calculates real-time Mean Absolute Error (MAE), Root Mean Square Error (RMSE), and Pearson Correlation ($r$).
  - One-click CSV export for validation datasets and scan records.
- **Dual User Interface Support**:
  1. **Futuristic Three.js 3D Beating Heart SPA**: Procedural 3D beating cardiac mesh reacting dynamically to estimated BPM, real-time BVP oscilloscope, and audio heartbeat pacer.
  2. **Modern React 18 / TypeScript / Tailwind CSS Client**: Full analytics dashboard, interactive Recharts trend graphs, pre-flight guide modal, and validation management.
- **Clinical PDF Reporting & Notifications**:
  - Automated PDF health reports generated via ReportLab with embedded high-resolution Matplotlib waveform charts and frequency spectrums.
  - Optional SMS summary dispatches via Twilio or internal SQLite audit logging.

---

## 2. Architecture & File Structure

```
PulseVision/
├── backend/
│   ├── app/
│   │   ├── computer_vision/       # Face detection, forehead & cheek ROIs, pre-flight guards
│   │   ├── signal_processing/     # POS, CHROM, GREEN, Butterworth filter, Welch FFT, SQI
│   │   ├── ml/                    # TS-CAN 2D, DeepPhys 2D, TSCAN-1D adapters & registry
│   │   ├── fatigue_stress/        # EAR calculation, blink detection, PERCLOS, stress index
│   │   ├── reporting/             # ReportLab clinical PDF generator with embedded charts
│   │   ├── notifications/         # Twilio SMS service & database audit logger
│   │   ├── models/                # SQLAlchemy ORM models (User, Scan, ValidationTrial, etc.)
│   │   ├── schemas/               # Pydantic v2 validation schemas
│   │   ├── security/              # PBKDF2 password hashing & JWT bearer authentication
│   │   ├── routers/               # 33 REST endpoints (auth, scans, inference, evaluation, reports)
│   │   ├── config.py              # Application settings and environment variables
│   │   ├── database.py            # SQLite engine and initial seed configuration
│   │   └── main.py                # FastAPI server entrypoint and static file mounts
│   └── models/                    # Neural network checkpoints (.pth)
├── frontend/                      # Three.js 3D beating heart Single Page Application
│   ├── index.html                 # Futuristic research UI
│   ├── css/                       # Glassmorphic cybernetic styling
│   └── js/                        # Three.js cardiac visualizer, audio synthesis, webcam rPPG
├── frontend_react/                # React 18 + TypeScript + Vite + Tailwind CSS dashboard
│   ├── src/
│   │   ├── components/            # Navbar, layout, status badges
│   │   ├── pages/                 # ScanPage, DashboardPage, ValidationPage, ReportsPage, AuthModal
│   │   ├── services/api.ts        # Axios client with JWT interceptor
│   │   └── types/                 # TypeScript interfaces
│   └── dist/                      # Production Vite bundle
├── docs/                          # Comprehensive technical documentation
│   ├── architecture.md            # Mathematical formulation & CV pipeline
│   ├── model_setup.md             # Pretrained weights provenance & loading
│   ├── dataset_setup.md           # Benchmark datasets (UBFC, PURE, SCAMPS)
│   ├── evaluation_protocol.md     # Reference validation & error metrics
│   └── api_guide.md               # REST API endpoints & contracts
├── reports_storage/               # Generated clinical PDF reports
└── tests/                         # Full automated test suite (21 unit & integration tests)
```

---

## 3. Quick Start & Execution

### 3.1 Start the FastAPI Backend
```bash
cd /Users/renzielfernandez/Downloads/PulseVision
/Users/renzielfernandez/Downloads/rPPG-Toolbox-main/.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

### 3.2 Access the Applications
- **Three.js 3D Beating Heart SPA**: Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **React 18 Analytics Dashboard**: Open [http://127.0.0.1:8000/app/](http://127.0.0.1:8000/app/)
- **Interactive OpenAPI Documentation**: Open [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **React Vite Development Server** (optional for frontend development):
  ```bash
  cd frontend_react && npm run dev
  ```
  Open [http://localhost:5173/](http://localhost:5173/)

### 3.3 Default Credentials
- **Email**: `demo@pulsevision.ai`
- **Password**: `demo1234`

---

## 4. Running the Automated Test Suite

PulseVision includes automated pytest suites covering algorithm correctness, neural model loading, pre-flight guards, PDF generation, and authentication:

```bash
/Users/renzielfernandez/Downloads/rPPG-Toolbox-main/.venv/bin/pytest /Users/renzielfernandez/Downloads/PulseVision/tests/ -v
```

Output:
```
============================= test session starts ==============================
tests/test_auth.py::test_register_and_login_flow PASSED                  [  4%]
tests/test_auth.py::test_invalid_login PASSED                            [  8%]
tests/test_auth.py::test_phone_validation PASSED                         [ 13%]
tests/test_deep_models.py::test_ml_registry_status PASSED                [ 17%]
tests/test_deep_models.py::test_tscan1d_forward_pass PASSED              [ 21%]
tests/test_deep_models.py::test_tscan2d_forward_pass PASSED              [ 26%]
tests/test_evaluation_metrics.py::test_validation_trial_recording_and_stats PASSED [ 30%]
tests/test_evaluation_metrics.py::test_validation_csv_export PASSED      [ 34%]
tests/test_evaluation_metrics.py::test_scans_csv_export PASSED           [ 39%]
tests/test_pdf_report.py::test_generate_pdf_report_direct PASSED         [ 43%]
tests/test_pdf_report.py::test_pdf_report_api PASSED                     [ 47%]
tests/test_preflight_and_sqi.py::test_preflight_rejections PASSED        [ 52%]
tests/test_preflight_and_sqi.py::test_sqi_low_quality_rejection PASSED   [ 56%]
tests/test_pulsevision.py::TestPulseVisionSystem::test_database_user_auth PASSED [ 60%]
tests/test_pulsevision.py::TestPulseVisionSystem::test_deep_learning_tscan_model PASSED [ 65%]
tests/test_pulsevision.py::TestPulseVisionSystem::test_fatigue_and_stress_engine PASSED [ 69%]
tests/test_pulsevision.py::TestPulseVisionSystem::test_phone_number_validation PASSED [ 73%]
tests/test_pulsevision.py::TestPulseVisionSystem::test_rppg_algorithms_pos_and_chrom PASSED [ 78%]
tests/test_pulsevision.py::TestPulseVisionSystem::test_sms_formatting PASSED [ 82%]
tests/test_pulsevision.py::TestPulseVisionSystem::test_validation_trials_and_stats PASSED [ 86%]
tests/test_rppg_algorithms.py::test_pos_algorithm_accuracy PASSED        [ 91%]
tests/test_rppg_algorithms.py::test_chrom_algorithm_accuracy PASSED      [ 95%]
tests/test_rppg_algorithms.py::test_green_algorithm PASSED               [100%]
============================== 23 passed in 4.63s ==============================
```

---

## 5. Citations & References

- Wang, W., den Brinker, A. C., Stuijk, S., & de Haan, G. (2017). *Algorithmic Principles of Remote PPG*. IEEE Transactions on Biomedical Engineering, 64(7), 1479-1491.
- de Haan, G., & Jeanne, V. (2013). *Robust Pulse Rate From Chrominance-Based rPPG*. IEEE Transactions on Biomedical Engineering, 60(10), 2878-2886.
- Liu, X., et al. (2020). *Multi-Task Temporal Shift Attention Networks for On-Device Contactless Vitals Measurement*. Advances in Neural Information Processing Systems (NeurIPS).
- Chen, W., & McDuff, D. (2018). *DeepPhys: Video-Based Physiological Measurement Using Convolutional Attention Networks*. European Conference on Computer Vision (ECCV).
