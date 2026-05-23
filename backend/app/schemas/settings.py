"""Application settings schemas."""

from pydantic import BaseModel, Field


class SettingsStatusResponse(BaseModel):
    llm_provider: str
    llm_model: str = ""
    is_mock: bool = True
    deepseek_configured: bool
    spark_enabled: bool = False
    spark_configured: bool = False
    spark_model: str = ""
    spark_base_url_configured: bool = False
    fallback_provider: str = ""
    embedding_provider: str
    embedding_is_mock: bool = True


class LLMConfigRequest(BaseModel):
    provider: str = "deepseek"
    api_key: str = Field(..., min_length=1)
    base_url: str = "https://api.deepseek.com"
    model: str = "deepseek-chat"


class LLMTestRequest(BaseModel):
    message: str = "请用一句话说明你已连接成功"
    provider: str = ""  # "deepseek" or "spark"


class LLMTestResponse(BaseModel):
    ok: bool
    provider: str = ""
    model: str = ""
    response: str = ""
    latency_ms: float = 0
    error: str = ""
