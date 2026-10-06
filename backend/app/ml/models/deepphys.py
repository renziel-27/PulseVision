import os
import time
import torch
import numpy as np
import cv2
from app.ml.model_interface import RPPGModelAdapter
from app.config import settings

class DeepPhysAdapter(RPPGModelAdapter):
    """
    Adapter for official DeepPhys (Convolutional Attention Network - ECCV 2018).
    Loads pre-trained weights PURE_DeepPhys.pth from rPPG-Toolbox release.
    """
    def __init__(self):
        self._name = "DeepPhys (Convolutional Attention Network - ECCV 2018)"
        self._version = "2.0-Toolbox"
        self._model = None
        self._weights_path = os.path.join(settings.RPPG_TOOLBOX_ROOT, "final_model_release", "PURE_DeepPhys.pth")
        self._load()

    @property
    def name(self) -> str:
        return self._name

    @property
    def version(self) -> str:
        return self._version

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def _load(self):
        if os.path.exists(self._weights_path):
            try:
                import sys
                if settings.RPPG_TOOLBOX_ROOT not in sys.path:
                    sys.path.insert(0, settings.RPPG_TOOLBOX_ROOT)
                from neural_methods.model.DeepPhys import DeepPhys
                
                model = DeepPhys(img_size=72)
                sd = torch.load(self._weights_path, map_location="cpu")
                sd = {k.replace("module.", ""): v for k, v in sd.items()}
                model.load_state_dict(sd)
                model.eval()
                self._model = model
            except Exception as e:
                print(f"[!] Could not load DeepPhys: {e}")

    def predict(self, face_frames, fs: float = 30.0) -> dict:
        t0 = time.time()
        if not self.is_loaded:
            raise RuntimeError("DeepPhys weights not loaded")

        resized = [cv2.resize(f, (72, 72)) for f in face_frames]
        cropped = np.array(resized, dtype=np.float32) / 255.0

        diffs = cropped[1:] - cropped[:-1]
        diffs_norm = diffs / (np.std(diffs, axis=(1, 2, 3), keepdims=True) + 1e-6)
        app = cropped[1:] - np.mean(cropped[1:], axis=(1, 2, 3), keepdims=True)
        app_norm = app / (np.std(app, axis=(1, 2, 3), keepdims=True) + 1e-6)

        inputs = np.concatenate([diffs_norm, app_norm], axis=-1)
        inputs = np.ascontiguousarray(np.transpose(inputs, (0, 3, 1, 2)))

        preds = []
        with torch.no_grad():
            for i in range(0, len(inputs), 16):
                chunk = torch.from_numpy(inputs[i:i+16]).float().contiguous()
                out = self._model(chunk)
                preds.extend(out.squeeze().cpu().numpy().tolist())

        from app.signal_processing.spectral import calculate_fft_bpm_and_sqi
        res = calculate_fft_bpm_and_sqi(preds, fs=fs)
        latency = round((time.time() - t0) * 1000.0, 2)

        return {
            "bpm": res["bpm"],
            "waveform": [round(float(v), 4) for v in preds[-150:]],
            "confidence": res["confidence"],
            "sqi": res["sqi"],
            "latency_ms": latency
        }
