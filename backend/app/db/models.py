"""
SQLite schema via SQLAlchemy ORM.

Core idea:
- Project = one report-building session (one research topic)
- Section = one outline item (Abstract, Introduction, ...), holds current status
- SectionVersion = every draft generated for a section (so "regenerate" keeps history)
- Source = an uploaded file or URL attached to a project, used for RAG
"""
import uuid
import datetime as dt
from sqlalchemy import (
    create_engine, Column, String, Integer, Text, DateTime, ForeignKey, Boolean
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

from app.core.config import settings

Base = declarative_base()


def gen_id() -> str:
    return uuid.uuid4().hex[:12]


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=gen_id)
    topic = Column(Text, nullable=False)
    context = Column(Text, default="")
    status = Column(String, default="outline_pending")
    # outline_pending -> outline_approved -> drafting -> completed
    validation_status = Column(String, default="pending")
    validation_message = Column(Text, default="")
    research_brief = Column(Text, default="")
    critic_report = Column(Text, default="")
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    sections = relationship("Section", back_populates="project", cascade="all, delete-orphan",
                             order_by="Section.order_index")
    sources = relationship("Source", back_populates="project", cascade="all, delete-orphan")


class Section(Base):
    __tablename__ = "sections"

    id = Column(String, primary_key=True, default=gen_id)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    title = Column(String, nullable=False)
    order_index = Column(Integer, nullable=False)
    status = Column(String, default="pending")
    # pending -> drafting -> awaiting_review -> approved
    instructions = Column(Text, default="")   # user's custom guidance for this section
    approved_content = Column(Text, default="")
    word_target = Column(Integer, default=300)

    project = relationship("Project", back_populates="sections")
    versions = relationship("SectionVersion", back_populates="section", cascade="all, delete-orphan",
                             order_by="SectionVersion.created_at")


class SectionVersion(Base):
    __tablename__ = "section_versions"

    id = Column(String, primary_key=True, default=gen_id)
    section_id = Column(String, ForeignKey("sections.id"), nullable=False)
    content = Column(Text, nullable=False)
    citations = Column(Text, default="[]")  # JSON list of {source, url/title}
    feedback = Column(Text, default="")     # user feedback that triggered regeneration (if any)
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    section = relationship("Section", back_populates="versions")


class Source(Base):
    __tablename__ = "sources"

    id = Column(String, primary_key=True, default=gen_id)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    kind = Column(String, nullable=False)   # pdf | image | text | url
    name = Column(String, nullable=False)   # filename or URL
    status = Column(String, default="pending")  # pending -> ingested -> failed
    chunk_count = Column(Integer, default=0)
    error = Column(Text, default="")
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    project = relationship("Project", back_populates="sources")


engine = create_engine(
    f"sqlite:///{settings.sqlite_path}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def init_db():
    Base.metadata.create_all(bind=engine)
    _ensure_project_columns()


def _ensure_project_columns():
    """Lightweight SQLite migration for local demo databases created by older builds."""
    with engine.begin() as conn:
        existing = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(projects)").fetchall()}
        migrations = {
            "context": "ALTER TABLE projects ADD COLUMN context TEXT DEFAULT ''",
            "validation_status": "ALTER TABLE projects ADD COLUMN validation_status VARCHAR DEFAULT 'pending'",
            "validation_message": "ALTER TABLE projects ADD COLUMN validation_message TEXT DEFAULT ''",
            "research_brief": "ALTER TABLE projects ADD COLUMN research_brief TEXT DEFAULT ''",
            "critic_report": "ALTER TABLE projects ADD COLUMN critic_report TEXT DEFAULT ''",
        }
        for column, sql in migrations.items():
            if column not in existing:
                conn.exec_driver_sql(sql)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
