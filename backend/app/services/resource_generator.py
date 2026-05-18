"""Resource generator: RAG retrieval → structured JSON → resource pack.

Unified pipeline for mindmap, lecture_doc, and quiz generation.
Reuses existing rag_service and llm_provider.
Mock mode generates deterministic structured resources from chunks.
"""

import logging
import re
from typing import Any, Optional

from sqlmodel import Session

from app.models.course import Course
from app.models.user import User
from app.schemas.resource import (
    Citation,
    LectureDocJSON,
    LectureSection,
    MindMapJSON,
    MindMapNode,
    QuizItem,
    QuizJSON,
    ResourceItem,
    ResourcePackResponse,
    ResourceType,
)
from app.services.llm_provider import get_llm_provider
from app.services.rag_service import search_course
from app.services.resource_renderer import (
    render_lecture_to_markdown,
    render_mindmap_to_mermaid,
    render_quiz,
)

logger = logging.getLogger(__name__)

MAX_RESOURCE_TOP_K = 8

# ── Topic-specific Mock templates ──────────────────────────────────────────────

# Known topic patterns → mock resource templates
_MOCK_TOPICS = {
    "导数": {
        "mindmap": MindMapJSON(
            title="导数",
            nodes=[
                MindMapNode(id="def", label="导数定义", children=[
                    MindMapNode(id="rate", label="瞬时变化率"),
                    MindMapNode(id="limit", label="差商极限"),
                ]),
                MindMapNode(id="geo", label="几何意义", children=[
                    MindMapNode(id="tangent", label="切线斜率"),
                    MindMapNode(id="monotonic", label="单调性判断"),
                ]),
                MindMapNode(id="rules", label="求导法则", children=[
                    MindMapNode(id="basic", label="基本初等函数"),
                    MindMapNode(id="chain", label="链式法则"),
                    MindMapNode(id="product", label="积商法则"),
                ]),
                MindMapNode(id="app", label="应用", children=[
                    MindMapNode(id="extreme", label="极值与最值"),
                    MindMapNode(id="shape", label="函数图像分析"),
                ]),
            ],
        ),
        "lecture": LectureDocJSON(
            title="导数入门讲解",
            difficulty="beginner",
            sections=[
                LectureSection(
                    heading="什么是导数",
                    content=(
                        "导数是微积分学中最核心的概念之一，用于描述函数在某一点处的瞬时变化率。"
                        "从直观上说，导数就是曲线在一点的切线斜率，它告诉我们函数在该点的变化趋势。"
                        "导数本质上来源于差商的极限：当自变量的增量趋近于零时，函数值的增量与自变量的增量之比的极限。"
                    ),
                ),
                LectureSection(
                    heading="导数的几何意义",
                    content=(
                        "在几何上，函数 y=f(x) 在点 x0 处的导数 f'(x0) 等于曲线在该点处切线的斜率。"
                        "切线是割线在两点无限趋近时的极限位置。导数的正负可以判断函数的单调性："
                        "导数为正表示函数在该点附近递增，导数为负表示函数递减。"
                    ),
                ),
                LectureSection(
                    heading="常见求导法则",
                    content=(
                        "1. 常数求导：(C)' = 0\n"
                        "2. 幂函数求导：(xⁿ)' = n·xⁿ⁻¹\n"
                        "3. 指数函数求导：(eˣ)' = eˣ\n"
                        "4. 对数函数求导：(ln x)' = 1/x\n"
                        "5. 和差法则：(u±v)' = u' ± v'\n"
                        "6. 积法则：(uv)' = u'v + uv'\n"
                        "7. 商法则：(u/v)' = (u'v - uv')/v²\n"
                        "8. 链式法则：(f(g(x)))' = f'(g(x))·g'(x)"
                    ),
                ),
                LectureSection(
                    heading="学习建议",
                    content=(
                        "建议初学者先从导数的直观理解入手，通过画切线来感受导数的几何意义。"
                        "然后通过大量练习掌握基本求导公式和法则。不建议死记硬背，而是理解每个法则的来源。"
                        "最后通过极值问题和函数作图来巩固对导数的整体理解。"
                    ),
                ),
            ],
        ),
        "quiz": QuizJSON(
            title="导数概念自测",
            items=[
                QuizItem(
                    question="导数本质上来源于什么？",
                    options=["积分", "差商的极限", "微分方程", "泰勒展开"],
                    answer=1,
                    explanation="导数定义为函数增量与自变量增量之比的极限，即差商的极限。",
                ),
                QuizItem(
                    question="导数在几何上表示什么？",
                    options=["曲线与 x 轴围成的面积", "曲线在某点的切线斜率", "函数的最大值", "函数的平均值"],
                    answer=1,
                    explanation="导数的几何意义就是曲线在对应点处的切线斜率。",
                ),
                QuizItem(
                    question="(x³)' 等于多少？",
                    options=["3x³", "3x²", "x²", "3x"],
                    answer=1,
                    explanation="根据幂函数求导法则：(xⁿ)' = n·xⁿ⁻¹，所以 (x³)' = 3x²。",
                ),
                QuizItem(
                    question="下列哪个是链式法则的正确表达式？",
                    options=[
                        "(uv)' = u'v + uv'",
                        "(u/v)' = (u'v - uv')/v²",
                        "(f(g(x)))' = f'(g(x))·g'(x)",
                        "(C)' = 0",
                    ],
                    answer=2,
                    explanation="(f(g(x)))' = f'(g(x))·g'(x) 就是链式法则，用于复合函数求导。",
                ),
            ],
        ),
    },
    "极限": {
        "mindmap": MindMapJSON(
            title="极限",
            nodes=[
                MindMapNode(id="def", label="极限定义", children=[
                    MindMapNode(id="eps_delta", label="ε-δ 语言"),
                    MindMapNode(id="intuitive", label="直观理解"),
                ]),
                MindMapNode(id="prop", label="极限性质", children=[
                    MindMapNode(id="unique", label="唯一性"),
                    MindMapNode(id="bounded", label="有界性"),
                    MindMapNode(id="preserve", label="保号性"),
                ]),
                MindMapNode(id="ops", label="极限运算法则", children=[
                    MindMapNode(id="four_op", label="四则运算法则"),
                    MindMapNode(id="squeeze", label="夹逼准则"),
                    MindMapNode(id="monotone", label="单调有界准则"),
                ]),
                MindMapNode(id="important", label="重要极限", children=[
                    MindMapNode(id="sin", label="sin x / x → 1"),
                    MindMapNode(id="e", label="(1+1/x)ˣ → e"),
                ]),
            ],
        ),
        "lecture": LectureDocJSON(
            title="极限入门讲解",
            difficulty="beginner",
            sections=[
                LectureSection(
                    heading="什么是极限",
                    content=(
                        "极限是微积分学的基础概念，描述当自变量无限趋近某个值时函数值的变化趋势。"
                        "直观理解：当 x 越来越接近 x0（但不等于 x0）时，f(x) 是否越来越接近某个确定的值 A。"
                        "如果能，就说 f(x) 在 x→x0 时的极限是 A。"
                    ),
                ),
                LectureSection(
                    heading="极限的性质",
                    content=(
                        "1. 唯一性：如果极限存在，则极限值唯一。\n"
                        "2. 有界性：如果极限存在，则函数在 x0 附近有界。\n"
                        "3. 保号性：如果极限为正，则函数在 x0 附近也为正。\n"
                        "4. 夹逼准则：如果 g(x) ≤ f(x) ≤ h(x) 且 g(x) 和 h(x) 趋于相同极限 L，则 f(x) 也趋于 L。"
                    ),
                ),
                LectureSection(
                    heading="两个重要极限",
                    content=(
                        "第一个重要极限：lim(x→0) sin x / x = 1\n"
                        "这个极限在处理三角函数极限时经常用到。\n\n"
                        "第二个重要极限：lim(x→∞) (1 + 1/x)ˣ = e\n"
                        "这个极限定义了自然常数 e ≈ 2.71828。"
                    ),
                ),
                LectureSection(
                    heading="学习建议",
                    content=(
                        "先通过图像和数值表建立直观理解，再学习 ε-δ 的严格定义。"
                        "多做极限计算练习，特别是两个重要极限的变形应用。"
                    ),
                ),
            ],
        ),
        "quiz": QuizJSON(
            title="极限概念自测",
            items=[
                QuizItem(
                    question="lim(x→0) sin x / x 的值是多少？",
                    options=["0", "1", "∞", "不存在"],
                    answer=1,
                    explanation="第一个重要极限：lim(x→0) sin x / x = 1。",
                ),
                QuizItem(
                    question="函数极限存在的必要条件是什么？",
                    options=["函数可导", "左右极限存在且相等", "函数连续", "函数有定义"],
                    answer=1,
                    explanation="函数在 x0 处极限存在的充要条件是左右极限存在且相等。",
                ),
                QuizItem(
                    question="如果 lim f(x) = L > 0，则根据保号性可以推出什么？",
                    options=["f(x) 恒大于 L", "在 x0 附近 f(x) > 0", "f(x) 是增函数", "L 是最大值"],
                    answer=1,
                    explanation="保号性：如果极限为正，则函数在该点附近也为正。",
                ),
            ],
        ),
    },
    "连续": {
        "mindmap": MindMapJSON(
            title="连续函数",
            nodes=[
                MindMapNode(id="def", label="连续定义", children=[
                    MindMapNode(id="three", label="三个条件"),
                    MindMapNode(id="left_right", label="左右连续"),
                ]),
                MindMapNode(id="types", label="间断点类型", children=[
                    MindMapNode(id="removable", label="可去间断点"),
                    MindMapNode(id="jump", label="跳跃间断点"),
                    MindMapNode(id="infinite", label="无穷间断点"),
                ]),
                MindMapNode(id="prop", label="连续函数性质", children=[
                    MindMapNode(id="ivt", label="介值定理"),
                    MindMapNode(id="maxmin", label="最值定理"),
                    MindMapNode(id="zeros", label="零点定理"),
                ]),
                MindMapNode(id="relation", label="与导数关系", children=[
                    MindMapNode(id="diff", label="可导必连续"),
                    MindMapNode(id="converse", label="连续不一定可导"),
                ]),
            ],
        ),
        "lecture": LectureDocJSON(
            title="函数的连续性讲解",
            difficulty="intermediate",
            sections=[
                LectureSection(
                    heading="连续的定义",
                    content=(
                        "函数 f(x) 在点 x0 处连续，需要满足三个条件：\n"
                        "1. f(x0) 有定义\n"
                        "2. lim(x→x0) f(x) 存在\n"
                        "3. lim(x→x0) f(x) = f(x0)\n\n"
                        "直观理解：函数的图像在该点不间断，可以一笔画出来。"
                    ),
                ),
                LectureSection(
                    heading="间断点的分类",
                    content=(
                        "1. 可去间断点：极限存在但不等于函数值或函数在该点无定义\n"
                        "2. 跳跃间断点：左右极限存在但不相等\n"
                        "3. 无穷间断点：极限为无穷大\n"
                        "4. 振荡间断点：函数在该点附近无限振荡"
                    ),
                ),
                LectureSection(
                    heading="连续函数的重要性",
                    content=(
                        "闭区间上的连续函数具有三个关键性质：\n"
                        "1. 最值定理：必能达到最大值和最小值\n"
                        "2. 介值定理：必能取到两端点之间的所有值\n"
                        "3. 零点定理：如果两端点函数值异号，则必存在零点\n\n"
                        "重要的是：可导必连续，但连续不一定可导（如 y=|x| 在 x=0）。"
                    ),
                ),
            ],
        ),
        "quiz": QuizJSON(
            title="连续函数自测",
            items=[
                QuizItem(
                    question="函数在一点连续需要满足几个条件？",
                    options=["1个", "2个", "3个", "4个"],
                    answer=2,
                    explanation="函数连续需要同时满足：有定义、极限存在、极限值等于函数值，共三个条件。",
                ),
                QuizItem(
                    question="y = |x| 在 x=0 处的情况是？",
                    options=["可导且连续", "连续但不可导", "可导但不连续", "既不连续也不可导"],
                    answer=1,
                    explanation="|x| 在 x=0 处连续但不可导，是'连续不一定可导'的典型例子。",
                ),
                QuizItem(
                    question="如果 f(a)·f(b) < 0 且 f 在 [a,b] 连续，则根据什么定理可以断定存在 c∈(a,b) 使 f(c)=0？",
                    options=["最值定理", "介值定理", "零点定理", "罗尔定理"],
                    answer=2,
                    explanation="闭区间连续且两端异号时，零点定理保证存在至少一个零点。",
                ),
            ],
        ),
    },
    "不定积分": {
        "mindmap": MindMapJSON(
            title="不定积分",
            nodes=[
                MindMapNode(id="def", label="定义", children=[
                    MindMapNode(id="antiderivative", label="原函数"),
                    MindMapNode(id="family", label="原函数族"),
                ]),
                MindMapNode(id="basic", label="基本积分公式", children=[
                    MindMapNode(id="power", label="幂函数"),
                    MindMapNode(id="trig", label="三角函数"),
                    MindMapNode(id="exp_log", label="指数与对数"),
                ]),
                MindMapNode(id="methods", label="积分方法", children=[
                    MindMapNode(id="sub", label="换元积分法"),
                    MindMapNode(id="parts", label="分部积分法"),
                    MindMapNode(id="rational", label="有理函数积分"),
                ]),
            ],
        ),
        "lecture": LectureDocJSON(
            title="不定积分入门",
            difficulty="intermediate",
            sections=[
                LectureSection(
                    heading="不定积分的概念",
                    content=(
                        "不定积分是微积分学中的基本运算之一，是导数的逆运算。"
                        "如果 F'(x) = f(x)，则称 F(x) 是 f(x) 的一个原函数，"
                        "而 f(x) 的所有原函数 F(x) + C 称为 f(x) 的不定积分，"
                        "记作 ∫ f(x) dx = F(x) + C。常数 C 称为积分常数，"
                        "体现了原函数族的概念。"
                    ),
                ),
                LectureSection(
                    heading="基本积分公式",
                    content=(
                        "1. ∫ xⁿ dx = xⁿ⁺¹/(n+1) + C  (n ≠ -1)\n"
                        "2. ∫ 1/x dx = ln|x| + C\n"
                        "3. ∫ eˣ dx = eˣ + C\n"
                        "4. ∫ sin x dx = -cos x + C\n"
                        "5. ∫ cos x dx = sin x + C\n"
                        "6. ∫ sec²x dx = tan x + C"
                    ),
                ),
                LectureSection(
                    heading="常用积分方法",
                    content=(
                        "1. 第一换元法（凑微分法）：将被积函数凑成某个函数的导数形式\n"
                        "2. 第二换元法：通过变量代换简化被积函数\n"
                        "3. 分部积分法：∫ u dv = uv - ∫ v du\n"
                        "4. 有理函数积分：通过部分分式分解后逐项积分\n\n"
                        "学习建议：先熟练掌握基本积分公式，再学习各种方法的适用场景。"
                        "多做题是掌握积分技巧的关键。"
                    ),
                ),
            ],
        ),
        "quiz": QuizJSON(
            title="不定积分自测",
            items=[
                QuizItem(
                    question="∫ x² dx 等于什么？",
                    options=["x³/2 + C", "x³/3 + C", "2x + C", "x² + C"],
                    answer=1,
                    explanation="∫ x² dx = x³/3 + C，这是幂函数积分公式的应用。",
                ),
                QuizItem(
                    question="分部积分法 ∫ u dv 的结果是？",
                    options=["uv + ∫ v du", "uv - ∫ v du", "u'v + uv'", "uv + C"],
                    answer=1,
                    explanation="分部积分公式：∫ u dv = uv - ∫ v du。",
                ),
                QuizItem(
                    question="∫ 1/x dx 的结果是什么？",
                    options=["ln x + C", "1/x² + C", "x + C", "ln|x| + C"],
                    answer=3,
                    explanation="∫ 1/x dx = ln|x| + C，注意绝对值符号。",
                ),
            ],
        ),
    },
}


