"""LLM Provider abstraction: Mock, Spark, DeepSeek.

Provider selection:
- LLM_PROVIDER=mock → MockLLMProvider (always available)
- LLM_PROVIDER=spark → SparkLLMProvider (requires SPARK_API_KEY)
- LLM_PROVIDER=deepseek → DeepSeekProvider (requires DEEPSEEK_API_KEY)
- Missing key → fallback to MockLLMProvider (no auto-hop between Spark/DeepSeek)
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

from openai import OpenAI

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class LLMResponse:
    content: str
    provider: str
    model: str
    raw: Optional[dict] = None


class BaseLLMProvider:
    provider: str = "base"
    model: str = "base"

    def generate(self, messages: list[dict], temperature: float = 0.2) -> LLMResponse:
        raise NotImplementedError


class MockLLMProvider(BaseLLMProvider):
    """Offline mock provider for pipeline validation. Always available."""
    provider = "mock"
    model = "mock"

    def generate(self, messages: list[dict], temperature: float = 0.2) -> LLMResponse:
        # Extract question from messages
        question = ""
        context_preview = ""
        for m in messages:
            if m.get("role") == "user":
                question = m.get("content", "")[:200]
                break

        answer = (
            "这是 MockLLM 生成的离线测试回答（MockLLM 生成）。\n\n"
            "当前环境未配置真实大模型 API Key，本回答仅用于验证 RAG 问答管线的工程链路是否通畅。\n\n"
            "【提问】\n"
            f"{question[:100]}\n\n"
            "【检索到的课程资料摘要】\n"
            "（从 ChromaDB 检索到的相关内容已成功注入 prompt 上下文）\n\n"
            "【回答】\n"
            "系统已从课程知识库中检索到相关资料。如果这是真实 LLM，会基于检索内容生成详细的教学回答。"
        )

        return LLMResponse(content=answer, provider="mock", model="mock")


class SparkLLMProvider(BaseLLMProvider):
    """Ifltyek Spark LLM via OpenAI-compatible HTTP API."""
    provider = "spark"

    def __init__(self):
        self._client = OpenAI(
            base_url=settings.SPARK_BASE_URL,
            api_key=settings.SPARK_API_KEY,
            timeout=settings.LLM_TIMEOUT_SECONDS,
            max_retries=settings.LLM_MAX_RETRIES,
        )
        self.model = settings.SPARK_MODEL

    def generate(self, messages: list[dict], temperature: float = 0.2) -> LLMResponse:
        resp = self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
        )
        return LLMResponse(
            content=resp.choices[0].message.content or "",
            provider="spark",
            model=self.model,
            raw=resp.model_dump() if hasattr(resp, "model_dump") else None,
        )


class DeepSeekProvider(BaseLLMProvider):
    """DeepSeek via OpenAI-compatible API. Dev/debug backup only."""
    provider = "deepseek"

    def __init__(self):
        self._client = OpenAI(
            base_url=settings.DEEPSEEK_BASE_URL,
            api_key=settings.DEEPSEEK_API_KEY,
            timeout=settings.LLM_TIMEOUT_SECONDS,
            max_retries=settings.LLM_MAX_RETRIES,
        )
        self.model = settings.DEEPSEEK_MODEL

    def generate(self, messages: list[dict], temperature: float = 0.2) -> LLMResponse:
        resp = self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
        )
        return LLMResponse(
            content=resp.choices[0].message.content or "",
            provider="deepseek",
            model=self.model,
            raw=resp.model_dump() if hasattr(resp, "model_dump") else None,
        )


_provider: Optional[BaseLLMProvider] = None


def reset_llm_provider():
    """Reset cached provider so new settings/env take effect without restart."""
    global _provider
    _provider = None


def get_llm_provider() -> BaseLLMProvider:
    """Get or create the configured LLM provider. Falls back to Mock on missing key."""
    global _provider
    if _provider is not None:
        return _provider

    provider_name = (settings.LLM_PROVIDER or "mock").strip().lower()

    if provider_name == "spark":
        if settings.SPARK_API_KEY:
            try:
                _provider = SparkLLMProvider()
                logger.info("LLM: using Spark provider (model=%s)", settings.SPARK_MODEL)
                return _provider
            except Exception as e:
                logger.warning("LLM: Spark init failed (%s), fallback to mock", e)
        else:
            logger.warning("LLM: SPARK_API_KEY not set, fallback to mock")

    elif provider_name == "deepseek":
        if settings.DEEPSEEK_API_KEY:
            try:
                _provider = DeepSeekProvider()
                logger.info("LLM: using DeepSeek provider (model=%s)", settings.DEEPSEEK_MODEL)
                return _provider
            except Exception as e:
                logger.warning("LLM: DeepSeek init failed (%s), fallback to mock", e)
        else:
            logger.warning("LLM: DEEPSEEK_API_KEY not set, fallback to mock")

    _provider = MockLLMProvider()
    logger.info("LLM: using Mock provider (offline)")
    return _provider
