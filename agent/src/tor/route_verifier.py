"""
ShadowBrowse Local Agent — Route Verifier (Phase 3)

Technical Honesty Rules:
  SOCKS5 PORT OPEN != TOR ROUTE VERIFIED.
  PROXIED REQUEST SUCCEEDED != TOR ROUTE VERIFIED.

The verifier clearly separates:
  1. SOCKS5 CONNECTIVITY
  2. PROXIED OUTBOUND CONNECTIVITY
  3. EXTERNAL IP OBSERVATION
  4. TOR ROUTE VERIFICATION

Status classifications:
  - TOR_ROUTE_VERIFIED:
      Outbound request succeeded via SOCKS5, external IP differs from direct IP,
      AND external endpoint (check.torproject.org) confirms the IP belongs to a Tor exit node.
  - ROUTE_VERIFIED_TOR_UNVERIFIED:
      Outbound request succeeded via SOCKS5, external IP differs from direct IP,
      but exit node is NOT confirmed as Tor (generic SOCKS5 proxy, or unverified exit).
  - DIRECT_BYPASS_DETECTED:
      Direct IP and proxied IP are IDENTICAL. Traffic is bypassing the proxy.
  - SOCKS5_REACHABLE_ONLY:
      SOCKS5 handshake succeeded, but outbound connection through the proxy failed
      (e.g., Tor circuit not built, DNS failure, or egress blocked).
  - ROUTE_FAILED:
      Proxied request failed completely.
  - UNAVAILABLE:
      SOCKS5 endpoint is not reachable.

PRIVACY TRANSPARENCY:
  Route verification contacts IP-echo services (check.torproject.org, api.ipify.org).
  User URLs and browsing history are NEVER transmitted.
  Only public IP echo requests are performed by the agent.
"""

import os
import socket
import ssl
import struct
import json
import urllib.request
from typing import Dict, Any, Optional, Tuple

TOR_CHECK_HOST = "check.torproject.org"
TOR_CHECK_PATH = "/api/ip"
TOR_CHECK_PORT = 443

FALLBACK_HTTP_HOST = "checkip.amazonaws.com"
FALLBACK_HTTP_PORT = 80

DIRECT_IP_ENDPOINT = "https://api.ipify.org?format=json"
DIRECT_IP_FALLBACK = "https://icanhazip.com"

DEFAULT_VERIFY_TIMEOUT = 10.0


# ============================================================
# SOCKS5 CONNECT TUNNEL (RFC 1928)
# ============================================================

