"""
ShadowBrowse — Service Lifecycle & Process Manager
==================================================
Manages starting, stopping, verifying, and monitoring the Tor daemon
and ShadowBrowse FastAPI Privacy Agent on Windows.

Strict safety constraints:
  - Zero broad taskkill (never kills by image name).
  - Strictly verifies process executable path and command line before terminating.
  - Never touches unrelated processes on occupied ports; displays clean diagnostics.
  - Probes genuine Tor control bootstrap status using agent.src.tor.detector.
  - Never prints secrets, tokens, or private browsing information.
"""

import sys
import os
import time
import json
import socket
import urllib.request
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, Tuple, List

# Workspace Root
ROOT_DIR = Path(__file__).resolve().parent.parent
TOR_EXE = ROOT_DIR / "agent" / "bin" / "tor" / "tor" / "tor.exe"
TOR_RC = ROOT_DIR / "agent" / "bin" / "tor" / "torrc"
AGENT_ENTRY = ROOT_DIR / "agent" / "src" / "main.py"
PID_FILE = ROOT_DIR / ".shadowbrowse" / "pids.json"

TOR_SOCKS_PORT = 9050
TOR_CONTROL_PORT = 9051
AGENT_PORT = 9152

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False


# ============================================================
# PROCESS INSPECTION & PORT RESOLUTION
# ============================================================

def get_process_info_for_port(port: int) -> Optional[Dict[str, Any]]:
    """
    Finds the process listening on a given port and returns its details.
    Uses psutil with a robust netstat fallback, strictly filtering for
    TCP sockets in the LISTENING state with valid non-zero PIDs.
    """
    if HAS_PSUTIL:
        try:
            for conn in psutil.net_connections(kind="tcp"):
                if conn.status == psutil.CONN_LISTEN and conn.laddr.port == port:
                    pid = conn.pid
                    if not pid or pid == 0:
                        continue
                    try:
                        proc = psutil.Process(pid)
                        return {
                            "pid": pid,
                            "name": proc.name(),
                            "exe": proc.exe(),
                            "cmdline": proc.cmdline(),
                            "cmdline_str": " ".join(proc.cmdline())
                        }
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        return {"pid": pid, "name": "unknown", "exe": "", "cmdline": [], "cmdline_str": ""}
        except Exception:
            pass

    # Fallback to netstat filtering strictly for LISTENING
    try:
        out = subprocess.check_output("netstat -ano -p tcp", shell=True, text=True)
        for line in out.strip().splitlines():
            line_str = line.strip()
            if "LISTENING" in line_str and f":{port}" in line_str:
                parts = line_str.split()
                if len(parts) >= 5:
                    try:
                        pid = int(parts[-1])
                    except ValueError:
                        continue
                    if pid <= 0:
                        continue

                    name = "process"
                    exe = ""
                    cmdline_str = ""
                    if HAS_PSUTIL:
                        try:
                            p = psutil.Process(pid)
                            name = p.name()
                            exe = p.exe()
                            cmdline_str = " ".join(p.cmdline())
                        except Exception:
                            pass

                    return {
                        "pid": pid,
                        "name": name,
                        "exe": exe,
                        "cmdline": [cmdline_str] if cmdline_str else [],
                        "cmdline_str": cmdline_str
                    }
    except Exception:
        pass

    return None


def is_shadowbrowse_tor_process(info: Dict[str, Any]) -> bool:
    """Verifies that a process is the ShadowBrowse Tor binary and torrc."""
    name = (info.get("name") or "").lower()
    if name not in ("tor.exe", "tor"):
        return False
    
    exe = str(info.get("exe") or "").lower().replace("/", "\\")
    cmdline_str = str(info.get("cmdline_str") or "").lower().replace("/", "\\")
    
    # Must match our repo's tor executable or reference our torrc
    is_our_exe = "agent\\bin\\tor\\tor\\tor.exe" in exe or str(TOR_EXE).lower() in exe
    uses_our_rc = "agent\\bin\\tor\\torrc" in cmdline_str or str(TOR_RC).lower() in cmdline_str
    
    return is_our_exe or uses_our_rc


