"""FastAPI application entry point."""

from fastapi import FastAPI

from app.api.health import router as health_router
from app.api.version import router as version_router

app = FastAPI(
    title="Intelligent Learning Agent",
    description="高等教育个性化学习资源多智能体系统",
    version="0.1.0",
)

app.include_router(health_router)
app.include_router(version_router)
