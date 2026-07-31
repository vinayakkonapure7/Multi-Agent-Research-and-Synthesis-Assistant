from pydantic import BaseModel, Field


class OutlineSectionSchema(BaseModel):
    title: str
    word_target: int = 300
    notes: str = ""  # short description of what goes in this section


class OutlineSchema(BaseModel):
    sections: list[OutlineSectionSchema]


class EvidenceItem(BaseModel):
    source_name: str
    url: str = ""
    content: str
    kind: str = "web"
    retrieval_method: str = ""


class ResearchValidation(BaseModel):
    status: str = Field(default="warning", description="approved | warning | rejected")
    message: str = ""


class ResearchBundle(BaseModel):
    validation: ResearchValidation
    evidence: list[EvidenceItem] = []
    rag_evidence: list[EvidenceItem] = []
    web_evidence: list[EvidenceItem] = []


class SummaryBundle(BaseModel):
    research_brief: str
    key_claims: list[str] = []


class CriticBundle(BaseModel):
    status: str = "warning"
    report: str = ""
    unsupported_claims: list[str] = []
