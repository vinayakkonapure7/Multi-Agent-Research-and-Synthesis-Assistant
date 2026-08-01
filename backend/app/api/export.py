import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db.models import get_db, Project
from app.services.export_service import build_docx

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects/{project_id}/export", tags=["export"])


@router.get("")
def export_report(project_id: str, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    approved_sections = [s for s in project.sections if s.status == "approved" and s.approved_content.strip()]
    if not approved_sections:
        raise HTTPException(400, "No approved sections yet — approve at least one section before exporting")

    sections_payload = [{"title": s.title, "content": s.approved_content} for s in approved_sections]
    path = build_docx(project.topic, sections_payload, project_id)

    return FileResponse(
        path=str(path),
        filename=path.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
