import time
import secrets
from typing import Optional, Dict, Any

class AgentSessionManager:
    def __init__(self):
        self.active_session_id: Optional[str] = None
        self.started_at: Optional[float] = None
        self.kill_switch_armed: bool = True

    def start_session(self, kill_switch: bool = True) -> Dict[str, Any]:
        self.active_session_id = secrets.token_hex(16)
        self.started_at = time.time()
        self.kill_switch_armed = kill_switch
        return {
            "session_id": self.active_session_id,
            "started_at": self.started_at,
            "kill_switch": self.kill_switch_armed,
            "status": "ACTIVE"
        }

    def stop_session(self) -> Dict[str, Any]:
        prev_id = self.active_session_id
        duration = time.time() - self.started_at if self.started_at else 0
        self.active_session_id = None
        self.started_at = None
        return {
            "stopped_session_id": prev_id,
            "duration_seconds": round(duration, 2),
            "status": "STOPPED"
        }

    def get_status(self) -> Dict[str, Any]:
        return {
            "active": self.active_session_id is not None,
            "session_id": self.active_session_id,
            "uptime": round(time.time() - self.started_at, 2) if self.started_at else 0,
            "kill_switch_armed": self.kill_switch_armed
        }

agent_session_manager = AgentSessionManager()
