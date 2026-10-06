# PulseVision Dataset Setup & Preprocessing Guide

## 1. Supported Benchmark Datasets

PulseVision supports standard academic and clinical datasets for remote photoplethysmography benchmarking:

| Dataset | Modality | Subjects | Frame Rate | Ground Truth | Primary Challenges |
|---|---|---|---|---|---|
| **UBFC-rPPG** | Uncompressed RGB (webcam) | 42 | 30 FPS | Pulse Oximeter (CMS50E) | Talking, slight motion, natural indoor lighting |
| **PURE** | Lossless PNG images | 10 | 30 FPS | Pulse Oximeter & SpO2 | Head rotation, talking, steady vs active tasks |
| **SCAMPS** | Synthetic RGB video | 2,800+ | 30 FPS | Simulated PPG & respiration | Diverse skin tones, extreme head poses |
| **VIPL-HR** | 9 clinical/daily setups | 107 | 25-30 FPS | BVP & ECG | High motion, multi-source illumination, distance variance |
| **COHFACE** | Compressed MJPEG video | 40 | 20 FPS | Thought Technology ECG & Respiration | Heavy video compression artifacts, dim illumination |

---

## 2. Directory Structure Conventions

Store raw datasets in structured directories:

```
datasets/
├── UBFC_rPPG/
│   ├── subject1/
│   │   ├── vid.avi
│   │   └── ground_truth.txt   # [Time (s), Pulse (BPM), BVP Signal]
│   └── subject2/
│       ├── vid.avi
│       └── ground_truth.txt
├── PURE/
│   ├── 01-01/
│   │   ├── 01-01/             # Sequential PNG frames (frame_0000.png, ...)
│   │   └── 01-01.json         # Timestamps, pulse rate, oxygen saturation
│   └── 01-02/
└── CUSTOM_TRIALS/
    ├── user_001_trial_01.mp4
    └── reference_ground_truth.csv     # [timestamp, ref_bpm, reference_source, condition]
```

---

## 3. Data Preprocessing Pipeline

### 3.1 Face Alignment & Cropping
1. Detect face bounding box using multi-task cascaded networks or Haar cascades.
2. Maintain spatial consistency across consecutive frames using an Exponential Moving Average (EMA) bounding box filter:
   $$B_t = 0.85 \times B_{t-1} + 0.15 \times B_{\text{raw}}$$
3. Crop and resize facial ROIs to standard input dimensions:
   - For TS-CAN / DeepPhys: $72 \times 72$ or $128 \times 128$ pixels.
   - For TSCAN-1D: Spatially averaged 1D RGB vector ($3 \times T$).

### 3.2 Difference Frame Generation (Normalized Difference)
Deep learning models (TS-CAN, DeepPhys) require normalized first-order differential frames:
$$D(t) = \frac{I(t+1) - I(t)}{I(t+1) + I(t) + \epsilon}$$
This normalization eliminates static background illumination while amplifying high-frequency micro-pulsatile fluctuations.

### 3.3 Ground Truth Synchronization
1. Resample ground truth BVP / pulse signals to match the camera frame timestamps using cubic spline interpolation.
2. Synchronize peak systolic wave timings with physiological pulse transit delays ($\sim 150\text{--}250\text{ ms}$ between central cardiac ejection and facial capillary perfusion).
