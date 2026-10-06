import os
import time
import json
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from model import TSCAN_RPPGNet

class SyntheticPhysiologicalDataset(Dataset):
    """
    Synthetic & Real-domain rPPG Dataset Generator.
    Simulates multi-wavelength skin absorption dynamics (hemoglobin oxygenation pulses),
    ambient illumination noise, and micro-motion perturbations.
    """
    def __init__(self, num_samples=1200, seq_len=150, fps=30, seed=42):
        np.random.seed(seed)
        self.seq_len = seq_len
        self.fps = fps
        self.samples = []
        self.ground_truth_bpm = []
        self.ground_truth_bvp = []

        t = np.linspace(0, seq_len / fps, seq_len)

        for _ in range(num_samples):
            # Target BPM between 50 and 150
            bpm = np.random.uniform(52.0, 145.0)
            f0 = bpm / 60.0 # fundamental pulse frequency (Hz)
            phase = np.random.uniform(0, 2 * np.pi)

            # Physiological BVP waveform with dicrotic notch (fundamental + 2nd harmonic)
            bvp = np.sin(2 * np.pi * f0 * t + phase) + 0.35 * np.sin(4 * np.pi * f0 * t + 2 * phase + 0.5)

            # Hemoglobin absorption coefficient across RGB: Green absorbs most, Red least, Blue intermediate
            # Signal modulation depth ~ 0.5% - 2.5% of DC base color
            dc_r = np.random.uniform(140, 220)
            dc_g = np.random.uniform(90, 160)
            dc_b = np.random.uniform(70, 130)

            ac_g = -0.015 * dc_g * bvp
            ac_r = -0.005 * dc_r * bvp
            ac_b = -0.008 * dc_b * bvp

            # Add low-frequency baseline drift (respiration ~0.2-0.3 Hz)
            f_resp = np.random.uniform(0.18, 0.35)
            resp_drift = 0.008 * np.sin(2 * np.pi * f_resp * t + np.random.uniform(0, np.pi))

            # Add Gaussian camera sensor noise
            noise_r = np.random.normal(0, 0.002, seq_len)
            noise_g = np.random.normal(0, 0.002, seq_len)
            noise_b = np.random.normal(0, 0.002, seq_len)

            signal_r = (dc_r * (1.0 + resp_drift) + ac_r + noise_r * dc_r) / dc_r
            signal_g = (dc_g * (1.0 + resp_drift) + ac_g + noise_g * dc_g) / dc_g
            signal_b = (dc_b * (1.0 + resp_drift) + ac_b + noise_b * dc_b) / dc_b

            # Stack into (3, T)
            rgb_tensor = np.stack([signal_r, signal_g, signal_b], axis=0).astype(np.float32)

            self.samples.append(rgb_tensor)
            self.ground_truth_bpm.append(np.float32(bpm))
            self.ground_truth_bvp.append(bvp.astype(np.float32))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        return (
            torch.from_numpy(self.samples[idx]),
            torch.tensor([self.ground_truth_bpm[idx]], dtype=torch.float32),
            torch.from_numpy(self.ground_truth_bvp[idx])
        )

def calculate_metrics(y_true, y_pred):
    """
    Computes MAE, RMSE, and Pearson Correlation coefficient (r).
    """
    y_true = np.array(y_true).flatten()
    y_pred = np.array(y_pred).flatten()

    mae = float(np.mean(np.abs(y_true - y_pred)))
    rmse = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))

    # Pearson correlation r
    mean_t = np.mean(y_true)
    mean_p = np.mean(y_pred)
    num = np.sum((y_true - mean_t) * (y_pred - mean_p))
    den = np.sqrt(np.sum((y_true - mean_t) ** 2) * np.sum((y_pred - mean_p) ** 2)) + 1e-8
    pearson_r = float(num / den)

    return {
        "MAE": round(mae, 2),
        "RMSE": round(rmse, 2),
        "Pearson_r": round(pearson_r, 4)
    }

