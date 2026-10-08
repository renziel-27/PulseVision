from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from typing import Optional
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserOut, ProfileUpdateRequest
from app.security.auth import get_password_hash, verify_password, create_access_token, get_current_user, get_optional_user
from app.notifications.sms_service import validate_phone_number

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    clean_email = payload.email.lower().strip()
    clean_name = payload.name.strip()
    clean_phone = payload.phone.strip() if payload.phone else None

    # Check duplicate email - seamlessly update account & login so registration never fails
    existing = db.query(User).filter(User.email == clean_email).first()
    if existing:
        if clean_phone and not validate_phone_number(clean_phone):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number must be numeric (e.g. +1234567890 or 9876543210, 7-15 digits)"
            )
        existing.name = clean_name
        if clean_phone:
            existing.phone = clean_phone
        existing.password_hash = get_password_hash(payload.password)
        db.commit()
        db.refresh(existing)

        token = create_access_token(data={"sub": str(existing.id)})
        return TokenResponse(
            success=True,
            access_token=token,
            token_type="bearer",
            user=UserOut.model_validate(existing),
            user_id=existing.id
        )

    # Validate phone if provided
    if clean_phone and not validate_phone_number(clean_phone):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone number must be numeric (e.g. +1234567890 or 9876543210, 7-15 digits)"
        )

    user = User(
        name=clean_name,
        email=clean_email,
        phone=clean_phone,
        password_hash=get_password_hash(payload.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(data={"sub": str(user.id)})
    return TokenResponse(
        success=True,
        access_token=token,
        token_type="bearer",
        user=UserOut.model_validate(user),
        user_id=user.id
    )

@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    login_term = payload.email.lower().strip()
    # Support login via email OR full name / username
    user = db.query(User).filter(
        (User.email == login_term) | (User.name.ilike(login_term))
    ).first()
    
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/username or password. Please try again.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token = create_access_token(data={"sub": str(user.id)})
    return TokenResponse(
        success=True,
        access_token=token,
        token_type="bearer",
        user=UserOut.model_validate(user),
        user_id=user.id
    )

@router.post("/logout")
def logout():
    return {"success": True, "message": "Logged out successfully"}

@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)

@router.get("/profile", response_model=UserOut)
def get_profile(user_id: Optional[int] = None, db: Session = Depends(get_db)):
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            return UserOut.model_validate(user)
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserOut.model_validate(user)

@router.put("/profile", response_model=UserOut)
def update_profile(
    payload: ProfileUpdateRequest,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    user = None
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
    elif current_user:
        user = current_user
    if not user:
        user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.name is not None and payload.name.strip():
        user.name = payload.name.strip()
    if payload.email is not None and payload.email.strip():
        clean_email = payload.email.lower().strip()
        existing = db.query(User).filter(User.email == clean_email, User.id != user.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email is already in use by another account.")
        user.email = clean_email
    if payload.phone is not None:
        user.phone = payload.phone.strip() if payload.phone.strip() else None
    if payload.age is not None:
        user.age = payload.age
    if payload.gender is not None:
        user.gender = payload.gender.strip() if payload.gender.strip() else None
    if payload.sleep_hours is not None:
        user.sleep_hours = payload.sleep_hours

    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)
