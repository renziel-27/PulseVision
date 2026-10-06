# PulseVision Deep Learning Model Setup & Provenance Guide

## 1. Supported Neural Architectures

PulseVision integrates three neural architectures for remote photoplethysmography (rPPG), providing real-time physiological signal extraction:

```
PulseVision / rPPG Deep Learning Models
├── TSCAN-2D (Convolutional Attention Network with Temporal Shifts)
│   ├── Weight Checkpoint: rPPG-Toolbox-main/final_model_release/PURE_TSCAN.pth
│   ├── Target Hardware: GPU / Apple Silicon / Multi-core CPU
│   └── Input: Difference frames (N, 3, H, W) + Raw frames (N, 3, H, W)
├── DeepPhys-2D (Two-Branch Motion & Appearance CNN)
│   ├── Weight Checkpoint: rPPG-Toolbox-main/final_model_release/PURE_DeepPhys.pth
│   ├── Target Hardware: GPU / Apple Silicon / Multi-core CPU
│   └── Input: Temporal gradient frames (N, 3, H, W) + Baseline appearance
└── TSCAN-1D (Lightweight 1D Temporal CNN)
    ├── Weight Checkpoint: PulseVision/backend/models/rppg_tscan_best.pth
    ├── Target Hardware: Edge CPU / Embedded devices / Web Workers
    └── Input: 3-channel temporal signal (1, 3, Frames)
```

---

## 2. Model Checkpoints & Provenance

### 2.1 TSCAN-2D (`PURE_TSCAN.pth`)
- **Origin**: Trained on the **PURE dataset** (Pulse Rate Estimation in Naturalistic Conditions, University of Applied Sciences Düsseldorf).
- **Architecture**: Temporal Shift Convolutional Attention Network (TS-CAN). Employs 2D spatial convolutions while performing channel shifts along the temporal dimension, capturing fine arterial volumetric changes without the memory overhead of full 3D convolutions.
- **Parameters**: 2,126,593 floating-point weights (~8.5 MB checkpoint).
- **Location**: `rPPG-Toolbox-main/final_model_release/PURE_TSCAN.pth`.

### 2.2 DeepPhys-2D (`PURE_DeepPhys.pth`)
- **Origin**: Trained on the **PURE dataset** via the official rPPG-Toolbox training pipeline.
- **Architecture**: Dual-stream CNN architecture:
  - **Motion Branch**: Processes normalized temporal differential frames $\Delta S_t = S_{t+1} - S_t$.
  - **Appearance Branch**: Extracts skin color priors and provides dynamic spatial attention masks to guide the motion branch away from non-pulsatile background and eye regions.
- **Parameters**: 2,125,569 floating-point weights (~8.5 MB checkpoint).
- **Location**: `rPPG-Toolbox-main/final_model_release/PURE_DeepPhys.pth`.

### 2.3 TSCAN-1D (`rppg_tscan_best.pth`)
- **Origin**: Distilled lightweight temporal convolutional model trained on temporally averaged skin chrominance signals.
- **Architecture**: Multi-scale 1D dilated residual temporal blocks with 64 hidden channels and adaptive average pooling.
- **Parameters**: 44,545 weights (~178 KB checkpoint).
- **Location**: `PulseVision/backend/models/rppg_tscan_best.pth`.
- **Latency**: $<1.2\text{ ms}$ inference time on CPU.

---

## 3. Dynamic Weight Loading & Fallback Protocol

PulseVision's `MLRegistry` (`PulseVision/backend/app/ml/registry.py`) implements automated discovery, device allocation, and fault tolerance:

```python
# Device Selection Logic
if torch.cuda.is_available():
    device = torch.device("cuda")
elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
    device = torch.device("mps")
else:
    device = torch.device("cpu")
```

1. **State Dictionary Mapping**: Checkpoints are loaded using `torch.load(path, map_location=device)`.
2. **Key Sanitization**: Strips `module.` prefixes if checkpoints were trained with PyTorch `DataParallel` or `DistributedDataParallel`.
3. **Graceful Fallback**: If deep learning weights are missing or incompatible, the registry sets `loaded: false` and routes requests seamlessly to classical signal processing (**POS** and **CHROM**), preventing runtime crashes.

---

## 4. Retraining & Fine-Tuning with rPPG-Toolbox

To train custom models on proprietary datasets:

1. **Configure YAML**: Edit `rPPG-Toolbox-main/configs/train_configs/PURE_TSCAN.yaml`:
   ```yaml
   TRAIN:
     BATCH_SIZE: 4
     EPOCHS: 30
     LR: 9e-3
     MODEL_FILE_NAME: PURE_TSCAN_custom
   METRIC:
     - 'MAE'
     - 'RMSE'
     - 'PEARSON'
   ```
2. **Execute Training**:
   ```bash
   cd /Users/renzielfernandez/Downloads/rPPG-Toolbox-main
   .venv/bin/python main.py --config_file ./configs/train_configs/PURE_TSCAN.yaml
   ```
3. **Deploy Checkpoint**: Copy the resulting `.pth` checkpoint into `PulseVision/backend/models/` and register it in `registry.py`.
