from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict

class TrialCreateRequest(BaseModel):
    user_id: Optional[int] = None
    trial_uid: Optional[str] = None
    trial_name: Optional[str] = "60s rPPG Trial"
    participant_code: Optional[str] = "P01"
    condition: Optional[str] = "Resting Baseline"
    lighting_condition: Optional[str] = "Normal Indoor (300-500 lux)"
    movement_condition: Optional[str] = "Stationary"
    requested_duration_sec: float = 60.0
    reference_source: Optional[str] = "Finger Pulse Oximeter"
    reference_bpm: Optional[float] = None
    reference_systolic_bp: Optional[float] = None
    reference_diastolic_bp: Optional[float] = None
    notes: Optional[str] = None

class TrialCompleteRequest(BaseModel):
    actual_duration_sec: float = 60.0
    duration_seconds: Optional[float] = None
    total_frames: int = 1800
    usable_frames: int = 1800
    rgb_history: Optional[List[List[float]]] = None
    motion_history: Optional[List[float]] = None
    facial_indicators: Optional[Any] = None
    reference_bpm: Optional[float] = None
    reference_systolic_bp: Optional[float] = None
    reference_diastolic_bp: Optional[float] = None
    final_bpm: Optional[float] = None
    consensus_bpm: Optional[float] = None
    final_sqi: Optional[float] = None
    final_confidence: Optional[float] = None
    contributing_algorithms: Optional[str] = None
    consensus_status: Optional[str] = None
    algorithm_results: Optional[Dict[str, Any]] = None

class TrialOut(BaseModel):
    id: int
    trial_uid: str
    user_id: int
    trial_name: str
    participant_code: str
    condition: str
    lighting_condition: str
    movement_condition: str
    status: str
    rejection_reason: Optional[str] = ""
    created_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    requested_duration_sec: float
    actual_duration_sec: float
    total_frames: int
    usable_frames: int
    final_bpm: Optional[float] = None
    final_sqi: Optional[float] = 0.0
    final_confidence: Optional[float] = 0.0
    contributing_algorithms: Optional[str] = ""
    consensus_status: Optional[str] = "PENDING"
    breathing_rate_brpm: Optional[float] = None
    breathing_status: Optional[str] = "Unavailable"
    avg_ear: Optional[float] = 0.28
    blink_count: Optional[int] = 0
    estimated_expression: Optional[str] = "Neutral"
    stress_level: Optional[str] = "Low (Relaxed)"
    fatigue_level: Optional[str] = "Normal"
    reference_source: Optional[str] = "Finger Pulse Oximeter"
    reference_bpm: Optional[float] = None
    reference_systolic_bp: Optional[float] = None
    reference_diastolic_bp: Optional[float] = None
    absolute_error_bpm: Optional[float] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class TrialDetailOut(TrialOut):
    consensus_bpm: Optional[float] = None
    spread_bpm: Optional[float] = 0.0
    contributing_algorithms: Optional[Any] = None
    multi_algorithm_bpm: Optional[Dict[str, Any]] = None
    algorithm_results: Optional[Dict[str, Any]] = None