def socks5_connect_tunnel(
    socks_host: str,
    socks_port: int,
    target_host: str,
    target_port: int,
    timeout: float = DEFAULT_VERIFY_TIMEOUT,
) -> Tuple[Optional[socket.socket], str]:
    """
    Establishes a raw TCP connection to the SOCKS5 proxy, performs No-Auth
    greeting, and issues a CONNECT command for target_host:target_port using
    remote domain resolution (ATYP 0x03).

    Returns:
      (socket_obj, "OK") on success,
      (None, error_reason) on failure.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)

    try:
        s.connect((socks_host, socks_port))
    except (socket.timeout, ConnectionRefusedError, OSError) as e:
        s.close()
        return None, f"SOCKS5 connect refused or timed out: {e}"

    # Step 1: SOCKS5 greeting (VER=5, NMETHODS=1, METHOD=0 No-Auth)
    try:
        s.sendall(b"\x05\x01\x00")
        greeting_reply = s.recv(2)
        if greeting_reply != b"\x05\x00":
            s.close()
            return None, f"SOCKS5 handshake rejected: {greeting_reply.hex() if greeting_reply else 'empty'}"
    except (socket.timeout, OSError) as e:
        s.close()
        return None, f"SOCKS5 handshake timed out/failed: {e}"

    # Step 2: SOCKS5 CONNECT request
    # Using domain name (ATYP=0x03) forces the proxy (Tor) to resolve DNS remotely, preventing local DNS leaks.
    try:
        host_bytes = target_host.encode("idna")
        host_len = len(host_bytes)
        port_bytes = struct.pack(">H", target_port)
        request = (
            b"\x05\x01\x00\x03"
            + bytes([host_len])
            + host_bytes
            + port_bytes
        )
        s.sendall(request)

        # Reply: VER(1) REP(1) RSV(1) ATYP(1) BND.ADDR(var) BND.PORT(2)
        reply_header = s.recv(4)
        if len(reply_header) < 4:
            s.close()
            return None, "SOCKS5 CONNECT reply truncated"

        if reply_header[0] != 0x05 or reply_header[1] != 0x00:
            rep_code = reply_header[1]
            rep_reasons = {
                0x01: "General SOCKS server failure",
                0x02: "Connection not allowed by ruleset",
                0x03: "Network unreachable",
                0x04: "Host unreachable",
                0x05: "Connection refused",
                0x06: "TTL expired",
                0x07: "Command not supported",
                0x08: "Address type not supported",
            }
            reason = rep_reasons.get(rep_code, f"SOCKS error code {rep_code:#x}")
            s.close()
            return None, f"SOCKS5 CONNECT failed: {reason}"

        # Consume remaining BND.ADDR and BND.PORT bytes
        atyp = reply_header[3]
        if atyp == 0x01:  # IPv4 (4 bytes) + port (2 bytes)
            s.recv(6)
        elif atyp == 0x03:  # Domain (1 byte length + N bytes) + port (2 bytes)
            addr_len_byte = s.recv(1)
            if addr_len_byte:
                s.recv(addr_len_byte[0] + 2)
        elif atyp == 0x04:  # IPv6 (16 bytes) + port (2 bytes)
            s.recv(18)

        return s, "OK"

    except (socket.timeout, OSError) as e:
        s.close()
        return None, f"SOCKS5 CONNECT negotiation error: {e}"


# ============================================================
# EXTERNAL IP RETRIEVAL
# ============================================================

def get_ip_direct(timeout: float = DEFAULT_VERIFY_TIMEOUT) -> Optional[str]:
    """
    Retrieves the machine's direct public IP without using any proxy.
    Explicitly uses an empty ProxyHandler to bypass system or environment proxies.
    """
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        req = urllib.request.Request(
            DIRECT_IP_ENDPOINT,
            headers={"User-Agent": "ShadowBrowse-Verifier/1.0", "Accept": "application/json"}
        )
        with opener.open(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            ip = data.get("ip") or data.get("IP")
            if ip and isinstance(ip, str):
                return ip.strip()
    except Exception:
        # Fallback to plain text echo
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            req = urllib.request.Request(
                DIRECT_IP_FALLBACK,
                headers={"User-Agent": "ShadowBrowse-Verifier/1.0"}
            )
            with opener.open(req, timeout=timeout) as resp:
                text = resp.read().decode("utf-8").strip()
                if text and ("." in text or ":" in text):
                    return text
        except Exception:
            pass

    return None


def get_ip_via_socks5(
    socks_host: str,
    socks_port: int,
    timeout: float = DEFAULT_VERIFY_TIMEOUT,
) -> Dict[str, Any]:
    """
    Retrieves external IP through the SOCKS5 proxy.
    Primary: TLS connection to check.torproject.org/api/ip (returns {"IP": "...", "IsTor": bool})
    Fallback: HTTP connection to checkip.amazonaws.com (returns IP only, is_tor = None)

    Returns:
      {
        "success": bool,
        "socks5_reachable": bool,
        "outbound_connected": bool,
        "ip": Optional[str],
        "is_tor": Optional[bool],
        "error": Optional[str],
        "endpoint_used": str
      }
    """
    result: Dict[str, Any] = {
        "success": False,
        "socks5_reachable": False,
        "outbound_connected": False,
        "ip": None,
        "is_tor": None,
        "error": None,
        "endpoint_used": "",
    }

    # Attempt Primary: TLS via check.torproject.org:443
    sock, err = socks5_connect_tunnel(socks_host, socks_port, TOR_CHECK_HOST, TOR_CHECK_PORT, timeout=timeout)
    if not sock:
        result["error"] = err
        # Determine if SOCKS5 itself was reachable
        if "connect refused" not in err.lower() and "timed out" not in err.lower():
            result["socks5_reachable"] = True
        return result

    result["socks5_reachable"] = True
    result["outbound_connected"] = True

    try:
        ctx = ssl.create_default_context()
        with ctx.wrap_socket(sock, server_hostname=TOR_CHECK_HOST) as tls_sock:
            tls_sock.settimeout(timeout)
            http_req = (
                f"GET {TOR_CHECK_PATH} HTTP/1.1\r\n"
                f"Host: {TOR_CHECK_HOST}\r\n"
                f"User-Agent: ShadowBrowse-Verifier/1.0\r\n"
                f"Accept: application/json\r\n"
                f"Connection: close\r\n\r\n"
            ).encode("ascii")
            tls_sock.sendall(http_req)

            chunks = []
            while True:
                chunk = tls_sock.recv(4096)
                if not chunk:
                    break
                chunks.append(chunk)

            raw = b"".join(chunks).decode("utf-8", errors="replace")
            body = raw.split("\r\n\r\n", 1)[-1].strip()

            try:
                data = json.loads(body)
                ip = data.get("IP") or data.get("ip")
                is_tor = data.get("IsTor")
                if ip:
                    result["success"] = True
                    result["ip"] = str(ip).strip()
                    result["is_tor"] = bool(is_tor) if is_tor is not None else None
                    result["endpoint_used"] = f"https://{TOR_CHECK_HOST}{TOR_CHECK_PATH}"
                    return result
            except json.JSONDecodeError:
                pass

    except Exception as e:
        result["error"] = f"TLS probe to {TOR_CHECK_HOST} failed: {e}"

    # Attempt Fallback: Plain HTTP via checkip.amazonaws.com:80
    sock2, err2 = socks5_connect_tunnel(socks_host, socks_port, FALLBACK_HTTP_HOST, FALLBACK_HTTP_PORT, timeout=timeout)
    if sock2:
        try:
            with sock2:
                sock2.settimeout(timeout)
                http_req = (
                    f"GET / HTTP/1.0\r\n"
                    f"Host: {FALLBACK_HTTP_HOST}\r\n"
                    f"User-Agent: ShadowBrowse-Verifier/1.0\r\n"
                    f"Connection: close\r\n\r\n"
                ).encode("ascii")
                sock2.sendall(http_req)

                chunks = []
                while True:
                    chunk = sock2.recv(4096)
                    if not chunk:
                        break
                    chunks.append(chunk)

                raw = b"".join(chunks).decode("ascii", errors="replace")
                body = raw.split("\r\n\r\n", 1)[-1].strip()
                if body and ("." in body or ":" in body):
                    result["success"] = True
                    result["ip"] = body
                    result["is_tor"] = None  # Unknown from this endpoint
                    result["endpoint_used"] = f"http://{FALLBACK_HTTP_HOST}"
                    result["error"] = None
                    return result
        except Exception as e:
            result["error"] = f"HTTP fallback probe failed: {e}"
    else:
        if not result["error"]:
            result["error"] = err2

    return result


# ============================================================
# COMPREHENSIVE ROUTE VERIFICATION
# ============================================================

def verify_route(
    socks_host: str = "127.0.0.1",
    socks_port: int = 9050,
    timeout: float = DEFAULT_VERIFY_TIMEOUT,
    mock_direct_ip: Optional[str] = None,
    mock_proxied_ip: Optional[str] = None,
    mock_exit_is_tor: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Performs comprehensive, multi-layer route verification.

    Layers evaluated:
      1. SOCKS5 Reachability
      2. Outbound Tunnel Capability
      3. Direct Public IP Discovery
      4. Proxied Public IP Discovery
      5. IP Differentiation & Bypass Check
      6. Tor Exit Node Identity Verification

    Returns a structured report with unambiguous verification status.
    """
    result: Dict[str, Any] = {
        "verification_attempted": True,
        "socks5_endpoint": f"{socks_host}:{socks_port}",
        "socks5_reachable": False,
        "outbound_connected": False,
        "direct_ip": None,
        "proxied_ip": None,
        "ips_differ": False,
        "exit_is_tor": None,
        "route_functional": False,
        "route_verified": False,
        "verification_status": "UNAVAILABLE",
        "evidence_level": "NONE",
        "limitations": [],
        "endpoint_used": "",
        "error": None,
    }

    # Test / Mock injection for controlled test environments
    if mock_direct_ip is not None or mock_proxied_ip is not None:
        result["socks5_reachable"] = True
        result["outbound_connected"] = bool(mock_proxied_ip)
        result["direct_ip"] = mock_direct_ip
        result["proxied_ip"] = mock_proxied_ip
        result["exit_is_tor"] = mock_exit_is_tor
        return _evaluate_verification_status(result)

    # In test mode without mock IPs, avoid real external internet connections
    if os.environ.get("SHADOWBROWSE_TEST_MODE") == "1" and not os.environ.get("SHADOWBROWSE_LIVE_NET"):
        # Synthesize safe offline result
        result["error"] = "Test mode active: live external network verification skipped"
        result["verification_status"] = "TEST_MODE_OFFLINE"
        result["limitations"].append("Running under SHADOWBROWSE_TEST_MODE. No outbound probes sent.")
        return result

    # Step 1: Direct IP check
    try:
        result["direct_ip"] = get_ip_direct(timeout=timeout)
    except Exception as e:
        result["error"] = f"Direct IP check failed: {e}"

    # Step 2: Proxied IP check
    proxied_info = get_ip_via_socks5(socks_host, socks_port, timeout=timeout)
    result["socks5_reachable"] = proxied_info["socks5_reachable"]
    result["outbound_connected"] = proxied_info["outbound_connected"]
    result["proxied_ip"] = proxied_info["ip"]
    result["exit_is_tor"] = proxied_info["is_tor"]
    result["endpoint_used"] = proxied_info.get("endpoint_used", "")

    if proxied_info["error"]:
        result["error"] = (
            f"{result['error']} | {proxied_info['error']}" if result["error"] else proxied_info["error"]
        )

    return _evaluate_verification_status(result)


