from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class ProcessFrameRequest(BaseModel):
    image: str # Base64 encoded JPEG

class LiveUpdateRequest(BaseModel):
    rgb_history: List[List[float]]
    algorithm: str = "POS"
    fps: float = 30.0

class InferenceResult(BaseModel):
    success: bool
    bpm: float
    confidence: float
    sqi: float
    waveform: List[float]
    algorithm: str
    is_valid: bool
    rejection_reason: str = ""
    spectrum: Optional[Dict[str, Any]] = None
