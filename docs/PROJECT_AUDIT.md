# PulseVision 3.0: Comprehensive Codebase Audit
**Date**: October 4, 2026  
**Auditor**: Senior Full-Stack, CV, rPPG & QA Specialist  
**Specification Version**: 3.0 (Complete Reconstruction & Final Repair)

---

## 1. Executive Summary

This audit assesses every component of PulseVision against the Version 3.0 specification. While core rPPG math (POS, CHROM, GREEN), MySQL database persistence, and pre-flight face quality guards are functional, key architectural and operational gaps were identified:
1. **Camera Lifecycle**: Camera stream lacks explicit OFF/ON separation; streams were running continuously rather than obeying an explicit user camera toggle.
2. **Measurement Window**: Previous workflow utilized a 15-second scan window; 3.0 strictly mandates a 60-second monotonic measurement window to achieve true physiological frequency resolution.
3. **Algorithm Execution**: Algorithms were previously selected one-at-a-time via a UI dropdown. 3.0 requires concurrent parallel execution of POS, CHROM, GREEN, FastICA, and TS-CAN on the identical underlying temporal buffer, followed by statistical consensus.
4. **Trial Management**: The "+ New Trial" button was not wired to an end-to-end persistent lifecycle (`CREATED` -> `READY` -> `RUNNING` -> `PROCESSING` -> `COMPLETED` / `REJECTED` / `CANCELLED`).
5. **Blood Pressure & Device References**: External device references lacked explicit distinction between automated webcam rPPG and manual ground-truth entry. Blood pressure was ambiguously presented; 3.0 strictly clarifies that BP is a manual reference entry (mmHg) only.
6. **Breathing Rate**: Visual respiratory rate estimation was absent from the live scan pipeline.
7. **Unnecessary Audio**: A Web Audio API cardiac synthesizer and audio controls existed in `frontend/index.html` and `frontend/js/app.js`; 3.0 mandates 100% silent visual operation.

---

## 2. Feature-by-Feature Detailed Audit Matrix

