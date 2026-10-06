import torch
import torch.nn as nn
import torch.nn.functional as F

class TemporalAttention(nn.Module):
    """
    Temporal Self-Attention mechanism for rPPG signals.
    Selectively weights cardiac pulse phases while suppressing motion artifacts.
    """
    def __init__(self, in_features):
        super(TemporalAttention, self).__init__()
        self.query = nn.Linear(in_features, in_features // 2)
        self.key = nn.Linear(in_features, in_features // 2)
        self.value = nn.Linear(in_features, in_features)
        self.scale = (in_features // 2) ** 0.5

    def forward(self, x):
        # x shape: (B, T, C)
        Q = self.query(x)
        K = self.key(x)
        V = self.value(x)

        attn_weights = torch.bmm(Q, K.transpose(1, 2)) / self.scale
        attn_weights = F.softmax(attn_weights, dim=-1)
        out = torch.bmm(attn_weights, V)
        return out, attn_weights

class TSCAN_RPPGNet(nn.Module):
    """
    Deep Learning Spatial-Temporal rPPG Network (TSCAN-inspired).
    Processes normalized RGB temporal skin signals across multi-ROIs
    to extract the BVP physiological waveform and predict Heart Rate (BPM).
    """
    def __init__(self, in_channels=3, seq_len=150):
        super(TSCAN_RPPGNet, self).__init__()
        self.seq_len = seq_len

        # Multi-scale 1D Temporal Convolutional Encoders
        self.conv1 = nn.Sequential(
            nn.Conv1d(in_channels, 32, kernel_size=7, padding=3),
            nn.BatchNorm1d(32),
            nn.ELU(),
            nn.Dropout(0.1)
        )
        self.conv2 = nn.Sequential(
            nn.Conv1d(32, 64, kernel_size=5, padding=4, dilation=2),
            nn.BatchNorm1d(64),
            nn.ELU(),
            nn.Dropout(0.1)
        )
        self.conv3 = nn.Sequential(
            nn.Conv1d(64, 64, kernel_size=3, padding=2, dilation=2),
            nn.BatchNorm1d(64),
            nn.ELU()
        )

        # Temporal Attention over encoded sequence
        self.attn = TemporalAttention(in_features=64)

        # Waveform pulse reconstruction head
        self.pulse_head = nn.Sequential(
            nn.Conv1d(64, 32, kernel_size=3, padding=1),
            nn.ELU(),
            nn.Conv1d(32, 1, kernel_size=1)
        )

        # Direct BPM Regression Head
        self.bpm_head = nn.Sequential(
            nn.AdaptiveAvgPool1d(1),
            nn.Flatten(),
            nn.Linear(64, 64),
            nn.ELU(),
            nn.Linear(64, 1)
        )

    def forward(self, x):
        """
        x: Tensor of shape (Batch, Channels, Time) -> (B, 3, T)
        Returns:
            pulse_waveform: (B, T)
            predicted_bpm: (B, 1)
        """
        feat = self.conv1(x)
        feat = self.conv2(feat)
        feat = self.conv3(feat) # (B, 64, T)

        # Attention across time: transpose to (B, T, 64)
        feat_t = feat.transpose(1, 2)
        attended_t, _ = self.attn(feat_t)
        attended_feat = attended_t.transpose(1, 2) # (B, 64, T)

        # Reconstruct BVP pulse signal
        pulse = self.pulse_head(attended_feat).squeeze(1) # (B, T)

        # Predict BPM
        bpm = self.bpm_head(attended_feat) # (B, 1)

        return pulse, bpm

def load_or_create_model(weights_path=None):
    """Factory function to load trained model or return initialized instance"""
    model = TSCAN_RPPGNet(in_channels=3, seq_len=150)
    if weights_path:
        import os
        if os.path.exists(weights_path):
            try:
                state = torch.load(weights_path, map_location=torch.device('cpu'), weights_only=True)
                model.load_state_dict(state)
                model.eval()
            except Exception as e:
                print(f"Could not load weights from {weights_path}: {e}")
    return model
