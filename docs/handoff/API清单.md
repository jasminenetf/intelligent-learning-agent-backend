# API 清单

## 健康与版本
| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | /health | 公开 | 健康检查 |
| GET | /api/version | 公开 | 版本 |

## 认证
| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | /api/auth/register | 公开 | 注册 |
| POST | /api/auth/login | 公开 | 登录→JWT |
| GET | /api/auth/me | 登录 | 当前用户 |

## 课程
| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | /api/courses | teacher/admin | 创建 |
| GET | /api/courses | 登录 | 列表 |
| POST | /api/courses/{id}/files | teacher/admin | 上传 |
| GET | /api/courses/{id}/files | 登录 | 文件列表 |
| GET | /api/courses/{id}/chunks | teacher/admin | chunks |

## RAG
| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | /api/rag/courses/{id}/build | teacher/admin | 构建索引 |
| GET/POST | /api/rag/courses/{id}/search | 登录 | 检索 |
| GET | /api/rag/status | teacher/admin | 状态 |

## LLM/QA
| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | /api/llm/status | teacher/admin | Provider 状态 |
| POST | /api/llm/test | teacher/admin | 调用测试 |
| GET/POST | /api/qa/courses/{id}/ask | 登录 | RAG QA |

## 多智能体
| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| POST | /api/agents/course/{id}/tutor | 登录 | 5 Agent 教学 |

**共 20 端点，6 模块。**
