@echo off
setlocal
cd /d "%~dp0"
title ShadowBrowse - Service Teardown

where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] 'python' is not recognized as an internal or external command.
    echo Please ensure Python 3.10+ is installed and added to your system PATH.
    echo.
    pause
    exit /b 1
)

python scripts\service_manager.py stop
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Service shutdown encountered an issue. See diagnostic messages above.
    pause
    exit /b %ERRORLEVEL%
)

pause
