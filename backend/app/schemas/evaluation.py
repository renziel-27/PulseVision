from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Optional, List
from datetime import datetime

class ReferenceCreate(BaseModel):
    smartwatch_bpm: Optional[float] = Field(None, ge=30, le=240)
    reference_bpm: Optional[float] = Field(None, ge=30, le=240)
    pulsevision_bpm: float = Field(..., ge=30, le=240)
    trial_name: Optional[str] = "Validation Trial"
    trial_code: Optional[str] = None
    participant_code: Optional[str] = "P01"
    reference_source: Optional[str] = "Smartwatch"
    reference_device: Optional[str] = None  # Legacy compatibility
    condition: Optional[str] = "Resting"
    lighting_condition: Optional[str] = "Normal Light"
    movement_condition: Optional[str] = "Stationary"
    measurement_duration: Optional[float] = 30.0
    algorithm: Optional[str] = "CONSENSUS_ENSEMBLE"
    signal_quality: Optional[float] = 1.0
    status: Optional[str] = "VALID"
    invalid_reason: Optional[str] = None
    notes: Optional[str] = None
    scan_id: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def populate_defaults(cls, data: dict):
        if isinstance(data, dict):
            if "smartwatch_bpm" in data and data["smartwatch_bpm"] is not None:
                if "reference_bpm" not in data or data["reference_bpm"] is None:
                    data["reference_bpm"] = data["smartwatch_bpm"]
            elif "reference_bpm" in data and data["reference_bpm"] is not None:
                data["smartwatch_bpm"] = data["reference_bpm"]

            if "reference_source" not in data or not data["reference_source"]:
                data["reference_source"] = data.get("reference_device") or "Smartwatch"
        return data

class ValidationTrialUpdate(BaseModel):
    smartwatch_bpm: Optional[float] = Field(None, ge=30, le=240)
    pulsevision_bpm: Optional[float] = Field(None, ge=30, le=240)
    participant_code: Optional[str] = None
    condition: Optional[str] = None
    measurement_duration: Optional[float] = None
    status: Optional[str] = None
    invalid_reason: Optional[str] = None
    notes: Optional[str] = None

class BulkDeleteRequest(BaseModel):
    trial_ids: List[int]

class BulkUpdateRequest(BaseModel):
    trial_ids: List[int]
    condition: Optional[str] = None
    status: Optional[str] = None
    invalid_reason: Optional[str] = None
    notes: Optional[str] = None

class ValidationTrialOut(BaseModel):
    id: int
    user_id: int
    trial_name: Optional[str] = "Validation Trial"
    trial_code: Optional[str] = "T001"
    participant_code: Optional[str] = "P01"
    reference_source: Optional[str] = "Smartwatch"
    condition: str
    lighting_condition: Optional[str] = "Normal Light"
    movement_condition: Optional[str] = "Stationary"
    reference_bpm: float
    smartwatch_bpm: Optional[float] = None
    pulsevision_bpm: float
    absolute_error: float
    measurement_duration: Optional[float] = 30.0
    algorithm: Optional[str] = "CONSENSUS_ENSEMBLE"
    signal_quality: Optional[float] = 1.0
    status: Optional[str] = "VALID"
    invalid_reason: Optional[str] = None
    notes: Optional[str] = None
    timestamp: Optional[datetime] = None

    @model_validator(mode="after")
    def sync_smartwatch_bpm(self):
        if self.smartwatch_bpm is None:
            self.smartwatch_bpm = self.reference_bpm
        if not self.trial_code:
            self.trial_code = f"T{self.id:03d}"
        if not self.status:
            self.status = "VALID"
        return self

    model_config = ConfigDict(from_attributes=True)

class ValidationStatsOut(BaseModel):
    total_trials: int
    valid_trials: int
    invalid_trials: int
    mae: Optional[float] = None
    rmse: Optional[float] = None
    pearson_r: Optional[float] = None
    mean_bias: Optional[float] = None
    mean_reference: Optional[float] = None
    mean_smartwatch: Optional[float] = None
    mean_pulsevision: Optional[float] = None
    max_error: Optional[float] = None
    min_error: Optional[float] = None
    bland_altman_mean_diff: Optional[float] = None
    loa_upper: Optional[float] = None
    loa_lower: Optional[float] = None
    status: str = "Ready"
    message: str = ""

class EvaluationSummaryOut(BaseModel):
    total_trials: int
    mae: float
    rmse: float
    pearson_r: float
    mean_reference: float
    mean_pulsevision: float
    max_error: float
    min_error: float
    trials: List[ValidationTrialOut]
