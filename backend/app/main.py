"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.auth import router as auth_router
from app.api.courses import router as courses_router
from app.api.health import router as health_router
from app.api.rag import router as rag_router
from app.api.version import router as version_router
# Import all models so SQLModel metadata picks them up
import app.models  # noqa: F401
from app.core.database import create_db_and_tables


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(
    title="Intelligent Learning Agent",
    description="高等教育个性化学习资源多智能体系统",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(health_router)
app.include_router(version_router)
app.include_router(auth_router)
app.include_router(courses_router)
app.include_router(rag_router)
