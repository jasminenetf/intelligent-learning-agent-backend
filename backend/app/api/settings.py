"""App settings API: configure LLM keys, test connections."""

import os
import time
import logging

from fastapi import APIRouter, HTTPException
from openai import OpenAI

from app.core.config import settings
from app.schemas.settings import (
    LLMConfigRequest,
    LLMTestRequest,
    LLMTestResponse,
    SettingsStatusResponse,
)
from app.services.llm_provider import reset_llm_provider

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings", tags=["settings"])

ENV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", ".env")


def _read_env_lines() -> list[str]:
    """Read .env file lines, return empty list if not found."""
    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            return f.readlines()
    return []


def _write_env_lines(lines: list[str]):
    """Write lines to .env file, create dir if needed."""
    os.makedirs(os.path.dirname(ENV_PATH), exist_ok=True)
    with open(ENV_PATH, "w", encoding="utf-8") as f:
        f.writelines(lines)


@router.get("/status", response_model=SettingsStatusResponse)
def api_settings_status():
    """Return current app configuration status without exposing keys."""
    return SettingsStatusResponse(
        llm_provider=settings.LLM_PROVIDER,
        deepseek_configured=bool(settings.DEEPSEEK_API_KEY),
        embedding_provider=settings.EMBEDDING_PROVIDER,
        embedding_configured=settings.EMBEDDING_PROVIDER != "hash_mock",
    )


@router.post("/llm")
def api_save_llm_config(body: LLMConfigRequest):
    """Save LLM configuration to backend/.env. Requires restart to take effect."""
    provider = body.provider.strip().lower()
    if provider not in ("deepseek", "spark"):
        raise HTTPException(status_code=400, detail="provider must be deepseek or spark")

    lines = _read_env_lines()
    updates = {
        "LLM_PROVIDER": provider,
        f"{provider.upper()}_API_KEY": body.api_key,
        f"{provider.upper()}_BASE_URL": body.base_url,
        f"{provider.upper()}_MODEL": body.model,
    }

    new_lines = []
    updated = set()
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in updates:
                new_lines.append(f"{key}={updates[key]}\n")
                updated.add(key)
                continue
        new_lines.append(line)

    # Append any not-yet-existing keys
    for key, val in updates.items():
        if key not in updated:
            new_lines.append(f"{key}={val}\n")

    try:
        _write_env_lines(new_lines)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"failed to save config: {e}")

    # Never log the key
    logger.info("LLM config saved: provider=%s, key_configured=True", provider)
    return {"ok": True, "provider": provider, "saved": True, "restart_required": True}


@router.post("/test-llm", response_model=LLMTestResponse)
def api_test_llm(body: LLMTestRequest):
    """Test LLM connection directly (bypasses cached provider)."""
    if not settings.DEEPSEEK_API_KEY:
        return LLMTestResponse(ok=False, error="DeepSeek API Key not configured")

    provider_name = settings.LLM_PROVIDER
    api_key = settings.DEEPSEEK_API_KEY
    base_url = settings.DEEPSEEK_BASE_URL
    model = settings.DEEPSEEK_MODEL

    if not api_key:
        return LLMTestResponse(ok=False, error=f"no API key for {provider_name}")

    try:
        client = OpenAI(base_url=base_url, api_key=api_key, timeout=15, max_retries=1)
        t0 = time.time()
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": body.message}],
            max_tokens=100,
        )
        latency = (time.time() - t0) * 1000
        content = resp.choices[0].message.content or ""
        return LLMTestResponse(
            ok=True,
            provider=provider_name,
            model=model,
            response=content[:500],
            latency_ms=round(latency, 1),
        )
    except Exception as e:
        return LLMTestResponse(ok=False, error=str(e)[:200])
