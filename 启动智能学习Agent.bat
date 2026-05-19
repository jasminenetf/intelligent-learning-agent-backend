@echo off
title Intelligent Learning Agent
echo Starting Intelligent Learning Agent...
echo.

REM Get the directory where this .bat file lives
set "BAT_DIR=%~dp0"
set "BAT_DIR=%BAT_DIR:~0,-1%"

REM Convert Windows path to WSL path
for /f "delims=" %%i in ('wsl.exe wslpath "%BAT_DIR%"') do set WSL_PATH=%%i

wsl.exe -e bash -lc "cd '%WSL_PATH%' && bash scripts/start_app.sh"
echo.
echo If the browser did not open, visit:
echo http://127.0.0.1:5173
echo.
pause
