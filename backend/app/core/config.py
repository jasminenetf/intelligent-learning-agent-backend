"""Core configuration module."""


from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "intelligent-learning-agent"
    APP_ENV: str = "development"
    BACKEND_PORT: int = 8000
    SPARK_APP_ID: str = ""
    SPARK_API_KEY: str = ""
    SPARK_API_SECRET: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
