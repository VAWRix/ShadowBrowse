import os
import secrets
from pathlib import Path

DEFAULT_PORT = int(os.environ.get("SHADOW_AGENT_PORT", "9152"))
DEFAULT_TOR_SOCKS_PORT = int(os.environ.get("SHADOW_TOR_PORT", "9050"))
DEFAULT_PROXY_HTTP_PORT = int(os.environ.get("SHADOW_PROXY_PORT", "8118"))

# Token directory
HOME_DIR = Path.home()
CONFIG_DIR = HOME_DIR / ".shadowbrowse"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)
TOKEN_FILE = CONFIG_DIR / "agent.token"

def get_or_create_auth_token() -> str:
    """
    Returns existing random cryptographic auth token or generates a new one.
    This token is required by all extension requests to the local agent.
    """
    if TOKEN_FILE.exists():
        token = TOKEN_FILE.read_text().strip()
        if token and len(token) >= 32:
            return token

    # Generate 256-bit cryptographically secure token
    new_token = secrets.token_hex(32)
    TOKEN_FILE.write_text(new_token)
    try:
        # Restrict file permissions if on POSIX
        TOKEN_FILE.chmod(0o600)
    except Exception:
        pass
    return new_token
