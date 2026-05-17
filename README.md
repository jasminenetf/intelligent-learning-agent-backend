# 智能学习Agent — 高等教育个性化学习资源多智能体系统

## 项目概述
面向高校的个性化学习资源生成与辅导系统，基于多智能体架构和 Agentic RAG 技术，
以科大讯飞星火大模型为核心推理引擎。

## 当前阶段
阶段 1：FastAPI 后端骨架初始化

## 快速启动

### 本地开发
```bash
cd /home/zhang/projects/intelligent-learning-agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend
```

### Docker
```bash
docker compose up -d --build
curl http://127.0.0.1:8000/health
```

## 技术栈
| 层 | 技术 |
|----|------|
| 前端 | LobeChat |
| 后端 | FastAPI (Python) |
| Agent 编排 | LangGraph |
| 推理引擎 | 科大讯飞 Spark LLM |
| 向量库 | ChromaDB |
| 数据库 | PostgreSQL / SQLite |
| 多模态 | Mermaid.js + Presenton |
| 部署 | Docker Compose |

## 项目文档
- [PROJECT_BRIEF.md](PROJECT_BRIEF.md) — 项目简介与 MVP 范围
- [AGENTS.md](AGENTS.md) — Agent 角色定义与协作规则
- [TASKS.md](TASKS.md) — 任务清单
- [DECISIONS.md](DECISIONS.md) — 技术决策记录
- [RUNBOOK.md](RUNBOOK.md) — 运行手册
- [docs/source/](docs/source/) — 原始需求文档