| Feature / Subsystem | Existing Implementation | Relevant File & Function | Actual Problem in Current Code | Required Correction | Verification Method | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Camera On/Off Control** | Auto-requests camera on page load; no explicit off state | `frontend/js/app.js`: `initWebcam()`, `startCamera()` | Camera cannot be cleanly turned OFF without leaving the page; no standby UI | Add explicit Camera OFF standby placeholder, "Turn Camera On" & "Stop Camera" controls, stop all media tracks | Toggle camera on/off in browser; verify stream releases | `IMPLEMENTED BUT BROKEN` |
| **60-Second Trial Enforcement** | 15-second scanning interval | `frontend/js/app.js`: `scanDurationSec = 15` | Short 15s window gives coarse spectral bins ($\Delta f \approx 4\text{ BPM}$); does not satisfy 60s requirement | Enforce 60-second measurement window; use `performance.now()` monotonic timing; reject early stops | Run trial, cancel at 25s (verify no BPM), run full 60s (verify completion) | `IMPLEMENTED BUT BROKEN` |
| **POS Algorithm** | Wang et al. 2017 projection | `backend/app/signal_processing/pos.py`: `compute_pos` | Only runs if user selects POS in dropdown | Run automatically as part of shared multi-algorithm ensemble | Pytest unit test on synthetic & real temporal signal | `WORKING AND VERIFIED` |
| **CHROM Algorithm** | de Haan et al. 2013 | `backend/app/signal_processing/chrom.py`: `compute_chrom` | Only runs if user selects CHROM in dropdown | Run automatically as part of shared multi-algorithm ensemble | Pytest unit test | `WORKING AND VERIFIED` |
| **GREEN Channel** | Peak hemoglobin absorption | `backend/app/signal_processing/green.py`: `compute_green` | Runs in isolation; not included in consensus | Integrate into multi-algorithm pipeline | Pytest unit test | `WORKING AND VERIFIED` |
| **FastICA rPPG** | None | `backend/app/signal_processing/ica.py` | Missing from classical signal processing suite | Implement FastICA decomposition using `sklearn.decomposition.FastICA` | Test ICA component extraction on temporal RGB | `MISSING` |
| **Deep Learning TS-CAN** | PyTorch adapter loaded | `backend/app/ml/models/tscan_1d.py`: `predict` | Only runs when selected exclusively | Run alongside classical methods on shared 60s window | Forward pass verification | `WORKING AND VERIFIED` |
| **Multi-Algorithm Consensus** | None; single algorithm output | `backend/app/routers/inference.py`: `estimate_rppg` | Single estimate output; no outlier detection, no agreement guard | Implement `MultiAlgorithmConsensus` calculating median, agreement spread ($<12\text{ BPM}$), and quality weighting | Test ensemble with concordant and divergent signals | `MISSING` |
| **"+ New Trial" Creation** | Static button; manual form | `frontend/index.html`: `#form-add-trial` | Does not generate backend Trial UID; no lifecycle state machine | Implement `Trial` model, `POST /api/trials/create`, generate `PV-TR-XXXX`, bind to camera scan | Create trial via UI, verify row in MySQL table | `PARTIALLY IMPLEMENTED` |
| **Trial Lifecycle State Machine** | Scans table has simple `accepted` boolean | `backend/app/models/scan.py` | No formal states (`CREATED`, `READY`, `RUNNING`, `PROCESSING`, `COMPLETED`, `REJECTED`, `CANCELLED`) | Add full lifecycle tracking in `Trial` entity | Test transitions through API | `PARTIALLY IMPLEMENTED` |
| **Smartwatch Integration** | Cleaned up in v2 to manual reference | `frontend/index.html`, `backend/app/models/reference.py` | Reference UI could still be confused with automated wearables | Label clearly as "Manual Ground-Truth Reference Standard (Finger Pulse Oximeter)" | Review UI labels and database queries | `WORKING AND VERIFIED` |
| **Blood Pressure Machine Integration** | Absent | `frontend/index.html` | No support for entering systolic/diastolic blood pressure reference data | Add manual BP entry form (Systolic/Diastolic mmHg); state clearly that webcam does not measure BP directly | Enter 120/80 mmHg, verify saved in trial record | `MISSING` |
| **Facial Landmarks & EAR** | 6-point EAR approximation from Haar eyes | `backend/app/fatigue_stress/analyzer.py`: `calculate_ear` | Cascades can lose tracking under extreme angles | Enhance landmark geometry and fallback smoothly | Test eye closure detection | `WORKING AND VERIFIED` |
| **Facial Expression Estimation** | None | `backend/app/fatigue_stress/analyzer.py` | Missing expression categories (Neutral, Happy, Surprised, Frowning) | Implement geometric facial expression estimator labeled as non-diagnostic | Test smiling and neutral frames | `MISSING` |
| **Breathing-Rate Estimation** | None | `backend/app/signal_processing/respiratory.py` | Missing visual respiratory motion calculation | Implement respiratory motion bandpass ($0.1\text{--}0.5\text{ Hz}$) on chin/nasal tracking; report unavailable if insufficient | Test breathing frequency calculation | `MISSING` |
| **Sound & Audio Effects** | Web Audio API Heartbeat Synthesizer present | `frontend/index.html`: `#btn-toggle-audio`, `frontend/js/app.js`: `initHeartbeatAudioControls` | Violates Requirement 11 (strict sound elimination) | Completely remove audio engine, synthesizer, and toggle button | Search codebase for AudioContext; confirm zero sound | `IMPLEMENTED BUT BROKEN` |
| **Database Persistence (MySQL)** | MySQL 8.4 connected with SQLite fallback | `backend/app/database.py`, `backend/app/config.py` | Schema needs `Trial` model with 60s metrics and ensemble outputs | Add `Trial` model; preserve all existing users and tables | Run `init_db()` against MySQL; verify tables | `WORKING AND VERIFIED` |
| **Authentication & Upsert** | Email & username login with upsert registration | `backend/app/routers/auth.py` | Working smoothly | Preserve all authentication features | Test login/register with existing accounts | `WORKING AND VERIFIED` |
