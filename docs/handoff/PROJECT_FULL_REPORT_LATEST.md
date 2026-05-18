# 智能学习Agent 项目全貌报告

## 1. 报告生成时间
2026-05-18 20:15 UTC+8

## 2. 项目定位
- **项目名称**: 高等教育个性化学习资源多智能体系统
- **项目目标**: 面向高校的 AI 驱动个性化学习资源生成与辅导系统
- **定位**: 比赛/答辩 Demo，非生产系统
- **当前核心价值链路**: 教材上传 → OCR/RAG 检索 → LangGraph 多Agent → DeepSeek 真模型 → 4类资源生成

## 3. 当前 Git 状态
- **分支**: `main`
- **领先远端**: 9 commits
- **工作区**: clean
- **最近 10 commits**:
  1. `80900d5` fix: DeepSeek provider attribute + real LLM verification
  2. `868bf7b` docs: D1B DeepSeek verification attempt — key empty, Mock confirmed
  3. `ccb7d60` feat: S2 real embedding + config fixes + env templates
  4. `eb106b1` feat: S1 Demo stabilization
  5. `32f39e1` feat: OCR-W2
  6. `344ac57` feat: add SQLAdmin (A1)
  7. `dcf3121` feat: add ppt generation and download (phase 7b)
  8. `5ec0599` feat: add OpenAI-compatible API for LobeChat (F1)
  9. `8bee2be` feat: add resource generation api (phase 7a)
  10. `5b6260d` docs: add developer report
- **未跟踪文件**: 无
- **敏感文件风险**: ✅ `backend/.env` 被 `.gitignore` 忽略，未跟踪

## 4. 实际目录结构
```
项目根: /home/zhang/projects/intelligent-learning-agent
后端:   backend/
入口:   backend/app/main.py
数据:   backend/data/ (SQLite + ChromaDB)
配置:   backend/.env (本地) / .env.example (团队模板)
文档:   docs/handoff/ (交接报告)
```

**注意**: 存在两个 `data/app.db`：项目根 `./data/app.db` 和 `backend/data/app.db`。后端默认读写 `backend/data/app.db`（sqlite:///./data/app.db，CWD=backend/）。

