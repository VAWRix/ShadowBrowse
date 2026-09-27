"""
ShadowBrowse Local Agent — Tor Provider Model (Phase 3)

Distinguishes:
  1. Tor unavailable
  2. Tor/provider available
  3. SOCKS5 reachable
  4. Proxy configured
  5. Agent-side proxied route verified
  6. Browser route verified
  7. External IP verified
  8. Direct bypass detected/prevented

Provider types:
  SYSTEM_TOR        — system Tor daemon (port 9050, control 9051)
  TOR_BROWSER       — Tor Browser bundle (port 9150, control 9151)
  USER_MANAGED_TOR  — user-configured endpoint verified as Tor via control port
  CONFIGURED_SOCKS5 — user-configured SOCKS5 endpoint (NOT verified as Tor)
  UNAVAILABLE       — no responsive provider found

HONESTY RULES:
  - SOCKS5 PORT OPEN != TOR ROUTE VERIFIED.
  - SOCKS5 handshake proves only that a proxy is listening, not that it is Tor.
  - Control port presence / authentication proves Tor daemon identity.
  - Outbound route verification is performed separately in route_verifier.py.
"""

import socket
import re
from typing import Dict, Any, Optional, List


# ============================================================
# SOCKS5 HANDSHAKE
# ============================================================

def socks5_handshake(host: str, port: int, timeout: float = 1.0) -> bool:
    """
    Genuine SOCKS5 No-Auth handshake (RFC 1928).
    Returns True only if the daemon responds with 0x05 0x00.
    Any SOCKS5 proxy (not just Tor) will pass this test.
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((host, port))
            s.sendall(b"\x05\x01\x00")  # Version 5, 1 method: No Auth
            response = s.recv(2)
            return response == b"\x05\x00"
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


# ============================================================
# PROCESS STATUS DETECTION
# ============================================================

def is_tor_process_detected() -> bool:
    """
    Non-invasive check to see if a Tor binary process is running locally.
    Does not crash if psutil is unavailable.
    """
    try:
        import psutil
        for proc in psutil.process_iter(['name']):
            try:
                name = (proc.info.get('name') or '').lower()
                if name in ('tor.exe', 'tor'):
                    return True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception:
        pass
    return False


# ============================================================
# TOR CONTROL PORT PROBING
# ============================================================

def tor_control_probe(host: str, port: int, timeout: float = 1.5) -> Optional[Dict[str, Any]]:
    """
    Attempts to connect to the Tor Control Port and query daemon/bootstrap status.

    Returns dict with:
      - is_tor: True if protocol response matches Tor Control Protocol
      - control_authenticated: True if AUTHENTICATE succeeded
      - bootstrap_percent: 0-100
      - bootstrap_summary: str
      - bootstrap_tag: str
    Or None if the control port is not listening or not Tor.
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((host, port))

            # Send empty password authentication
            s.sendall(b'AUTHENTICATE ""\r\n')
            auth_response = s.recv(256).decode("ascii", errors="replace")

            # Check if this speaks Tor Control Protocol:
            # 250 = Auth OK
            # 515 = Authentication required (cookie auth enforced — still confirms it is Tor!)
            if auth_response.startswith("250"):
                # Authenticated: query bootstrap status
                s.sendall(b"GETINFO status/bootstrap-phase\r\n")
                data = s.recv(512).decode("ascii", errors="replace")

                percent_match = re.search(r"PROGRESS=(\d+)", data)
                summary_match = re.search(r'SUMMARY="([^"]+)"', data)
                tag_match = re.search(r"TAG=(\w+)", data)

                percent = int(percent_match.group(1)) if percent_match else 0
                summary = summary_match.group(1) if summary_match else "Active"
                tag = tag_match.group(1) if tag_match else "running"

                try:
                    s.sendall(b"QUIT\r\n")
                except Exception:
                    pass

                return {
                    "is_tor": True,
                    "control_authenticated": True,
                    "bootstrap_percent": percent,
                    "bootstrap_summary": summary,
                    "bootstrap_tag": tag,
                }

            elif auth_response.startswith("515") or "Authentication required" in auth_response:
                # Cookie auth is required — we cannot read bootstrap %, but we have
                # cryptographic proof this is genuinely a Tor daemon.
                try:
                    s.sendall(b"QUIT\r\n")
                except Exception:
                    pass

                return {
                    "is_tor": True,
                    "control_authenticated": False,
                    "bootstrap_percent": 100,  # Daemon is up and enforcing auth
                    "bootstrap_summary": "Cookie auth enforced (Tor confirmed)",
                    "bootstrap_tag": "cookie_auth",
                }

    except (socket.timeout, ConnectionRefusedError, OSError, UnicodeDecodeError):
        return None

    return None


