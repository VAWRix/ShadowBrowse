import socket
from typing import Dict, Any

def test_tcp_port(host: str = "127.0.0.1", port: int = 8118, timeout: float = 1.0) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((host, port))
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False

def check_local_proxy(port: int = 8118) -> Dict[str, Any]:
    online = test_tcp_port(port=port)
    return {
        "status": "RUNNING" if online else "STOPPED",
        "port": port,
        "detail": f"Local HTTP proxy {'active' if online else 'offline'} on 127.0.0.1:{port}"
    }
