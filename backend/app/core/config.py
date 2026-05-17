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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
