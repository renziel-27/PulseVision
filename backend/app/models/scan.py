from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class Scan(Base):
    __tablename__ = "scans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, default=datetime.utcnow)
    duration_seconds = Column(Float, default=15.0)
    sampling_rate = Column(Float, default=30.0)
    algorithm_name = Column(String(50), default="POS")
    model_version = Column(String(50), default="v2.0-Production")

    estimated_bpm = Column(Float, nullable=True)
    confidence = Column(Float, default=0.0)
    signal_quality = Column(String(50), default="High")
    sqi_score = Column(Float, default=1.0)
    accepted = Column(Boolean, default=True)
    rejection_reason = Column(String(255), default="")
    processing_latency_ms = Column(Float, default=0.0)

    # Health & Secondary Indicators
    classification = Column(String(100), default="Normal Range")
    stress_level = Column(String(100), default="Low (Relaxed)")
    fatigue_level = Column(String(100), default="Normal")
    ear_value = Column(Float, default=0.28)
    waveform_json = Column(Text, nullable=True) # Compressed or sampled points
    notes = Column(Text, nullable=True)

    user = relationship("User", back_populates="scans")
    reference = relationship("ReferenceMeasurement", back_populates="scan", uselist=False, cascade="all, delete-orphan")
    report = relationship("Report", back_populates="scan", uselist=False, cascade="all, delete-orphan")
