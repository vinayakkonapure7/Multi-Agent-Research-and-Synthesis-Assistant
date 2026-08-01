"""
Step 1 of the human-in-the-loop flow: propose a report OUTLINE (headings only,
no content) based on the topic + any uploaded sources, for the user to edit
and approve before any section gets drafted.

This avoids the wasted-effort case of generating full sections for headings
the user didn't actually want.
"""
import json
import logging

from app.services.llm_client import chat
from app.core.config import settings

logger = logging.getLogger(__name__)

DEFAULT_RESEARCH_PAPER_OUTLINE = [
    {"title": "Title", "word_target": 20, "notes": "Research-paper title aligned to the approved topic."},
    {"title": "Abstract", "word_target": 200, "notes": "150-250 words summarizing purpose, method, findings, and contribution."},
    {"title": "Keywords", "word_target": 40, "notes": "4-8 keywords."},
    {"title": "1. Introduction", "word_target": 750, "notes": "600-900 words covering background, problem statement, objectives, and contributions."},
    {"title": "2. Literature Review", "word_target": 950, "notes": "700-1200 words covering existing methods and research gap."},
    {"title": "3. Proposed Methodology", "word_target": 1200, "notes": "900-1600 words covering architecture, agent components, workflow, and algorithms."},
    {"title": "4. Experimental Setup", "word_target": 450, "notes": "300-600 words covering development environment, software configuration, and hardware configuration."},
    {"title": "5. Results", "word_target": 800, "notes": "600-1000 words covering performance evaluation and comparative analysis."},
    {"title": "6. Discussion", "word_target": 500, "notes": "350-700 words interpreting findings and implications."},
    {"title": "7. Limitations", "word_target": 180, "notes": "100-250 words describing constraints and weaknesses."},
    {"title": "8. Future Work", "word_target": 180, "notes": "100-250 words describing possible improvements."},
    {"title": "9. Conclusion", "word_target": 260, "notes": "180-350 words summarizing the paper."},
    {"title": "References", "word_target": 0, "notes": "Minimum 15 verified research-paper/book sources in MLA format when evidence is available."},
]

OUTLINE_SYSTEM_PROMPT = """You are an expert research-paper architect helping a student \
plan the structure of an academic/technical research report.

Start from the required CDAC/SRS structure:
Title, Abstract, Keywords, Introduction, Literature Review, Proposed Methodology,
Experimental Setup, Results, Discussion, Limitations, Future Work, Conclusion, References.

You may adapt subpoint notes to the research topic, but keep the main sections unless the
topic truly requires an additional section. Do not write section content yet.

Respond ONLY with valid JSON matching this exact schema, nothing else:
{
  "sections": [
    {"title": "string", "word_target": integer, "notes": "one-sentence description of what this section should cover"}
  ]
}

Use these target ranges:
Abstract 150-250; Introduction 600-900; Literature Review 700-1200;
Proposed Methodology 900-1600; Experimental Setup 300-600; Results 600-1000;
Discussion 350-700; Limitations 100-250; Future Work 100-250; Conclusion 180-350.
"""


def generate_outline(topic: str, source_summary: str = "", context: str = "") -> list[dict]:
    if not settings.openai_api_key:
        return DEFAULT_RESEARCH_PAPER_OUTLINE

    user_prompt = f"Research topic: {topic}\nContext from user: {context or '(none)'}\n"
    if source_summary:
        user_prompt += f"\nResearch brief and source material:\n{source_summary}\n"
    user_prompt += "\nPropose the outline now."

    raw = chat(
        messages=[
            {"role": "system", "content": OUTLINE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        model=settings.openai_model_strong,
        temperature=0.3,
        max_tokens=1200,
    )

    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        parsed = json.loads(raw)
        return _normalize_outline(parsed["sections"])
    except (json.JSONDecodeError, KeyError) as e:
        logger.error(f"Failed to parse outline JSON: {e}\nRaw: {raw}")
        return DEFAULT_RESEARCH_PAPER_OUTLINE


def _normalize_outline(sections: list[dict]) -> list[dict]:
    if not sections:
        return DEFAULT_RESEARCH_PAPER_OUTLINE
    titles = " ".join(str(s.get("title", "")).lower() for s in sections)
    required = ["abstract", "introduction", "literature", "methodology", "results", "conclusion", "references"]
    if not all(key in titles for key in required):
        return DEFAULT_RESEARCH_PAPER_OUTLINE
    return sections
