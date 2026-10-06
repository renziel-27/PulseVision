import sys
import os
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))
from app.main import app
from app.database import init_db

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    init_db()

def test_register_and_login_flow():
    email = "researcher_test@pulsevision.ai"
    reg_payload = {
        "name": "Dr. Sarah Chen",
        "email": email,
        "password": "ResearchSecurePassword2026",
        "phone": "+14155552671"
    }

    # Register
    res = client.post("/api/auth/register", json=reg_payload)
    assert res.status_code in [200, 400] # 200 or duplicate 400
    
    # Login
    login_res = client.post("/api/auth/login", json={
        "email": email,
        "password": "ResearchSecurePassword2026"
    })
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert "access_token" in token_data
    token = token_data["access_token"]

    # Protected me endpoint
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    user_info = me_res.json()
    assert user_info["name"] == "Dr. Sarah Chen"
    assert user_info["email"] == email

def test_invalid_login():
    res = client.post("/api/auth/login", json={
        "email": "nonexistent@pulsevision.ai",
        "password": "wrongpassword"
    })
    assert res.status_code == 401

def test_phone_validation():
    # Invalid phone letters
    res = client.post("/api/auth/register", json={
        "name": "Invalid Phone User",
        "email": "invalid_phone@pulsevision.ai",
        "password": "password123",
        "phone": "invalid-phone"
    })
    assert res.status_code == 400
