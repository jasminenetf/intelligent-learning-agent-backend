# D1B DeepSeek 真 LLM 验证与 .env 安全复核报告

**执行日期**: 2026-05-18

---

## 1. .env 安全检查

| 检查项 | 命令 | 结果 |
|--------|------|------|
| git status | `git status --short` | 空（工作区干净）|
| gitignore 规则 | `git check-ignore -v backend/.env` | `.gitignore:19:.env	backend/.env` ✅ |
| 是否被跟踪 | `git ls-files backend/.env` | 无输出 ✅ |
| 工作区状态 | `git status --ignored backend/.env` | 被忽略 ✅ |

**结论**: `backend/.env` 未被 Git 跟踪，安全 ✅

---

## 2. DeepSeek Key 配置状态

| 配置项 | 值 |
|--------|-----|
| LLM_PROVIDER | deepseek |
| DEEPSEEK_API_KEY configured | **false**（为空）|
| DEEPSEEK_MODEL | deepseek-chat |
| DEEPSEEK_BASE_URL | https://api.deepseek.com |
| EMBEDDING_PROVIDER | sentence_transformers |
| EMBEDDING_MODEL | paraphrase-multilingual-MiniLM-L12-v2 |

---

## 3. 当前 LLM 状态

**⚠️ 仍为 Mock** — `is_mock=true`

- DeepSeekProvider 代码完整 ✅
- 环境变量配置就绪 ✅
- 真实调用尚未验证 ❌
- **原因**: `backend/.env` 第3行 `DEEPSEEK_API_KEY=` 为空
- **停止真模型验证** — 遵循"Key为空则明确停止，不假装完成"

---

## 4. 真模型验证结果

**未执行** — DEEPSEEK_API_KEY 为空。

以下验证项待 Key 填入后执行：
- [ ] /api/llm/status → is_mock=false
- [ ] /api/llm/test → 真实模型回答
- [ ] /api/qa/courses/{id}/ask → RAG + 真 LLM
- [ ] /api/resources/courses/{id}/generate → 真模型生成4类资源
- [ ] /v1/chat/completions → 真模型 + LangGraph

---

## 5. API 端点复核（22 个唯一路径）

| # | 方法 | 路径 | 功能 |
|---|------|------|------|
| 1 | POST | /api/agents/course/{id}/tutor | LangGraph Tutor |
| 2 | POST | /api/auth/login | 登录 |
| 3 | GET | /api/auth/me | 当前用户 |
| 4 | POST | /api/auth/register | 注册 |
| 5 | GET/POST | /api/courses | 课程列表/创建 |
| 6 | GET | /api/courses/{id}/chunks | 课程分块列表 |
| 7 | GET/POST | /api/courses/{id}/files | 文件上传/列表 |
| 8 | GET | /api/llm/status | LLM 状态 |
| 9 | POST | /api/llm/test | LLM 测试 |
| 10 | POST | /api/ocr/courses/{id}/build-rag | OCR 课程 RAG |
| 11 | POST | /api/ocr/files/{id}/build-rag | OCR 文件 RAG |
| 12 | GET | /api/ocr/files/{id}/status | OCR 文件状态 |
| 13 | GET/POST | /api/qa/courses/{id}/ask | RAG Q&A |
| 14 | POST | /api/rag/courses/{id}/build | RAG 索引构建 |
| 15 | GET/POST | /api/rag/courses/{id}/search | RAG 搜索 |
| 16 | GET | /api/rag/status | RAG 状态 |
| 17 | POST | /api/resources/courses/{id}/generate | 资源生成 |
| 18 | GET | /api/resources/download/{id} | 资源下载 |
| 19 | GET | /api/version | 版本信息 |
| 20 | GET | /health | 健康检查 |
| 21 | POST | /v1/chat/completions | OpenAI-compat |
| 22 | GET | /v1/models | 模型列表 |

**说明**: 22 个唯一路径，含多个 GET+POST 同路径的情况。计路由+方法共 26 个端点。0 新增/减少。

---

## 6. 当前问题

1. **DEEPSEEK_API_KEY 为空** — LLM 仍是 Mock
2. DeepSeek 真模型 0 项验证通过
3. 前端未对接
4. HF_TOKEN 未设置

---

## 7. 下一步建议

1. 填入 `DEEPSEEK_API_KEY` 后重新执行 D1B 验证
2. 如 Key 暂时无法获取 → 直接推进 P1 学生画像 + 学习路径规划
