import os
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

logger = logging.getLogger("PulseVision.Database")

def create_db_engine():
    db_url = settings.DATABASE_URL

    # If targeting MySQL, verify/create database schema first
    if "mysql" in db_url:
        try:
            import pymysql
            from sqlalchemy.engine import make_url
            parsed_url = make_url(db_url)
            is_local = parsed_url.host in ("127.0.0.1", "localhost")

            # For local MySQL only: ensure database exists
            if is_local:
                try:
                    conn = pymysql.connect(
                        host=parsed_url.host,
                        port=parsed_url.port or 3306,
                        user=parsed_url.username or "root",
                        password=parsed_url.password or "root",
                        autocommit=True
                    )
                    with conn.cursor() as cur:
                        db_name = parsed_url.database or "pulsevision"
                        cur.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
                    conn.close()
                except Exception as local_err:
                    logger.warning(f"Could not verify/create local database: {local_err}")

            # Remote / Cloud MySQL (e.g. Aiven) requires SSL
            connect_args = {}
            if not is_local or "ssl" in db_url.lower():
                connect_args["ssl"] = {"check_hostname": False}

            eng = create_engine(
                db_url,
                connect_args=connect_args,
                pool_pre_ping=True,
                pool_recycle=3600
            )
            # Verify test query
            with eng.connect() as test_conn:
                test_conn.execute(text("SELECT 1"))
            host_display = parsed_url.host or "MySQL"
            port_display = parsed_url.port or 3306
            db_display = parsed_url.database or "pulsevision"
            print(f"[*] PulseVision Database: Connected to MySQL ({host_display}:{port_display}/{db_display})")
            return eng
        except Exception as e:
            print(f"[!] Warning: MySQL connection failed ({e}). Falling back to SQLite database.")
    
    # SQLite Fallback
    sqlite_path = os.path.join(settings.BASE_DIR, "pulsevision.db")
    sqlite_url = f"sqlite:///{sqlite_path}"
    eng = create_engine(
        sqlite_url,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True
    )
    print(f"[*] PulseVision Database: Connected to SQLite ({sqlite_path})")
    return eng

engine = create_db_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    from app.models import user, scan, reference, report, notification
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        from app.models.user import User
        from app.security.auth import get_password_hash
        
        # 1. Seed demo user if missing
        demo = db.query(User).filter(User.email == "demo@pulsevision.ai").first()
        if not demo:
            demo_user = User(
                name="PulseVision Demo User",
                email="demo@pulsevision.ai",
                phone="+15551234567",
                password_hash=get_password_hash("demo1234")
            )
            db.add(demo_user)
            db.commit()

        # 2. Check if we should sync from existing SQLite database
        sqlite_file = os.path.join(settings.BASE_DIR, "pulsevision.db")
        if "mysql" in str(engine.url) and os.path.exists(sqlite_file) and db.query(User).count() <= 1:
            try:
                import sqlite3
                sq_conn = sqlite3.connect(sqlite_file)
                sq_cur = sq_conn.cursor()
                sq_users = sq_cur.execute("SELECT id, name, email, phone, password_hash, created_at, updated_at FROM users").fetchall()
                for u in sq_users:
                    if not db.query(User).filter(User.email == u[2]).first():
                        migrated_u = User(
                            id=u[0],
                            name=u[1],
                            email=u[2],
                            phone=u[3],
                            password_hash=u[4]
                        )
                        db.merge(migrated_u)
                db.commit()
                sq_conn.close()
            except Exception as sync_err:
                print(f"[!] Optional SQLite sync skipped: {sync_err}")
                db.rollback()

        # 3. Auto-migrate validation_trials schema if columns are missing
        new_cols = [
            ("trial_code", "VARCHAR(60) DEFAULT 'T001'"),
            ("measurement_duration", "FLOAT DEFAULT 30.0"),
            ("status", "VARCHAR(30) DEFAULT 'VALID'"),
            ("invalid_reason", "VARCHAR(255) DEFAULT NULL"),
        ]
        with engine.connect() as conn:
            for col_name, col_def in new_cols:
                try:
                    conn.execute(text(f"ALTER TABLE validation_trials ADD COLUMN {col_name} {col_def}"))
                    conn.commit()
                except Exception:
                    pass  # Column already exists
            
            # Populate trial_code for existing records if null
            try:
                rows = conn.execute(text("SELECT id, trial_code FROM validation_trials ORDER BY id ASC")).fetchall()
                for idx, r in enumerate(rows, 1):
                    if not r[1] or r[1] == "Validation Trial" or r[1] == "T001" and idx > 1:
                        generated_code = f"T{idx:03d}"
                        conn.execute(text("UPDATE validation_trials SET trial_code = :tc WHERE id = :id"), {"tc": generated_code, "id": r[0]})
                conn.commit()
            except Exception as e:
                print(f"[!] Warning updating trial_codes: {e}")

    finally:
        db.close()
