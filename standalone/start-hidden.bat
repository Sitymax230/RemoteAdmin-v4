@echo off
:: RemoteAdmin v4 Agent - Windows Launcher
:: Hides the console window and starts the agent
:: Usage: Double-click this file to start the agent silently

:: Check if running already
tasklist /FI "IMAGENAME eq remoteadmin-agent-win.exe" 2>NUL | find /I "remoteadmin-agent-win.exe" >NUL
if %errorlevel% equ 0 (
    echo RemoteAdmin Agent is already running.
    timeout /t 3 >nul
    exit /b
)

:: Start agent hidden (no console window)
start "" /B wscript.exe "%~dp0start-silent.vbs"