def _extract_topic_key(topic: str) -> Optional[str]:
    """Match user topic to a known mock topic key."""
    topic_lower = topic.strip().lower()
    for key in _MOCK_TOPICS:
        if key in topic or key in topic_lower:
            return key
    return None


def _chunks_to_summary(chunks: list[dict], max_len: int = 200) -> str:
    """Extract a short text summary from retrieved chunks."""
    parts = []
    total = 0
    for c in chunks:
        content = (c.get("content", "") or "").strip()
        if not content:
            continue
        if total + len(content) > max_len:
            remaining = max_len - total
            parts.append(content[:remaining] + "...")
            break
        parts.append(content)
        total += len(content)
    return " ".join(parts).strip()


def _extract_keywords(text: str, max_words: int = 10) -> list[str]:
    """Extract key terms from text for generic resource generation."""
    # Simple heuristic: find capitalized/longer Chinese or English terms
    words = re.findall(r"[\u4e00-\u9fff]{2,6}|\b[A-Za-z]{3,}\b", text)
    seen = set()
    result = []
    for w in words:
        if w not in seen:
            seen.add(w)
            result.append(w)
            if len(result) >= max_words:
                break
    return result


# ── MindMap generation ─────────────────────────────────────────────────────────

def _generate_mindmap_json(topic: str, chunks: list[dict]) -> MindMapJSON:
    """Generate a MindMapJSON from topic and retrieved chunks."""
    topic_key = _extract_topic_key(topic)

    if topic_key and topic_key in _MOCK_TOPICS:
        return _MOCK_TOPICS[topic_key]["mindmap"]

    # Generic fallback: build mindmap from chunk keywords
    summary = _chunks_to_summary(chunks, max_len=500)
    keywords = _extract_keywords(summary, max_words=8)

    if not keywords:
        keywords = ["基础概念", "核心原理", "应用方法"]

    nodes = []
    for i, kw in enumerate(keywords):
        nodes.append(
            MindMapNode(
                id=f"node_{i}",
                label=kw,
                children=[
                    MindMapNode(id=f"node_{i}_1", label="定义与概念"),
                    MindMapNode(id=f"node_{i}_2", label="关键要点"),
                ],
            )
        )

    return MindMapJSON(title=topic, nodes=nodes)


