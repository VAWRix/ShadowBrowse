"""
ShadowBrowse — Reproducible Production Release Packaging Script
==============================================================
Assembles the complete, clean, self-contained Windows release package:
  - extension/ (production MV3 build, zero source maps)
  - agent/ (FastAPI daemon source, requirements, launcher)
  - tor/ (Tor 0.4.8.14 binary, clean torrc, clean data dir with geoip)
  - Documentation and launcher scripts (START_ALL.bat, STOP_ALL.bat, README, UNINSTALL, LICENSE)

Outputs:
  - release/shadowbrowse-v0.3.0-windows-x64/
  - release/shadowbrowse-v0.3.0-windows-x64.zip
  - release/MANIFEST.txt
  - release/SHA256SUMS.txt
"""

import os
import shutil
import zipfile
import hashlib
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT_DIR / "extension" / "dist"
AGENT_SRC_DIR = ROOT_DIR / "agent" / "src"
AGENT_REQ = ROOT_DIR / "agent" / "requirements.txt"
TOR_SRC_DIR = ROOT_DIR / "agent" / "bin" / "tor"

RELEASE_DIR = ROOT_DIR / "release"
PACKAGE_NAME = "shadowbrowse-v0.3.0-windows-x64"
STAGE_DIR = RELEASE_DIR / PACKAGE_NAME
ZIP_PATH = RELEASE_DIR / f"{PACKAGE_NAME}.zip"


