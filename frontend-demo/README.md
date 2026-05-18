# 智能学习Agent — 前端 Demo

## 定位

比赛答辩用的最小前端页面。单文件 HTML，零依赖构建，可直接用于答辩录屏。

## 启动方式

```bash
# 1. 启动后端
cd /home/zhang/projects/intelligent-learning-agent/backend
source ../.venv/bin/activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 2. 启动前端（新终端）
cd /home/zhang/projects/intelligent-learning-agent/frontend-demo
python -m http.server 5173

# 3. 浏览器打开
# http://127.0.0.1:5173
```

## 登录方式

- **方式 A**：左侧登录表单输入用户名/密码，点击登录（支持 admin_ocr / admintest123）
- **方式 B**：手动从 Swagger 获取 Token 后粘贴到"Token"输入框

## course_id 获取

```bash
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8000/api/courses
```

默认已预填 course_id=2（高等数学上）

## 演示流程

1. 点击"登录"获取 Token
2. 点击"检查状态"确认 DeepSeek 在线
3. 点击"提取画像"生成 8 维学生画像
4. 输入问题 → "提问"进行 RAG 问答
5. 选择资源类型 → "生成资源"（mindmap/lecture/quiz/ppt/study_plan）
6. 思维导图自动 Mermaid 渲染
7. 测验题卡片展示
8. PPT 点击下载
9. 学习路径步骤卡片展示
10. 点击"全流程演示"一键跑完所有步骤

## 常见问题

### CORS 错误
后端已配置 CORS（见 backend/app/main.py），支持 127.0.0.1:5173 / localhost:5173

### Token 过期
重新登录即可

### 后端未启动
检查 8000 端口：`curl http://127.0.0.1:8000/health`

### 资源生成耗时
DeepSeek 生成需 5-15 秒/类，study_plan 最快，quiz 和 lecture 较慢

### PPT 下载
点击下载链接，浏览器会自动下载 .pptx 文件。如被拦截，检查弹窗设置

### Mermaid 不渲染
检查网络能否访问 cdn.jsdelivr.net。如离线，mindmap 仍会显示纯文本 Mermaid 源码

## 技术说明

- 纯 HTML+CSS+JS，无构建工具
- Mermaid 通过 CDN 加载（jsdelivr）
- 所有 API 调用通过 fetch + JWT Bearer Token
- CORS 由后端 FastAPI CORSMiddleware 处理
