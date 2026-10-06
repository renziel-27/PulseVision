import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.database import init_db
from app.routers import auth, scans, inference, evaluation, reports, notifications, health, trials

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize database schema & demo user
    init_db()
    print(f"[*] {settings.PROJECT_NAME} initialized.")
    yield
    # Shutdown
    print(f"[*] {settings.PROJECT_NAME} shutdown.")

# Ensure DB initialized on module load as well
try:
    init_db()
except Exception as e:
    print(f"[!] Warning on initial init_db: {e}")

app = FastAPI(
    title="PulseVision AI API",
    description="Contactless rPPG Heart Rate & Physiological Assessment Research API",
    version=settings.VERSION,
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path in ("/", "/index.html", "/sw.js", "/manifest.json") or path.startswith(("/css", "/js", "/assets")):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Include API Routers under /api
api_prefix = settings.API_PREFIX
app.include_router(auth.router, prefix=api_prefix)
app.include_router(trials.router, prefix=api_prefix)
app.include_router(scans.router, prefix=api_prefix)
app.include_router(inference.router, prefix=api_prefix)
app.include_router(evaluation.router, prefix=api_prefix)
app.include_router(reports.router, prefix=api_prefix)
app.include_router(notifications.router, prefix=api_prefix)
app.include_router(health.router, prefix=api_prefix)

# Also expose health and root-level routes for easy monitoring
app.include_router(health.router, prefix="")

# Serve Frontend static directory
if os.path.exists(settings.FRONTEND_DIR):
    # Mount sub-directories (css, js, assets)
    css_dir = os.path.join(settings.FRONTEND_DIR, "css")
    js_dir = os.path.join(settings.FRONTEND_DIR, "js")
    assets_dir = os.path.join(settings.FRONTEND_DIR, "assets")
    
    if os.path.exists(css_dir):
        app.mount("/css", StaticFiles(directory=css_dir), name="css")
    if os.path.exists(js_dir):
        app.mount("/js", StaticFiles(directory=js_dir), name="js")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/")
    @app.get("/index.html")
    def serve_frontend_index():
        index_path = os.path.join(settings.FRONTEND_DIR, "index.html")
        return FileResponse(
            index_path,
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )

    @app.get("/manifest.json")
    def serve_manifest():
        manifest_path = os.path.join(settings.FRONTEND_DIR, "manifest.json")
        if os.path.exists(manifest_path):
            return FileResponse(manifest_path, media_type="application/manifest+json")
        return {"error": "manifest not found"}

    @app.get("/sw.js")
    def serve_service_worker():
        sw_path = os.path.join(settings.FRONTEND_DIR, "sw.js")
        if os.path.exists(sw_path):
            return FileResponse(sw_path, media_type="application/javascript")
        return {"error": "sw not found"}

    @app.get("/favicon.ico")
    def serve_favicon():
        svg_icon = os.path.join(settings.FRONTEND_DIR, "assets", "heart_3d_banner.svg")
        if os.path.exists(svg_icon):
            return FileResponse(svg_icon, media_type="image/svg+xml")
        return FileResponse(os.path.join(settings.FRONTEND_DIR, "index.html"))

# Mount React Frontend SPA at /app
react_dist = os.path.join(settings.PULSEVISION_ROOT, "frontend_react", "dist")
if os.path.exists(react_dist):
    app.mount("/app", StaticFiles(directory=react_dist, html=True), name="react_app")

if __name__ == "__main__":
    import uvicorn
    print("[*] Starting PulseVision Uvicorn Server on http://127.0.0.1:8000 ...")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
