import re
from app.config import settings
from app.database import SessionLocal
from app.models.notification import SMSLog

PHONE_REGEX = re.compile(r'^\+?[0-9]{7,15}$')

def validate_phone_number(phone: str) -> bool:
    if not phone:
        return False
    cleaned = re.sub(r'[\s\-\(\)]', '', phone)
    return bool(PHONE_REGEX.match(cleaned))

def format_health_sms(user_name: str, bpm: float, classification: str, stress_level: str, fatigue_level: str) -> str:
    return (
        f"PulseVision Report for {user_name}:\n"
        f"Estimated Heart Rate: {bpm} BPM ({classification})\n"
        f"Stress Index: {stress_level}\n"
        f"Fatigue Index: {fatigue_level}\n"
        f"Notice: Non-contact research prototype estimate only. Not a medical diagnosis."
    )

def send_health_sms(phone: str, user_name: str, bpm: float, classification: str, stress_level: str, fatigue_level: str) -> dict:
    if not validate_phone_number(phone):
        return {
            "success": False,
            "error": "Invalid phone number format. Must be numeric with 7-15 digits (e.g. +1234567890)."
        }

    message_body = format_health_sms(user_name, bpm, classification, stress_level, fatigue_level)

    # Check if Twilio credentials exist
    if settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_PHONE_NUMBER:
        try:
            from twilio.rest import Client
            client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            message = client.messages.create(
                body=message_body,
                from_=settings.TWILIO_PHONE_NUMBER,
                to=phone
            )
            status = "Sent (Twilio)"
            carrier_resp = f"SID: {message.sid}"
        except Exception as e:
            status = "Failed"
            carrier_resp = str(e)
    else:
        # Simulated Dispatch Logger
        status = "Dispatched (Simulated Gateway)"
        carrier_resp = "Delivered to PulseVision SMS simulated dispatcher."

    # Save to database
    db = SessionLocal()
    try:
        log_entry = SMSLog(
            phone=phone,
            message=message_body,
            status=status,
            carrier_response=carrier_resp
        )
        db.add(log_entry)
        db.commit()
    finally:
        db.close()

    return {
        "success": True if "Failed" not in status else False,
        "status": status,
        "phone": phone,
        "message": message_body,
        "carrier_response": carrier_resp
    }
