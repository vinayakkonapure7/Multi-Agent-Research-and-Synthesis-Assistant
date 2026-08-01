from pydantic import BaseModel


class CreateProjectRequest(BaseModel):
    topic: str
    context: str = ""


class ProjectResponse(BaseModel):
    id: str
    topic: str
    context: str
    status: str
    validation_status: str
    validation_message: str
    research_brief: str
    critic_report: str

    class Config:
        from_attributes = True


class OutlineSectionIn(BaseModel):
    title: str
    word_target: int = 300
    notes: str = ""


class ApproveOutlineRequest(BaseModel):
    sections: list[OutlineSectionIn]


class SectionResponse(BaseModel):
    id: str
    title: str
    order_index: int
    status: str
    instructions: str
    word_target: int
    approved_content: str

    class Config:
        from_attributes = True


class DraftSectionRequest(BaseModel):
    instructions: str = ""          # optional custom guidance, only used on first draft
    use_web_search: bool = True
    use_rag: bool = True


class RegenerateSectionRequest(BaseModel):
    feedback: str
    use_web_search: bool = True
    use_rag: bool = True


class SectionVersionResponse(BaseModel):
    id: str
    content: str
    citations: str
    feedback: str

    class Config:
        from_attributes = True


class SourceResponse(BaseModel):
    id: str
    kind: str
    name: str
    status: str
    chunk_count: int
    error: str

    class Config:
        from_attributes = True


class AddUrlSourceRequest(BaseModel):
    url: str


class ResearchCheckpointResponse(BaseModel):
    validation_status: str
    validation_message: str
    research_brief: str
    critic_report: str
    sources: list[dict] = []
