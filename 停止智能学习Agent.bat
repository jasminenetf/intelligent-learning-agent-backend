@echo off
echo Stopping Intelligent Learning Agent...
wsl bash -lc "cd /home/zhang/projects/intelligent-learning-agent && bash scripts/stop_app.sh"
pause
