import logging

from app.core.config import settings
from app.services.llm_client import chat
from app.services.vector_store import query_project_multi
from app.services.web_search import web_search

logger = logging.getLogger(__name__)

WRITER_SYSTEM_PROMPT = """You are the Writer Agent for an academic research-paper assistant.

Rules:
- Write ONLY the requested section. Do not include other sections.
- Follow the section word target closely (+/- 15%) unless the target is 0.
- Use the research brief, critic report, uploaded-source excerpts, and web evidence as grounding.
- Do not invent research papers, books, statistics, datasets, authors, dates, or citations.
- If evidence is weak, explicitly keep the writing conceptual and avoid unsupported specifics.
- Use an academic but readable tone.
- For References, include only verified research papers and books present in the evidence.
- Format References consistently in MLA style when enough metadata is present.
"""

SECTION_RULES = {
    "abstract": "150-250 words; summarize purpose, method, result direction, and contribution.",
    "keywords": "4-8 comma-separated keywords only.",
    "introduction": "600-900 words with background, problem statement, objectives, and contributions.",
    "literature review": "700-1200 words; compare existing methods and clearly state the research gap.",
    "proposed methodology": "900-1600 words; cover architecture, design, workflow, and algorithms.",
    "experimental setup": "300-600 words; cover development environment, software configuration, and hardware configuration.",
    "results": "600-1000 words; cover performance evaluation and comparative analysis without fabricating numbers.",
    "discussion": "350-700 words; interpret findings and tradeoffs.",
    "limitations": "100-250 words.",
    "future work": "100-250 words.",
    "conclusion": "180-350 words.",
    "references": "minimum 15 verified research-paper/book sources when available; MLA style.",
}


def draft_report_section(
    topic: str,
    context: str,
    section_title: str,
    section_notes: str,
    word_target: int,
    project_id: str,
    research_brief: str = "",
    critic_report: str = "",
    user_instructions: str = "",
    feedback: str = "",
    previous_content: str = "",
    use_web_search: bool = True,
    use_rag: bool = True,
) -> tuple[str, list[dict]]:
    rag_chunks = query_project_multi(project_id, f"{topic} {section_title}", n_results=8) if use_rag else []
    web_results = web_search(f"{topic} {section_title}", max_results=5) if use_web_search else []
    context_block = _build_context_block(rag_chunks, web_results)

    rule = _section_rule(section_title)
    prompt = f"""Research topic: {topic}
User context: {context or '(none provided)'}
Section to write: {section_title}
Section notes: {section_notes or '(none)'}
Target word count: ~{word_target} words
Non-negotiable section rule: {rule}

Research brief from Summarizer Agent:
{research_brief or '(not available yet)'}

Critic Agent report:
{critic_report or '(not available yet)'}
"""
    if user_instructions:
        prompt += f"\nUser instructions for this section:\n{user_instructions}\n"
    if feedback and previous_content:
        prompt += f"""
Previous draft:
---
{previous_content}
---
Human feedback:
{feedback}

Regenerate the section and apply this feedback directly.
"""
    prompt += f"\nEvidence context:\n{context_block}\n\nNow write only this section."

    content = chat(
        messages=[
            {"role": "system", "content": WRITER_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        model=settings.openai_model,
        temperature=0.45,
        max_tokens=2600,
    )

    citations = [{"source_name": c["source_name"], "url": ""} for c in rag_chunks]
    citations += [{"source_name": r["title"], "url": r["url"]} for r in web_results]
    return content.strip(), _dedupe_citations(citations)


def _build_context_block(rag_chunks: list[dict], web_results: list[dict]) -> str:
    parts = []
    if rag_chunks:
        parts.append("=== UPLOADED SOURCE EXCERPTS (hybrid semantic/BM25/MMR retrieval) ===")
        for c in rag_chunks:
            parts.append(f"[Source: {c['source_name']} | method: {c.get('retrieval_method', '')}]\n{c['text']}\n")
    if web_results:
        parts.append("=== WEB SEARCH AND SCRAPED SOURCES ===")
        for r in web_results:
            parts.append(f"[Source: {r['title']} ({r['url']})]\n{r['content']}\n")
    return "\n".join(parts) if parts else "(No evidence retrieved for this section.)"


def _section_rule(title: str) -> str:
    lowered = title.lower()
    for key, rule in SECTION_RULES.items():
        if key in lowered:
            return rule
    return "Use the approved outline notes and keep the section grounded in evidence."


def _dedupe_citations(citations: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for citation in citations:
        key = (citation.get("source_name", ""), citation.get("url", ""))
        if key in seen:
            continue
        seen.add(key)
        out.append(citation)
    return out
