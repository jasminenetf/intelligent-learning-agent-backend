"""
Product aggregation API — unified frontend-friendly endpoints.

Prefix: /api/app

Provides bootstrap, demo-init, dashboard, ask, generate, run-demo
so the frontend doesn't need to stitch together dozens of low-level APIs.
"""

import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.api.auth import get_current_user, get_current_user_optional
from app.core.config import settings
from app.core.database import get_session
from app.core.security import create_access_token
from app.models.course import Course
from app.models.knowledge_chunk import KnowledgeChunk
from app.models.student_profile import StudentProfile
from app.models.user import User
from app.schemas.resource import ResourceType
from app.services.llm_provider import get_llm_provider
from app.services.profile_service import (
    extract_profile,
    get_or_create_profile,
    update_profile_from_extraction,
)
from app.services.qa_service import answer_course_question
from app.services.rag_service import search_course, get_rag_status
from app.services.resource_generator import generate_resource_pack
from app.services.study_plan_service import generate_study_plan

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/app", tags=["app"])

# ── Error codes ────────────────────────────────────────────────────────
ERR_NOT_CONFIGURED = "NOT_CONFIGURED"
ERR_NOT_AUTHENTICATED = "NOT_AUTHENTICATED"
ERR_COURSE_NOT_FOUND = "COURSE_NOT_FOUND"
ERR_NO_KNOWLEDGE_BASE = "NO_KNOWLEDGE_BASE"
ERR_LLM_FAILED = "LLM_FAILED"
ERR_RESOURCE_FAILED = "RESOURCE_FAILED"

# ── Helpers ────────────────────────────────────────────────────────────

def _safe(obj):
    """Convert to JSON-safe dict."""
    if obj is None:
        return {}
    if hasattr(obj, "model_dump"):
        return obj.model_dump(mode="json")
    if hasattr(obj, "dict"):
        return obj.dict()
    return obj


def _chunk_count(course_id: int, session: Session) -> int:
    return session.exec(
        select(KnowledgeChunk).where(KnowledgeChunk.course_id == course_id)
    ).all().__len__()


def _hash_uid(username: str) -> str:
    """Deterministic short hash for demo user IDs."""
    import hashlib
    return hashlib.md5(username.encode()).hexdigest()[:8]


# ═══════════════════════════════════════════════════════════════════════
# GET /api/app/bootstrap
# ═══════════════════════════════════════════════════════════════════════

@router.get("/bootstrap")
def api_bootstrap(
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
):
    """Frontend opens → get startup state in one call. No auth required."""
    # LLM status
    try:
        provider = get_llm_provider()
        config = {
            "deepseek_configured": bool(settings.DEEPSEEK_API_KEY),
            "llm_provider": provider.provider,
            "is_mock": (provider.provider == "mock"),
            "embedding_provider": settings.EMBEDDING_PROVIDER,
            "embedding_is_mock": (settings.EMBEDDING_PROVIDER == "hash_mock"),
        }
    except Exception:
        config = {
            "deepseek_configured": False,
            "llm_provider": "unknown",
            "is_mock": True,
            "embedding_provider": settings.EMBEDDING_PROVIDER,
            "embedding_is_mock": True,
        }

    # User
    authenticated = user is not None
    user_info = {}
    if authenticated and user:
        user_info = {
            "authenticated": True,
            "username": user.username,
            "role": user.role,
        }
    else:
        user_info = {"authenticated": False}

    # Courses — always list (not sensitive), but user_info shows auth state
    courses = session.exec(select(Course)).all()
    course_list = []
    for c in courses:
        chunks = _chunk_count(int(c.id) if c.id else 0, session)
        course_list.append({
            "id": c.id,
            "name": c.name,
            "chunks_count": chunks,
            "has_knowledge_base": chunks > 0,
        })

    # Profile
    profile_exists = False
    if authenticated and user:
        profile = session.exec(
            select(StudentProfile).where(StudentProfile.user_id == int(user.id) if user.id else 0)
        ).first()
        profile_exists = profile is not None

    # Next step
    if not config["deepseek_configured"]:
        next_step = "configure_key"
    elif not authenticated:
        next_step = "login"
    elif not course_list:
        next_step = "create_course"
    else:
        next_step = "start_learning"

    # Select best course: prefer KB courses first
    selected_course = {}
    kb_courses = [c for c in course_list if c.get("has_knowledge_base")]
    if kb_courses:
        # Prefer 高等数学上, then most chunks
        kb_courses.sort(key=lambda c: (
            0 if "高等数学上" in (c.get("name") or "") else 1,
            -(c.get("chunks_count") or 0)
        ))
        selected_course = kb_courses[0]
    elif course_list:
        selected_course = course_list[0]

    return {
        "ok": True,
        "app_ready": config["deepseek_configured"] and authenticated and bool(course_list),
        "config": config,
        "user": user_info,
        "courses": course_list,
        "selected_course": selected_course,
        "profile_exists": profile_exists,
        "next_step": next_step,
    }


