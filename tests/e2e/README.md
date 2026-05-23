# E2E Tests — 智学工坊 AI 自动学习助手

Playwright end-to-end tests for the competition demo auto learning flow.

## Setup

```bash
cd tests/e2e
npm install
npx playwright install chromium
```

## Running Tests

```bash
# All tests
npm test

# Demo auto-flow only
npm run test:demo

# Headed (visible browser)
npm run test:demo:headed

# Debug mode
npm run test:debug

# View report
npm run report
```

## Test Files

| File | Description |
|------|-------------|
| `demo-auto-flow.spec.js` | Full competition demo flow: landing → ask → mindmap → quiz → study_plan → regenerate |
| `dashboard.spec.js` | Dashboard page smoke test |
| `assistant-flow.spec.js` | Legacy assistant flow |
| `resource-flow.spec.js` | Resource generation flow |

## Requirements

- Backend running on `http://127.0.0.1:8000`
- Frontend running on `http://127.0.0.1:5173`
- Demo account and courses initialized
- DeepSeek API key configured in `backend/.env`

## Quick Smoke

```bash
bash scripts/e2e_browser_smoke.sh
```
