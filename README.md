# 智能学习Agent — 高等教育个性化学习资源多智能体系统

## 项目概述
面向高校的个性化学习资源生成与辅导系统，基于 LangGraph 多智能体架构和 Agentic RAG 技术。

## 当前状态 (2026-05-18)

### ✅ 已完成
- 用户注册/登录 (JWT)
- 课程管理 + 文件上传
- OCR-W2 (PDF→文本→chunk→ChromaDB)
- RAG 搜索 (真语义 Embedding)
- RAG Q&A (DeepSeek 真模型 + 引用)
- LangGraph 5Agent 多智能体 (supervisor→profile→rag→lecture→verifier)
- SQLAdmin 管理后台 (/admin)
- 6维学生画像 (新增)
- 5类资源生成: mindmap, lecture_doc, quiz, ppt, study_plan
- OpenAI-compatible API (/v1/models, /v1/chat/completions)
- LobeChat 兼容接口
- 真 Embedding: sentence-transformers MiniLM-L12-v2
- 真 LLM: DeepSeek deepseek-chat

### 🔄 进行中
- 前端对接

### ❌ 未完成
- 前端界面
- 流式输出
- 自动测试
- Docker 部署验证
- 答辩 PPT/视频

## 快速启动

```bash
cd backend
source /home/zhang/.venv/bin/activate
cp .env.example .env
# 编辑 .env: 填入 DEEPSEEK_API_KEY=sk-xxx
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 技术栈
FastAPI + SQLModel + ChromaDB + LangGraph + DeepSeek + sentence-transformers + python-pptx

## 安全提醒
- `backend/.env` 包含 API Key，已被 `.gitignore` 忽略
- 不要将 `.env` 提交到 Git

## 文档
- [PROJECT_BRIEF.md](PROJECT_BRIEF.md) — 项目简介
- [DECISIONS.md](DECISIONS.md) — 技术决策
- [OSS_LICENSES.md](OSS_LICENSES.md) — 开源协议
- [docs/handoff/](docs/handoff/) — 阶段报告