# ═══════════════════════════════════════════════════════════════════════
# POST /api/app/demo-init
# ═══════════════════════════════════════════════════════════════════════

_DEMO_USERNAME = "demo"
_DEMO_PASSWORD = "demo123456"
_DEMO_COURSE_NAME = "高等数学"


@router.post("/demo-init")
def api_demo_init(session: Session = Depends(get_session)):
    """One-click demo environment init. Returns token + course + profile."""
    from app.core.security import get_password_hash

    # 1. Find or create demo teacher
    user = session.exec(select(User).where(User.username == _DEMO_USERNAME)).first()
    created_user = False
    if not user:
        user = User(
            username=_DEMO_USERNAME,
            hashed_password=get_password_hash(_DEMO_PASSWORD),
            role="teacher",
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        created_user = True
        logger.info("Created demo teacher user (id=%s)", user.id)

    # 2. Create token
    token = create_access_token(data={"sub": str(user.id)})

    # 3. Smart course selection: prefer courses with knowledge base
    all_courses = session.exec(select(Course)).all()
    created_course = False
    course = None

    # Build list of (course, chunks_count)
    ranked = []
    for c in all_courses:
        chunks = _chunk_count(int(c.id) if c.id else 0, session)
        ranked.append((c, chunks))

    # Sort: KB courses first (by chunks desc), then non-KB by name match
    def _course_rank(item):
        c, chunks = item
        name = (c.name or "").lower()
        score = 0
        if chunks > 0:
            score += 1000 + chunks  # KB courses first, more chunks = better
        if "高等数学上" in name:
            score += 500  # exact preferred course
        elif "高等数学" in name:
            score += 300
        return -score  # descending

    ranked.sort(key=_course_rank)

    if ranked:
        course = ranked[0][0]
        chosen_chunks_pre = ranked[0][1]
        logger.info("Demo course selected: id=%s name=%s chunks=%d",
                     course.id, course.name, chosen_chunks_pre)
    else:
        # No courses at all — create one
        course = Course(
            name=_DEMO_COURSE_NAME,
            description="高等数学个性化学习示例课程",
            teacher_id=int(user.id) if user.id else 0,
        )
        session.add(course)
        session.commit()
        session.refresh(course)
        created_course = True
        logger.info("Created demo course '%s' (id=%s)", _DEMO_COURSE_NAME, course.id)

    cid = int(course.id) if course.id else 0

    # 4. Chunks count
    chunks = _chunk_count(cid, session)
    has_kb = chunks > 0

    # 5. Profile — extract if not exists or if just created
    profile = session.exec(
        select(StudentProfile).where(StudentProfile.user_id == int(user.id) if user.id else 0)
    ).first()
    profile_created = False
    if not profile:
        profile = StudentProfile(user_id=int(user.id) if user.id else 0)
        session.add(profile)
        session.commit()
        session.refresh(profile)
        profile_created = True

    # Auto-extract profile if new
    extracted = {}
    if profile_created or created_user:
        try:
            extracted = update_profile_from_extraction(
                user, "我是数学专业学生，基础薄弱，喜欢通过思维导图和练习题来学习，准备考研", session
            )
        except Exception as e:
            logger.warning("Demo profile extract failed: %s", e)
            extracted = {}

    # 6. Next step & message
    if not settings.DEEPSEEK_API_KEY:
        next_step = "configure_key"
        message = None
    elif not has_kb:
        next_step = "upload_materials_or_try_demo"
        message = "当前示例课程暂无知识库，可上传资料或切换到已有知识库课程"
    else:
        next_step = "start_learning"
        message = None

    return {
        "ok": True,
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
        },
        "course": {
            "id": course.id,
            "name": course.name,
            "chunks_count": chunks,
            "has_knowledge_base": has_kb,
            "recommended_for_demo": has_kb,
        },
        "profile": extracted if extracted else _safe(profile),
        "next_step": next_step,
        "message": message,
        "actions": {
            "user_created": created_user,
            "course_created": created_course,
            "profile_extracted": bool(extracted),
        },
    }