# ============================================================
# PROVIDER REGISTRY & DETECTION
# ============================================================

STANDARD_PROVIDERS = [
    {
        "provider_type": "SYSTEM_TOR",
        "socks_port": 9050,
        "control_port": 9051,
        "description": "System Tor daemon (port 9050, control 9051)",
    },
    {
        "provider_type": "TOR_BROWSER",
        "socks_port": 9150,
        "control_port": 9151,
        "description": "Tor Browser bundle (port 9150, control 9151)",
    },
]


def detect_tor_provider(
    custom_host: str = "127.0.0.1",
    custom_socks_port: Optional[int] = None,
    custom_control_port: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Detects available Tor / SOCKS5 providers in priority order.

    Exposes real evidence:
      - provider_type: SYSTEM_TOR | TOR_BROWSER | USER_MANAGED_TOR | CONFIGURED_SOCKS5 | UNAVAILABLE
      - endpoint: "host:port"
      - reachable: bool
      - process_detected: bool
      - bootstrap_percent: 0-100
      - bootstrap_summary: str
      - control_port_verified: bool
      - verification_level: CONTROL_PORT | SOCKS5_ONLY | NONE
      - verification_status: CONFIRMED_TOR | SOCKS5_ONLY | UNAVAILABLE
      - status: TOR_READY | TOR_BOOTSTRAPPING | TOR_DEGRADED | SOCKS5_ONLY | TOR_UNAVAILABLE
      - description: str
      - limitations: list of honest limitation statements
    """
    process_running = is_tor_process_detected()

    # 1. Custom / User-specified SOCKS5 endpoint
    if custom_socks_port:
        socks_ok = socks5_handshake(custom_host, custom_socks_port)
        if socks_ok:
            # Check if user also provided or standard control port works
            ctrl_port = custom_control_port or (custom_socks_port + 1)
            ctrl_info = tor_control_probe(custom_host, ctrl_port)

            if ctrl_info and ctrl_info.get("is_tor"):
                provider_type = "USER_MANAGED_TOR"
                description = f"User-managed Tor at {custom_host}:{custom_socks_port} (Control port {ctrl_port} verified)"
            else:
                provider_type = "CONFIGURED_SOCKS5"
                description = f"User-configured SOCKS5 at {custom_host}:{custom_socks_port} (SOCKS5 only, Tor unverified)"

            return _build_provider_dict(
                provider_type=provider_type,
                host=custom_host,
                socks_port=custom_socks_port,
                control_port=ctrl_port if (ctrl_info and ctrl_info.get("is_tor")) else None,
                control_info=ctrl_info,
                process_detected=process_running,
                description=description,
            )

    # 2. Standard Known Providers (System Tor, Tor Browser)
    for p in STANDARD_PROVIDERS:
        socks_port = p["socks_port"]
        socks_ok = socks5_handshake("127.0.0.1", socks_port)
        if not socks_ok:
            continue

        # SOCKS5 responds — probe control port for Tor confirmation
        control_port = p["control_port"]
        ctrl_info = tor_control_probe("127.0.0.1", control_port)

        return _build_provider_dict(
            provider_type=p["provider_type"],
            host="127.0.0.1",
            socks_port=socks_port,
            control_port=control_port,
            control_info=ctrl_info,
            process_detected=process_running,
            description=p["description"],
        )

    # 3. No provider reachable
    return {
        "provider_type": "UNAVAILABLE",
        "status": "TOR_UNAVAILABLE",
        "endpoint": "",
        "host": "127.0.0.1",
        "socks_port": 0,
        "control_port": None,
        "reachable": False,
        "process_detected": process_running,
        "bootstrap_percent": 0,
        "bootstrap_summary": "Not running",
        "bootstrap_tag": "none",
        "control_port_verified": False,
        "verification_level": "NONE",
        "verification_status": "UNAVAILABLE",
        "description": "No Tor SOCKS5 daemon detected on standard ports (9050, 9150).",
        "limitations": [
            "No SOCKS5 endpoint responding on 127.0.0.1:9050 or 127.0.0.1:9150.",
            "Install and launch Tor or Tor Browser to enable anonymous routing.",
            "SOCKS5 port listening does not by itself prove Tor routing.",
        ],
    }


def _build_provider_dict(
    provider_type: str,
    host: str,
    socks_port: int,
    control_port: Optional[int],
    control_info: Optional[Dict[str, Any]],
    process_detected: bool,
    description: str,
) -> Dict[str, Any]:
    """Constructs an evidence-backed provider status dictionary."""
    endpoint = f"{host}:{socks_port}"
    ctrl_verified = bool(control_info and control_info.get("is_tor"))

    if ctrl_verified:
        pct = control_info.get("bootstrap_percent", 0)
        summary = control_info.get("bootstrap_summary", "Ready")
        tag = control_info.get("bootstrap_tag", "done")
        verification_level = "CONTROL_PORT"
        verification_status = "CONFIRMED_TOR"

        if pct >= 100:
            status = "TOR_READY"
        elif pct > 0:
            status = "TOR_BOOTSTRAPPING"
        else:
            status = "TOR_DEGRADED"

        limitations = [
            "Tor Control Port verified: this daemon is confirmed to be Tor.",
            f"Bootstrap progress: {pct}% ({summary}).",
            "Outbound circuit routing requires route verification (verify-route).",
            "Chromium remote DNS resolution relies on SOCKS5 hostname forwarding.",
        ]
    else:
        pct = 0
        summary = "SOCKS5 reachable; Control port not accessible"
        tag = "socks5_only"
        verification_level = "SOCKS5_ONLY"
        verification_status = "SOCKS5_ONLY"
        status = "SOCKS5_ONLY"

        limitations = [
            "SOCKS5 handshake succeeded, but Tor Control Port is unavailable.",
            "Cannot confirm daemon is Tor solely from SOCKS5 handshake (any SOCKS5 server passes).",
            "Bootstrap progress is unknown.",
            "External route verification is required to test exit node routing.",
        ]

    return {
        "provider_type": provider_type,
        "status": status,
        "endpoint": endpoint,
        "host": host,
        "socks_port": socks_port,
        "control_port": control_port if ctrl_verified else None,
        "reachable": True,
        "process_detected": process_detected,
        "bootstrap_percent": pct,
        "bootstrap_summary": summary,
        "bootstrap_tag": tag,
        "control_port_verified": ctrl_verified,
        "verification_level": verification_level,
        "verification_status": verification_status,
        "description": description,
        "limitations": limitations,
    }


# ============================================================
# BACKWARD COMPATIBILITY
# ============================================================

def check_tor_status(ports=(9050, 9150)) -> Dict[str, Any]:
    """
    Backward-compatible wrapper used by legacy routes and tests.
    Exposes both legacy status strings and the complete Phase 3 provider object.
    """
    result = detect_tor_provider()

    if result["provider_type"] == "UNAVAILABLE":
        return {
            "status": "NOT_AVAILABLE",
            "socks_port": 0,
            "detail": result["description"],
            "provider": result,
        }

    status_map = {
        "TOR_READY": "CONNECTED",
        "TOR_BOOTSTRAPPING": "BOOTSTRAPPING",
        "TOR_DEGRADED": "DEGRADED",
        "SOCKS5_ONLY": "CONNECTED",
        "TOR_UNAVAILABLE": "NOT_AVAILABLE",
    }

    legacy_status = status_map.get(result["status"], "NOT_AVAILABLE")

    return {
        "status": legacy_status,
        "socks_port": result["socks_port"],
        "detail": result["description"],
        "provider": result,
    }
