#!/bin/bash
# 智能学习Agent — 一键启动脚本
# 用法: bash scripts/start_app.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "============================================"
echo "  智能学习Agent — 启动中..."
echo "============================================"

# Check venv
if [ ! -f "$ROOT/.venv/bin/activate" ]; then
    echo "ERROR: .venv not found, run: python -m venv .venv && pip install -r backend/requirements.txt"
    exit 1
fi

source "$ROOT/.venv/bin/activate"

# Kill existing processes on ports
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true
sleep 1

# Start backend
echo "[1/2] Starting backend on http://127.0.0.1:8000 ..."
cd "$ROOT/backend"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "       Backend PID: $BACKEND_PID"

# Start frontend
echo "[2/2] Starting frontend on http://127.0.0.1:5173 ..."
cd "$ROOT/frontend-demo"
python -m http.server 5173 &
FRONTEND_PID=$!
echo "       Frontend PID: $FRONTEND_PID"

sleep 2

echo ""
echo "============================================"
echo "  系统已启动！"
echo "  前端: http://127.0.0.1:5173"
echo "  后端: http://127.0.0.1:8000"
echo "  API文档: http://127.0.0.1:8000/docs"
echo ""
echo "  停止: bash scripts/stop_app.sh"
echo "        或 Ctrl+C 两次"
echo "============================================"

# Wait for either process
wait
