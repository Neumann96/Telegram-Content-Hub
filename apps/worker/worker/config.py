from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    api_base_url: str = "http://localhost:8080"
    api_user_id: str | None = None
    worker_token: str | None = None
    telegram_api_id: int | None = None
    telegram_api_hash: str | None = None
    telegram_bot_token: str | None = None
    telegram_worker_session: str = "./data/telethon.session"
    poll_interval_seconds: int = 30
    initial_posts_limit: int = 20

    @field_validator("api_user_id", "worker_token", "telegram_api_id", "telegram_api_hash", "telegram_bot_token", mode="before")
    @classmethod
    def empty_string_as_none(cls, value: object) -> object:
        if value == "":
            return None
        return value


settings = Settings()
