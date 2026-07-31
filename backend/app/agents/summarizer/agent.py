import json
import logging

from app.agents.schemas import EvidenceItem, SummaryBundle
from app.core.config import settings
from app.services.llm_client import chat

logger = logging.getLogger(__name__)

SUMMARY_PROMPT = """You are the Summarizer Agent.

Condense retrieved web and uploaded-document evidence into a writer-ready research brief.
Remove noise, duplicate claims, boilerplate, and unsupported detail. Preserve source names
beside important claims so the Writer and Critic can keep the paper grounded.

Return ONLY valid JSON in exactly this shape:
{
  "research_brief": "A single string of flowing prose. Multiple paragraphs are
   fine, separated by \\n\\n. This value MUST be a string — never a nested
   object, never a list.",
  "key_claims": ["claim with source name", "..."]
}
"""


def run_summarizer(topic: str, context: str, evidence: list[EvidenceItem]) -> SummaryBundle:
    if not evidence:
        return SummaryBundle(
            research_brief=(
                "No retrieved evidence is available yet. The writer must stay conceptual and avoid "
                "specific studies, statistics, or citations until sources are added."
            ),
            key_claims=[],
        )

    evidence_block = "\n\n".join(
        f"[{idx + 1}] {item.source_name} ({item.kind}; {item.retrieval_method})\n{item.content[:1800]}"
        for idx, item in enumerate(evidence[:14])
    )

    if not settings.openai_api_key:
        brief = "\n".join(f"- {item.source_name}: {item.content[:350]}" for item in evidence[:8])
        return SummaryBundle(research_brief=brief, key_claims=[])

    raw = chat(
        messages=[
            {"role": "system", "content": SUMMARY_PROMPT},
            {
                "role": "user",
                "content": f"Topic: {topic}\nContext: {context or '(none)'}\n\nEvidence:\n{evidence_block}",
            },
        ],
        model=settings.openai_model,
        temperature=0.2,
        max_tokens=1600,
    )
    try:
        parsed = json.loads(_strip_json_fence(raw))
        brief = _flatten_brief(parsed.get("research_brief", "") if isinstance(parsed, dict) else parsed)
        key_claims = parsed.get("key_claims") if isinstance(parsed, dict) else None
        if not isinstance(key_claims, list):
            key_claims = []
        return SummaryBundle(research_brief=brief, key_claims=key_claims)
    except Exception:
        logger.warning("Summary JSON parse failed; returning raw brief. Raw=%s", raw)
        return SummaryBundle(research_brief=raw.strip(), key_claims=[])


def _strip_json_fence(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:]
    return raw.strip()


def _title_case_key(key: str) -> str:
    return key.replace("_", " ").replace("-", " ").title()


def _stringify_value(value) -> str:
    if isinstance(value, dict):
        return " ".join(
            f"{_title_case_key(k)} — {_stringify_value(v)}" for k, v in value.items()
        )
    if isinstance(value, list):
        return ", ".join(_stringify_value(item) for item in value)
    return str(value)


def _flatten_brief(value) -> str:
    """
    The model is asked for research_brief as a plain string, but sometimes
    returns a nested object or list instead. Flatten whatever shape shows up
    into readable prose rather than failing validation on it.
    """
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        paragraphs = [
            f"{_title_case_key(key)}: {_stringify_value(val)}"
            for key, val in value.items()
        ]
        return "\n\n".join(paragraphs)
    if isinstance(value, list):
        return "\n\n".join(_stringify_value(item) for item in value)
    return str(value)
