from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text
from app.database import Base

class SMSLog(Base):
    __tablename__ = "sms_logs"

    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String(30), nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(50), nullable=False)
    carrier_response = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

class EmailLog(Base):
    __tablename__ = "email_logs"

    id = Column(Integer, primary_key=True, index=True)
    to_email = Column(String(180), nullable=False)
    subject = Column(String(200), nullable=False)
    status = Column(String(50), nullable=False)
    response_details = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
