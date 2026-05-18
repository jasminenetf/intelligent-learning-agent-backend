"""PPT generation service: structured content → python-pptx → .pptx file.

Pipeline:
  topic + chunks → SlideDeck JSON (Mock or LLM)
  → python-pptx rendering
  → .pptx bytes
"""

import logging
from io import BytesIO

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor

from app.schemas.resource import LectureDocJSON

logger = logging.getLogger(__name__)

# Slide dimensions (standard 16:9)
SLIDE_WIDTH = Inches(13.333)
SLIDE_HEIGHT = Inches(7.5)

# Color palette for academic slides
COLOR_TITLE = RGBColor(0x1A, 0x56, 0xDB)       # blue
COLOR_SUBTITLE = RGBColor(0x55, 0x55, 0x55)     # gray
COLOR_BODY = RGBColor(0x33, 0x33, 0x33)         # dark gray
COLOR_ACCENT = RGBColor(0xE8, 0xF0, 0xFE)       # light blue bg
COLOR_WHITE = RGBColor(0xFF, 0xFF, 0xFF)
COLOR_BLACK = RGBColor(0x00, 0x00, 0x00)

FONT_TITLE = "Microsoft YaHei"
FONT_BODY = "Microsoft YaHei"


# ── SlideDeck JSON generation ─────────────────────────────────────────────────

def build_slide_deck(
    topic: str,
    chunks: list[dict],
    student_profile: dict,
) -> dict:
    """Build SlideDeck JSON from topic and retrieved chunks.

    In Mock mode, generates deterministic slide content.
    When real LLM is available, would call LLM with structured prompt.
    """
    # Extract content from chunks for slide content
    summary = _extract_summary(chunks)
    difficulty = student_profile.get("knowledge_level", "intermediate")
    difficulty_labels = {
        "beginner": "基础入门",
        "intermediate": "中级进阶",
        "advanced": "高级深入",
    }
    diff_label = difficulty_labels.get(difficulty, "中级进阶")

    return {
        "title": f"{topic}入门讲解",
        "subtitle": f"适合{diff_label}水平学生",
        "slides": [
            {
                "type": "title",
                "title": f"{topic}入门讲解",
                "subtitle": f"智能学习 Agent 自动生成 · {diff_label}",
            },
            {
                "type": "content",
                "title": "学习目标",
                "bullets": [
                    f"理解{topic}的核心概念与定义",
                    f"掌握{topic}的基本方法与应用",
                    "能够独立完成相关练习题",
                    "了解常见误区与注意事项",
                ],
            },
            {
                "type": "content",
                "title": f"什么是{topic}",
                "bullets": _extract_bullets(summary, count=4),
            },
            {
                "type": "content",
                "title": "核心要点",
                "bullets": _extract_bullets(summary, count=4, offset=4) or [
                    "请参考课程教材获取详细内容",
                    "结合课堂讲解深入理解",
                    "通过练习巩固知识",
                    "注意概念之间的联系",
                ],
            },
            {
                "type": "content",
                "title": "典型例子",
                "bullets": [
                    "课本例题是理解概念的最佳入口",
                    "从简单到复杂逐步推进",
                    "注意解题步骤的规范性",
                    "学会举一反三",
                ],
            },
            {
                "type": "content",
                "title": "常见误区",
                "bullets": [
                    "概念混淆：注意区分相近但不同的概念",
                    "公式误用：确认适用范围后再套用公式",
                    "符号错误：注意数学符号的准确书写",
                    "跳步思维：初学者建议写出完整推导过程",
                ],
            },
            {
                "type": "content",
                "title": "练习建议",
                "bullets": [
                    "先完成教材课后基础题",
                    "再尝试综合性题目",
                    "建立错题本，定期回顾",
                    "与同学讨论，检验理解深度",
                ],
            },
            {
                "type": "content",
                "title": "参考资料与引用来源",
                "bullets": [
                    f"智能学习 Agent 知识库（{len(chunks)} 条检索结果）",
                    "高等数学（第七版）同济大学数学系",
                    "课程讲义与课堂笔记",
                ],
            },
        ],
    }


def _extract_summary(chunks: list[dict], max_len: int = 800) -> str:
    """Extract a combined summary from retrieved chunks."""
    parts = []
    total = 0
    for c in chunks:
        content = (c.get("content", "") or "").strip()
        if not content:
            continue
        parts.append(content)
        total += len(content)
        if total >= max_len:
            break
    return "\n".join(parts)


