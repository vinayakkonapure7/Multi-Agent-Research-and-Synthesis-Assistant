import json
import logging

from app.agents.schemas import EvidenceItem, ResearchBundle, ResearchValidation
from app.core.config import settings
from app.services.llm_client import chat
from app.services.vector_store import query_project_multi
from app.services.web_search import web_search

logger = logging.getLogger(__name__)

VALIDATION_PROMPT = """You are the Research Agent in a multi-agent academic research system.

Your first job is hallucination prevention. Validate whether the user's topic and context are
coherent, researchable, and specific enough to begin evidence-based research.

Reject only when the request is clearly incoherent, impossible to ground, mostly random text, or asks
for a fake/dummy paper. Use warning when the topic is broad but can proceed with caution.

Return ONLY valid JSON:
{
  "status": "approved | warning | rejected",
  "message": "short user-facing explanation"
}
"""


def run_researcher(topic: str, context: str, project_id: str, use_web: bool = True, use_rag: bool = True) -> ResearchBundle:
    validation = validate_research_query(topic, context)
    if validation.status == "rejected":
        return ResearchBundle(validation=validation)

    query = f"{topic}\n{context}".strip()
    rag = _rag_evidence(project_id, query) if use_rag else []
    web = _web_evidence(query) if use_web else []
    evidence = rag + web

    if not evidence and validation.status == "approved":
        validation = ResearchValidation(
            status="warning",
            message=(
                "The topic is coherent, but no external evidence has been retrieved yet. "
                "Upload documents, add URLs, or configure web search before drafting a final paper."
            ),
        )

    return ResearchBundle(validation=validation, evidence=evidence, rag_evidence=rag, web_evidence=web)


def validate_research_query(topic: str, context: str = "") -> ResearchValidation:
    topic = topic.strip()
    context = context.strip()
    if len(topic) < 6:
        return ResearchValidation(status="rejected", message="Please provide a more specific research topic.")
    if _looks_random(topic) or (context and _looks_random(context)):
        return ResearchValidation(
            status="rejected",
            message="The topic/context looks incoherent, so the system will not generate a fabricated paper.",
        )
    if not settings.openai_api_key:
        return ResearchValidation(
            status="warning",
            message="OPENAI_API_KEY is not configured, so only basic validation was applied.",
        )

    raw = chat(
        messages=[
            {"role": "system", "content": VALIDATION_PROMPT},
            {"role": "user", "content": f"Topic:\n{topic}\n\nContext:\n{context or '(none provided)'}"},
        ],
        model=settings.openai_model_strong,
        temperature=0.0,
        max_tokens=350,
    )
    try:
        parsed = json.loads(_strip_json_fence(raw))
        return ResearchValidation(**parsed)
    except Exception:
        logger.warning("Research validation JSON parse failed; continuing with warning. Raw=%s", raw)
        return ResearchValidation(
            status="warning",
            message="The topic appears researchable, but validation could not be parsed cleanly.",
        )


def _rag_evidence(project_id: str, query: str) -> list[EvidenceItem]:
    chunks = query_project_multi(project_id, query, n_results=10)
    return [
        EvidenceItem(
            source_name=c.get("source_name", "uploaded source"),
            content=c.get("text", ""),
            kind=c.get("kind", "document"),
            retrieval_method=c.get("retrieval_method", ""),
        )
        for c in chunks
    ]


def _web_evidence(query: str) -> list[EvidenceItem]:
    return [
        EvidenceItem(
            source_name=r.get("title", "web source"),
            url=r.get("url", ""),
            content=r.get("content", ""),
            kind="web",
            retrieval_method="web_scrape",
        )
        for r in web_search(query, max_results=settings.web_search_results)
    ]


def _looks_random(text: str) -> bool:
    words = [w for w in text.split() if w.strip()]
    if len(words) < 2:
        return False
    very_short = sum(1 for w in words if len(w) <= 2)
    alpha_ratio = sum(ch.isalpha() for ch in text) / max(1, len(text))
    return alpha_ratio < 0.45 or very_short / len(words) > 0.65


def _strip_json_fence(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:]
    return raw.strip()
