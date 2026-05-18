"""Core configuration module."""


from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "intelligent-learning-agent"
    APP_ENV: str = "development"
    BACKEND_PORT: int = 8000

    # Database
    DATABASE_URL: str = "sqlite:///./data/app.db"

    # JWT
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Spark LLM (placeholder)
    SPARK_APP_ID: str = ""
    SPARK_API_KEY: str = ""
    SPARK_API_SECRET: str = ""

    # ChromaDB
    CHROMA_PERSIST_DIR: str = "./data/chroma"
    CHROMA_COLLECTION_NAME: str = "course_chunks"

    # Embedding
    EMBEDDING_PROVIDER: str = "hash_mock"
    EMBEDDING_DIM: int = 384
    EMBEDDING_MODEL_NAME: str = "sentence-transformers/all-MiniLM-L6-v2"

    # LLM Provider
    LLM_PROVIDER: str = "mock"

    SPARK_BASE_URL: str = "https://spark-api-open.xf-yun.com/v1"
    SPARK_API_KEY: str = ""
    SPARK_MODEL: str = "lite"

    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_MODEL: str = "deepseek-chat"

    LLM_TIMEOUT_SECONDS: int = 60
    LLM_MAX_RETRIES: int = 2

    # Generated files
    GENERATED_DIR: str = "./data/generated"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
