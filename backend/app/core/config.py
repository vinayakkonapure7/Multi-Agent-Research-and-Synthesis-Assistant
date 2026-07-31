"""
Central configuration. All secrets/keys come from environment variables (.env file).
Never hardcode API keys.
"""
import os
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/


class Settings(BaseSettings):
    # --- LLM ---
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"          # used for section drafting (cheap + fast)
    openai_model_strong: str = "gpt-4o"        # used for outline planning / final polish
    openai_vision_model: str = "gpt-4o-mini"   # used for handwritten/scanned image OCR fallback
    openai_embedding_model: str = "text-embedding-3-small"

    # --- Web search ---
    tavily_api_key: str = ""
    search_provider: str = "ddgs"              # ddgs | tavily
    web_search_results: int = 7
    web_scrape_timeout_seconds: float = 12.0

    # --- Storage paths ---
    storage_dir: Path = BASE_DIR / "storage"
    upload_dir: Path = BASE_DIR / "storage" / "uploads"
    chroma_dir: Path = BASE_DIR / "storage" / "chroma"
    export_dir: Path = BASE_DIR / "storage" / "exports"
    sqlite_path: Path = BASE_DIR / "storage" / "app.db"

    # --- App ---
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    max_upload_mb: int = 25

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

# Ensure storage dirs exist at import time
for d in [settings.storage_dir, settings.upload_dir, settings.chroma_dir, settings.export_dir]:
    os.makedirs(d, exist_ok=True)
