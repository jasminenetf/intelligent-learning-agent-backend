# R1 产品级重构计划

## 1. 为什么当前页面不可交付

旧版 `frontend-demo/index.html` 是一个 **API 调试面板**，不是产品界面：

- 用户必须理解 Token、Course ID、API Base、API Path 等工程概念
- 左侧堆叠了连接、课程、画像、资源生成、一键演示等表单控件
- 右侧大面积空白，只有 JSON 或资源结果文本
- 没有学习助手主线流程
- 画像、RAG、资源生成、学习路径彼此割裂在独立按钮中
- 学生需要手动填写 Course ID、选择 API Base 才能开始使用
- 界面像是开发者调试工具而非学习软件

用户反馈："现在整个项目功能就是一坨屎，根本不能交上去，用起来界面交互也很难受。"

## 2. 旧 FINAL-QA 的局限

`docs/handoff/FINAL_DELIVERY_QA_REPORT.md` 验证的是：
- 接口能否返回 200
- 后端编译是否通过
- API Key 是否暴露

它**不能**证明：
- 产品界面是否可用
- 用户能否在 5 分钟内完成主流程演示
- 页面是否有合理的信息架构
- 资源是否可视化展示
- 学习流程是否连贯

**旧 QA 报告作废**，本轮重构完成后重新验收。

## 3. 新交付标准

| 标准 | 要求 |
|------|------|
| Token 暴露 | 用户不接触 Token 输入框 |
| Course ID 暴露 | 用户不接触 Course ID |
| API Path 暴露 | 用户不接触 API Base URL |
| 页面空白 | 无大面积空白，所有区域有意义内容 |
| 演示时间 | 主流程 5 分钟内可完整演示 |
| 状态引导 | 每个状态都有下一步引导 |
| 资源展示 | 5 类资源都有可视化展示区 |
| 功能统一 | 画像、RAG、问答、资源、路径统一在一个工作台 |
| 聚合 API | 后端有 `/api/app/*` 聚合接口支撑前端 |

## 4. 重构方案

### 后端新增
- `backend/app/api/app.py` - 6 个产品聚合接口
  - `GET /api/app/bootstrap` - 启动状态
  - `POST /api/app/demo-init` - 一键演示初始化
  - `GET /api/app/dashboard` - 工作台数据
  - `POST /api/app/ask` - 统一问答
  - `POST /api/app/generate` - 统一资源生成
  - `POST /api/app/run-demo` - 全流程演示

### 前端重构
- `frontend-demo/index.html` → 完全重写为学习工作台
- 新增 `frontend-demo/app.css` - 完整样式
- 新增 `frontend-demo/app.js` - 应用逻辑
- 7 个主导航页面：学习助手、课程管理、知识库、资源生成、学习路径、数据看板、设置

### 用户流程
1. 打开页面 → 看到设置页（配置 API Key）
2. 配置 Key → 测试连接
3. 点击演示账号 → 自动初始化
4. 选择课程 → 开始学习
5. 学习助手：左侧聊天 → 中间 Artifacts → 右侧文献溯源

## 5. 文件清单

| 文件 | 操作 |
|------|------|
| `docs/handoff/R1_PRODUCT_REBUILD_PLAN.md` | 新增 |
| `backend/app/api/app.py` | 新增 |
| `backend/app/main.py` | 修改（注册路由） |
| `frontend-demo/index.html` | 重写 |
| `frontend-demo/app.css` | 新增 |
| `frontend-demo/app.js` | 新增 |
| `frontend-demo/README.md` | 更新 |
| `README.md` | 更新 |
| `docs/handoff/R1_PRODUCT_REBUILD_REPORT.md` | 新增 |
