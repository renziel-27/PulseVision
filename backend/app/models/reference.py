from datetime import datetime
from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class ReferenceMeasurement(Base):
    __tablename__ = "validation_trials"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id"), nullable=True, index=True)
    trial_name = Column(String(120), default="Validation Trial")
    trial_code = Column(String(60), nullable=True, default="T001")
    participant_code = Column(String(60), default="P01")
    reference_source = Column(String(100), default="Smartwatch")
    condition = Column(String(100), default="Resting Baseline")
    lighting_condition = Column(String(100), default="Normal Indoor (300-500 lux)")
    movement_condition = Column(String(100), default="Stationary")

    reference_bpm = Column(Float, nullable=False)
    pulsevision_bpm = Column(Float, nullable=False)
    absolute_error = Column(Float, nullable=False)
    measurement_duration = Column(Float, default=30.0)
    algorithm = Column(String(50), default="POS")
    signal_quality = Column(Float, default=1.0)
    status = Column(String(30), default="VALID")
    invalid_reason = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="validation_trials")
    scan = relationship("Scan", back_populates="reference")

    # Compatibility properties
    @property
    def smartwatch_bpm(self):
        return self.reference_bpm

    @smartwatch_bpm.setter
    def smartwatch_bpm(self, val):
        self.reference_bpm = val

    @property
    def reference_device(self):
        return self.reference_source

    @reference_device.setter
    def reference_device(self, val):
        self.reference_source = val