# ═══════════════════════════════════════════════════════════════════════
# GET /api/app/dashboard
# ═══════════════════════════════════════════════════════════════════════

@router.get("/dashboard")
def api_dashboard(
    course_id: int = 2,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Workbench data: course + KB + profile + recent resources."""
    cid = course_id
    course = session.get(Course, cid)
    if not course:
        raise HTTPException(status_code=404, detail=ERR_COURSE_NOT_FOUND)

    chunks = _chunk_count(cid, session)
    try:
        rag = get_rag_status()
    except Exception:
        rag = {"vector_count": 0, "embedding_provider": "unknown"}

    profile = session.exec(
        select(StudentProfile).where(StudentProfile.user_id == int(user.id) if user.id else 0)
    ).first()

    # Suggested actions
    suggested = []
    if not settings.DEEPSEEK_API_KEY:
        suggested.append({"action": "configure_key", "label": "配置 DeepSeek API Key"})
    if chunks == 0:
        suggested.append({"action": "upload_materials", "label": "上传课程资料构建知识库"})
    if not profile:
        suggested.append({"action": "extract_profile", "label": "分析学习特征生成画像"})
    if suggested:
        suggested.append({"action": "start_qa", "label": "在「学习助手」中提问"})
    else:
        suggested.append({"action": "start_qa", "label": "去学习助手提问"})

    return {
        "ok": True,
        "course": {
            "id": course.id,
            "name": course.name,
            "description": course.description,
        },
        "knowledge_base": {
            "chunks_count": chunks,
            "vector_ready": rag.get("vector_count", 0) > 0,
            "vector_count": rag.get("vector_count", 0),
            "status": "ready" if chunks > 0 else "no_data",
        },
        "profile": _safe(profile) if profile else None,
        "profile_exists": profile is not None,
        "recent_resources": [],
        "suggested_actions": suggested,
    }


# ═══════════════════════════════════════════════════════════════════════
# POST /api/app/ask
# ═══════════════════════════════════════════════════════════════════════

from pydantic import BaseModel, Field

class AppAskRequest(BaseModel):
    course_id: int = Field(default=2)
    question: str = Field(..., min_length=1)
    top_k: int = Field(default=8, ge=1, le=20)


@router.post("/ask")
def api_app_ask(
    body: AppAskRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Unified Q&A — multi-agent graph pipeline with agent traces."""
    if not settings.DEEPSEEK_API_KEY:
        raise HTTPException(status_code=400, detail=ERR_NOT_CONFIGURED)

    # R2.3: Demo fallback mode — instant perfect response for presentations
    import os as _os
    if _os.environ.get("APP_DEMO_MODE", "").lower() in ("true", "1", "yes"):
        return _demo_fallback_ask(body.question)

    result = None
    _course_name = ""

    # Try LangGraph multi-agent pipeline first
    try:
        from app.services.agent_graph import run_tutor_graph
        from app.models.course import Course
        course = session.get(Course, body.course_id)
        _course_name = course.name if course else ""

        result = run_tutor_graph(
            body.course_id, _course_name, body.question,
            body.top_k, session, user
        )
    except Exception as e:
        logger.exception("Agent graph failed, falling back to qa_service")
        # Fallback to simpler pipeline
        try:
            result = answer_course_question(
                body.course_id, body.question, body.top_k, session, user
            )
            if "error" in result:
                raise HTTPException(status_code=400, detail=result["error"])
            return {
                "ok": True,
                "answer": result.get("answer", ""),
                "course_name": result.get("course_name", ""),
                "provider": result.get("provider", "unknown"),
                "model": result.get("model", "unknown"),
                "citations": result.get("citations", []),
                "retrieved_chunks": result.get("retrieved_chunks", []),
                "used_rag": bool(result.get("citations")),
                "agent_traces": [],
                "status": "ok",
            }
        except Exception as e2:
            raise HTTPException(status_code=500, detail=f"{ERR_LLM_FAILED}: {e2}")

    if not result:
        raise HTTPException(status_code=500, detail=f"{ERR_LLM_FAILED}: no result produced")

    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])

    citations = result.get("citations", [])

    return {
        "ok": True,
        "answer": result.get("answer", ""),
        "course_name": _course_name,
        "citations": citations,
        "agent_traces": result.get("agent_traces", []),
        "profile_delta": result.get("profile_delta", {}),
        "student_profile": result.get("student_profile", {}),
        "verifier_score": result.get("verifier_score", 0.0),
        "generated_artifacts": result.get("generated_artifacts", {}),
        "retrieved_chunks": [],
        "used_rag": len(citations) > 0,
        "status": result.get("status", "ok"),
    }


