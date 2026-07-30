"""
Thin wrapper around the OpenAI SDK so the rest of the app never touches
the client directly. Centralizes model choice and retry logic.
"""
import logging
from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None


def _require_client():
    if _client is None:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Add it to backend/.env before using LLM features."
        )
    return _client


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def chat(messages: list[dict], model: str | None = None, temperature: float = 0.4,
         max_tokens: int = 1500) -> str:
    client = _require_client()
    model = model or settings.openai_model
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content or ""


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def vision_extract_text(image_b64: str) -> str:
    """
    Used as OCR fallback for handwritten notes / poor scans that Tesseract
    can't read reliably.
    """
    client = _require_client()
    resp = client.chat.completions.create(
        model=settings.openai_vision_model,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Transcribe ALL text visible in this image exactly as written, "
                            "including handwritten notes. Preserve structure (bullet points, "
                            "headings, tables as text) where possible. If the image contains "
                            "diagrams, briefly describe them in [brackets]. "
                            "Output only the transcription, no commentary."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{image_b64}"},
                    },
                ],
            }
        ],
        max_tokens=2000,
        temperature=0.0,
    )
    return resp.choices[0].message.content or ""
