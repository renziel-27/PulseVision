from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional

class ReportOut(BaseModel):
    id: int
    scan_id: int
    file_name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class SMSRequest(BaseModel):
    phone: str
    user_name: Optional[str] = "PulseVision User"
    bpm: float
    classification: Optional[str] = "Normal Range"
    stress_level: Optional[str] = "Low (Relaxed)"
    fatigue_level: Optional[str] = "Normal"
