# R3: UI/UX Bug Audit Report

**Date:** 2026-05-23
**Phase:** R3-UI-UX-BUG-AUDIT
**Previous commit:** 2ae1a87

---

## 1. 当前 Commit

(待提交)

## 2. 审计范围

- 首页/比赛演示入口
- 自动学习流程 (4 步)
- AI 回答区
- 引用来源区
- 思维导图/知识结构
- Quiz 即时反馈
- 学习报告卡片
- 学习路径卡片
- 多智能体过程
- 设置页 (DeepSeek / Spark / Fallback)
- 高级功能(7 个旧页面)
- Console / Network / API

## 3. 运行环境

- Browser: Chromium (Playwright + real browser)
- Backend: DeepSeek (25s AbortController timeout)
- Course: 人工智能导论 (id=5)

## 4. E2E 基线结果

- `demo-auto-flow.spec.js`: ✅ 1/1 passed (1.9m)
- `ui-audit.spec.js`: ⚠️ citation-card absent (API timeout → expected)

## 5. 人工浏览器审计结果

真实浏览器完整操作 3 遍。每遍均触发 API 超时 → fallback 链。

## 6. UI/UX 总评分: 72/100

| 维度 | 得分 | 满分 | 说明 |
|------|------|------|------|
| 清晰度 | 14 | 20 | 入口清晰，但 fallback 时多个"失败"标签造成困惑 |
| 操作顺畅度 | 16 | 20 | 一键启动，自动流程顺畅；等待时间 90s+ |
| 视觉观感 | 11 | 15 | 三栏布局合理，引用区 fallback 时空白减分 |
| 错误处理 | 10 | 15 | API 超时时所有区域显示"失败"，非降级语义 |
| 学习闭环表达 | 11 | 15 | 闭环完整，但"失败"文案破坏可信度 |
| 录屏稳定性 | 10 | 15 | 流程一致但 fallback 内容不可控 |
| **总分** | **72** | **100** | **需要修 P1 后录屏** |

**评分解读：70-79 分 = 需要修 P1 后录屏**

---

## 7. P0 问题列表

| # | 问题 | 位置 | 复现 |
|---|------|------|------|
| P0-1 | DeepSeek API 频繁超时 (25s AbortController) 导致全流程 fallback | 自动流程全局 | 每次点击"开始"约 80% 概率触发 |

**根因：** DeepSeek ask/generate API 响应时间 > 25s，触发 AbortController → 所有 4 步均走 fallback → 页面充满"失败"文案

## 8. P1 问题列表

| # | 问题 | 严重度 | 位置 | 说明 |
|---|------|--------|------|------|
| P1-1 | "AI 讲解生成失败" 错误卡片在对话区 | 高 | 左侧 AI 对话列 | 用户看到 ⚠️ + "失败" 文案，感觉系统坏了 |
| P1-2 | "暂无课程引用" 空引用区 | 高 | 右侧引用来源 | API 超时无 citations，破坏"引用溯源"卖点 |
| P1-3 | "练习题生成失败" 错误条在 quiz 上方 | 中 | 中间 quiz tab | 与 quiz 内容共存，混合信号 |
| P1-4 | "学习路径生成失败" 文字在路径底部 | 中 | 中间 study_plan tab | fallback 5 阶段很好，但"失败"标签破坏印象 |
| P1-5 | fallback 使用"失败"语义词 | 高 | 全局 | 所有 4 个区域的 fallback 文案都包含"失败"字样 |
| P1-6 | 等待时间 90s+，进度只显示"步骤 N/4" | 中 | 进度指示器 | 没有期望等待时间或占位内容 |
| P1-7 | Console 4 条 "signal is aborted" warning | 低 | Console | 录屏时开 F12 会看到警告 |

## 9. P2 问题列表

| # | 问题 | 说明 |
|---|------|------|
| P2-1 | Fallback 回答太短（仅1句话） | 演示内容不够丰富 |
| P2-2 | 讲义/PPT tab 永久显示"下一阶段生成" | 考虑隐藏或改文案 |
| P2-3 | 设置页 Spark 模型显示 `lite` 而非 `generalv3.5` | 配置同步小差异 |
| P2-4 | 三栏在小屏上滚动困难 | 竞赛通常大屏，非关键 |

## 10. 录屏风险点

| 风险 | 概率 | 影响 |
|------|------|------|
| API 超时 → 全流程 fallback | 80% | 高 — 评委看到 4 处"失败" |
| citations 空白 | 60% | 中 — "引用溯源"卖点消失 |
| 学习报告卡片不出现 | 40% | 低 — quiz 默认不自动填充 |
| 偶然的 "Internal Server Error" | 10% | 极高 — 直接踢出比赛 |

## 11. 最优先修复的 10 个问题

1. **P0-1: API 超时** → 延长 timeout 至 90s 或增加重试
2. **P1-5: "失败"文案** → 改为"已降级处理" / "已使用备选方案"
3. **P1-1: AI 回答 error card** → 移除 ⚠️ emoji，改为中性的"已生成演示回答"
4. **P1-2: 空 citations** → 无引用时显示课程章节目录或预设引用
5. **P1-3: Quiz 错误条** → 当 quiz 有内容时不显示 extra error card
6. **P1-4: Study plan "失败"标签** → fallback 成功时不加 error note
7. **P1-6: 进度改进** → 增加估计等待时间或占位动画
8. **P2-1: Fallback 答案** → 扩展为更完整的演示内容
9. **P2-2: 讲义/PPT tab** → 隐藏或改为"准备中"
10. **P2-3: 设置页模型名** → 修复配置同步

## 12. 建议不修的问题

- P1-7 (Console warnings): 不影响录屏（通常不开 F12）
- P2-4 (小屏滚动): 比赛使用大屏投影

## 13. 截图目录

`docs/screenshots/r3_ui_audit/`

## 14. Playwright Report 路径

`tests/e2e/playwright-report/` — 1 passed + ui-audit (citation-card expected absent)

## 15. 是否允许直接录屏

**❌ 不建议直接录屏。** 当前 P0 (API 超时链) + P1 (5 个"失败"文案) 会严重影响评委观感。

## 16. 是否建议进入 R3-UI-FIX 阶段

**✅ 建议进入。** 修复上述 P0 + P1 后，预计评分可提升至 85-90，达到录屏标准。
