@echo off
title Intelligent Learning Agent Stopper
echo Stopping Intelligent Learning Agent...
echo.
wsl.exe -e bash -lc "cd /home/zhang/projects/intelligent-learning-agent && bash scripts/stop_app.sh"
echo.
pause
