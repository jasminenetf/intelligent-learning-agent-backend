"""LangGraph multi-agent tutor workflow.

5-agent pipeline:
  supervisor → profile → rag → lecture → verifier → END
"""

from typing import Optional

from langgraph.graph import StateGraph, END
from sqlmodel import Session

from app.models.user import User
from app.services.llm_provider import get_llm_provider
from app.services.prompt_builder import build_rag_prompt
from app.services.rag_service import search_course

MAX_TUTOR_TOP_K = 10


class AgentState(dict):
    course_id: int
    course_name: Optional[str]
    question: str
    top_k: int
    user_id: int
    user_role: str
    intent: Optional[str]
    student_profile: dict
    retrieved_chunks: list[dict]
    citations: list[dict]
    draft_answer: Optional[str]
    verified_answer: Optional[str]
    verification: dict
    agent_trace: list[dict]
    error: Optional[str]


def _trace(state: AgentState, agent: str, **kwargs):
    entry = {"agent": agent}
    entry.update(kwargs)
    state.setdefault("agent_trace", []).append(entry)


def supervisor_node(state: AgentState) -> AgentState:
    state["intent"] = "course_tutoring"
    state["top_k"] = min(state.get("top_k", 5), MAX_TUTOR_TOP_K)
    state["agent_trace"] = []
    state["student_profile"] = {}
    state["retrieved_chunks"] = []
    state["citations"] = []
    state["draft_answer"] = None
    state["verified_answer"] = None
    state["verification"] = {}
    state["error"] = None
    _trace(state, "supervisor", status="dispatched", intent="course_tutoring")
    return state


def profile_node(state: AgentState) -> AgentState:
    q = state.get("question", "").lower()

    # Knowledge level
    if any(w in q for w in ["不懂", "不会", "基础比较差", "基础很差", "基础差", "简单", "初学", "入门"]):
        level = "beginner"
    elif any(w in q for w in ["证明", "推导", "深入", "原理", "为什么"]):
        level = "advanced"
    else:
        level = "intermediate"

    # Cognitive style
    if any(w in q for w in ["证明", "推导", "为什么", "逻辑"]):
        style = "logical"
    elif any(w in q for w in ["例题", "怎么做", "练习", "做题", "应用"]):
        style = "practice_oriented"
    else:
        style = "conceptual"

    profile = {
        "knowledge_level": level,
        "cognitive_style": style,
        "needs_examples": style == "practice_oriented",
        "needs_step_by_step": level == "beginner" or "步骤" in q,
        "detected_weakness": "",
    }
    state["student_profile"] = profile
    _trace(state, "profile", status="profiled", **profile)
    return state


def rag_node(state: AgentState, session: Session) -> AgentState:
    cid = state["course_id"]
    result = search_course(cid, state["question"], state["top_k"], session)
    if "error" in result:
        state["error"] = result["error"]
        _trace(state, "rag", status="failed", error=result["error"])
        return state

    chunks = result.get("results", [])
    state["retrieved_chunks"] = chunks
    state["citations"] = [
        {
            "chunk_id": c.get("chunk_id"),
            "source": c.get("source"),
            "page_number": c.get("page_number"),
            "score": c.get("score"),
        }
        for c in chunks
    ]
    _trace(state, "rag", status="retrieved", chunks_found=len(chunks))
    return state


def lecture_node(state: AgentState) -> AgentState:
    if state.get("error"):
        _trace(state, "lecture", status="skipped", reason=state["error"])
        state["draft_answer"] = ""
        return state

    chunks = state.get("retrieved_chunks", [])
    if not chunks:
        _trace(state, "lecture", status="skipped", reason="no chunks")
        state["draft_answer"] = ""
        return state

    course_name = state.get("course_name", "")
    messages = build_rag_prompt(
        question=state["question"],
        chunks=chunks,
        course_name=course_name,
    )

    # Inject student profile into system message
    profile = state.get("student_profile", {})
    if profile:
        profile_hint = (
            f"\n学生画像：知识水平={profile.get('knowledge_level','intermediate')}，"
            f"认知风格={profile.get('cognitive_style','conceptual')}。"
            f"请根据学生水平调整回答深度。"
        )
        messages[0]["content"] += profile_hint

    provider = get_llm_provider()
    resp = provider.generate(messages)
    state["draft_answer"] = resp.content
    _trace(state, "lecture", status="generated", answer_len=len(resp.content))
    return state


def verifier_node(state: AgentState) -> AgentState:
    draft = state.get("draft_answer", "")
    citations = state.get("citations", [])
    chunks = state.get("retrieved_chunks", [])
    reasons = []

    checks = [
        (bool(draft), "draft_answer is not empty"),
        (bool(citations), "citations is not empty"),
        (bool(chunks), "retrieved_chunks is not empty"),
        ("根据教材原文" not in draft, "does not claim PDF source improperly"),
    ]
    all_ok = True
    for ok, msg in checks:
        if not ok:
            reasons.append(f"FAIL: {msg}")
            all_ok = False
        else:
            reasons.append(f"PASS: {msg}")

    if all_ok:
        state["verified_answer"] = draft
        state["verification"] = {"verdict": "passed", "reasons": reasons}
        _trace(state, "verifier", status="passed")
    else:
        state["verified_answer"] = "当前课程资料不足以生成可靠回答。"
        state["verification"] = {"verdict": "failed", "reasons": reasons}
        _trace(state, "verifier", status="failed")
    return state


_current_session: Optional[Session] = None


def _rag_node_wrapper(state: AgentState) -> AgentState:
    return rag_node(state, _current_session)


def _build_graph():
    g = StateGraph(AgentState)
    g.add_node("supervisor", supervisor_node)
    g.add_node("profile", profile_node)
    g.add_node("rag", _rag_node_wrapper)
    g.add_node("lecture", lecture_node)
    g.add_node("verifier", verifier_node)

    g.set_entry_point("supervisor")
    g.add_edge("supervisor", "profile")
    g.add_edge("profile", "rag")
    g.add_edge("rag", "lecture")
    g.add_edge("lecture", "verifier")
    g.add_edge("verifier", END)

    return g.compile()


_tutor_graph = _build_graph()


def run_tutor_graph(
    course_id: int,
    course_name: Optional[str],
    question: str,
    top_k: int,
    session: Session,
    user: Optional[User] = None,
) -> AgentState:
    global _current_session
    _current_session = session
    try:
        uid = int(user.id) if (user and user.id) else 0
        role = user.role if user else "student"
        state: AgentState = {
            "course_id": course_id,
            "course_name": course_name,
            "question": question,
            "top_k": min(top_k, MAX_TUTOR_TOP_K),
            "user_id": uid,
            "user_role": role,
        }
        return _tutor_graph.invoke(state)
    finally:
        _current_session = None
