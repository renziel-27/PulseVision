# PulseVision 3.0: Feature Status Inventory

**Audit Date**: October 4, 2026  
**Status Taxonomy**:
- `WORKING AND VERIFIED`: Feature is implemented, functionally correct, and verified by tests.
- `IMPLEMENTED BUT BROKEN`: Code exists but fails operational requirements or specifications.
- `PARTIALLY IMPLEMENTED`: Core logic exists but lacks integration, lifecycle, or persistence.
- `MISSING`: Required feature is not present in the current codebase.
- `UNAVAILABLE`: Hardware or external dependency is genuinely not available on host system.
- `REMOVED`: Out-of-scope or prohibited feature removed in accordance with specifications.

---

## Subsystem Inventory

### 1. Camera & Video Pipeline
- **Webcam MediaStream Capture**: `WORKING AND VERIFIED` (captures $640 \times 480$ at $30\text{ fps}$ via `getUserMedia`).
- **Camera On/Off Lifecycle Control**: `WORKING AND VERIFIED` (explicit hardware power on/off, camera standby overlay, `track.stop()` release, automatic release on navigation/unload).
- **Face Detection (Haar Multiscale)**: `WORKING AND VERIFIED` (dual-pass cascades for scale invariance).
- **Forehead & Bilateral Cheek ROI Extraction**: `WORKING AND VERIFIED` (YCrCb + HSV skin chrominance isolation).
- **Pre-flight Illumination, Contrast & Stability Guards**: `WORKING AND VERIFIED` (underexposure, saturation, motion limits).

### 2. rPPG Signal Processing & Algorithms
- **Temporal RGB Buffer Management**: `WORKING AND VERIFIED` (sliding buffer with monotonic timestamps).
- **Plane-Orthogonal-to-Skin (POS)**: `WORKING AND VERIFIED` (Wang et al. 2017).
- **Chrominance-based rPPG (CHROM)**: `WORKING AND VERIFIED` (de Haan et al. 2013).
- **Green Channel Baseline (GREEN)**: `WORKING AND VERIFIED` (Verkruysse et al. 2008).
- **Independent Component Analysis (FastICA)**: `WORKING AND VERIFIED` (Poh et al. 2010 FastICA decomposition).
- **TS-CAN Deep Learning 1D/2D Model**: `WORKING AND VERIFIED` (trained weights loaded on MPS/CPU).
- **Multi-Algorithm Concurrent Execution**: `WORKING AND VERIFIED` (concurrent POS, CHROM, GREEN, FastICA, and TS-CAN execution on identical window).
- **Statistical Consensus Engine**: `WORKING AND VERIFIED` (outlier pruning, spread $\le 12\text{ BPM}$ rejection threshold, SNR-weighted median consensus).

### 3. Measurement Timing & Trial Lifecycle
- **60-Second Trial Enforcement**: `WORKING AND VERIFIED` (strict 60-second window measured with monotonic clock `performance.now()`).
- **Early Stop & Incomplete Scan Rejection**: `WORKING AND VERIFIED` (aborted trials marked CANCELLED/REJECTED, final BPM strictly withheld).
- **"+ New Trial" Backend Creation**: `WORKING AND VERIFIED` (unique UID generator `PV-TR-XXXX` and protocol configuration modal).
- **Trial State Machine (`CREATED` -> `READY` -> `RUNNING` -> `COMPLETED` / `CANCELLED` / `REJECTED`)**: `WORKING AND VERIFIED`.
- **Trial History & Persistence**: `WORKING AND VERIFIED` (persisted in MySQL `pulsevision.trials` table).

### 4. Devices, Reference Standards & Blood Pressure
- **Automated Smartwatch SDK / Bluetooth**: `UNAVAILABLE` (no physical wearable hardware attached).
- **Fake Smartwatch UI & Animated Mock Curves**: `REMOVED` (100% eliminated from interface).
- **Manual Ground-Truth Reference Standard Entry (Pulse Oximeter)**: `WORKING AND VERIFIED` (tracks reference BPM, MAE, RMSE, Pearson $r$).
- **Blood Pressure Reference Entry (Systolic/Diastolic mmHg)**: `WORKING AND VERIFIED` (manual entry with explicit disclaimer that webcam rPPG does not measure BP directly).
- **Device Graphical Representations**: `WORKING AND VERIFIED` (honest empty states until manual entry).

### 5. Facial Analysis & Respiratory Motion
- **6-Point Eye Aspect Ratio (EAR)**: `WORKING AND VERIFIED` (real-time eyelid distance ratio).
- **Blink Counter & PERCLOS**: `WORKING AND VERIFIED` (sliding window blink detector).
- **Facial Expression Estimation**: `WORKING AND VERIFIED` (geometric landmark ratio classifier: Neutral, Smiling, Surprised, Drowsy; labeled non-diagnostic).
- **Visual Respiratory Rate Estimation**: `WORKING AND VERIFIED` (cyclic lower face/chin motion bandpass $0.10\text{--}0.50\text{ Hz}$).

### 6. Audio & Sound Elimination
- **Web Audio API Cardiac Synthesizer**: `REMOVED` (purged from codebase; zero AudioContext or oscillators).
- **Audible Beeps & Voice Announcements**: `REMOVED` (100% silent visual operation).

### 7. Storage, API & Security
- **MySQL 8.4 Engine with SQLite Fallback**: `WORKING AND VERIFIED` (connected to `127.0.0.1:3306/pulsevision`).
- **User Authentication (JWT & PBKDF2)**: `WORKING AND VERIFIED` (supports email or username login, upsert registration).
- **CSV Data Export (`/api/trials/export-csv`)**: `WORKING AND VERIFIED` (fully formatted clinical CSV export).
