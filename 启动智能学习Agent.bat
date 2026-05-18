@echo off
title Intelligent Learning Agent Launcher
echo Starting Intelligent Learning Agent...
echo.
wsl.exe -e bash -lc "cd /home/zhang/projects/intelligent-learning-agent && bash scripts/start_app.sh"
echo.
echo If the browser did not open, visit:
echo http://127.0.0.1:5173
echo.
pause
