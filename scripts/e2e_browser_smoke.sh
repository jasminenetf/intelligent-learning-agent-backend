#!/bin/bash
# E2E Browser Smoke Test
# Usage: bash scripts/e2e_browser_smoke.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Stopping old services ==="
bash scripts/stop_app.sh 2>/dev/null || true
sleep 2

echo "=== Starting backend ==="
cd backend
HF_HUB_OFFLINE=1 python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!
cd "$ROOT"

echo "=== Waiting for backend ==="
for i in $(seq 1 30); do
  if curl -s http://127.0.0.1:8000/health > /dev/null 2>&1; then
    echo "Backend ready"
    break
  fi
  sleep 1
done

echo "=== Checking frontend ==="
curl -sI --max-time 5 http://127.0.0.1:5173 > /dev/null 2>&1 || {
  echo "WARNING: Frontend not detected on :5173. Starting vite..."
  cd frontend-demo
  npx vite --host 127.0.0.1 --port 5173 &
  FRONTEND_PID=$!
  cd "$ROOT"
  sleep 5
}

echo "=== Running E2E tests ==="
cd tests/e2e

if [ ! -d "node_modules" ]; then
  echo "Installing Playwright..."
  npm install
  npx playwright install chromium --with-deps 2>/dev/null || {
    echo "WARNING: Could not install Playwright browsers."
    echo "This environment may not support headless Chrome."
    echo "Skipping E2E tests."
    exit 0
  }
fi

npm test
TEST_EXIT=$?

cd "$ROOT"

echo "=== Stopping services ==="
kill $BACKEND_PID 2>/dev/null || true
kill $FRONTEND_PID 2>/dev/null || true

if [ $TEST_EXIT -ne 0 ]; then
  echo "E2E TESTS FAILED (exit $TEST_EXIT)"
  exit $TEST_EXIT
fi

echo "E2E TESTS PASSED"
