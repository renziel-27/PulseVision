#!/usr/bin/env python3
"""
PulseVision AI — Master Application Entrypoint
Version 2.0 (Documentation-Aligned, Smartwatch-Free Scope)
"""

import os
import sys
import argparse
import uvicorn

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(CURRENT_DIR, "backend")

# Ensure backend is at the top of sys.path and doesn't collide with app.py
if CURRENT_DIR in sys.path:
    sys.path.remove(CURRENT_DIR)
sys.path.insert(0, BACKEND_DIR)
if "app" in sys.modules:
    del sys.modules["app"]

from app.main import app

try:
    import cv2
    cv2.ocl.setUseOpenCL(False)
except Exception:
    pass

def main():
    parser = argparse.ArgumentParser(description="PulseVision AI Research Prototype Server")
    parser.add_argument("--host", default="127.0.0.1", help="Host address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port (default: 8000)")
    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("   PULSEVISION AI — NON-CONTACT rPPG PHYSIOLOGICAL MONITOR")
    print("   Version: 2.0 (Smartwatch Heart-Rate Validation & Benchmark)")
    print("=" * 60)
    print(f"[*] Starting core backend on http://{args.host}:{args.port}")
    print(f"[*] Three.js 3D Beating Heart Interface: http://{args.host}:{args.port}/")
    print(f"[*] React 18 Analytics Dashboard:        http://{args.host}:{args.port}/app/")
    print(f"[*] Interactive OpenAPI Docs:           http://{args.host}:{args.port}/docs")
    print("=" * 60 + "\n")

    uvicorn.run(
        app,
        host=args.host,
        port=args.port
    )

if __name__ == "__main__":
    main()
