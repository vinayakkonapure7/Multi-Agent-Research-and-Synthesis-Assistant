import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.models import get_db, Project, Section
from app.api.schemas import (
    CreateProjectRequest,
    ProjectResponse,
    ApproveOutlineRequest,
    SectionResponse,
    ResearchCheckpointResponse,
)
from app.agents.graph import run_research_checkpoint
from app.agents.outline_agent import generate_outline
from app.services.vector_store import delete_project_collection

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse)
def create_project(req: CreateProjectRequest, db: Session = Depends(get_db)):
    if not req.topic.strip():
        raise HTTPException(400, "Topic cannot be empty")
    project = Project(topic=req.topic.strip(), context=req.context.strip())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.post("/{project_id}/generate-outline")
def propose_outline(project_id: str, db: Session = Depends(get_db)):
    """
    Generates a PROPOSED outline (not saved as Sections yet). The frontend
    shows this for the user to edit, then calls /approve-outline to persist it.
    """
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    checkpoint = _run_and_store_checkpoint(project, db)
    if checkpoint["validation_status"] == "rejected":
        raise HTTPException(422, checkpoint["validation_message"])

    outline = generate_outline(
        project.topic,
        source_summary=checkpoint["research_brief"],
        context=project.context,
    )
    return {"sections": outline, "checkpoint": checkpoint}


@router.post("/{project_id}/research-checkpoint", response_model=ResearchCheckpointResponse)
def research_checkpoint(project_id: str, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return _run_and_store_checkpoint(project, db)


@router.post("/{project_id}/approve-outline", response_model=list[SectionResponse])
def approve_outline(project_id: str, req: ApproveOutlineRequest, db: Session = Depends(get_db)):
    """
    Persists the user-edited outline as Section rows in order, and flips
    the project into 'outline_approved' so drafting can begin.
    """
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    if not req.sections:
        raise HTTPException(400, "Outline must have at least one section")

    # Wipe any existing sections (e.g. if user regenerated the outline after editing once)
    for s in list(project.sections):
        db.delete(s)
    db.flush()

    created = []
    for i, sec in enumerate(req.sections):
        section = Section(
            project_id=project_id,
            title=sec.title.strip(),
            order_index=i,
            word_target=sec.word_target,
            instructions=sec.notes,
            status="pending",
        )
        db.add(section)
        created.append(section)

    project.status = "outline_approved"
    db.commit()
    for s in created:
        db.refresh(s)
    return created


@router.get("/{project_id}/sections", response_model=list[SectionResponse])
def list_sections(project_id: str, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project.sections


@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    db.delete(project)
    db.commit()
    delete_project_collection(project_id)
    return {"deleted": True}


def _run_and_store_checkpoint(project: Project, db: Session) -> dict:
    checkpoint = run_research_checkpoint(project.topic, project.context, project.id)
    project.validation_status = checkpoint["validation_status"]
    project.validation_message = checkpoint["validation_message"]
    project.research_brief = checkpoint["research_brief"]
    project.critic_report = checkpoint["critic_report"]
    db.commit()
    return checkpoint
