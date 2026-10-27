@echo off
setlocal
cd /d "%~dp0"
title ShadowBrowse - Service Launcher

echo ============================================================
echo   ShadowBrowse -- System Startup Launcher
echo   Tor SOCKS5/Control Daemon + Local Privacy Agent
echo ============================================================
echo [*] Working Directory: %~dp0

REM 1. Verify Tor binary and config paths
if not exist "agent\bin\tor\tor\tor.exe" (
    echo [ERROR] Tor executable not found at:
    echo         agent\bin\tor\tor\tor.exe
    echo Please verify that the Tor binary is present in the repository.
    echo.
    pause
    exit /b 1
)

if not exist "agent\bin\tor\torrc" (
    echo [ERROR] Tor configuration file not found at:
    echo         agent\bin\tor\torrc
    echo.
    pause
    exit /b 1
)

REM 2. Verify FastAPI agent entry point
if not exist "agent\src\main.py" (
    echo [ERROR] Privacy Agent entrypoint not found at:
    echo         agent\src\main.py
    echo.
    pause
    exit /b 1
)

REM 3. Verify Python availability
where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] 'python' is not recognized as an internal or external command.
    echo Please ensure Python 3.10+ is installed and added to your system PATH.
    echo.
    pause
    exit /b 1
)

REM 4. Execute Service Manager
python scripts\service_manager.py start
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Service startup encountered an issue. See diagnostic messages above.
    pause
    exit /b %ERRORLEVEL%
)

pause
