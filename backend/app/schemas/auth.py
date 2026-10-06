from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional
from datetime import datetime

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    email: str
    password: str = Field(..., min_length=1)
    phone: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    success: bool = True
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"
    user_id: Optional[int] = None

class UserOut(BaseModel):
    id: int
    name: str
    email: str
    phone: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    sleep_hours: Optional[float] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    sleep_hours: Optional[float] = None

TokenResponse.model_rebuild()

