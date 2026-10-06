import uuid
from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class Trial(Base):
    __tablename__ = "trials"

    id = Column(Integer, primary_key=True, index=True)
    trial_uid = Column(String(60), unique=True, index=True, default=lambda: f"PV-TR-{uuid.uuid4().hex[:8].upper()}")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    trial_name = Column(String(120), default="60s rPPG Trial")
    participant_code = Column(String(60), default="P01")
    condition = Column(String(100), default="Resting Baseline")
    lighting_condition = Column(String(100), default="Normal Indoor (300-500 lux)")
    movement_condition = Column(String(100), default="Stationary")

    # Lifecycle State Machine: CREATED -> READY -> RUNNING -> PROCESSING -> COMPLETED | REJECTED | CANCELLED | FAILED
    status = Column(String(30), default="CREATED", index=True)
    rejection_reason = Column(String(255), default="")

    # Duration & Frames
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    requested_duration_sec = Column(Float, default=60.0)
    actual_duration_sec = Column(Float, default=0.0)
    total_frames = Column(Integer, default=0)
    usable_frames = Column(Integer, default=0)

    # Multi-Algorithm Consensus Results
    final_bpm = Column(Float, nullable=True)
    final_sqi = Column(Float, default=0.0)
    final_confidence = Column(Float, default=0.0)
    contributing_algorithms = Column(String(200), default="")
    consensus_status = Column(String(50), default="PENDING")
    algorithm_results_json = Column(Text, nullable=True)

    # Physiological & Facial Analysis
    breathing_rate_brpm = Column(Float, nullable=True)
    breathing_status = Column(String(100), default="Unavailable")
    avg_ear = Column(Float, default=0.28)
    blink_count = Column(Integer, default=0)
    eye_closure_sec = Column(Float, default=0.0)
    estimated_expression = Column(String(50), default="Neutral")
    stress_level = Column(String(50), default="Low (Relaxed)")
    fatigue_level = Column(String(50), default="Normal")
    eye_redness_status = Column(String(50), default="Normal")

    # Manual Reference Standard Validation
    reference_source = Column(String(100), default="Finger Pulse Oximeter")
    reference_bpm = Column(Float, nullable=True)
    reference_systolic_bp = Column(Float, nullable=True)   # mmHg
    reference_diastolic_bp = Column(Float, nullable=True)  # mmHg
    absolute_error_bpm = Column(Float, nullable=True)

    notes = Column(Text, nullable=True)

    user = relationship("User", back_populates="trials")
