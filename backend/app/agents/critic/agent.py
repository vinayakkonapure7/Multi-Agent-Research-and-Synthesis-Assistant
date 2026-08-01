import json
import logging

from app.agents.schemas import CriticBundle, EvidenceItem, SummaryBundle
from app.core.config import settings
from app.services.llm_client import chat

logger = logging.getLogger(__name__)

CRITIC_PROMPT = """You are the Critic Agent in a research synthesis workflow.

Evaluate the Summarizer Agent's key claims against the retrieved evidence. Flag unsupported
claims, contradictions, weak source coverage, and citation gaps. The goal is not to block
reasonable research; it is to prevent hallucinated or fake claims from reaching the Writer.

Return ONLY valid JSON:
{
  "status": "approved | warning | rejected",
  "report": "short review summary for the human reviewer",
  "unsupported_claims": ["claim", "..."]
}
"""


def run_critic(topic: str, summary: SummaryBundle, evidence: list[EvidenceItem]) -> CriticBundle:
    if not evidence:
        return CriticBundle(
            status="warning",
            report="No evidence is available. Drafting may continue only as a conceptual outline, without factual claims or citations.",
            unsupported_claims=[],
        )
    if not settings.openai_api_key:
        return CriticBundle(
            status="warning",
            report="OPENAI_API_KEY is not configured, so only retrieval-level validation was completed.",
            unsupported_claims=[],
        )

    evidence_names = "\n".join(f"- {item.source_name}: {item.content[:500]}" for item in evidence[:12])
    raw = chat(
        messages=[
            {"role": "system", "content": CRITIC_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Topic: {topic}\n\nResearch brief:\n{summary.research_brief}\n\n"
                    f"Key claims:\n{json.dumps(summary.key_claims, indent=2)}\n\nEvidence:\n{evidence_names}"
                ),
            },
        ],
        model=settings.openai_model,
        temperature=0.0,
        max_tokens=1000,
    )
    try:
        return CriticBundle(**json.loads(_strip_json_fence(raw)))
    except Exception:
        logger.warning("Critic JSON parse failed; returning warning. Raw=%s", raw)
        return CriticBundle(status="warning", report=raw.strip(), unsupported_claims=[])


def _strip_json_fence(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:]
    return raw.strip()