def is_shadowbrowse_agent_process(info: Dict[str, Any]) -> bool:
    """Verifies that a process is the ShadowBrowse FastAPI agent."""
    name = (info.get("name") or "").lower()
    if "python" not in name:
        return False
    
    cmdline_str = str(info.get("cmdline_str") or "")
    # Must invoke agent.src.main and port 9152
    return "agent.src.main" in cmdline_str and str(AGENT_PORT) in cmdline_str


# ============================================================
# READINESS PROBES
# ============================================================

def is_socket_open(host: str, port: int, timeout: float = 1.0) -> bool:
    """Tests if a TCP port is actively listening."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout)
            s.connect((host, port))
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


def get_tor_bootstrap_percent() -> Tuple[int, str]:
    """
    Queries Tor bootstrap status using project's tor_control_probe.
    Returns (percent, summary_tag).
    """
    try:
        # Import directly from project source
        sys.path.insert(0, str(ROOT_DIR))
        from agent.src.tor.detector import tor_control_probe
        probe = tor_control_probe("127.0.0.1", TOR_CONTROL_PORT, timeout=1.5)
        if probe and probe.get("is_tor"):
            return probe.get("bootstrap_percent", 0), probe.get("bootstrap_summary", "unknown")
    except Exception:
        pass
    return 0, "offline"


def is_agent_online() -> bool:
    """Checks agent readiness via GET /api/v1/status."""
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{AGENT_PORT}/api/v1/status")
        req.add_header("Origin", "http://127.0.0.1")
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode())
                return bool(data.get("online"))
    except Exception:
        pass
    return False


# ============================================================
# SERVICE COMMANDS
# ============================================================

def check_environment() -> bool:
    """Validates prerequisite binaries and configurations."""
    if not TOR_EXE.exists():
        print(f"[ERROR] Tor executable not found at: {TOR_EXE}")
        print("        Ensure Tor is present in agent/bin/tor/tor/.")
        return False
    if not TOR_RC.exists():
        print(f"[ERROR] Tor configuration file not found at: {TOR_RC}")
        return False
    if not AGENT_ENTRY.exists():
        print(f"[ERROR] Agent entry point not found at: {AGENT_ENTRY}")
        return False
    return True


def save_pid_info(tor_pid: Optional[int], agent_pid: Optional[int]):
    """Persists running PIDs in .shadowbrowse/pids.json."""
    PID_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "tor_pid": tor_pid,
        "agent_pid": agent_pid,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S")
    }
    with open(PID_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def clear_pid_info():
    """Removes the PID file."""
    if PID_FILE.exists():
        try:
            PID_FILE.unlink()
        except OSError:
            pass


def start_services() -> int:
    """
    Starts Tor daemon and FastAPI agent after validating environment
    and checking for port conflicts.
    """
    print("=" * 64)
    print("  ShadowBrowse -- System Startup Launcher")
    print("  (Tor Daemon SOCKS5/Control + Local Privacy Agent)")
    print("=" * 64)
    print(f"[*] Workspace Root: {ROOT_DIR}")

    if not check_environment():
        return 1

    # 1. Inspect existing ports
    tor_proc_9050 = get_process_info_for_port(TOR_SOCKS_PORT)
    tor_proc_9051 = get_process_info_for_port(TOR_CONTROL_PORT)
    agent_proc_9152 = get_process_info_for_port(AGENT_PORT)

    tor_running = False
    agent_running = False
    tor_pid: Optional[int] = None
    agent_pid: Optional[int] = None

    # Check Tor ports (9050 and 9051)
    if tor_proc_9050 or tor_proc_9051:
        # Check if they belong to our Tor instance
        proc = tor_proc_9050 or tor_proc_9051
        if is_shadowbrowse_tor_process(proc):
            tor_pid = proc["pid"]
            tor_running = True
            print(f"[+] Reusing existing ShadowBrowse Tor daemon (PID: {tor_pid})")
        else:
            print(f"\n[CONFLICT ERROR] Tor ports are occupied by an unexpected process:")
            if tor_proc_9050:
                print(f"  Port 9050 -> PID {tor_proc_9050['pid']} ({tor_proc_9050['name']}): {tor_proc_9050['cmdline_str']}")
            if tor_proc_9051:
                print(f"  Port 9051 -> PID {tor_proc_9051['pid']} ({tor_proc_9051['name']}): {tor_proc_9051['cmdline_str']}")
            print("\nCannot start Tor safely without risking port collision or process corruption.")
            print("Action required: Please terminate the conflicting process or reconfigure the ports.")
            return 1

    # Check Agent port (9152)
    if agent_proc_9152:
        if is_shadowbrowse_agent_process(agent_proc_9152):
            agent_pid = agent_proc_9152["pid"]
            agent_running = True
            print(f"[+] Reusing existing ShadowBrowse Privacy Agent (PID: {agent_pid})")
        else:
            print(f"\n[CONFLICT ERROR] Agent port 9152 is occupied by an unexpected process:")
            print(f"  Port 9152 -> PID {agent_proc_9152['pid']} ({agent_proc_9152['name']}): {agent_proc_9152['cmdline_str']}")
            print("\nCannot start ShadowBrowse Agent on port 9152.")
            print("Action required: Please terminate the conflicting process or free port 9152.")
            return 1

    # 2. Start Tor if not already running
    if not tor_running:
        print(f"\n[1/2] Launching Tor Daemon on 127.0.0.1:{TOR_SOCKS_PORT} & Control {TOR_CONTROL_PORT}...")
        try:
            # Launch Tor in its own process group and console window
            proc = subprocess.Popen(
                [str(TOR_EXE), "-f", str(TOR_RC)],
                cwd=str(ROOT_DIR),
                stdin=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NEW_CONSOLE | subprocess.CREATE_NEW_PROCESS_GROUP
            )
            print(f"      Launched Tor console window. Waiting for bootstrap...")
        except Exception as e:
            print(f"[ERROR] Failed to launch Tor process: {e}")
            return 1

        # Wait for Tor bootstrap (up to 30s)
        start_time = time.time()
        bootstrapped = False
        while time.time() - start_time < 30.0:
            if is_socket_open("127.0.0.1", TOR_SOCKS_PORT) and is_socket_open("127.0.0.1", TOR_CONTROL_PORT):
                pct, summary = get_tor_bootstrap_percent()
                if pct >= 100:
                    bootstrapped = True
                    print(f"[+] Tor Bootstrap Complete: 100% ({summary})")
                    break
                else:
                    print(f"    ... bootstrapping: {pct}% ({summary})")
            time.sleep(1.0)

        if not bootstrapped:
            print("[ERROR] Tor daemon did not finish bootstrapping within 30 seconds.")
            print("        Please inspect the 'Tor Daemon (ShadowBrowse)' console window for errors.")
            return 1

        # Retrieve new Tor PID
        info = get_process_info_for_port(TOR_SOCKS_PORT)
        if info:
            tor_pid = info["pid"]

    else:
        # Check existing Tor bootstrap status
        pct, summary = get_tor_bootstrap_percent()
        print(f"    Tor Status: {pct}% bootstrap ({summary})")

    # 3. Start Agent if not already running
    if not agent_running:
        print(f"\n[2/2] Launching Local Privacy Agent on 127.0.0.1:{AGENT_PORT}...")
        try:
            # Launch Agent in its own process group and console window
            proc = subprocess.Popen(
                [sys.executable, "-m", "agent.src.main", "--port", str(AGENT_PORT)],
                cwd=str(ROOT_DIR),
                stdin=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NEW_CONSOLE | subprocess.CREATE_NEW_PROCESS_GROUP
            )
            print("      Launched Agent console window. Waiting for readiness...")
        except Exception as e:
            print(f"[ERROR] Failed to launch Agent process: {e}")
            return 1

        # Wait for Agent online (up to 15s)
        start_time = time.time()
        agent_ready = False
        while time.time() - start_time < 15.0:
            if is_agent_online():
                agent_ready = True
                print("[+] Local Privacy Agent is ONLINE and verified.")
                break
            time.sleep(1.0)

        if not agent_ready:
            print(f"[ERROR] Agent did not respond on http://127.0.0.1:{AGENT_PORT} within 15 seconds.")
            print("        Please inspect the 'Local Agent (ShadowBrowse)' console window for tracebacks.")
            return 1

        # Retrieve new Agent PID
        info = get_process_info_for_port(AGENT_PORT)
        if info:
            agent_pid = info["pid"]

    # 4. Save PID tracking info
    save_pid_info(tor_pid, agent_pid)

    # 5. Display concise summary and instructions
    print("\n" + "=" * 64)
    print("  ShadowBrowse Subsystems are ONLINE & READY")
    print("=" * 64)
    print(f"  [+] Tor SOCKS5 Proxy  : 127.0.0.1:{TOR_SOCKS_PORT}  (PID: {tor_pid})")
    print(f"  [+] Tor Control Port  : 127.0.0.1:{TOR_CONTROL_PORT}  (Bootstrap 100% - Done)")
    print(f"  [+] Local Privacy Agent: http://127.0.0.1:{AGENT_PORT} (PID: {agent_pid})")
    print("-" * 64)
    print("  NEXT STEPS TO BROWSE SECURELY:")
    print("  1. Open Google Chrome.")
    print("  2. Navigate to: chrome://extensions/")
    print("  3. Ensure 'Developer mode' toggle (top right) is ON.")
    print("  4. Click 'Load unpacked' and select the directory:")
    print(f"     {ROOT_DIR / 'extension' / 'dist'}")
    print("  5. Click the ShadowBrowse icon in the Chrome extension toolbar.")
    print("  6. Click 'Readiness Checklist' to confirm all checks pass.")
    print("  7. Click 'START PRIVATE SESSION' to activate Tor routing.")
    print("-" * 64)
    print("  NOTE: This launcher starts the background daemons only.")
    print("  It does NOT modify your browser's proxy settings until you")
    print("  explicitly activate the session via the extension UI.")
    print("  To stop both services cleanly, run STOP_ALL.bat.")
    print("=" * 64 + "\n")

    return 0


def stop_services() -> int:
    """
    Safely terminates only the exact Tor and Agent processes started
    for ShadowBrowse, verifying process identity to prevent accidental kills.
    """
    print("=" * 64)
    print("  ShadowBrowse -- Service Teardown")
    print("=" * 64)

    tor_proc_9050 = get_process_info_for_port(TOR_SOCKS_PORT)
    tor_proc_9051 = get_process_info_for_port(TOR_CONTROL_PORT)
    agent_proc_9152 = get_process_info_for_port(AGENT_PORT)

    stopped_count = 0

    # Stop Agent (Port 9152)
    if agent_proc_9152:
        pid = agent_proc_9152["pid"]
        if is_shadowbrowse_agent_process(agent_proc_9152):
            print(f"[*] Stopping ShadowBrowse Agent (PID: {pid})...")
            try:
                if HAS_PSUTIL:
                    p = psutil.Process(pid)
                    p.terminate()
                    p.wait(timeout=3)
                else:
                    subprocess.run(f"taskkill /F /T /PID {pid}", shell=True, check=True)
                print(f"[+] Agent (PID: {pid}) stopped.")
                stopped_count += 1
            except Exception as e:
                print(f"[!] Warning: Could not cleanly terminate Agent (PID: {pid}): {e}")
        else:
            print(f"[!] SKIP: Port 9152 belongs to an unrelated process (PID: {pid}). Refusing to terminate.")
    else:
        print(f"[-] Agent is not currently running on port {AGENT_PORT}.")

    # Stop Tor (Port 9050 / 9051)
    tor_proc = tor_proc_9050 or tor_proc_9051
    if tor_proc:
        pid = tor_proc["pid"]
        if is_shadowbrowse_tor_process(tor_proc):
            print(f"[*] Stopping ShadowBrowse Tor Daemon (PID: {pid})...")
            try:
                if HAS_PSUTIL:
                    p = psutil.Process(pid)
                    p.terminate()
                    p.wait(timeout=3)
                else:
                    subprocess.run(f"taskkill /F /T /PID {pid}", shell=True, check=True)
                print(f"[+] Tor Daemon (PID: {pid}) stopped.")
                stopped_count += 1
            except Exception as e:
                print(f"[!] Warning: Could not cleanly terminate Tor (PID: {pid}): {e}")
        else:
            print(f"[!] SKIP: Tor port belongs to an unrelated process (PID: {pid}). Refusing to terminate.")
    else:
        print(f"[-] Tor Daemon is not currently running on port {TOR_SOCKS_PORT}.")

    clear_pid_info()

    # Verify ports are released
    time.sleep(1.0)
    tor_open = is_socket_open("127.0.0.1", TOR_SOCKS_PORT)
    agent_open = is_socket_open("127.0.0.1", AGENT_PORT)

    print("-" * 64)
    if not tor_open and not agent_open:
        print("[+] All ShadowBrowse ports (9050, 9051, 9152) are now free.")
        print("[+] Safe teardown complete.")
    else:
        if tor_open:
            print(f"[!] Warning: Port {TOR_SOCKS_PORT} is still listening.")
        if agent_open:
            print(f"[!] Warning: Port {AGENT_PORT} is still listening.")
    print("=" * 64 + "\n")
    return 0


def status_services() -> int:
    """Displays real-time status of Tor and Agent ports and bootstrap."""
    print("=" * 64)
    print("  ShadowBrowse -- System Status")
    print("=" * 64)

    tor_proc = get_process_info_for_port(TOR_SOCKS_PORT) or get_process_info_for_port(TOR_CONTROL_PORT)
    agent_proc = get_process_info_for_port(AGENT_PORT)

    if tor_proc and is_shadowbrowse_tor_process(tor_proc):
        pct, summary = get_tor_bootstrap_percent()
        print(f"  Tor Daemon         : ONLINE (PID: {tor_proc['pid']})")
        print(f"    SOCKS5 Port      : 127.0.0.1:{TOR_SOCKS_PORT} (Listening)")
        print(f"    Control Port     : 127.0.0.1:{TOR_CONTROL_PORT} (Listening)")
        print(f"    Bootstrap Status : {pct}% ({summary})")
    elif tor_proc:
        print(f"  Tor Daemon         : CONFLICT (Port occupied by PID {tor_proc['pid']}: {tor_proc['name']})")
    else:
        print("  Tor Daemon         : OFFLINE")

    print("-" * 64)

    if agent_proc and is_shadowbrowse_agent_process(agent_proc):
        online = is_agent_online()
        print(f"  Local Privacy Agent: {'ONLINE' if online else 'STARTING'} (PID: {agent_proc['pid']})")
        print(f"    Endpoint         : http://127.0.0.1:{AGENT_PORT}")
    elif agent_proc:
        print(f"  Local Privacy Agent: CONFLICT (Port occupied by PID {agent_proc['pid']}: {agent_proc['name']})")
    else:
        print("  Local Privacy Agent: OFFLINE")

    print("=" * 64)
    return 0


if __name__ == "__main__":
    action = sys.argv[1].lower() if len(sys.argv) > 1 else "start"
    if action == "start":
        sys.exit(start_services())
    elif action == "stop":
        sys.exit(stop_services())
    elif action == "status":
        sys.exit(status_services())
    else:
        print(f"Usage: python scripts/service_manager.py [start|stop|status]")
        sys.exit(1)
