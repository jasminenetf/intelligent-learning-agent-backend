# 最终交付 QA 验收报告 v2

> 测试时间: 2026-05-18 18:50 · commit 1d30eb7+ · 全链路重测

---

## 交付等级: A — 可交付

## 安全

| 项 | 结果 |
|----|------|
| backend/.env gitignore | ✅ |
| git ls-files count | ✅ 0 |
| Key 泄露 | ✅ 无 |

## 启动

| 项 | 结果 |
|----|------|
| start_app.sh bash -n | ✅ |
| stop_app.sh bash -n | ✅ |
| Windows bat ASCII | ✅ |
| 桌面 bat | ✅ |
| 后端 8000 | ✅ |
| 前端 5173 | ✅ |

## API

28 paths / 33 routes — 全部核心接口存在且正常

## LLM / Embedding

| 项 | 值 |
|----|-----|
| provider | deepseek |
| is_mock | **false** |
| deepseek_configured | true |
| embedding_provider | sentence_transformers |
| embedding_is_mock | **false** |

## 功能验证（全部 PASS）

| 功能 | 结果 |
|------|------|
| 注册 qatest | ✅ |
| 登录 demo(teacher) | ✅ |
| 8维画像提取 | ✅ beginner |
| RAG问答 | ✅ 686字 + 5 citations |
| mindmap | ✅ deepseek, fallback=false |
| lecture_doc | ✅ deepseek, fallback=false |
| quiz | ✅ deepseek, 5 items |
| ppt | ✅ deepseek, 8 slides, 38KB |
| study_plan | ✅ deepseek, 4 steps |
| PPT下载 | ✅ 200, 38KB |
| /v1/models | ✅ 200 |
| /v1/chat | ✅ 200 |

## 前端

精简为资源面板：登录、画像、5类资源生成、PPT下载、一键演示。修复 course_id 自动切换 bug。

## LobeChat 对接

```bash
# Docker 方式（推荐）
docker run -d -p 3210:3210 \
  -e OPENAI_API_KEY=any \
  -e OPENAI_BASE_URL=http://127.0.0.1:8000/v1 \
  lobehub/lobe-chat
# → http://127.0.0.1:3210

# 无 Docker：在线版 https://chat-preview.lobehub.com
# 设置 → 自定义 API → http://127.0.0.1:8000/v1
```

## OCR

Tesseract 未安装。OCR-W2 代码完整，sample OCR 可检索。

## 阻塞问题

**无。**

## 非阻塞

Tesseract 未安装、无自动测试、Markdown 纯文本渲染。

## 结论

**可交付。** 双击 bat → 浏览器打开 → 填 Key → 登录 → 使用。LobeChat 负责聊天，资源面板负责画像+5类资源+PPT下载。
