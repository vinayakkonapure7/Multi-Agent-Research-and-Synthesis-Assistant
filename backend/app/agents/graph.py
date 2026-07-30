from typing import TypedDict

from app.agents.critic import run_critic
from app.agents.researcher import run_researcher
from app.agents.schemas import CriticBundle, EvidenceItem, ResearchValidation, SummaryBundle
from app.agents.summarizer import run_summarizer

try:
    from langgraph.graph import END, StateGraph
except Exception:  # pragma: no cover - optional until dependencies are installed
    END = None
    StateGraph = None


class ResearchState(TypedDict, total=False):
    topic: str
    context: str
    project_id: str
    validation: ResearchValidation
    evidence: list[EvidenceItem]
    summary: SummaryBundle
    critic: CriticBundle


def run_research_checkpoint(topic: str, context: str, project_id: str) -> dict:
    """
    Researcher -> Summarizer -> Critic -> HITL checkpoint.
    The actual human approval happens in the frontend before section drafting.
    """
    initial: ResearchState = {"topic": topic, "context": context, "project_id": project_id}
    if StateGraph is None:
        state = _research_node(initial)
        if state["validation"].status == "rejected":
            return _serialize_state(state)
        state = _summarizer_node(state)
        state = _critic_node(state)
        return _serialize_state(state)

    graph = StateGraph(ResearchState)
    graph.add_node("researcher_agent", _research_node)
    graph.add_node("summarizer_agent", _summarizer_node)
    graph.add_node("critic_agent", _critic_node)
    graph.set_entry_point("researcher_agent")
    graph.add_conditional_edges("researcher_agent", _after_researcher, {"continue": "summarizer_agent", "stop": END})
    graph.add_edge("summarizer_agent", "critic_agent")
    graph.add_edge("critic_agent", END)
    compiled = graph.compile()
    return _serialize_state(compiled.invoke(initial))


def _research_node(state: ResearchState) -> ResearchState:
    bundle = run_researcher(state["topic"], state.get("context", ""), state["project_id"])
    state["validation"] = bundle.validation
    state["evidence"] = bundle.evidence
    return state


def _summarizer_node(state: ResearchState) -> ResearchState:
    state["summary"] = run_summarizer(state["topic"], state.get("context", ""), state.get("evidence", []))
    return state


def _critic_node(state: ResearchState) -> ResearchState:
    state["critic"] = run_critic(state["topic"], state["summary"], state.get("evidence", []))
    return state


def _after_researcher(state: ResearchState) -> str:
    return "stop" if state["validation"].status == "rejected" else "continue"


def _serialize_state(state: ResearchState) -> dict:
    validation = state.get("validation") or ResearchValidation(status="warning", message="Validation did not run.")
    summary = state.get("summary") or SummaryBundle(research_brief="")
    critic = state.get("critic") or CriticBundle(status=validation.status, report=validation.message)
    return {
        "validation_status": validation.status,
        "validation_message": validation.message,
        "research_brief": summary.research_brief,
        "critic_report": critic.report,
        "sources": [
            {
                "source_name": item.source_name,
                "url": item.url,
                "kind": item.kind,
                "retrieval_method": item.retrieval_method,
                "excerpt": (item.content or "")[:400],
            }
            for item in state.get("evidence", [])
        ],
    }
