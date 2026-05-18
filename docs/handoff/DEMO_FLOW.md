# Demo 流程 — 智能学习Agent 演示脚本

> 本文档用于答辩/评审现场演示。当前 LLM 为 Mock 模式，资源生成内容为模板文本。

## 环境准备

```bash
# 1. 进入项目
cd /home/zhang/projects/intelligent-learning-agent/backend

# 2. 配置环境变量（必须复制到 backend/.env）
cp ../.env.example .env
# 编辑 .env，确认：
#   ADMIN_ENABLED=true    （启用管理后台）
#   LLM_PROVIDER=mock     （Mock 模式，暂无真 Key）
#   FILE_UPLOAD_MAX_MB=80 （支持大文件）

# 3. 启动
source ../.venv/bin/activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 演示流程

### Step 1: 注册/登录

```bash
# 注册管理员
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"demo_admin","password":"demopass123","email":"demo@test.com","role":"admin"}'

# 登录
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo_admin","password":"demopass123"}' \
  | jq -r .access_token)
```

### Step 2: 创建课程

```bash
curl -X POST http://localhost:8000/api/courses \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"高等数学(上)","description":"同济七版高数上课程"}'
# → course_id: 1
```

### Step 3: 上传教材（高数上.pdf 或 sample文本）

```bash
curl -X POST "http://localhost:8000/api/courses/1/files" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/mnt/c/Users/zhang/Desktop/智能学习agent/高数上.pdf"
# → file_id: 1, status: parsed/failed

# 如果 PDF 是扫描版 → status=failed
# 则执行 OCR:
curl -X POST "http://localhost:8000/api/ocr/files/1/build-rag" \
  -H "Authorization: Bearer $TOKEN"
```

### Step 4: 构建 RAG 索引

```bash
curl -X POST "http://localhost:8000/api/rag/courses/1/build" \
  -H "Authorization: Bearer $TOKEN"
# → indexed_chunks: N
```

### Step 5: RAG 问答

```bash
curl -X POST "http://localhost:8000/api/qa/courses/1/ask" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"什么是导数？","top_k":5}'
# → 返回带引用的回答（Mock 模式返回模板文本）
```

### Step 6: 生成学习资源

```bash
# 生成全部 4 类资源
curl -X POST "http://localhost:8000/api/resources/courses/1/generate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topic":"导数","resource_types":["mindmap","lecture_doc","quiz","ppt"]}'
# → mindmap: Mermaid 代码
# → lecture_doc: Markdown 讲义
# → quiz: JSON 测验题（含答案）
# → ppt: download_url
```

### Step 7: 下载 PPT

```bash
curl -OJ "http://localhost:8000/api/resources/download/{resource_id}" \
  -H "Authorization: Bearer $TOKEN"
# → 下载 PPTX 文件
```

### Step 8: 查看管理后台

```bash
# 浏览器打开 http://localhost:8000/admin
# 可查看 users / courses / course_files / knowledge_chunks
# 勿在生产环境开启
```

### Step 9: LobeChat 对接

```bash
# LobeChat 配置:
#   API Base URL: http://localhost:8000/v1
#   API Key: 任意非空字符串（JWT token 也可）
#   Model: mock（或 deepseek-chat 配置后）
```

## 当前 Mock 状态说明

| 组件 | 当前模式 | 真模式配置 |
|------|---------|-----------|
| LLM | mock（模板文本） | LLM_PROVIDER=deepseek + DEEPSEEK_API_KEY |
| Embedding | hash_mock（哈希向量） | EMBEDDING_PROVIDER=sentence_transformers |
| OCR | PyMuPDF text | 安装 tesseract-ocr + tesseract-ocr-chi-sim |

检测命令：
```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/llm/status
# → is_mock: true, embedding_is_mock: true
```

## 切换 DeepSeek 真模型

```bash
# 1. 编辑 backend/.env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxxxxxxx  # 替换为真实 Key

# 2. 重启服务
# 3. 验证
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/llm/status
# → is_mock: false, deepseek_configured: true
```

## 演示要点

1. **先展示 Mock 状态**：LLM Status 接口显示 is_mock=true，说明当前为管道验证
2. **展示知识库构建**：上传 PDF → chunk → ChromaDB → 可搜索
3. **展示 RAG 回答**：回答带引用来源（chunk_id、source、page_number）
4. **展示 4 类资源**：mindmap(Mermaid)、lecture(Markdown)、quiz(JSON)、ppt(PPTX下载)
5. **展示管理后台**：SQLAdmin 可视化
6. **如配真 Key**：展示真实 LLM 回答质量提升

## API 参考

完整 22 个端点见 openapi.json：
```bash
curl http://localhost:8000/openapi.json | jq '.paths | keys'
```