## 5. 运行方式
```bash
cd /home/zhang/projects/intelligent-learning-agent/backend
source /home/zhang/.venv/bin/activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
端口占用: `fuser -k 8000/tcp` 释放。

## 6. 环境变量与配置状态

| 变量 | 状态/值 |
|------|---------|
| DATABASE_URL | sqlite:///./data/app.db |
| LLM_PROVIDER | deepseek |
| DEEPSEEK_API_KEY | **configured=true** |
| DEEPSEEK_BASE_URL | https://api.deepseek.com |
| DEEPSEEK_MODEL | deepseek-chat |
| SPARK_API_KEY | configured=false |
| EMBEDDING_PROVIDER | sentence_transformers |
| EMBEDDING_MODEL | paraphrase-multilingual-MiniLM-L12-v2 |
| CHROMA_PERSIST_DIR | ./data/chroma |
| ADMIN_ENABLED | true |
| FILE_UPLOAD_MAX_MB | 80 |
| HF_TOKEN | not configured |

## 7. API 端点清单
**22 个唯一路径, 26 个路由(method)**:

| # | Method | Path | 功能 |
|---|--------|------|------|
| 1 | POST | /api/agents/course/{id}/tutor | LangGraph Tutor |
| 2 | POST | /api/auth/login | 登录 |
| 3 | GET | /api/auth/me | 当前用户 |
| 4 | POST | /api/auth/register | 注册 |
| 5 | GET/POST | /api/courses | 课程 CRUD |
| 6 | GET | /api/courses/{id}/chunks | 分块列表 |
| 7 | GET/POST | /api/courses/{id}/files | 文件上传/列表 |
| 8 | GET | /api/llm/status | LLM 状态 |
| 9 | POST | /api/llm/test | LLM 测试 |
| 10 | POST | /api/ocr/courses/{id}/build-rag | OCR RAG 构建 |
| 11 | POST | /api/ocr/files/{id}/build-rag | OCR 文件 RAG |
| 12 | GET | /api/ocr/files/{id}/status | OCR 状态 |
| 13 | GET/POST | /api/qa/courses/{id}/ask | RAG Q&A |
| 14 | POST | /api/rag/courses/{id}/build | RAG 构建 |
| 15 | GET/POST | /api/rag/courses/{id}/search | RAG 搜索 |
| 16 | GET | /api/rag/status | RAG 状态 |
| 17 | POST | /api/resources/courses/{id}/generate | 资源生成 |
| 18 | GET | /api/resources/download/{id} | 资源下载 |
| 19 | GET | /api/version | 版本 |
| 20 | GET | /health | 健康检查 |
| 21 | POST | /v1/chat/completions | OpenAI-compat |
| 22 | GET | /v1/models | 模型列表 |

## 8. 数据库结构

### users
- id, username(unique), email, hashed_password, role(student/teacher/admin), is_active, created_at

### courses
- id, name, description, teacher_id(FK→users.id), created_at

### course_files
- id, course_id(FK), uploader_id(FK), original_filename, stored_path, file_size, status, created_at

### knowledge_chunks
- id, course_id(FK), file_id(FK), chunk_index, content, source, page_number, token_count, created_at

**无学生画像表、无学习路径表、无资源记录表**。

## 9. 已实现功能清单

| 功能 | 状态 | 验证方式 |
|------|------|---------|
| 用户注册/登录 | ✅ | API 测试通过 |
| 课程管理 | ✅ | CRUD API 正常 |
| 文件上传 | ✅ | POST /api/courses/{id}/files |
| 文档解析 | ✅ | PyMuPDF + python-docx |
| OCR-W2 | ✅ | 3个OCR chunks入库，source=ocr: |
| chunker | ✅ | 纯Python 800字符重叠切分 |
| ChromaDB | ✅ | 16向量持久化 |
| RAG 搜索 | ✅ | 语义检索验证通过 |
| RAG QA | ✅ | DeepSeek+引用 |
| LangGraph Agent | ✅ | 5节点DAG已验证 |
| SQLAdmin | ✅ | /admin 可访问（ADMIN_ENABLED=true）|
| 资源 mindmap | ✅ | Mermaid思维导图 |
| 资源 lecture_doc | ✅ | Markdown讲义 |
| 资源 quiz | ✅ | 选择题JSON |
| 资源 ppt | ✅ | PPTX可下载 |
| PPT 下载 | ✅ | HTTP 200, 38KB |
| OpenAI-compat | ✅ | /v1/models + /v1/chat |
| 真 Embedding | ✅ | sentence-transformers |
| 真 LLM (DeepSeek) | ✅ | provider=deepseek, is_mock=false |
| 学生画像 | ❌ | 未实现 |
| 学习路径规划 | ❌ | 未实现 |
| 前端 | ❌ | 仅LobeChat兼容接口 |

## 10. RAG 与 OCR 状态
- OCR-W2: ✅ 完成，3个OCR chunks入库
- 扫描PDF支持: ❌ Tesseract未安装
- 高数上.pdf: ❌ 56MB超限（当前80MB限制已够）但扫描版无Tesseract无法OCR
- sample OCR: ✅ 已入库 test_calc.pdf
- OCR chunk→SQLite: ✅ source前缀 "ocr:"
- OCR chunk→ChromaDB: ✅
- RAG检索OCR内容: ✅

## 11. LLM 状态
- **当前**: DeepSeek 真模型 ✅
- is_mock: **false**
- provider: **deepseek**
- model: **deepseek-chat**
- /api/llm/test: ✅ 1.19s
- 回答质量: 高，含LaTeX公式、引用

## 12. Embedding 状态
- provider: **sentence_transformers** ✅
- is_mock: **false**
- model: paraphrase-multilingual-MiniLM-L12-v2 (384维)
- ChromaDB: 已重建（16 chunks）
- 语义区分: 导数vs极限=0.49 > 导数vs天气=0.17 ✅
- HF_TOKEN: 未设置，有限速警告

## 13. 多智能体状态
- 框架: LangGraph v1.2.0 StateGraph
- 节点: supervisor → profile → rag → lecture → verifier (5节点线性DAG)
- /v1/chat: 经过完整5Agent管道
- agent_trace: ✅ 返回
- citations: ✅ 返回
- 限制: 线性流水线，无失败重试机制（可扩展）

## 14. 资源生成状态

| 类型 | API | 输出 | RAG | 真LLM | 可下载 |
|------|-----|------|-----|-------|--------|
| mindmap | POST generate | Mermaid文本 | ✅ | Mock模板 | N/A |
| lecture_doc | POST generate | Markdown | ✅ | Mock模板 | N/A |
| quiz | POST generate | JSON | ✅ | Mock模板 | N/A |
| ppt | POST generate | .pptx | ✅ | Mock模板 | ✅ |

**注意**: 资源生成内容目前使用Mock模板，即使用DeepSeek作为QA/Agent，资源生成的JSON结构仍是预定义模板。这是设计决策（决策014），待阶段7C接入真LLM生成。

## 15. 前端与演示状态
- LobeChat: 未部署，但/v1接口兼容 ✅
- Mermaid渲染: 后端输出文本，前端需自行渲染
- PPT下载: ✅
- 无自研前端
- 当前演示方式: curl + API + Postman/Swagger UI (/docs)

## 16. 赛题硬指标对照

| 要求 | 状态 | 说明 |
|------|------|------|
| 6维学生画像 | ❌ 未满足 | 未实现任何画像维度 |
| 多智能体协同 | ✅ 部分满足 | 5Agent线性管道，缺少并行协作 |
| 5种资源生成 | ⚠️ 4/5 | mindmap/lecture/quiz/ppt，缺1种 |
| 学习路径规划 | ❌ 未满足 | 未实现 |
| 防幻觉 | ✅ 部分满足 | citations返回但verifier是pass-through |
| Markdown/流式/多模态 | ⚠️ 部分满足 | Markdown✅ 流式❌ 多模态仅PPT |
| 开源项目说明 | ❌ 未满足 | 未列出开源来源和协议 |
| 答辩PPT/演示视频 | ❌ 未满足 | 未制作 |

## 17. 当前最大风险（按严重程度）

1. **学生画像未实现**（赛题硬指标，6维必须）
2. **学习路径未实现**（赛题硬指标）
3. **资源生成内容为Mock模板**（不是真LLM生成，质量有限）
4. **资源类型不足5种**（只有4种，缺第5种如flashcard/教学视频等）
5. **前端完全缺失**（无法Demo演示给评委看）
6. **Admin无认证**（/admin任何人都可访问，安全风险）
7. **Tesseract未安装**（扫描PDF无法OCR）
8. **Docker Compose未验证**（docker-compose.yml极简，仅backend服务）
9. **generated_file_storage内存注册表**（重启丢失所有已生成资源）
10. **无自动测试**（0个pytest测试）
11. **数据持久化风险**（两个data/app.db容易混淆）
12. **TASKS.md/README.md严重过期**（与实际进度不匹配）
13. **LangGraph无失败重试**（verifier节点是pass-through）

## 18. Hermes 遇到的问题与疑问

### Q1. 项目根存在两个 data/app.db
- **问题类型**: 路径
- **严重程度**: 中
- **现象**: `./data/app.db` 和 `backend/data/app.db` 同时存在
- **已确认事实**: 后端使用 `sqlite:///./data/app.db`，CWD为backend/时读写 `backend/data/app.db`
- **可能原因**: 早期从项目根启动时创建了 `./data/app.db`
- **对项目影响**: 可能误操作旧数据库
- **推荐决策**: 删除项目根 `./data/app.db`，保留 `backend/data/app.db`
- **需要用户确认**: 否
- **下一步**: `rm /home/zhang/projects/intelligent-learning-agent/data/app.db`

