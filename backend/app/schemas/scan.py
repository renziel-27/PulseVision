from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime

class ScanCreate(BaseModel):
    algorithm_name: str = "POS"
    duration_seconds: float = 15.0

class ScanComplete(BaseModel):
    bpm: float
    confidence: float = 85.0
    signal_quality: str = "High"
    sqi_score: float = 1.0
    algorithm_used: str = "POS"
    classification: str = "Normal Range"
    stress_level: str = "Low (Relaxed)"
    fatigue_level: str = "Normal"
    ear_value: float = 0.28
    waveform: Optional[List[float]] = None
    notes: Optional[str] = None

class ScanOut(BaseModel):
    id: int
    user_id: int
    started_at: datetime
    completed_at: datetime
    duration_seconds: float
    sampling_rate: float
    algorithm_name: str
    model_version: str
    estimated_bpm: Optional[float] = None
    confidence: float
    signal_quality: str
    accepted: bool
    rejection_reason: str
    classification: str
    stress_level: str
    fatigue_level: str
    ear_value: float

    model_config = ConfigDict(from_attributes=True)

class PreflightCheck(BaseModel):
    ready: bool
    face_detected: bool
    lighting_ok: bool
    lighting_mean: float = 0.0
    lighting_contrast: float = 0.0
    position_ok: bool
    stability_ok: bool
    motion_score: float = 0.0
    message: str