def _evaluate_verification_status(result: Dict[str, Any]) -> Dict[str, Any]:
    """Evaluates collected evidence and sets unambiguous status."""
    direct_ip = result["direct_ip"]
    proxied_ip = result["proxied_ip"]
    exit_is_tor = result["exit_is_tor"]
    socks5_ok = result["socks5_reachable"]
    outbound_ok = result["outbound_connected"]

    # Case 1: SOCKS5 not even reachable
    if not socks5_ok:
        result["verification_status"] = "UNAVAILABLE"
        result["evidence_level"] = "NONE"
        result["limitations"].append(
            "SOCKS5 proxy endpoint is unreachable. Proxy daemon is not running or listening."
        )
        return result

    # Case 2: SOCKS5 reachable, but outbound request failed
    if not outbound_ok or not proxied_ip:
        result["verification_status"] = "SOCKS5_REACHABLE_ONLY"
        result["evidence_level"] = "LOW"
        result["limitations"].append(
            "SOCKS5 port responded to handshake, but outbound connection through the proxy failed."
        )
        result["limitations"].append(
            "Tor daemon may still be bootstrapping or circuits are not yet constructed."
        )
        return result

    # Case 3: Both IPs observed
    if direct_ip and proxied_ip:
        result["ips_differ"] = direct_ip != proxied_ip

        if not result["ips_differ"]:
            # DIRECT BYPASS DETECTED!
            result["verification_status"] = "DIRECT_BYPASS_DETECTED"
            result["route_functional"] = False
            result["route_verified"] = False
            result["evidence_level"] = "NONE"
            result["limitations"].append(
                "CRITICAL: Direct IP and proxied IP are identical. Traffic is bypassing the proxy."
            )
            return result

        # IPs differ: Route is functional through an egress proxy
        result["route_functional"] = True

        if exit_is_tor is True:
            # Genuine Tor exit node confirmed!
            result["verification_status"] = "TOR_ROUTE_VERIFIED"
            result["route_verified"] = True
            result["evidence_level"] = "HIGH"
            result["limitations"].append(
                "CONFIRMED: check.torproject.org recognized exit IP as a verified Tor exit node."
            )
        elif exit_is_tor is False:
            # Proxied, but NOT Tor!
            result["verification_status"] = "ROUTE_VERIFIED_TOR_UNVERIFIED"
            result["route_verified"] = False
            result["evidence_level"] = "MEDIUM"
            result["limitations"].append(
                "ROUTE VERIFIED, BUT TOR UNVERIFIED: Traffic is proxied through an external IP, "
                "but check.torproject.org reported the exit IP is NOT a recognized Tor node."
            )
        else:
            # Proxied, Tor status unknown
            result["verification_status"] = "ROUTE_VERIFIED_TOR_UNVERIFIED"
            result["route_verified"] = False
            result["evidence_level"] = "MEDIUM"
            result["limitations"].append(
                "ROUTE VERIFIED, BUT TOR UNVERIFIED: External IP differs, but endpoint could not verify Tor exit status."
            )

    elif proxied_ip and not direct_ip:
        # Proxied worked, direct failed
        result["route_functional"] = True
        if exit_is_tor is True:
            result["verification_status"] = "TOR_ROUTE_VERIFIED"
            result["route_verified"] = True
            result["evidence_level"] = "HIGH"
            result["limitations"].append(
                "CONFIRMED: Exit IP recognized as Tor exit node (direct IP probe was unavailable)."
            )
        else:
            result["verification_status"] = "ROUTE_VERIFIED_TOR_UNVERIFIED"
            result["route_verified"] = False
            result["evidence_level"] = "MEDIUM"
            result["limitations"].append(
                "Proxied IP observed, but Tor identity could not be confirmed."
            )

    # Universal architectural limitations
    result["limitations"].extend([
        "AGENT ROUTE VERIFICATION tests the Local Shadow Agent connection, not Chrome's tab traffic.",
        "Chrome browser routing requires separate proxy configuration and verification.",
        "Chromium DNS routing via SOCKS5 uses remote hostname resolution (not direct UDP probe).",
    ])

    return result