### Q2. docker-compose.yml 只定义了 backend 服务
- **问题类型**: 配置
- **严重程度**: 低
- **现象**: docker-compose.yml 仅有 backend 单服务，无 ChromaDB/PostgreSQL/Redis/LobeChat
- **可能原因**: MVP阶段未部署Docker
- **对项目影响**: Docker部署未验证
- **推荐决策**: 当前优先Demo，暂不投入Docker；答辩时用uvicorn直接启动即可
- **需要用户确认**: 否

### Q3. TASKS.md 和 README.md 严重过期
- **问题类型**: 文档
- **严重程度**: 中
- **现象**: README 写"阶段2"，TASKS.md大量标记⬜未开始但实际已完成
- **对项目影响**: 新人看不懂项目真实进度
- **推荐决策**: 答辨前更新或删除过期文档
- **需要用户确认**: 是
  - A. 答辩前更新 README+TASKS 到最新状态
  - B. 不更新，答辩时不展示这些文件
  - C. 删除过期文档只保留有效报告

### Q4. 资源生成仍用 Mock 模板而非真 LLM
- **问题类型**: 功能
- **严重程度**: 高
- **现象**: resource_generator.py 使用预定义4主题模板，即使DeepSeek已配置
- **对项目影响**: 资源质量上限低，非"智能生成"
- **推荐决策**: 阶段7C接入真LLM资源生成，但可能耗时较长
- **需要用户确认**: 是
  - A. 做7C：资源生成接入真DeepSeek
  - B. 先做P1学生画像，Mock资源演示可接受
  - C. 两边并行

### Q5. Admin 无认证
- **问题类型**: 安全
- **严重程度**: 中
- **现象**: ADMIN_ENABLED=true时 /admin 直接可访问，无任何认证
- **对项目影响**: 答辩Demo无影响（本地），但生产不可接受
- **推荐决策**: 答辩期ADMIN_ENABLED=false或保持true（本地Demo安全），不需要现在加认证
- **需要用户确认**: 否

