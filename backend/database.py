import sqlite3
import os
import json
import hashlib
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pulsevision.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Users Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Scans History Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            bpm REAL NOT NULL,
            confidence REAL NOT NULL,
            stress_level TEXT NOT NULL,
            fatigue_level TEXT NOT NULL,
            ear_value REAL,
            signal_quality TEXT NOT NULL,
            algorithm_used TEXT NOT NULL,
            classification TEXT NOT NULL,
            notes TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)

    # Ground-Truth Reference Validation Trials Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS validation_trials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            trial_name TEXT,
            trial_code TEXT,
            participant_code TEXT DEFAULT 'P01',
            reference_source TEXT DEFAULT 'Smartwatch',
            condition TEXT NOT NULL,
            lighting_condition TEXT DEFAULT 'Normal Light',
            movement_condition TEXT DEFAULT 'Stationary',
            reference_bpm REAL NOT NULL,
            pulsevision_bpm REAL NOT NULL,
            absolute_error REAL NOT NULL,
            measurement_duration REAL DEFAULT 30.0,
            algorithm TEXT NOT NULL,
            signal_quality REAL,
            status TEXT DEFAULT 'VALID',
            invalid_reason TEXT,
            notes TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)

    # Run SQLite migration for validation_trials columns if missing
    cursor.execute("PRAGMA table_info(validation_trials)")
    existing_cols = [c[1] for c in cursor.fetchall()]
    if "trial_code" not in existing_cols:
        cursor.execute("ALTER TABLE validation_trials ADD COLUMN trial_code TEXT")
    if "measurement_duration" not in existing_cols:
        cursor.execute("ALTER TABLE validation_trials ADD COLUMN measurement_duration REAL DEFAULT 30.0")
    if "status" not in existing_cols:
        cursor.execute("ALTER TABLE validation_trials ADD COLUMN status TEXT DEFAULT 'VALID'")
    if "invalid_reason" not in existing_cols:
        cursor.execute("ALTER TABLE validation_trials ADD COLUMN invalid_reason TEXT")

    # Outgoing SMS Logs Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sms_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL,
            carrier_response TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Outgoing Email Logs Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS email_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            to_email TEXT NOT NULL,
            subject TEXT NOT NULL,
            status TEXT NOT NULL,
            response_details TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()

    # Create default demo user if not exists
    cursor.execute("SELECT id FROM users WHERE email = ?", ("demo@pulsevision.ai",))
    if not cursor.fetchone():
        cursor.execute("""
            INSERT INTO users (name, email, phone, password_hash)
            VALUES (?, ?, ?, ?)
        """, ("Alex Morgan", "demo@pulsevision.ai", "+15550198234", hash_password("demo1234")))
        conn.commit()

    conn.close()

# Database helper functions
def register_user(name, email, phone, password):
    conn = get_db_connection()
    cursor = conn.cursor()
    pwd_hash = hash_password(password)
    
    # If user provided a single username instead of full email, format as @pulsevision.ai
    clean_email = email.strip().lower()
    if "@" not in clean_email:
        clean_email = f"{clean_email}@pulsevision.ai"

    try:
        cursor.execute("""
            INSERT INTO users (name, email, phone, password_hash)
            VALUES (?, ?, ?, ?)
        """, (name.strip(), clean_email, phone.strip(), pwd_hash))
        conn.commit()
        user_id = cursor.lastrowid
        return {"success": True, "user_id": user_id, "name": name.strip(), "email": clean_email, "phone": phone.strip()}
    except sqlite3.IntegrityError:
        return {"success": False, "error": "User/Email is already registered"}
    finally:
        conn.close()

def authenticate_user(identifier, password):
    conn = get_db_connection()
    cursor = conn.cursor()
    pwd_hash = hash_password(password)
    clean_id = identifier.strip().lower()
    cursor.execute("""
        SELECT id, name, email, phone FROM users
        WHERE (LOWER(email) = ? OR LOWER(name) = ?) AND password_hash = ?
    """, (clean_id, clean_id, pwd_hash))
    user = cursor.fetchone()
    conn.close()
    if user:
        return {"success": True, "user": dict(user)}
    return {"success": False, "error": "Invalid username/email or password"}

def save_scan_record(user_id, bpm, confidence, stress_level, fatigue_level, ear_value, signal_quality, algorithm_used, classification, notes=""):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO scans (user_id, bpm, confidence, stress_level, fatigue_level, ear_value, signal_quality, algorithm_used, classification, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, bpm, confidence, stress_level, fatigue_level, ear_value, signal_quality, algorithm_used, classification, notes))
    conn.commit()
    scan_id = cursor.lastrowid
    conn.close()
    return scan_id

def get_user_scans(user_id, limit=20):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM scans WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?
    """, (user_id, limit))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def save_validation_trial(user_id, condition="Resting", reference_bpm=None, pulsevision_bpm=72.0, algorithm="CONSENSUS_ENSEMBLE", signal_quality=1.0, trial_name="Validation Trial", notes="", smartwatch_bpm=None, participant_code="P01", reference_source="Smartwatch", lighting_condition="Normal Light", movement_condition="Stationary", measurement_duration=30.0, status="VALID", invalid_reason=None):
    ref_bpm = reference_bpm if reference_bpm is not None else (smartwatch_bpm if smartwatch_bpm is not None else 72.0)
    abs_error = round(abs(ref_bpm - pulsevision_bpm), 2)
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO validation_trials (user_id, trial_name, trial_code, participant_code, reference_source, condition, lighting_condition, movement_condition, reference_bpm, pulsevision_bpm, absolute_error, measurement_duration, algorithm, signal_quality, status, invalid_reason, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, trial_name, trial_name, participant_code, reference_source, condition, lighting_condition, movement_condition, ref_bpm, pulsevision_bpm, abs_error, measurement_duration, algorithm, signal_quality, status, invalid_reason, notes))
    conn.commit()
    trial_id = cursor.lastrowid
    conn.close()
    return {"id": trial_id, "absolute_error": abs_error}

def get_validation_trials(user_id=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    if user_id:
        cursor.execute("SELECT * FROM validation_trials WHERE user_id = ? ORDER BY timestamp DESC", (user_id,))
    else:
        cursor.execute("SELECT * FROM validation_trials ORDER BY timestamp DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def log_sms(phone, message, status="DELIVERED", carrier_response="OK (Simulated Gateway)"):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO sms_logs (phone, message, status, carrier_response)
        VALUES (?, ?, ?, ?)
    """, (phone, message, status, carrier_response))
    conn.commit()
    sms_id = cursor.lastrowid
    conn.close()
    return sms_id

def get_sms_logs(limit=15):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sms_logs ORDER BY timestamp DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def log_email(to_email, subject, status="SENT", response_details="Delivered"):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO email_logs (to_email, subject, status, response_details)
        VALUES (?, ?, ?, ?)
    """, (to_email, subject, status, response_details))
    conn.commit()
    email_id = cursor.lastrowid
    conn.close()
    return email_id

def get_email_logs(limit=15):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM email_logs ORDER BY timestamp DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at:", DB_PATH)