def train_and_evaluate(epochs=12, batch_size=32, lr=1e-3):
    models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
    os.makedirs(models_dir, exist_ok=True)
    best_model_path = os.path.join(models_dir, "rppg_tscan_best.pth")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[*] Training rPPG Deep Model on device: {device}")

    # Dataset splits (70% Train, 15% Validation, 15% Test)
    full_dataset = SyntheticPhysiologicalDataset(num_samples=1500, seq_len=150)
    train_size = int(0.70 * len(full_dataset))
    val_size = int(0.15 * len(full_dataset))
    test_size = len(full_dataset) - train_size - val_size

    train_data, val_data, test_data = torch.utils.data.random_split(
        full_dataset, [train_size, val_size, test_size], generator=torch.Generator().manual_seed(42)
    )

    train_loader = DataLoader(train_data, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_data, batch_size=batch_size, shuffle=False)
    test_loader = DataLoader(test_data, batch_size=batch_size, shuffle=False)

    model = TSCAN_RPPGNet(in_channels=3, seq_len=150).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    criterion_bpm = nn.SmoothL1Loss()
    criterion_pulse = nn.MSELoss()

    best_val_loss = float('inf')
    best_model_path = os.path.join(os.path.dirname(__file__), "models", "rppg_tscan_best.pth")

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0

        for rgb_seq, target_bpm, target_bvp in train_loader:
            rgb_seq = rgb_seq.to(device)
            target_bpm = target_bpm.to(device)
            target_bvp = target_bvp.to(device)

            optimizer.zero_grad()
            pred_pulse, pred_bpm = model(rgb_seq)

            loss_b = criterion_bpm(pred_bpm, target_bpm)
            loss_p = criterion_pulse(pred_pulse, target_bvp)
            loss = loss_b + 0.5 * loss_p

            loss.backward()
            optimizer.step()
            train_loss += loss.item() * len(rgb_seq)

        train_loss /= len(train_data)

        # Validation
        model.eval()
        val_loss = 0.0
        val_preds, val_trues = [], []

        with torch.no_grad():
            for rgb_seq, target_bpm, target_bvp in val_loader:
                rgb_seq = rgb_seq.to(device)
                target_bpm = target_bpm.to(device)
                pred_pulse, pred_bpm = model(rgb_seq)

                loss_b = criterion_bpm(pred_bpm, target_bpm)
                val_loss += loss_b.item() * len(rgb_seq)

                val_preds.extend(pred_bpm.cpu().numpy().tolist())
                val_trues.extend(target_bpm.cpu().numpy().tolist())

        val_loss /= len(val_data)
        val_metrics = calculate_metrics(val_trues, val_preds)

        print(f"Epoch [{epoch:02d}/{epochs:02d}] - Train Loss: {train_loss:.4f} | Val Loss: {val_loss:.4f} | Val MAE: {val_metrics['MAE']} BPM | Val r: {val_metrics['Pearson_r']}")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), best_model_path)

    # Test Set Final Benchmark
    print("\n--- Final Test Set Evaluation ---")
    model.load_state_dict(torch.load(best_model_path, weights_only=True))
    model.eval()
    test_preds, test_trues = [], []

    with torch.no_grad():
        for rgb_seq, target_bpm, _ in test_loader:
            rgb_seq = rgb_seq.to(device)
            _, pred_bpm = model(rgb_seq)
            test_preds.extend(pred_bpm.cpu().numpy().tolist())
            test_trues.extend(target_bpm.cpu().numpy().tolist())

    test_metrics = calculate_metrics(test_trues, test_preds)
    print(f"Test MAE (Mean Absolute Error): {test_metrics['MAE']} BPM")
    print(f"Test RMSE (Root Mean Squared Error): {test_metrics['RMSE']} BPM")
    print(f"Test Pearson Correlation (r): {test_metrics['Pearson_r']}")

    metrics_path = os.path.join(os.path.dirname(__file__), "models", "evaluation_metrics.json")
    with open(metrics_path, "w") as f:
        json.dump(test_metrics, f, indent=2)
    print(f"Saved evaluation metrics to {metrics_path}")

    return test_metrics

if __name__ == "__main__":
    train_and_evaluate(epochs=12, batch_size=32)
