# R3: AI Intro Course Report

**Date:** 2026-05-23
**Phase:** R3-AI-INTRO-COURSE
**Previous commit:** f88c74f

---

## 1. 当前 Commit

(待提交)

## 2. 修改文件列表

| 文件 | 操作 | 说明 |
|------|------|------|
| `docs/course_materials/ai_intro/人工智能导论.md` | 新增 | 11 章 AI 导论课程内容 |
| `scripts/seed_ai_intro_course.py` | 新增 | 种子脚本 |
| `scripts/_seed_core.py` | 新增 | 后端 DB 种子工具 |
| `scripts/_build_index.py` | 新增 | ChromaDB 索引构建工具 |
| `backend/app/api/app.py` | 修改 | demo-init 优先选择 AI 导论 |
| `docs/screenshots/r3_ai_intro_course/` | 新增 | 截图 |

## 3. 课程文件路径

`docs/course_materials/ai_intro/人工智能导论.md`

## 4. 种子脚本路径

`scripts/seed_ai_intro_course.py`

## 5. 脚本运行结果

- Course created: id=5
- 课程名: 人工智能导论
- Chunks: 8 (600 char size, 100 overlap)
- ChromaDB indexed: 8 vectors (via API `/api/rag/courses/5/build`)

## 6. 人工智能导论 course_id

**5**

## 7. Chunks 数量

**8**

## 8. demo-init 是否优先选择人工智能导论

**✅** — demo-init 返回 `"course": {"name": "人工智能导论", "id": 5}`

## 9. ask 是否命中人工智能导论内容

**✅** — ask 返回回答：过拟合与正则化的关系，包含 8 条 citations (source: ai_intro_course)

## 10. Citations 是否来自人工智能导论

**✅** — 所有 8 条 citation source 均为 `ai_intro_course`

## 11. Quiz 是否正常

**✅** — E2E 通过

## 12. Study Plan 是否正常

**✅** — E2E 通过

## 13. E2E 是否通过

**✅** — 1/1 passed (1.9m)

## 14. Quality Gate 是否通过

**✅** — 3/3 PASS

## 15. 截图路径

`docs/screenshots/r3_ai_intro_course/ai-intro-full-flow.png`

## 16. P0 问题

0

## 17. P1 问题

1 — ChromaDB 索引需通过 API 构建（sentence-transformers 在 WSL HF_HUB_OFFLINE=1 环境下命令行阻塞，但 API 调用正常）

## 18. P2 问题

0

## 19. 是否允许进入 SparkProvider 阶段

**✅ 允许** — AI 导论课程数据就绪，比赛演示主题已对齐
