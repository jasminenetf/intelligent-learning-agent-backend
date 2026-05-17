# 运行手册 — 智能学习Agent系统

## 环境要求
- Docker 24+ + Docker Compose v2
- Python 3.10+（本地开发）
- 科大讯飞 Spark API 凭证（APP_ID、API_KEY、API_SECRET）

## 快速启动

### 1. 获取 Spark 凭证
访问 https://xinghuo.xfyun.cn 注册 → 创建应用 → 获取 APP_ID / API_KEY / API_SECRET

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env，填入：
# SPARK_APP_ID=xxx
# SPARK_API_KEY=xxx
# SPARK_API_SECRET=xxx
```

### 3. 启动所有服务
```bash
docker compose up -d
```

### 4. 验证
| 服务 | 地址 | 验证方式 |
|------|------|----------|
| LobeChat | http://localhost:3210 | 浏览器打开，用 ACCESS_CODE 登录 |
| FastAPI | http://localhost:8000/docs | Swagger UI |
| ChromaDB | http://localhost:8001 | 后端内部调用 |
| Minio | http://localhost:9001 | 文件存储控制台 |

### 5. 停止
```bash
docker compose down
```

## 常用命令

```bash
# 查看日志
docker compose logs -f backend

# 重启单个服务
docker compose restart backend

# 进入后端容器
docker compose exec backend bash

# 数据库迁移
docker compose exec backend python -m app.db.migrate
```

## 目录结构
```
project-root/
├── frontend/        # LobeChat 配置
├── backend/
│   ├── app/
│   │   ├── api/     # FastAPI 路由
│   │   ├── agents/  # LangGraph Agent 节点
│   │   ├── services/# 业务逻辑
│   │   ├── models/  # ORM 模型
│   │   └── main.py  # 入口
│   └── Dockerfile
├── data/            # 上传文件、向量库持久化
├── scripts/         # 工具脚本
├── docker-compose.yml
└── docs/            # 文档
```

## 故障排查

| 问题 | 解决 |
|------|------|
| Spark API 调用失败 | 检查 .env 凭证是否正确，API 额度是否耗尽 |
| ChromaDB 无法连接 | `docker compose restart chroma` |
| Presenton 生成失败 | 检查 Presenton 容器日志，确认 API 密钥 |
| 向量检索无结果 | 确认已上传教材并构建索引 |
| 端口冲突 | 修改 docker-compose.yml 中的端口映射 |

## 开发模式
```bash
# 后端热重载
cd backend && uvicorn app.main:app --reload --port 8000

# 仅启动基础设施（不启动后端）
docker compose up -d chroma postgres redis minio
```
