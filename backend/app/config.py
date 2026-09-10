from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "cockroachdb+asyncpg://root@localhost:26257/pocketpilot?sslmode=disable"
    allowed_origins: str = "http://localhost:19006,http://localhost:8081"

    # LLM provider: Gemini is the default development provider; the service
    # still falls back to deterministic local rules when the provider fails.
    llm_provider: str = "gemini"
    gemini_api_key: str = ""
    gemini_model_id: str = "gemini-3.6-flash"
    gemini_embedding_model_id: str = "gemini-embedding-001"

    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    bedrock_model_id: str = "anthropic.claude-3-sonnet-20240229-v1:0"
    bedrock_embedding_model_id: str = "amazon.titan-embed-text-v2:0"
    embedding_dimension: int = 1024
    tesseract_cmd: str = ""
    tesseract_lang: str = "eng"
    receipt_storage_dir: str = "storage/receipts"
    auth_secret_key: str = "dev-only-change-this-secret"
    access_token_expire_minutes: int = 60

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


settings = Settings()