# ── Lecture generation ─────────────────────────────────────────────────────────

def _generate_lecture_doc_json(topic: str, chunks: list[dict], profile: dict) -> LectureDocJSON:
    """Generate a LectureDocJSON from topic, chunks, and student profile."""
    topic_key = _extract_topic_key(topic)

    if topic_key and topic_key in _MOCK_TOPICS:
        return _MOCK_TOPICS[topic_key]["lecture"]

    # Generic fallback
    summary = _chunks_to_summary(chunks, max_len=1000)
    difficulty = profile.get("knowledge_level", "intermediate")

    sections = []
    if summary:
        sections.append(
            LectureSection(
                heading=f"{topic} — 概述",
                content=summary,
            )
        )
    else:
        sections.append(
            LectureSection(
                heading="课程概述",
                content=f"本课程讨论 {topic} 相关的核心知识点。请参考课程教材获取详细内容。",
            )
        )

    sections.append(
        LectureSection(
            heading="学习建议",
            content="建议结合教材和练习题，从基础概念入手，逐步深入理解。",
        )
    )

    return LectureDocJSON(title=f"{topic}讲解", difficulty=difficulty, sections=sections)


# ── Quiz generation ────────────────────────────────────────────────────────────

def _generate_quiz_json(topic: str, chunks: list[dict]) -> QuizJSON:
    """Generate a QuizJSON from topic and chunks."""
    topic_key = _extract_topic_key(topic)

    if topic_key and topic_key in _MOCK_TOPICS:
        return _MOCK_TOPICS[topic_key]["quiz"]

    # Generic fallback
    summary = _chunks_to_summary(chunks, max_len=300)
    items = [
        QuizItem(
            question=f"关于 {topic}，以下哪项描述最准确？",
            options=["选项 A", "选项 B", "选项 C", "以上都不是"],
            answer=0,
            explanation=f"请参考课程资料获取 {topic} 的准确定义。当前为通用示例题目。",
        )
    ]

    return QuizJSON(title=f"{topic}自测", items=items)


