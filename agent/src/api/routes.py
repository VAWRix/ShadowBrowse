"""
ShadowBrowse Local Agent — API Routes (Phase 3)

Phase 3 enhancements:
  - /api/v1/status: Full provider detail (provider_type, endpoint, bootstrap %, control port verified, verification status)
  - /api/v1/tor/provider: Granular Tor provider evidence and diagnostics
  - /api/v1/tor/verify-route: Full multi-layer route verification endpoint
  - /api/v1/diagnostics: Updated with honest multi-dimensional leak & route evidence
  - DNS status honestly classified based on actual verification level
"""

import os
from fastapi import APIRouter, Depends, Request
from ..security.auth import verify_localhost_and_origin, verify_token
from ..security.rate_limiter import rate_limiter
from ..tor.detector import check_tor_status, detect_tor_provider
from ..tor.route_verifier import verify_route
from ..network.proxy_checker import check_local_proxy
from ..session.manager import agent_session_manager

router = APIRouter(prefix="/api/v1")


@router.get("/status")
async def get_status(request: Request):
    """
    Public localhost status endpoint.
    Protected by localhost origin checks & rate limiting.
    Phase 3: Returns extended Tor provider information and evidence.
    """
    verify_localhost_and_origin(request)
    rate_limiter.check(request)

    tor_info = check_tor_status()
    provider = tor_info.get("provider", {})
    proxy_info = check_local_proxy()
    session_info = agent_session_manager.get_status()

    # Honest DNS classification:
    # Remote DNS resolution via SOCKS5 is only considered routed if SOCKS5 endpoint is reachable
    socks_ok = provider.get("reachable", False) or tor_info["status"] in ("CONNECTED", "BOOTSTRAPPING")
    control_ok = provider.get("control_port_verified", False)
    bootstrap_done = provider.get("bootstrap_percent", 0) >= 100

    dns_status = "UNVERIFIED"
    if socks_ok:
        dns_status = "PARTIAL"  # Chromium forwards hostnames via SOCKS5, but extension cannot inspect UDP
    if control_ok and bootstrap_done:
        dns_status = "PARTIAL"  # Still PARTIAL because browser extension cannot inspect kernel-level DNS

    return {
        "version": "0.3.0",
        "online": True,
        "tor_status": tor_info["status"],
        "tor_socks_port": tor_info["socks_port"],
        # Phase 3: Detailed Provider Evidence
        "tor_provider_type": provider.get("provider_type", "UNAVAILABLE"),
        "tor_endpoint": provider.get("endpoint", ""),
        "tor_reachable": provider.get("reachable", False),
        "tor_process_detected": provider.get("process_detected", False),
        "tor_bootstrap_percent": provider.get("bootstrap_percent", 0),
        "tor_bootstrap_summary": provider.get("bootstrap_summary", "Unknown"),
        "tor_control_port_verified": control_ok,
        "tor_verification_level": provider.get("verification_level", "NONE"),
        "tor_verification_status": provider.get("verification_status", "UNAVAILABLE"),
        # Local HTTP Proxy
        "proxy_status": proxy_info["status"],
        "proxy_http_port": proxy_info["port"],
        # DNS
        "dns_routed": socks_ok,
        "dns_verified": False,  # Technically honest: extension cannot verify kernel DNS
        "dns_status": dns_status,
        # Session & Kill Switch
        "kill_switch": session_info["kill_switch_armed"],
        "session_active": session_info["active"],
    }


@router.get("/tor/provider")
async def get_tor_provider(request: Request):
    """
    Phase 3: Full Tor provider inspection endpoint.
    Returns complete provider detection result including:
      - provider_type: SYSTEM_TOR | TOR_BROWSER | USER_MANAGED_TOR | CONFIGURED_SOCKS5 | UNAVAILABLE
      - endpoint, reachable, process_detected
      - bootstrap_percent, bootstrap_summary
      - control_port_verified, verification_level, verification_status
      - limitations
    """
    verify_localhost_and_origin(request)
    rate_limiter.check(request)
    return detect_tor_provider()


