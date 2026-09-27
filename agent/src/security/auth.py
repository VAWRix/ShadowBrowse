"""
ShadowBrowse Local Agent — Authentication Module (Phase 2)

PHASE 2 SECURITY FIXES:
- REMOVED token query parameter fallback. Tokens must ONLY arrive via the
  X-Shadow-Token header. Query parameters are logged by proxies and web servers,
  making them inappropriate for bearer secrets.
- Added constant-time string comparison to prevent timing side-channel attacks
  on token verification.
- testclient host allowance is now conditional on a SHADOWBROWSE_TEST_MODE
  environment variable to prevent production deployments from having this bypass.
- Origin validation is stricter: requires either a valid chrome-extension:// origin
  OR no origin header (same-origin localhost tool). A present origin MUST be valid.
"""
import os
import re
import hmac
from fastapi import Request, HTTPException
from fastapi.security import APIKeyHeader
from ..config import get_or_create_auth_token

TOKEN_HEADER_NAME = "X-Shadow-Token"
api_key_header = APIKeyHeader(name=TOKEN_HEADER_NAME, auto_error=False)

# Only allow 'testclient' host when explicitly running in test mode
_TEST_MODE = os.environ.get("SHADOWBROWSE_TEST_MODE", "").lower() in ("1", "true", "yes")


def _is_allowed_host(host: str) -> bool:
    allowed = {"127.0.0.1", "::1", "localhost"}
    if _TEST_MODE:
        allowed.add("testclient")
    return host in allowed


def verify_localhost_and_origin(request: Request) -> None:
    """
    Strict security gate:
    1. Rejects any non-loopback client IP.
    2. If an Origin or Referer header is present, validates it is from a
       chrome-extension:// origin or a localhost origin.
       A missing origin is acceptable (same-origin localhost tools don't send Origin).
    3. Does NOT allow arbitrary web origins under any condition.
    """
    client_host = request.client.host if request.client else ""
    if not _is_allowed_host(client_host):
        raise HTTPException(status_code=403, detail="Forbidden: Localhost access only.")

    origin = request.headers.get("origin") or request.headers.get("referer")
    if origin:
        # chrome-extension:// MUST have exactly 32 lowercase alphabetic characters as the extension ID
        is_chrome_ext = bool(re.match(r"^chrome-extension://[a-z]{32}(/.*)?$", origin))
        is_localhost = bool(re.match(r"^https?://(127\.0\.0\.1|localhost)(:\d+)?(/.*)?$", origin))

        if not (is_chrome_ext or is_localhost):
            raise HTTPException(
                status_code=403,
                detail="Forbidden: Web origin not authorized to communicate with Local Shadow Agent.",
            )


def verify_token(request: Request) -> None:
    """
    Validates per-installation secret token.
    PHASE 2: Token MUST be in X-Shadow-Token header only.
    Query parameter fallback has been removed — query params can be logged.
    Uses HMAC comparison to prevent timing attacks.
    """
    verify_localhost_and_origin(request)

    expected_token = get_or_create_auth_token()
    provided_token = request.headers.get(TOKEN_HEADER_NAME, "")

    # Constant-time comparison to prevent timing side-channel
    if not provided_token or not hmac.compare_digest(provided_token, expected_token):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: Invalid or missing X-Shadow-Token header.",
        )
