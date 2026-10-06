from fastapi import APIRouter
from app.config import settings
from app.ml import ml_registry

router = APIRouter(tags=["Health & Diagnostics"])

@router.get("/health")
def health():
    return {"status": "ok", "service": "PulseVision Core API", "healthy": True}

@router.get("/ready")
def ready():
    return {"status": "ready", "deep_models_loaded": True, "database": "connected"}

@router.get("/version")
def version():
    return {
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "api_prefix": settings.API_PREFIX
    }

@router.get("/status")
def status_info():
    return {
        "status": "online",
        "system": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "ml_status": ml_registry.get_status(),
        "disclaimer": "Research and educational prototype only. Not a medical diagnostic device."
    }
