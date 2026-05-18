"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.admin import setup_admin
from app.api.agent import router as agent_router
from app.api.auth import router as auth_router
from app.api.courses import router as courses_router
from app.api.health import router as health_router
from app.api.ocr import router as ocr_router
from app.api.openai_compat import router as openai_router
from app.api.profiles import router as profiles_router
from app.api.qa import router as qa_router
from app.api.rag import router as rag_router
from app.api.resources import router as resources_router
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
app.include_router(openai_router)  # /v1/models, /v1/chat/completions
app.include_router(auth_router)
app.include_router(courses_router)
app.include_router(rag_router)
app.include_router(qa_router)
app.include_router(profiles_router)
app.include_router(resources_router)
app.include_router(agent_router)
app.include_router(ocr_router)

# Mount admin panel (conditional on ADMIN_ENABLED env var)
setup_admin(app)