def _extract_bullets(text: str, count: int = 4, offset: int = 0) -> list[str]:
    """Extract bullet points from text by splitting on common delimiters."""
    import re
    # Split on Chinese periods, newlines, or numbered items
    sentences = re.split(r"[。；\n]|(?<=\d)[\.、)]", text)
    bullets = []
    for s in sentences:
        s = s.strip()
        if len(s) > 5 and len(s) < 80:
            bullets.append(s)
    start = min(offset, len(bullets))
    end = min(start + count, len(bullets))
    result = bullets[start:end]
    # Pad if not enough
    while len(result) < count:
        result.append("请参考课程教材获取更多内容")
    return result[:count]


# ── PPTX Rendering ────────────────────────────────────────────────────────────

def render_pptx(slide_deck: dict) -> bytes:
    """Render a SlideDeck JSON to .pptx file bytes using python-pptx.

    Args:
        slide_deck: SlideDeck JSON dict with title, subtitle, slides[].

    Returns:
        .pptx file bytes.
    """
    prs = Presentation()
    prs.slide_width = SLIDE_WIDTH
    prs.slide_height = SLIDE_HEIGHT

    slides = slide_deck.get("slides", [])
    for slide_data in slides:
        stype = slide_data.get("type", "content")
        if stype == "title":
            _add_title_slide(prs, slide_data)
        else:
            _add_content_slide(prs, slide_data)

    buf = BytesIO()
    prs.save(buf)
    return buf.getvalue()


def _add_title_slide(prs: Presentation, data: dict):
    """Add a title slide."""
    slide_layout = prs.slide_layouts[6]  # blank
    slide = prs.slides.add_slide(slide_layout)

    # Background
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = COLOR_TITLE

    # Title
    title_box = slide.shapes.add_textbox(
        Inches(1.5), Inches(2.0), Inches(10), Inches(1.5)
    )
    tf = title_box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = data.get("title", "")
    p.font.size = Pt(44)
    p.font.bold = True
    p.font.color.rgb = COLOR_WHITE
    p.font.name = FONT_TITLE
    p.alignment = PP_ALIGN.CENTER

    # Subtitle
    subtitle = data.get("subtitle", "")
    if subtitle:
        sub_box = slide.shapes.add_textbox(
            Inches(1.5), Inches(3.8), Inches(10), Inches(1.0)
        )
        tf = sub_box.text_frame
        p = tf.paragraphs[0]
        p.text = subtitle
        p.font.size = Pt(22)
        p.font.color.rgb = RGBColor(0xBB, 0xCC, 0xEE)
        p.font.name = FONT_BODY
        p.alignment = PP_ALIGN.CENTER


def _add_content_slide(prs: Presentation, data: dict):
    """Add a content slide with title and bullets."""
    slide_layout = prs.slide_layouts[6]  # blank
    slide = prs.slides.add_slide(slide_layout)

    # White background
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = COLOR_WHITE

    # Title bar
    bar = slide.shapes.add_shape(
        1,  # MSO_SHAPE.RECTANGLE
        Inches(0), Inches(0),
        SLIDE_WIDTH, Inches(1.3),
    )
    bar.fill.solid()
    bar.fill.fore_color.rgb = COLOR_TITLE
    bar.line.fill.background()

    title_box = slide.shapes.add_textbox(
        Inches(0.8), Inches(0.2), Inches(11), Inches(1.0)
    )
    tf = title_box.text_frame
    p = tf.paragraphs[0]
    p.text = data.get("title", "")
    p.font.size = Pt(32)
    p.font.bold = True
    p.font.color.rgb = COLOR_WHITE
    p.font.name = FONT_TITLE

    # Bullets
    bullets = data.get("bullets", [])
    if bullets:
        body_box = slide.shapes.add_textbox(
            Inches(1.2), Inches(1.8), Inches(11), Inches(5.0)
        )
        tf = body_box.text_frame
        tf.word_wrap = True

        for i, bullet in enumerate(bullets):
            if i == 0:
                p = tf.paragraphs[0]
            else:
                p = tf.add_paragraph()

            p.text = f"• {bullet}"
            p.font.size = Pt(20)
            p.font.color.rgb = COLOR_BODY
            p.font.name = FONT_BODY
            p.space_after = Pt(12)