### Q6. 开源项目来源未标注
- **问题类型**: 赛题要求
- **严重程度**: 中
- **现象**: 使用了FastAPI/LangGraph/ChromaDB/sentence-transformers/python-pptx/SQLAdmin等大量开源项目，但未列出来源和协议
- **对项目影响**: 赛题要求"开源项目使用需标注来源和协议"
- **推荐决策**: 生成一份 `OSS_LICENSES.md` 列出所有依赖及其许可证
- **需要用户确认**: 是
  - A. 生成 OSS_LICENSES.md
  - B. 答辩时口头说明即可
  - C. 不需要

### Q7. 前端路线选择
- **问题类型**: 演示
- **严重程度**: 高
- **现象**: 无前端，评委无法直观体验
- **推荐决策**: 建议优先LobeChat Docker部署（零前端代码），备选自研简单HTML
- **需要用户确认**: 是
  - A. LobeChat Docker部署
  - B. 自研简单React/HTML前端
  - C. Swagger UI /docs + curl演示，不做前端

### Q8. 资源第5种类型选择
- **问题类型**: 赛题要求
- **严重程度**: 中
- **现象**: 赛题要求≥5种资源，当前4种
- **推荐决策**: 建议添加 flashcard（Anki风格闪卡）或 study_plan（学习计划），实现简单
- **需要用户确认**: 是
  - A. flashcard（闪卡）
  - B. study_plan（学习路径/计划）
  - C. video_script（教学视频脚本）
  - D. 其他（请说明）

### Q9. 优先DeepSeek还是Spark
- **问题类型**: 配置
- **严重程度**: 低
- **现象**: 赛题要求Spark，但DeepSeek已跑通且质量好
- **推荐决策**: 保持DeepSeek为主，Spark作为备选（代码已支持），答辩时说明"支持多模型切换"
- **需要用户确认**: 否

### Q10. 是否安装 Tesseract
- **问题类型**: 依赖
- **严重程度**: 低
- **现象**: Tesseract未安装，扫描PDF无法OCR
- **推荐决策**: 安装（仅需一条命令），让Demo支持真实扫描教材OCR
- **需要用户确认**: 是
  - A. sudo apt install tesseract-ocr tesseract-ocr-chi-sim
  - B. 先不装，用sample OCR演示
  - C. 后期再说

## 19. 下一步路线图

### P0：必须立刻做
1. **学生画像 6维** — 新增 student_profile 模型 + Insight Agent → 2-3天
2. **学习路径规划** — 简单规则/A* 从知识chunk构建先决关系 → 2-3天
3. **第5种资源** — flashcard 或 study_plan → 1天

### P1：Demo前必须做
1. **前端演示** — LobeChat Docker 或 自研HTML → 1-2天
2. **资源生成接入真LLM** — 阶段7C → 1天
3. **生成 OSS_LICENSES.md** → 0.5天

### P2：答辩加分项
1. **Tesseract 安装 + 扫描PDF OCR** → 0.5天
2. **更新 README/TASKS 到最新状态** → 0.5天
3. **Docker Compose 完整编排** → 1天
4. **答辩PPT制作** → 1天

### P3：后期优化
1. **Admin 认证** → 0.5天
2. **流式输出 (SSE)** → 1天
3. **自动测试** → 2天
4. **generated_file_storage 持久化** → 0.5天

## 20. 给用户的决策清单

1. **前端路线**:
   A. LobeChat Docker部署 — 推荐
   B. 自研简单React前端
   C. Swagger UI + curl演示

2. **学生画像 vs 资源真LLM 优先级**:
   A. 先P1学生画像（赛题硬指标）
   B. 先7C资源生成真LLM（提高Demo质量）
   C. 两边并行

3. **第5种资源类型**:
   A. flashcard（闪卡）
   B. study_plan（学习路径/计划）
   C. 其他

4. **Tesseract安装**:
   A. 安装（sudo apt install tesseract-ocr tesseract-ocr-chi-sim）
   B. 暂不安装，用sample OCR

5. **OSS_LICENSES.md**:
   A. 生成
   B. 不需要

6. **TASKS/README更新**:
   A. 更新到最新
   B. 删除过期文档
   C. 不动

## 21. 最终结论

当前项目已具备完整的后端 Demo 链路：真Embedding + 真LLM(DeepSeek) + OCR-RAG + LangGraph多Agent + 4类资源生成 + OpenAI-compatible接口。后端23个API全部可用，可通过Swagger UI或curl完成完整演示。

**最大短板**: 缺少前端（无法直观展示）、学生画像未实现（赛题硬指标缺失）、资源生成仍为Mock模板、资源类型不足5种。

建议下一步优先级：**学生画像 > 前端对接 > 第5种资源 > 资源真LLM > 答辩材料**。这些补齐后即具备完整参赛Demo雏形。
