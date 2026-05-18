# S2 真实模型 + 真实 Embedding + Demo 质量验证报告

## 执行日期
2026-05-18

## 1. 当前 LLM Provider
- **状态**: Mock (is_mock=true)
- **原因**: `backend/.env` 中 `DEEPSEEK_API_KEY=` 为空
- **配置已就绪**: `LLM_PROVIDER=deepseek` + `DEEPSEEK_BASE_URL=https://api.deepseek.com`
- **待用户操作**: 在 `backend/.env` 中填入真实 `DEEPSEEK_API_KEY=sk-xxx`，然后重启后端

## 2. 当前 Embedding Provider
- **状态**: 真实 (embedding_is_mock=false) ✅
- **提供者**: sentence_transformers
- **模型**: `paraphrase-multilingual-MiniLM-L12-v2`
- **维度**: 384
- **语义区分验证**:
  - 导数 vs 极限: cos=0.4902
  - 导数 vs 天气: cos=0.1736
  - 语义区分有效 ✅

## 3. .env 路径复核
- `config.py` 中 `env_file = [".env", "../.env"]` — **正确** ✅
- 优先级: `backend/.env` → `项目根/.env`
- 修复了 config.py 中重复的 `SPARK_API_KEY` 字段

## 4. DeepSeek 配置
- DeepSeekProvider 代码完整 (llm_provider.py) ✅
- 通过 OpenAI-compatible HTTP API 调用 ✅
- `backend/.env` 模板已创建 ✅
- `backend/.env.example` 已创建 ✅
- **阻塞项**: 需要用户填入真实 API Key

## 5. Embedding 切换结果
- 安装 `sentence-transformers==5.5.0` ✅
- 下载模型 `paraphrase-multilingual-MiniLM-L12-v2` (384维, ~470MB) ✅
- 切换到 `EMBEDDING_PROVIDER=sentence_transformers` ✅
- 旧 ChromaDB (hash_mock) 已删除并重建 ✅
- 新索引使用真实语义向量 ✅

## 6. RAG 搜索质量样例

### 搜索"导数"
| 排名 | score | 来源 | 内容预览 |
|------|-------|------|---------|
| 1 | 0.4025 | 高数上_demo_knowledge.txt | 分作为和的极限的思想，掌握分割近似求和方法 |
| 2 | 0.3116 | test_calc.pdf | 函数是高等数学的核心概念之一... |
| 3 | 0.3116 | ocr:test_calc.pdf | 函数是高等数学的核心概念之一... |

## 7. QA 回答样例
- **问题**: 什么是导数
- **Provider**: mock (待切换 DeepSeek)
- **Citations**: 5条
- **Agent Trace**: supervisor → profile → rag → lecture → verifier (LangGraph 多Agent链路正常)

## 8. 4类资源生成验证

| 类型 | 状态 | 详情 |
|------|------|------|
| mindmap | ✅ | Mermaid 思维导图 (导数, 4节点+子节点) |
| lecture_doc | ✅ | Markdown 讲义 (4节, 603字符) |
| quiz | ✅ | 4道选择题 (含解析) |
| ppt | ✅ | 8页 PPTX 课件 (38KB, 下载正常) |

Download API: `GET /api/resources/download/{resource_id}` → 200, 返回 .pptx 文件 ✅

## 9. OpenAI-compatible 接口验证

| 端点 | 状态 | 详情 |
|------|------|------|
| GET /v1/models | ✅ 200 | 返回 `intelligent-learning-tutor` |
| POST /v1/chat/completions | ✅ 200 | LangGraph 多Agent链路完整 |

LobeChat 兼容：响应格式含 `id`, `choices[].message.content`, `usage`, `agent_trace`, `citations`

## 10. API 端点总数
- 当前: **23** (与S1一致，无减少)
- 新增: 无（本次仅修改内部配置和依赖）

## 11. 当前仍存在的问题
1. **LLM 仍是 Mock** — 需用户填入 `DEEPSEEK_API_KEY` 后重启
2. **RAG 语义检索质量已提升**（真实 embedding），但 Mock LLM 回答仍是模板
3. **HF_TOKEN 未设置** — HuggingFace 下载模型有限速警告，可设 `HF_TOKEN` 提升下载速度
4. **前端未对接** — 后端链路完整，缺少前端界面

## 12. 新增/修改文件清单

### 新增
- `backend/.env` — 运行环境配置模板
- `backend/.env.example` — 团队共享配置模板
- `docs/handoff/S2_REAL_MODEL_REPORT.md` — 本报告

### 修改
- `backend/app/core/config.py` — 移除重复的 `SPARK_API_KEY`
- `backend/requirements.txt` — 补全 chromadb/openai/numpy/python-pptx/sentence-transformers

## 13. 下一步建议
1. **立即**: 在 `backend/.env` 填入真实 `DEEPSEEK_API_KEY`，重启后端
2. **验证**: `/api/llm/status` 确认 `is_mock=false`, `deepseek_configured=true`
3. **深入**: 用真模型重新跑 RAG QA + 资源生成，对比 Mock 质量
4. **前端**: 对接 LobeChat 或自建前端
