import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session

from app.db.models import get_db, Project, Source
from app.api.schemas import SourceResponse, AddUrlSourceRequest
from app.core.config import settings
from app.services.ingestion import ingest_source
from app.services.vector_store import delete_source_chunks

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects/{project_id}/sources", tags=["sources"])

ALLOWED_EXTENSIONS = {
    ".pdf": "pdf",
    ".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image",
    ".txt": "text", ".md": "text",
    ".docx": "docx",
    ".xlsx": "xlsx",
    ".json": "json",
    ".csv": "csv", ".tsv": "csv",
}


def _run_ingestion(db_url_kwargs, project_id: str, source_id: str, kind: str, name: str, file_path: str | None):
    """Runs in a background task; opens its own DB session."""
    from app.db.models import SessionLocal
    db = SessionLocal()
    try:
        source = db.get(Source, source_id)
        if not source:
            return
        try:
            chunk_count = ingest_source(project_id, source_id, kind, name, file_path)
            source.status = "ingested"
            source.chunk_count = chunk_count
            source.error = ""
        except Exception as e:
            logger.exception(f"Ingestion failed for source {source_id}")
            source.status = "failed"
            source.error = str(e)[:500]
        db.commit()
    finally:
        db.close()


@router.post("/upload", response_model=SourceResponse)
async def upload_source(
    project_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type: {ext}. Allowed: {list(ALLOWED_EXTENSIONS.keys())}")
    kind = ALLOWED_EXTENSIONS[ext]

    contents = await file.read()
    if len(contents) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(400, f"File too large (max {settings.max_upload_mb}MB)")

    source = Source(project_id=project_id, kind=kind, name=file.filename, status="pending")
    db.add(source)
    db.commit()
    db.refresh(source)

    project_upload_dir = settings.upload_dir / project_id
    project_upload_dir.mkdir(parents=True, exist_ok=True)
    dest_path = project_upload_dir / f"{source.id}_{file.filename}"
    with open(dest_path, "wb") as f:
        f.write(contents)

    background_tasks.add_task(_run_ingestion, {}, project_id, source.id, kind, file.filename, str(dest_path))

    return source


@router.post("/url", response_model=SourceResponse)
def add_url_source(
    project_id: str,
    req: AddUrlSourceRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    if not req.url.strip().startswith(("http://", "https://")):
        raise HTTPException(400, "URL must start with http:// or https://")

    source = Source(project_id=project_id, kind="url", name=req.url.strip(), status="pending")
    db.add(source)
    db.commit()
    db.refresh(source)

    background_tasks.add_task(_run_ingestion, {}, project_id, source.id, "url", req.url.strip(), None)

    return source


@router.get("", response_model=list[SourceResponse])
def list_sources(project_id: str, db: Session = Depends(get_db)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project.sources


@router.get("/{source_id}/status", response_model=SourceResponse)
def get_source_status(project_id: str, source_id: str, db: Session = Depends(get_db)):
    source = db.get(Source, source_id)
    if not source or source.project_id != project_id:
        raise HTTPException(404, "Source not found")
    return source


@router.delete("/{source_id}")
def delete_source(project_id: str, source_id: str, db: Session = Depends(get_db)):
    source = db.get(Source, source_id)
    if not source or source.project_id != project_id:
        raise HTTPException(404, "Source not found")
    db.delete(source)
    db.commit()
    delete_source_chunks(project_id, source_id)
    return {"deleted": True}