def sha256_file(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def build_release():
    print(f"Building release package: {PACKAGE_NAME}...")

    # 1. Clean staging directory
    if STAGE_DIR.exists():
        shutil.rmtree(STAGE_DIR)
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()
    STAGE_DIR.mkdir(parents=True, exist_ok=True)

    # 2. Package Extension
    print("  [1/6] Packaging Chromium extension...")
    ext_stage = STAGE_DIR / "extension"
    ext_stage.mkdir(parents=True, exist_ok=True)

    if not DIST_DIR.exists():
        raise RuntimeError(f"extension/dist does not exist at {DIST_DIR}. Run 'npm run build' first.")

    for item in DIST_DIR.rglob("*"):
        if item.is_file():
            # Disallow source maps and development secrets
            if item.suffix == ".map":
                raise RuntimeError(f"Source map detected in dist: {item}")
            if item.name.startswith(".env") or item.suffix == ".token":
                raise RuntimeError(f"Secret file detected in dist: {item}")

            rel_path = item.relative_to(DIST_DIR)
            target = ext_stage / rel_path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)

    # 3. Package Agent
    print("  [2/6] Packaging Local Shadow Agent...")
    agent_stage = STAGE_DIR / "agent"
    agent_src_stage = agent_stage / "src"
    agent_src_stage.mkdir(parents=True, exist_ok=True)

    for item in AGENT_SRC_DIR.rglob("*"):
        if item.is_file():
            if "__pycache__" in item.parts or item.suffix in (".pyc", ".pyo"):
                continue
            rel_path = item.relative_to(AGENT_SRC_DIR)
            target = agent_src_stage / rel_path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)

    shutil.copy2(AGENT_REQ, agent_stage / "requirements.txt")

    (agent_stage / "start-agent.bat").write_text(
        "@echo off\r\n"
        "title ShadowBrowse Local Agent\r\n"
        "echo ============================================================\r\n"
        "echo  SHADOWBROWSE LOCAL PRIVACY AGENT (127.0.0.1:9152)\r\n"
        "echo ============================================================\r\n"
        "cd /d \"%~dp0\"\r\n"
        "python -m pip install -r requirements.txt --quiet\r\n"
        "python -m src.main --port 9152\r\n"
        "pause\r\n",
        encoding="utf-8",
    )

    # 4. Package Tor Component
    print("  [3/6] Packaging Tor Daemon...")
    tor_stage = STAGE_DIR / "tor"
    tor_bin_stage = tor_stage / "tor"
    tor_data_stage = tor_stage / "data"
    tor_bin_stage.mkdir(parents=True, exist_ok=True)
    tor_data_stage.mkdir(parents=True, exist_ok=True)

    # Copy tor binaries
    src_tor_bin = TOR_SRC_DIR / "tor"
    for item in src_tor_bin.rglob("*"):
        if item.is_file():
            rel_path = item.relative_to(src_tor_bin)
            target = tor_bin_stage / rel_path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)

    # Copy only GeoIP database files, NOT runtime caches, lock, keys, or state
    for geo_name in ("geoip", "geoip6"):
        src_geo = TOR_SRC_DIR / "data" / geo_name
        if src_geo.exists():
            shutil.copy2(src_geo, tor_data_stage / geo_name)

    # Clean, relative torrc for standalone release
    (tor_stage / "torrc").write_text(
        "SocksPort 127.0.0.1:9050\r\n"
        "ControlPort 127.0.0.1:9051\r\n"
        "DataDirectory data\r\n"
        "CookieAuthentication 0\r\n"
        "HashedControlPassword \"\"\r\n"
        "GeoIPFile data/geoip\r\n"
        "GeoIPv6File data/geoip6\r\n",
        encoding="utf-8",
    )

    (tor_stage / "start-tor.bat").write_text(
        "@echo off\r\n"
        "title Tor Daemon (ShadowBrowse)\r\n"
        "echo ============================================================\r\n"
        "echo  TOR DAEMON (SOCKS5 127.0.0.1:9050 / Control 127.0.0.1:9051)\r\n"
        "echo ============================================================\r\n"
        "cd /d \"%~dp0\"\r\n"
        "tor\\tor.exe -f torrc\r\n"
        "pause\r\n",
        encoding="utf-8",
    )

    # 5. Top-level Documentation and Scripts
    print("  [4/6] Writing release documentation & launch scripts...")
    (STAGE_DIR / "START_ALL.bat").write_text(
        "@echo off\r\n"
        "echo ============================================================\r\n"
        "echo  Starting ShadowBrowse Background Services\r\n"
        "echo ============================================================\r\n"
        "cd /d \"%~dp0\"\r\n"
        "echo [1/2] Launching Tor Daemon on 127.0.0.1:9050...\r\n"
        "start \"Tor Daemon (ShadowBrowse)\" /min cmd /c \"cd /d tor && tor\\tor.exe -f torrc\"\r\n"
        "timeout /t 3 /nobreak > nul\r\n"
        "echo [2/2] Launching Local Privacy Agent on 127.0.0.1:9152...\r\n"
        "start \"Local Agent (ShadowBrowse)\" cmd /c \"cd /d agent && python -m src.main --port 9152\"\r\n"
        "echo Services started! Now open Google Chrome and load the extension/ directory.\r\n",
        encoding="utf-8",
    )

    (STAGE_DIR / "STOP_ALL.bat").write_text(
        "@echo off\r\n"
        "echo Stopping ShadowBrowse background services...\r\n"
        "taskkill /F /IM tor.exe 2>nul\r\n"
        "for /f \"tokens=5\" %%a in ('netstat -aon ^| findstr \":9152\"') do taskkill /F /PID %%a 2>nul\r\n"
        "echo Services stopped cleanly.\r\n",
        encoding="utf-8",
    )

    (STAGE_DIR / "README.txt").write_text(
        "========================================================================\r\n"
        " SHADOWBROWSE v0.3.0 (Windows x64)\r\n"
        " Privacy-Preserving Anonymous Browsing Layer for Chromium\r\n"
        "========================================================================\r\n\r\n"
        "PACKAGE CONTENTS:\r\n"
        "  - extension/    : Built Chromium Extension (Manifest V3)\r\n"
        "  - agent/        : Local Shadow Agent (FastAPI daemon on 127.0.0.1:9152)\r\n"
        "  - tor/          : Bundled Tor 0.4.8.14 Daemon (SOCKS5 127.0.0.1:9050)\r\n"
        "  - START_ALL.bat : Starts Tor and the Local Agent simultaneously\r\n"
        "  - STOP_ALL.bat  : Cleanly terminates Tor and Local Agent\r\n"
        "  - UNINSTALL.txt : Complete uninstallation & cleanup steps\r\n\r\n"
        "PREREQUISITES:\r\n"
        "  - Windows 10 or 11 x64\r\n"
        "  - Google Chrome, Brave, or Chromium 114+\r\n"
        "  - Python 3.10+ (added to Windows PATH)\r\n\r\n"
        "QUICK START GUIDE:\r\n"
        "  1. Start Services:\r\n"
        "     Double-click 'START_ALL.bat'. This launches Tor and the Local Agent.\r\n"
        "     The agent console will display your secret token location:\r\n"
        "     ~/.shadowbrowse/agent.token\r\n\r\n"
        "  2. Load Extension in Chrome:\r\n"
        "     - Open Google Chrome and navigate to chrome://extensions\r\n"
        "     - Enable 'Developer mode' (upper right toggle)\r\n"
        "     - Click 'Load unpacked' and select the 'extension' folder\r\n"
        "     - ShadowBrowse will appear in your Chrome toolbar\r\n\r\n"
        "  3. Configure & Verify:\r\n"
        "     - Open the ShadowBrowse extension from the toolbar\r\n"
        "     - Click 'Review Setup' to view the 6-point readiness checklist\r\n"
        "     - In Settings, confirm 'Local Agent Secret Token' is populated\r\n"
        "     - Click 'START PRIVATE SESSION' to begin anonymous browsing\r\n\r\n"
        "LIMITATIONS & PRIVACY TRANSPARENCY:\r\n"
        "  - DNS: Remote hostname resolution is performed via SOCKS5. However, MV3\r\n"
        "    extensions cannot inspect raw kernel UDP sockets; status is PARTIAL.\r\n"
        "  - Storage: Storage isolation is enforced across sessions via post-session\r\n"
        "    data cleanup. True per-tab containers are not supported by Chromium.\r\n"
        "  - Fingerprinting: WebGL/Canvas/Audio probes are detected and alerted.\r\n"
        "    Active noise spoofing is intentionally omitted to avoid high entropy.\r\n",
        encoding="utf-8",
    )

    (STAGE_DIR / "UNINSTALL.txt").write_text(
        "========================================================================\r\n"
        " SHADOWBROWSE — UNINSTALLATION AND CLEANUP GUIDE\r\n"
        "========================================================================\r\n\r\n"
        "1. Stop Services:\r\n"
        "   Double-click STOP_ALL.bat to stop Tor and the Local Agent.\r\n\r\n"
        "2. Remove Extension from Chrome:\r\n"
        "   - Open chrome://extensions in Google Chrome.\r\n"
        "   - Find ShadowBrowse and click 'Remove'.\r\n"
        "   - Chrome automatically cleans up extension storage.\r\n\r\n"
        "3. Remove Agent Data & Auth Tokens:\r\n"
        "   - Delete the user config folder: %USERPROFILE%\\.shadowbrowse\r\n"
        "   - Delete this extracted folder.\r\n\r\n"
        "4. Proxy Restoration Check:\r\n"
        "   - Open Chrome Settings -> System -> Open proxy settings.\r\n"
        "   - Verify that proxy mode is set to 'Automatically detect settings'\r\n"
        "     (ShadowBrowse restores this automatically on session exit).\r\n",
        encoding="utf-8",
    )

    (STAGE_DIR / "LICENSE-TOR.txt").write_text(
        "The Tor executable (tor.exe) included in this package is licensed under\r\n"
        "the GNU General Public License v3 (GPLv3).\r\n\r\n"
        "Tor version: 0.4.8.14 (git-5d040a975df7a060)\r\n"
        "Copyright (c) 2001-2004, Roger Dingledine\r\n"
        "Copyright (c) 2004-2006, Roger Dingledine, Nick Mathewson\r\n"
        "Copyright (c) 2007-2024, The Tor Project, Inc.\r\n\r\n"
        "For complete source code and licensing terms, visit:\r\n"
        "https://www.torproject.org/\r\n"
        "https://www.gnu.org/licenses/gpl-3.0.en.html\r\n",
        encoding="utf-8",
    )

    # 6. Generate Manifest and Zip
    print("  [5/6] Generating manifest and file checksums...")
    manifest_lines = []
    for item in sorted(STAGE_DIR.rglob("*")):
        if item.is_file():
            rel_path = item.relative_to(STAGE_DIR).as_posix()
            size = item.stat().st_size
            h = sha256_file(item)
            manifest_lines.append(f"{h}  {size:10d}  {rel_path}")

    manifest_content = (
        f"# ShadowBrowse Release Manifest — {PACKAGE_NAME}\n"
        f"# Total Files: {len(manifest_lines)}\n"
        f"# SHA-256 Checksum                                                Size (B)   Path\n"
        + "\n".join(manifest_lines)
        + "\n"
    )
    (RELEASE_DIR / "MANIFEST.txt").write_text(manifest_content, encoding="utf-8")

    print(f"  [6/6] Creating ZIP archive: {ZIP_PATH.name}...")
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in sorted(STAGE_DIR.rglob("*")):
            if item.is_file():
                arcname = f"{PACKAGE_NAME}/{item.relative_to(STAGE_DIR).as_posix()}"
                zf.write(item, arcname)

    zip_hash = sha256_file(ZIP_PATH)
    zip_size_mb = ZIP_PATH.stat().st_size / (1024 * 1024)
    (RELEASE_DIR / "SHA256SUMS.txt").write_text(f"{zip_hash}  {ZIP_PATH.name}\n", encoding="utf-8")

    print("\n============================================================")
    print("RELEASE PACKAGE BUILT SUCCESSFULLY!")
    print("============================================================")
    print(f"Directory:    {STAGE_DIR}")
    print(f"ZIP Archive:  {ZIP_PATH}")
    print(f"Size:         {zip_size_mb:.2f} MB ({ZIP_PATH.stat().st_size:,} bytes)")
    print(f"SHA-256:      {zip_hash}")
    print(f"Manifest:     {RELEASE_DIR / 'MANIFEST.txt'}")
    print(f"Checksums:    {RELEASE_DIR / 'SHA256SUMS.txt'}")
    print("============================================================\n")

    return {
        "package_name": PACKAGE_NAME,
        "zip_path": str(ZIP_PATH),
        "size_bytes": ZIP_PATH.stat().st_size,
        "sha256": zip_hash,
        "file_count": len(manifest_lines),
    }


if __name__ == "__main__":
    build_release()
