"""
The core human-in-the-loop loop your project is built around:

  POST /sections/{id}/draft       -> generate first draft, status -> awaiting_review
  GET  /sections/{id}/versions    -> see all attempts (for comparing regenerations)
  POST /sections/{id}/regenerate  -> redraft with user feedback, status stays awaiting_review
  POST /sections/{id}/approve     -> lock in latest version as final, status -> approved
  POST /sections/{id}/edit        -> user directly edits the approved/draft text by hand

Each step is independent and synchronous (no websockets needed) — the frontend
calls draft, shows it, and only calls approve/regenerate after the user acts.
"""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.models import get_db, Section, SectionVersion, Project
from app.api.schemas import (
    DraftSectionRequest, RegenerateSectionRequest, SectionResponse, SectionVersionResponse
)
from app.agents.section_agent import draft_section

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sections", tags=["sections"])


def _latest_version(section: Section) -> SectionVersion | None:
    return section.versions[-1] if section.versions else None


@router.post("/{section_id}/draft", response_model=SectionVersionResponse)
def draft(section_id: str, req: DraftSectionRequest, db: Session = Depends(get_db)):
    section = db.get(Section, section_id)
    if not section:
        raise HTTPException(404, "Section not found")
    project = db.get(Project, section.project_id)

    if req.instructions:
        section.instructions = req.instructions

    section.status = "drafting"
    db.commit()

    content, citations = draft_section(
        topic=project.topic,
        context=project.context,
        section_title=section.title,
        section_notes=section.instructions,
        word_target=section.word_target,
        project_id=project.id,
        research_brief=project.research_brief,
        critic_report=project.critic_report,
        user_instructions=section.instructions,
        use_web_search=req.use_web_search,
        use_rag=req.use_rag,
    )

    version = SectionVersion(
        section_id=section.id,
        content=content,
        citations=json.dumps(citations),
    )
    db.add(version)
    section.status = "awaiting_review"
    db.commit()
    db.refresh(version)
    return version


@router.post("/{section_id}/regenerate", response_model=SectionVersionResponse)
def regenerate(section_id: str, req: RegenerateSectionRequest, db: Session = Depends(get_db)):
    section = db.get(Section, section_id)
    if not section:
        raise HTTPException(404, "Section not found")
    project = db.get(Project, section.project_id)

    prev = _latest_version(section)
    if not prev:
        raise HTTPException(400, "No previous draft to regenerate from — call /draft first")

    content, citations = draft_section(
        topic=project.topic,
        context=project.context,
        section_title=section.title,
        section_notes=section.instructions,
        word_target=section.word_target,
        project_id=project.id,
        research_brief=project.research_brief,
        critic_report=project.critic_report,
        user_instructions=section.instructions,
        feedback=req.feedback,
        previous_content=prev.content,
        use_web_search=req.use_web_search,
        use_rag=req.use_rag,
    )

    version = SectionVersion(
        section_id=section.id,
        content=content,
        citations=json.dumps(citations),
        feedback=req.feedback,
    )
    db.add(version)
    section.status = "awaiting_review"
    db.commit()
    db.refresh(version)
    return version


@router.get("/{section_id}/versions", response_model=list[SectionVersionResponse])
def list_versions(section_id: str, db: Session = Depends(get_db)):
    section = db.get(Section, section_id)
    if not section:
        raise HTTPException(404, "Section not found")
    return section.versions


@router.post("/{section_id}/approve", response_model=SectionResponse)
def approve(section_id: str, db: Session = Depends(get_db)):
    """Locks in the LATEST version's content as the section's final approved content."""
    section = db.get(Section, section_id)
    if not section:
        raise HTTPException(404, "Section not found")

    latest = _latest_version(section)
    if not latest:
        raise HTTPException(400, "No draft exists yet to approve")

    section.approved_content = latest.content
    section.status = "approved"
    db.commit()
    db.refresh(section)

    _maybe_mark_project_complete(section.project_id, db)
    return section


class EditApprovedRequest:
    pass  # placeholder type hint helper (actual schema below via inline body)


@router.post("/{section_id}/edit", response_model=SectionResponse)
def edit_approved(section_id: str, payload: dict, db: Session = Depends(get_db)):
    """
    Lets the user hand-edit the text directly (e.g. fixing a small typo)
    without going through a full LLM regeneration. Body: {"content": "..."}
    """
    section = db.get(Section, section_id)
    if not section:
        raise HTTPException(404, "Section not found")

    new_content = payload.get("content", "")
    if not new_content.strip():
        raise HTTPException(400, "Content cannot be empty")

    section.approved_content = new_content
    section.status = "approved"
    db.commit()
    db.refresh(section)
    return section


def _maybe_mark_project_complete(project_id: str, db: Session):
    project = db.get(Project, project_id)
    if project and all(s.status == "approved" for s in project.sections) and project.sections:
        project.status = "completed"
        db.commit()