# ── Main pipeline ──────────────────────────────────────────────────────────────

def generate_resource_pack(
    course_id: int,
    topic: str,
    resource_types: list[ResourceType],
    student_profile: dict,
    top_k: int,
    session: Session,
    user: User,
) -> ResourcePackResponse:
    """Generate a pack of educational resources from course knowledge base.

    Pipeline: verify course → RAG search → JSON generation → rendering → pack.

    Args:
        course_id: Course to search in.
        topic: Topic/question to generate resources for.
        resource_types: Types of resources to generate.
        student_profile: Profile dict with knowledge_level and cognitive_style.
        top_k: Number of chunks to retrieve (capped at MAX_RESOURCE_TOP_K).
        session: Database session.
        user: Authenticated user.

    Returns:
        ResourcePackResponse with generated resources and citations.
    """
    top_k = min(top_k, MAX_RESOURCE_TOP_K)

    # Verify course
    course = session.get(Course, course_id)
    if not course:
        raise ValueError(f"course not found: {course_id}")

    # Retrieve chunks
    search_result = search_course(course_id, topic, top_k, session)
    if "error" in search_result:
        raise ValueError(search_result["error"])

    chunks = search_result.get("results", [])
    if not chunks:
        raise ValueError("no relevant course materials found for this topic")

    # Build citations
    citations = [
        Citation(
            chunk_id=c.get("chunk_id"),
            source=c.get("source"),
            page_number=c.get("page_number"),
            score=c.get("score"),
        )
        for c in chunks
    ]

    # Generate resources
    resources: list[ResourceItem] = []
    llm_provider = get_llm_provider()

    for rt in resource_types:
        try:
            item = _generate_single_resource(rt, topic, chunks, student_profile)
            resources.append(item)
        except Exception as e:
            logger.warning("Failed to generate resource type=%s: %s", rt.value, e)
            resources.append(
                ResourceItem(
                    type=rt,
                    title=topic,
                    content=f"生成失败：{str(e)}",
                )
            )

    return ResourcePackResponse(
        course_id=course_id,
        course_name=course.name or "",
        topic=topic,
        resources=resources,
        citations=citations,
        provider=llm_provider.provider,
        model=llm_provider.model,
    )