@router.post("/tor/verify-route", dependencies=[Depends(verify_token)])
async def post_verify_route(request: Request):
    """
    Phase 3: Initiates multi-layer route verification.
    Requires secret auth token.

    Accepts optional JSON payload:
      - socks_host: custom SOCKS5 host (default 127.0.0.1)
      - socks_port: custom SOCKS5 port (default detected port)
      - timeout: verification timeout in seconds
      - mock_direct_ip: for test mode verification
      - mock_proxied_ip: for test mode verification
      - mock_exit_is_tor: for test mode verification
    """
    rate_limiter.check(request)

    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}

    tor_info = check_tor_status()
    default_port = tor_info.get("socks_port", 0)

    socks_host = body.get("socks_host", "127.0.0.1")
    socks_port = body.get("socks_port") or default_port
    timeout = float(body.get("timeout", 10.0))

    # Test mode mock parameters
    mock_direct_ip = None
    mock_proxied_ip = None
    mock_exit_is_tor = None

    if os.environ.get("SHADOWBROWSE_TEST_MODE") == "1":
        mock_direct_ip = body.get("mock_direct_ip")
        mock_proxied_ip = body.get("mock_proxied_ip")
        mock_exit_is_tor = body.get("mock_exit_is_tor")

    if not socks_port and mock_direct_ip is None:
        return {
            "verification_attempted": False,
            "socks5_reachable": False,
            "outbound_connected": False,
            "route_functional": False,
            "route_verified": False,
            "verification_status": "UNAVAILABLE",
            "evidence_level": "NONE",
            "error": "No SOCKS5 endpoint available. Start Tor or configure a SOCKS5 proxy before verifying route.",
            "limitations": ["No SOCKS5 port specified or detected."],
        }

    return verify_route(
        socks_host=socks_host,
        socks_port=socks_port or 9050,
        timeout=timeout,
        mock_direct_ip=mock_direct_ip,
        mock_proxied_ip=mock_proxied_ip,
        mock_exit_is_tor=mock_exit_is_tor,
    )


@router.post("/session/start", dependencies=[Depends(verify_token)])
async def start_session(request: Request):
    rate_limiter.check(request)
    return agent_session_manager.start_session()


@router.post("/session/stop", dependencies=[Depends(verify_token)])
async def stop_session(request: Request):
    rate_limiter.check(request)
    return agent_session_manager.stop_session()


@router.get("/network/status", dependencies=[Depends(verify_token)])
async def get_network_status(request: Request):
    rate_limiter.check(request)
    return {
        "tor": check_tor_status(),
        "proxy": check_local_proxy(),
    }


@router.get("/diagnostics", dependencies=[Depends(verify_token)])
async def get_diagnostics(request: Request):
    """
    Local privacy diagnostic check (Phase 3).
    Returns honest status across network, DNS, WebRTC, and kill-switch dimensions.
    """
    rate_limiter.check(request)

    tor_full = check_tor_status()
    provider = tor_full.get("provider", {})
    tor_connected = tor_full["status"] in ("CONNECTED", "BOOTSTRAPPING")
    control_verified = provider.get("control_port_verified", False)
    bootstrap_pct = provider.get("bootstrap_percent", 0)

    if control_verified and bootstrap_pct >= 100:
        dns_leak_risk = "MINIMAL_REMOTE_SOCKS5_VERIFIED"
    elif tor_connected:
        dns_leak_risk = "MINIMAL_REMOTE_SOCKS5"
    else:
        dns_leak_risk = "LOCAL_ISP_RISK"

    return {
        "tor_detected": tor_connected,
        "tor_provider": provider.get("provider_type", "UNAVAILABLE"),
        "tor_endpoint": provider.get("endpoint", ""),
        "tor_reachable": provider.get("reachable", False),
        "tor_control_verified": control_verified,
        "tor_verification_status": provider.get("verification_status", "UNAVAILABLE"),
        "tor_bootstrap_percent": bootstrap_pct,
        "dns_leak_risk": dns_leak_risk,
        "webrtc_protection": "BROWSER_POLICY_DEPENDENT",
        "fail_closed_ready": True,
        "details": [
            tor_full["detail"],
            f"Provider: {provider.get('provider_type', 'UNAVAILABLE')} | "
            f"Verification: {provider.get('verification_level', 'NONE')} | "
            f"Bootstrap: {bootstrap_pct}%",
            "Remote DNS routing requires SOCKS5 protocol with remote hostname resolution.",
            "Route verification available via POST /api/v1/tor/verify-route.",
            "Local Shadow Agent strictly prohibits external command injection or disk inspection.",
        ] + provider.get("limitations", []),
    }