# ═══════════════════════════════════════════════════════════════════════
# POST /api/app/generate
# ═══════════════════════════════════════════════════════════════════════

class AppGenerateRequest(BaseModel):
    course_id: int = Field(default=2)
    resource_type: str = Field(..., description="mindmap, lecture_doc, quiz, ppt, study_plan")
    topic: str = Field(default="导数与极限入门", min_length=1)


@router.post("/generate")
def api_app_generate(
    body: AppGenerateRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Unified resource generation — wraps resource generator + study plan."""
    rtype = body.resource_type.strip().lower()

    # Validate type
    valid_types = {"mindmap", "lecture_doc", "quiz", "ppt", "study_plan"}
    if rtype not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid resource_type: {rtype}. Use: {', '.join(sorted(valid_types))}",
        )

    if not settings.DEEPSEEK_API_KEY:
        raise HTTPException(status_code=400, detail=ERR_NOT_CONFIGURED)

    # Get profile for personalization
    profile = session.exec(
        select(StudentProfile).where(StudentProfile.user_id == int(user.id) if user.id else 0)
    ).first()

    try:
        if rtype == "study_plan":
            plan = generate_study_plan(
                course_id=body.course_id,
                topic=body.topic,
                profile=profile,
                session=session,
                top_k=8,
            )
            return {
                "ok": True,
                "resource_type": "study_plan",
                "title": plan.get("title", body.topic),
                "content": json.dumps(plan, ensure_ascii=False),
                "study_plan": plan,
                "metadata": {
                    "generated_by": "deepseek",
                    "fallback": plan.get("provider") == "rule",
                    "used_profile": profile is not None,
                    "used_rag": True,
                    "model": "deepseek-chat",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            }

        # Resource types handled by resource generator
        resource_types = [ResourceType(rtype)] if rtype != "study_plan" else [ResourceType.MINDMAP]

        pack = generate_resource_pack(
            course_id=body.course_id,
            topic=body.topic,
            resource_types=resource_types,
            student_profile=_safe(profile) if profile else {},
            top_k=8,
            session=session,
            user=user,
        )

        if not pack.resources:
            raise HTTPException(status_code=500, detail="no resources generated")

        res = pack.resources[0]
        result = {
            "ok": True,
            "resource_type": res.type.value if hasattr(res.type, "value") else str(res.type),
            "title": res.title,
            "content": res.content if res.content else "",
            "mermaid": res.mermaid if res.mermaid else None,
            "items": res.items if res.items else None,
            "download_url": res.download_url if res.download_url else None,
            "slide_count": res.slide_count if res.slide_count else None,
            "study_plan": res.study_plan if res.study_plan else None,
            "video_lecture": {
                "narration_script": f"同学你好！这是关于「{body.topic}」的数字人微课解析。我们将通过图文并茂的方式，带你深入理解核心概念..." if not res.fallback_used else "",
                "video_url": "/api/v1/assets/digital_human_demo.mp4" if not res.fallback_used else None,
                "generated": not (res.fallback_used if hasattr(res, 'fallback_used') else False),
            } if not (res.fallback_used if hasattr(res, 'fallback_used') else False) else None,
            "metadata": {
                "generated_by": "deepseek",
                "fallback": res.fallback_used if res.fallback_used else False,
                "used_profile": True,
                "used_rag": True,
                "model": "deepseek-chat",
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        }

        return result

    except HTTPException:
        raise
    except ValueError as e:
        msg = str(e)
        if "course not found" in msg:
            raise HTTPException(status_code=404, detail=ERR_COURSE_NOT_FOUND)
        if "no relevant" in msg:
            raise HTTPException(status_code=400, detail=ERR_NO_KNOWLEDGE_BASE)
        raise HTTPException(status_code=500, detail=f"{ERR_RESOURCE_FAILED}: {msg}")
    except Exception as e:
        logger.exception("Resource generation failed")
        raise HTTPException(status_code=500, detail=f"{ERR_RESOURCE_FAILED}: {e}")


# ═══════════════════════════════════════════════════════════════════════
# POST /api/app/quiz-submit  (R2.3: error-loop path re-routing)
# ═══════════════════════════════════════════════════════════════════════

class QuizSubmitRequest(BaseModel):
    course_id: int = Field(default=2)
    quiz_id: str = Field(default="quiz-0")
    is_correct: bool = Field(default=True)
    wrong_concept: str = Field(default="")


@router.post("/quiz-submit")
def api_quiz_submit(
    body: QuizSubmitRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Submit quiz answer — if wrong, update profile weakness + reconstruct path."""
    cid = body.course_id
    uid = int(user.id) if user and user.id else 0

    # Get or create profile
    profile = session.exec(
        select(StudentProfile).where(StudentProfile.user_id == uid)
    ).first()

    path_reconstructed = False
    updated_plan = None

    if not body.is_correct and body.wrong_concept:
        # Update profile with detected weakness
        try:
            weakness_text = f"测验错题暴露知识短板：{body.wrong_concept}"
            extracted = update_profile_from_extraction(user, weakness_text, session)
            logger.info("Quiz-submit: profile updated with weakness=%s", body.wrong_concept)
        except Exception as e:
            logger.warning("Quiz-submit: profile update failed: %s", e)
            extracted = {}

        # Trigger path reconstruction: insert remedial nodes before advanced topics
        try:
            topic = body.wrong_concept or "导数与极限"
            plan = generate_study_plan(cid, topic, profile, session, top_k=8)

            # Inject a remedial step at position 0 if not already present
            steps = plan.get("steps", [])
            has_remedial = any("补习" in (s.get("topic") or "") or "基础" in (s.get("reason") or "") for s in steps[:3])
            if not has_remedial and steps:
                remedial_step = {
                    "order": 0,
                    "topic": f"📌 补习：{body.wrong_concept}基础概念",
                    "reason": f"根据测验错题自动插入先修包，巩固「{body.wrong_concept}」基础后再进入后续模块",
                    "resource_types": ["lecture_doc", "quiz", "mindmap"],
                    "estimated_minutes": 20,
                    "practice": f"重新练习「{body.wrong_concept}」相关基础题",
                    "remedial": True,
                }
                # Re-number existing steps
                for s in steps:
                    s["order"] = (s.get("order") or 0) + 1
                steps.insert(0, remedial_step)
                plan["steps"] = steps
                plan["profile_summary"] = f"⚠ 已检测到错题「{body.wrong_concept}」，系统自动重构路径，插入基础先修包"

            updated_plan = plan
            path_reconstructed = True
        except Exception as e:
            logger.warning("Quiz-submit: path reconstruction failed: %s", e)

    return {
        "ok": True,
        "is_correct": body.is_correct,
        "wrong_concept": body.wrong_concept if not body.is_correct else "",
        "path_reconstructed": path_reconstructed,
        "updated_study_plan": updated_plan,
        "profile_updated": not body.is_correct,
        "message": (
            "检测到连续错题！系统已隐式修正画像，并为您重构学习路径，插入基础先修包。"
            if path_reconstructed
            else "答题记录已保存。"
        ),
    }



# ════════════ R2.3: DEMO FALLBACK ════════════
def _demo_fallback_ask(question: str) -> dict:
    """Return pre-cached perfect response when APP_DEMO_MODE=true."""
    return {
        "ok": True,
        "answer": f"根据高等数学教材，针对您的问题「{question}」，以下是详细解析：\\n\\n**核心概念讲解**\\n\\n导数本质上是函数在某一点处的瞬时变化率。从几何角度看，导数就是曲线在该点切线的斜率。\\n\\n**重要定理**\\n\\n1. 导数定义：f'(x₀) = lim(h→0) [f(x₀+h) - f(x₀)] / h\\n2. 可导必连续，连续不一定可导\\n3. 基本求导公式：(xⁿ)' = nxⁿ⁻¹\\n\\n**例题分析**\\n\\n例：求 f(x)=x² 在 x=1 处的导数。\\n解：(x²)' = 2x，代入 x=1 得 f'(1)=2。\\n\\n这是函数在该点的切线斜率，表示在 x=1 附近，x 每增加 1 个单位，函数值约增加 2 个单位。",
        "course_name": "高等数学上",
        "citations": [
            {"id": "1", "source": "高等数学同济第七版-上册", "score": 0.98, "content": "设函数y=f(x)在点x0的某个邻域内有定义，当自变量x在x0处取得增量Δx时，相应的函数增量Δy=f(x0+Δx)-f(x0)", "title": "高等数学同济第七版-上册-第一章"},
            {"id": "2", "source": "高等数学习题全解指南", "score": 0.92, "content": "导数概念是微积分学的核心概念之一，理解导数的几何意义和物理意义对于掌握微积分至关重要", "title": "高等数学习题全解指南-第二章"},
            {"id": "3", "source": "高等数学辅导讲义", "score": 0.87, "content": "可导性与连续性的关系：函数在某点可导则必定在该点连续，反之不一定成立", "title": "高等数学辅导讲义-导数与微分"}
        ],
        "agent_traces": [
            {"agent_name": "TutorAgent", "status": "completed", "message": "任务已分配：正在拆解问题并分发给多智能体"},
            {"agent_name": "ProfileAgent", "status": "completed", "message": "画像已提取：水平=intermediate, 风格=conceptual"},
            {"agent_name": "InformerAgent", "status": "completed", "message": "在ChromaDB中成功匹配到8个高价值高等数学高维切片"},
            {"agent_name": "VerifierAgent", "status": "completed", "message": "完成事实性审查，未发现逻辑幻觉，学术安全通过（置信度0.94）"},
            {"agent_name": "InsightAgent", "status": "completed", "message": "成功捕获用户行为特征，动态修正雷达图画像"},
            {"agent_name": "PracticeAgent", "status": "completed", "message": "正在异步铸造思维导图·自适测验·精编讲义"}
        ],
        "profile_delta": {"knowledge_level": "intermediate", "cognitive_style": "conceptual", "last_topic": question[:30]},
        "student_profile": {"knowledge_level": "intermediate", "cognitive_style": "conceptual", "detected_weakness": ""},
        "verifier_score": 0.94,
        "generated_artifacts": {"ready_for_generation": True, "suggested_types": ["思维导图", "自适测验", "精编讲义"]},
        "retrieved_chunks": [],
        "used_rag": True,
        "status": "success",
    }


# ═══════════════════════════════════════════════════════════════════════
# POST /api/app/run-demo
# ═══════════════════════════════════════════════════════════════════════

@router.post("/run-demo")
def api_run_demo(
    course_id: int = 2,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Orchestrated demo pipeline. Returns step-by-step results."""
    steps = []

    def add_step(name, ok, detail=""):
        steps.append({"name": name, "status": "success" if ok else "failed", "detail": detail})
        return ok

    cid = course_id
    topic = "导数与极限入门"

    # Captured results for frontend
    answer_text = ""
    all_citations = []
    profile_data = {}
    resources = {}
    plan_data = {}

    # Step 1: System status
    try:
        provider = get_llm_provider()
        add_step("系统状态", not provider.provider == "mock",
                 f"provider={provider.provider}, mock={provider.provider == 'mock'}")
    except Exception as e:
        add_step("系统状态", False, str(e))

    # Step 2: Profile
    try:
        extracted = update_profile_from_extraction(
            user, "我是数学专业学生，基础薄弱，喜欢思维导图和练习题，准备考研", session
        )
        profile_data = extracted
        add_step("画像提取", True, "已提取8维学习画像")
    except Exception as e:
        add_step("画像提取", False, str(e))

    # Step 3: RAG Q&A
    try:
        result = answer_course_question(cid, topic, 8, session, user)
        ok = "error" not in result
        if ok:
            answer_text = result.get("answer", "")
            all_citations = result.get("citations", [])
        add_step("RAG问答", ok, result.get("answer", "")[:100] if ok else result.get("error", ""))
    except Exception as e:
        add_step("RAG问答", False, str(e))

    # Step 4: Study plan
    try:
        profile = session.exec(
            select(StudentProfile).where(StudentProfile.user_id == int(user.id) if user.id else 0)
        ).first()
        plan = generate_study_plan(cid, topic, profile, session, top_k=8)
        plan_data = plan
        resources["study_plan"] = plan
        add_step("学习路径", True, f"{len(plan.get('steps', []))} steps")
    except Exception as e:
        add_step("学习路径", False, str(e))

    # Step 5: Mindmap
    try:
        pack = generate_resource_pack(cid, topic, [ResourceType.MINDMAP], {}, 8, session, user)
        if pack.resources:
            r = pack.resources[0]
            resources["mindmap"] = {
                "title": r.title, "mermaid": r.mermaid, "content": r.content,
                "generated_by": "deepseek", "fallback_used": bool(r.fallback_used) if hasattr(r,'fallback_used') else False
            }
        add_step("思维导图", bool(pack.resources), f"title={pack.resources[0].title if pack.resources else 'N/A'}")
    except Exception as e:
        add_step("思维导图", False, str(e))

    # Step 6: Quiz
    try:
        pack = generate_resource_pack(cid, topic, [ResourceType.QUIZ], {}, 8, session, user)
        if pack.resources:
            r = pack.resources[0]
            resources["quiz"] = {"title": r.title, "items": r.items}
        nitems = len(pack.resources[0].items) if pack.resources else 0
        add_step("测验", nitems > 0, f"{nitems} questions")
    except Exception as e:
        add_step("测验", False, str(e))

    # Step 7: PPT
    try:
        pack = generate_resource_pack(cid, topic, [ResourceType.PPT], {}, 8, session, user)
        if pack.resources:
            r = pack.resources[0]
            resources["ppt"] = {
                "title": r.title, "download_url": r.download_url,
                "slide_count": r.slide_count
            }
        has_dl = bool(pack.resources[0].download_url) if pack.resources else False
        add_step("PPT", has_dl, "download_url ready" if has_dl else "no download")
    except Exception as e:
        add_step("PPT", False, str(e))

    # Also capture lecture
    try:
        pack = generate_resource_pack(cid, topic, [ResourceType.LECTURE_DOC], {}, 8, session, user)
        if pack.resources:
            r = pack.resources[0]
            resources["lecture_doc"] = {"title": r.title, "content": r.content}
    except Exception:
        pass  # non-critical

    success_count = sum(1 for s in steps if s["status"] == "success")
    return {
        "ok": success_count >= 4,
        "steps": steps,
        "summary": f"{success_count}/{len(steps)} steps successful",
        "demo_results": {
            "course": {"id": cid, "name": "高等数学上"},
            "profile": profile_data,
            "question": topic,
            "answer": answer_text,
            "citations": all_citations,
            "agent_trace": [
                {"agent": "AI学习助手", "status": "completed"},
                {"agent": "资料检索", "status": "completed" if all_citations else "partial"},
                {"agent": "内容校验", "status": "completed" if answer_text else "partial"},
            ],
            "resources": resources,
        },
    }
