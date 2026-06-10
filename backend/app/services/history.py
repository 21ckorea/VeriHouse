import sqlite3
import json
import os
from datetime import datetime
from typing import List, Dict, Any

class HistoryService:
    def __init__(self, db_path: str = "verihouse.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        """
        Initializes the SQLite database and creates the history table if it doesn't exist.
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS verification_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                article_no TEXT UNIQUE,
                title TEXT,
                property_type TEXT,
                trade_type TEXT,
                price_info TEXT,
                address TEXT,
                risk_score INTEGER,
                risk_level TEXT,
                created_at TEXT
            )
        """)
        conn.commit()
        conn.close()

    def add_record(self, article_no: str, title: str, property_type: str, trade_type: str, price_info: dict, address: str, risk_score: int, risk_level: str):
        """
        Adds or updates a verification record in the database.
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        created_at = datetime.now().isoformat()
        price_info_str = json.dumps(price_info)
        
        try:
            # Insert or replace to avoid duplicates and update the latest risk/timestamp
            cursor.execute("""
                INSERT OR REPLACE INTO verification_history 
                (article_no, title, property_type, trade_type, price_info, address, risk_score, risk_level, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (article_no, title, property_type, trade_type, price_info_str, address, risk_score, risk_level, created_at))
            conn.commit()
        except sqlite3.Error as e:
            print(f"Database error: {e}")
        finally:
            conn.close()

    def get_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Retrieves recent verification records.
        """
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT * FROM verification_history 
                ORDER BY datetime(created_at) DESC 
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            
            history = []
            for row in rows:
                item = dict(row)
                item["price_info"] = json.loads(item["price_info"])
                history.append(item)
            return history
        except sqlite3.Error as e:
            print(f"Database query error: {e}")
            return []
        finally:
            conn.close()
            
    def get_stats(self) -> Dict[str, Any]:
        """
        Generates stats from the verification history (Approach B readiness).
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("SELECT COUNT(*) FROM verification_history")
            total_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM verification_history WHERE risk_score >= 60")
            danger_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM verification_history WHERE risk_score >= 20 AND risk_score < 60")
            warning_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM verification_history WHERE risk_score < 20")
            safe_count = cursor.fetchone()[0]
            
            # Risk types breakdown (requires parsing, but can do a simple average)
            cursor.execute("SELECT AVG(risk_score) FROM verification_history")
            avg_risk = cursor.fetchone()[0] or 0.0
            
            return {
                "total_verified": total_count,
                "danger_count": danger_count,
                "warning_count": warning_count,
                "safe_count": safe_count,
                "average_risk_score": round(avg_risk, 1)
            }
        except sqlite3.Error:
            return {
                "total_verified": 0,
                "danger_count": 0,
                "warning_count": 0,
                "safe_count": 0,
                "average_risk_score": 0.0
            }
        finally:
            conn.close()
