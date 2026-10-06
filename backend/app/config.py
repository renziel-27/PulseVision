import os
from pydantic import BaseModel

try:
    from dotenv import load_dotenv
    _PULSEVISION_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    load_dotenv(os.path.join(_PULSEVISION_ROOT, ".env"))
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
except ImportError:
    pass

class Settings(BaseModel):
    PROJECT_NAME: str = "PulseVision AI Heart Monitoring & Health Assessment System"
    VERSION: str = "2.0-Research"
    API_PREFIX: str = "/api"
    SECRET_KEY: str = os.getenv("PULSEVISION_SECRET_KEY", "pulsevision-super-secret-research-jwt-key-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    PULSEVISION_ROOT: str = os.path.dirname(BASE_DIR)
    RPPG_TOOLBOX_ROOT: str = "/Users/renzielfernandez/Downloads/rPPG-Toolbox-main"
    
    # Priority: Environment variable -> MySQL (root:root) -> SQLite fallback
    DATABASE_URL: str = os.getenv("DATABASE_URL", "mysql+pymysql://root:root@127.0.0.1:3306/pulsevision")
    MODELS_DIR: str = os.path.join(BASE_DIR, "models")
    CASCADES_DIR: str = os.path.join(BASE_DIR, "cascades")
    REPORTS_DIR: str = os.path.join(PULSEVISION_ROOT, "reports_storage")
    FRONTEND_DIR: str = os.path.join(PULSEVISION_ROOT, "frontend")

    # Twilio / SMS Configuration
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_PHONE_NUMBER: str = os.getenv("TWILIO_PHONE_NUMBER", "")

    # CORS origins
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*"
    ]

settings = Settings()
os.makedirs(settings.REPORTS_DIR, exist_ok=True)
os.makedirs(settings.MODELS_DIR, exist_ok=True)
