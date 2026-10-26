"""
ShadowBrowse Phase 12 — Production Packaging & Clean-Install Verification
========================================================================
Validates:
- Release ZIP artifact existence, non-empty size, and SHA-256 integrity.
- Absence of source maps, credentials, runtime state, or development artifacts.
- Clean extraction into an isolated temporary folder.
- Functional integrity of packaged extension, local agent, and Tor daemon.
"""

import os
import zipfile
import hashlib
import shutil
import subprocess
from pathlib import Path
import pytest

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
RELEASE_DIR = ROOT_DIR / "release"
PACKAGE_NAME = "shadowbrowse-v0.3.0-windows-x64"
ZIP_PATH = RELEASE_DIR / f"{PACKAGE_NAME}.zip"
CHECKSUMS_PATH = RELEASE_DIR / "SHA256SUMS.txt"
MANIFEST_PATH = RELEASE_DIR / "MANIFEST.txt"
TEMP_INSTALL_DIR = ROOT_DIR / "tests" / "tmp_clean_install_verification"


def sha256_file(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def test_release_zip_and_checksum_files_exist():
    """Verify release ZIP, SHA256SUMS.txt, and MANIFEST.txt exist."""
    assert ZIP_PATH.exists(), f"Missing release archive at {ZIP_PATH}"
    assert CHECKSUMS_PATH.exists(), f"Missing checksums file at {CHECKSUMS_PATH}"
    assert MANIFEST_PATH.exists(), f"Missing manifest file at {MANIFEST_PATH}"

    # Verify sha256 matches recorded sum
    recorded_text = CHECKSUMS_PATH.read_text(encoding="utf-8").strip()
    recorded_hash = recorded_text.split()[0]
    actual_hash = sha256_file(ZIP_PATH)
    assert actual_hash == recorded_hash, f"Checksum mismatch: {actual_hash} != {recorded_hash}"


def test_release_archive_prohibited_files_audit():
    """Audit every file inside the release archive for secret and development leakage."""
    assert ZIP_PATH.exists()

    with zipfile.ZipFile(ZIP_PATH, "r") as zf:
        for entry in zf.infolist():
            filename = entry.filename

            # 1. No source maps
            assert not filename.endswith(".map"), f"Prohibited source map in release: {filename}"

            # 2. No tokens, secrets, or .env files
            assert not filename.endswith(".token"), f"Prohibited token file in release: {filename}"
            assert "/.env" not in filename, f"Prohibited env file in release: {filename}"
            assert "agent.token" not in filename, f"Prohibited agent.token in release: {filename}"

            # 3. No pyc / __pycache__
            assert "__pycache__" not in filename, f"Prohibited __pycache__ in release: {filename}"
            assert not filename.endswith(".pyc"), f"Prohibited .pyc in release: {filename}"

            # 4. No Tor runtime keys, lock, or cached state
            assert "/tor/data/keys" not in filename, f"Prohibited Tor keys in release: {filename}"
            assert "/tor/data/lock" not in filename, f"Prohibited Tor lock in release: {filename}"
            assert "/tor/data/state" not in filename, f"Prohibited Tor state in release: {filename}"
            assert "cached-" not in filename, f"Prohibited cached Tor descriptor in release: {filename}"

            # 5. No git artifacts
            assert ".git" not in filename.split("/"), f"Prohibited git artifact in release: {filename}"


def test_clean_install_extraction_and_file_verification():
    """Extract release archive into isolated temporary directory and verify structure."""
    if TEMP_INSTALL_DIR.exists():
        shutil.rmtree(TEMP_INSTALL_DIR, ignore_errors=True)
    TEMP_INSTALL_DIR.mkdir(parents=True, exist_ok=True)

    try:
        # Extract archive
        with zipfile.ZipFile(ZIP_PATH, "r") as zf:
            zf.extractall(TEMP_INSTALL_DIR)

        extracted_root = TEMP_INSTALL_DIR / PACKAGE_NAME
        assert extracted_root.exists(), f"Missing extracted root directory at {extracted_root}"

        # 1. Verify Top-Level scripts and docs
        expected_top = [
            "START_ALL.bat",
            "STOP_ALL.bat",
            "README.txt",
            "UNINSTALL.txt",
            "LICENSE-TOR.txt",
        ]
        for f in expected_top:
            assert (extracted_root / f).exists(), f"Missing top-level file: {f}"

        # 2. Verify Extension directory
        ext_dir = extracted_root / "extension"
        assert ext_dir.exists()
        expected_ext = [
            "manifest.json",
            "popup.html",
            "sidepanel.html",
            "background.js",
            "content.js",
            "injectGuard.js",
        ]
        for f in expected_ext:
            assert (ext_dir / f).exists(), f"Missing extension file: {f}"

        # 3. Verify Agent directory
        agent_dir = extracted_root / "agent"
        assert (agent_dir / "src" / "main.py").exists()
        assert (agent_dir / "src" / "config.py").exists()
        assert (agent_dir / "requirements.txt").exists()
        assert (agent_dir / "start-agent.bat").exists()

        # 4. Verify Tor directory
        tor_dir = extracted_root / "tor"
        assert (tor_dir / "tor" / "tor.exe").exists()
        assert (tor_dir / "torrc").exists()
        assert (tor_dir / "start-tor.bat").exists()
        assert (tor_dir / "data" / "geoip").exists()
        assert (tor_dir / "data" / "geoip6").exists()

    finally:
        # Cleanup isolated extraction
        if TEMP_INSTALL_DIR.exists():
            shutil.rmtree(TEMP_INSTALL_DIR, ignore_errors=True)


def test_packaged_tor_executable_runs_in_isolation():
    """Verify that the packaged tor.exe runs --verify-config cleanly."""
    if TEMP_INSTALL_DIR.exists():
        shutil.rmtree(TEMP_INSTALL_DIR, ignore_errors=True)
    TEMP_INSTALL_DIR.mkdir(parents=True, exist_ok=True)

    try:
        with zipfile.ZipFile(ZIP_PATH, "r") as zf:
            zf.extractall(TEMP_INSTALL_DIR)

        tor_dir = TEMP_INSTALL_DIR / PACKAGE_NAME / "tor"
        tor_exe = tor_dir / "tor" / "tor.exe"
        tor_rc = tor_dir / "torrc"

        # Run tor.exe --verify-config from tor_dir
        cmd = [str(tor_exe), "-f", str(tor_rc), "--verify-config"]
        proc = subprocess.run(
            cmd,
            cwd=str(tor_dir),
            capture_output=True,
            text=True,
            timeout=10,
        )
        assert proc.returncode == 0, f"tor.exe --verify-config failed: {proc.stderr}"
        assert "Configuration was valid" in proc.stdout or "Configuration was valid" in proc.stderr
    finally:
        if TEMP_INSTALL_DIR.exists():
            shutil.rmtree(TEMP_INSTALL_DIR, ignore_errors=True)