def _generate_single_resource(
    rt: ResourceType,
    topic: str,
    chunks: list[dict],
    student_profile: dict,
) -> ResourceItem:
    """Generate a single resource item of the given type."""
    if rt == ResourceType.MINDMAP:
        mm_json = _generate_mindmap_json(topic, chunks)
        mermaid = render_mindmap_to_mermaid(mm_json)
        return ResourceItem(
            type=ResourceType.MINDMAP,
            title=mm_json.title,
            mermaid=mermaid,
            raw_json=mm_json.model_dump(),
        )

    elif rt == ResourceType.LECTURE_DOC:
        lec_json = _generate_lecture_doc_json(topic, chunks, student_profile)
        md_content = render_lecture_to_markdown(lec_json)
        return ResourceItem(
            type=ResourceType.LECTURE_DOC,
            title=lec_json.title,
            content=md_content,
        )

    elif rt == ResourceType.QUIZ:
        quiz_json = _generate_quiz_json(topic, chunks)
        quiz_dict = render_quiz(quiz_json)
        return ResourceItem(
            type=ResourceType.QUIZ,
            title=quiz_json.title,
            items=quiz_dict.get("items", []),
        )

    elif rt == ResourceType.PPT:
        from app.services.ppt_service import build_slide_deck, render_pptx
        from app.services.generated_file_storage import save_generated_file

        slide_deck = build_slide_deck(topic, chunks, student_profile)
        pptx_bytes = render_pptx(slide_deck)
        file_info = save_generated_file(
            content=pptx_bytes,
            filename=f"{topic}_课件.pptx",
            content_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )
        return ResourceItem(
            type=ResourceType.PPT,
            title=slide_deck.get("title", topic),
            resource_id=file_info["resource_id"],
            filename=file_info["filename"],
            download_url=file_info["download_url"],
            slide_count=len(slide_deck.get("slides", [])),
        )

    else:
        raise ValueError(f"unsupported resource type: {rt.value}")
