from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(180), unique=True, index=True, nullable=False)
    phone = Column(String(30), nullable=True)
    age = Column(Integer, nullable=True)
    gender = Column(String(30), nullable=True)
    sleep_hours = Column(Float, nullable=True, default=7.5)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    scans = relationship("Scan", back_populates="user", cascade="all, delete-orphan")
    reports = relationship("Report", back_populates="user", cascade="all, delete-orphan")
    validation_trials = relationship("ReferenceMeasurement", back_populates="user", cascade="all, delete-orphan")
    trials = relationship("Trial", back_populates="user", cascade="all, delete-orphan")
