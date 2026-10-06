# PulseVision Phase-by-Phase Implementation Plan (v2.0)

**Date**: October 4, 2026  
**Target Scope**: Smartwatch-Free, Documentation-Aligned, Research-Grade rPPG System

---

## Phase 0: Audit, Entrypoint Unification & Packaging
- [x] Complete comprehensive codebase audit (`docs/PROJECT_AUDIT.md`, `docs/FEATURE_STATUS.md`).
- [ ] Create `PulseVision/requirements.txt` listing exact verified dependencies.
- [ ] Create `PulseVision/.env.example` with safe placeholder configuration.
- [ ] Create `PulseVision/app.py` as the top-level application entry point.

---

## Phase 1: Total Removal of Smartwatch & Wearable Code
- [ ] Database Schema Refactoring:
  - In `backend/app/models/reference.py`: Replace `smartwatch_bpm` with `reference_bpm` and `reference_device` with `reference_source`.
  - In `backend/app/schemas/evaluation.py`: Update validation schemas to reflect `reference_bpm` and `reference_source`.
  - In `backend/database.py`: Clean up legacy references.
- [ ] Backend API Refactoring:
  - In `backend/app/routers/evaluation.py`: Remove smartwatch naming and routes. Retain manual reference entry (`/api/validation/trial`, `/api/validation/trials`, `/api/validation/stats`).
  - In `backend/app/reporting/pdf_generator.py`: Rebrand "Smartwatch Comparison" section to "Reference Standard Comparison".
- [ ] Frontend Refactoring:
  - In `frontend/index.html`: Remove "Smartwatch Validation" navigation and headers; replace with "Reference Validation & Benchmark". Remove wearable connection mockups.
  - In `frontend/js/app.js`: Remove all smartwatch references; update trial payload to `reference_bpm`.
  - In `frontend_react/`: Update `Navbar.tsx`, `App.tsx`, `ValidationPage.tsx`, and `types/index.ts` to reference manual ground truth rather than smartwatches.
- [ ] Tests & Docs Refactoring:
  - Update `tests/test_evaluation_metrics.py`, `tests/test_pulsevision.py`, and `tests/test_pdf_report.py` to use `reference_bpm`.
  - Scrub all documentation (`README.md`, `docs/`) of smartwatch setup instructions and claims.

---

## Phase 2: Camera Capture & Computer Vision Verification
- [ ] Verify browser webcam capture with user permissions in both frontends.
- [ ] Verify multi-pass Haar face and eye detector with histogram equalization.
- [ ] Verify forehead (upper 25%) and bilateral cheek ROI extraction with YCrCb/HSV skin chrominance filtering.
- [ ] Test edge cases: face absence, multiple faces, out-of-bounds, and extreme motion.

---

## Phase 3: Classical rPPG Pipeline Verification
- [ ] Verify temporal RGB buffer accumulation over 100-300 frames.
- [ ] Verify Tarvainen detrending and 4th-order Butterworth bandpass filter ($0.75\text{--}2.5\text{ Hz}$).
- [ ] Verify POS (Plane-Orthogonal-to-Skin) and CHROM implementations.
- [ ] Verify Welch periodogram FFT peak extraction ($\text{BPM} = f_{\text{peak}} \times 60$).
- [ ] Verify SQI and SNR rejection gate: strictly reject low-quality or moving signals (Zero Fabrication Policy).

---

## Phase 4: Application, Persistence & CSV Export
- [ ] Verify user registration and authentication flow.
- [ ] Verify scan results persistence in SQLite database.
- [ ] Implement CSV Export endpoints:
  - `GET /api/scans/export-csv` (exports user scan history to CSV).
  - `GET /api/validation/export-csv` (exports paired reference trials to CSV).
- [ ] Verify history and dashboard views render real data from SQLite.

---

## Phase 5: Deep-Learning Model Verification & Fallback
- [ ] Verify TSCAN-1D model (`rppg_tscan_best.pth`, 178 KB) CPU forward pass.
- [ ] Verify TS-CAN 2D (`PURE_TSCAN.pth`, 8.5 MB) and DeepPhys 2D (`PURE_DeepPhys.pth`, 8.5 MB) loading and forward inference.
- [ ] Ensure clear fallback to classical rPPG when deep inference is disabled or unavailable.

---

## Phase 6: Experimental Validation (Smartwatch-Free)
- [ ] Allow researchers to record manual reference BPM (e.g. from finger pulse oximeter or clinical monitor).
- [ ] Compute genuine MAE, RMSE, and Pearson correlation ($r$) exclusively from actual recorded pairs.
- [ ] Display "Insufficient reference data" when no paired trials exist.
- [ ] Retain failed and rejected trials in the database.

---

## Phase 7: Secondary Indicators (Fatigue & Stress)
- [ ] Verify 6-point EAR calculation and PERCLOS drowsiness state machine.
- [ ] Verify pulse-rate stability and blink jitter stress proxy.
- [ ] Enforce "Experimental Indicator (Non-Diagnostic)" disclaimer on all views and reports.

---

## Phase 8: Final Product, Testing & Demonstration
- [ ] Run full automated test suite (`pytest`) and confirm 0 errors.
- [ ] Verify PDF report generation and download.
- [ ] Verify SMS dispatch with local audit logger fallback.
- [ ] Update all documentation in `docs/` and master `README.md`.
- [ ] Conduct end-to-end live testing of both frontends.
