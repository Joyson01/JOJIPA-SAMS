import sqlite3
import re
import csv
import io
from datetime import date, datetime
from pathlib import Path

# Places the database in ~/Projects/SAMS/data/attendance.db
DB_PATH = Path(__file__).resolve().parent.parent / "data" / "attendance.db"

def init_db() -> None:
    """Initialize the SQLite database and create required tables."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS students (
                eid TEXT PRIMARY KEY,
                name TEXT NOT NULL
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS attendance (
                eid TEXT,
                name TEXT,
                date TEXT,
                time TEXT,
                PRIMARY KEY (eid, date)
            )
        ''')

def get_all_students() -> dict[str, str]:
    """Return a dictionary mapping EIDs to student names."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute("SELECT eid, name FROM students")
        return {row[0]: row[1] for row in cursor.fetchall()}

def get_attendance_for_date(target_date: date) -> dict[str, str]:
    """Return attendance marked for a specific date (EID to time)."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            "SELECT eid, time FROM attendance WHERE date = ?", 
            (target_date.isoformat(),)
        )
        return {row[0]: row[1] for row in cursor.fetchall()}

def clean_name(name: any) -> str | None:
    """Validate and clean the student name (1-100 characters)."""
    if not isinstance(name, str):
        return None
    clean = name.strip()
    if 1 <= len(clean) <= 100:
        return clean
    return None

def clean_eid(eid: any) -> str | None:
    """Validate and clean the Enrollment ID (letters, numbers, hyphens, underscores)."""
    if not isinstance(eid, str):
        return None
    clean = eid.strip()
    if re.match(r'^[\w-]+$', clean):
        return clean
    return None

def upsert_student(eid: str, name: str) -> None:
    """Insert a new student or update an existing one."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("INSERT OR REPLACE INTO students (eid, name) VALUES (?, ?)", (eid, name))

def mark_attendance(eid: str, name: str, now: datetime) -> bool:
    """Mark attendance for a student. Returns True if inserted, False if already marked."""
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M:%S")
    with sqlite3.connect(DB_PATH) as conn:
        try:
            conn.execute(
                "INSERT INTO attendance (eid, name, date, time) VALUES (?, ?, ?, ?)", 
                (eid, name, date_str, time_str)
            )
            return True
        except sqlite3.IntegrityError:
            # IntegrityError triggers if the (eid, date) primary key constraint fails
            return False

def list_attendance(target_date: date) -> list[dict]:
    """Return a list of attendance dictionaries for the API response."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            "SELECT eid, name, time FROM attendance WHERE date = ? ORDER BY time DESC", 
            (target_date.isoformat(),)
        )
        return [dict(row) for row in cursor.fetchall()]

def attendance_csv(target_date: date) -> str:
    """Generate a CSV string of the attendance records for a given date."""
    records = list_attendance(target_date)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["EID", "Name", "Time"])
    for r in records:
        writer.writerow([r["eid"], r["name"], r["time"]])
    return output.getvalue()