# R2-DEEP-QA 浏览器交互失效声明

**日期:** 2026-05-20
**原 QA 报告:** `docs/handoff/R2_DEEP_QA_FUNCTIONAL_REPORT.md` (96/100, Grade A)
**状态:** ❌ 作废

---

## 失效原因

用户真实浏览器截图暴露以下 P0 问题：

1. **发送按钮点击无反应** — 输入"极限的定义"点击发送，无新气泡、无请求
2. **页面卡在 loading** — 显示"AI 正在检索课程资料并校验答案，可能需要稍等..."
3. **Agent 卡死** — VerifierAgent 一直"执行中"
4. **Artifacts 空白** — 中间区域大面积空白
5. **Citations 未更新** — 仍显示"提问后将在这里展示课程资料引用"

这些问题是 `compileall`、`node --check`、`curl` 无法检测的**真实浏览器交互阻塞**。

---

## 根因分析

### 根因 1: `_sendQuestion` 定义在 `_askQuestion` 函数体内
- `window._sendQuestion` 在 `_askQuestion` 第 563 行定义
- 首次页面加载时，`_sendQuestion` 未定义 → 点击发送按钮 → `ReferenceError`（被全局 error handler 静默吞掉）
- 必须先点击示例问题调用 `_askQuestion`，才能让 `_sendQuestion` 生效

### 根因 2: 无 `askInFlight` 锁
- 无状态锁保护，重复点击可能导致多个并发请求

### 根因 3: 无 `finally` 确保清理
- timer 清理只在成功路径，失败路径可能遗漏

### 根因 4: 25s fallback 内联 onclick 转义错误
- 多层嵌套引号导致 `onclick="..."` 中的 JavaScript 无法执行

---

## 修复内容

| # | 修复 | 文件 |
|---|------|------|
| 1 | `_sendQuestion` 移到 `_askQuestion` 外部，顶层定义 | app.js |
| 2 | 添加 `S.askInFlight` 锁 + 按钮 disabled/文字反馈 | app.js |
| 3 | `try/finally` 确保 timer 清理 | app.js |
| 4 | 25s fallback 卡片改用 `setTimeout` + DOM `onclick` 绑定 | app.js |
| 5 | 按钮文字"发送" → "生成中..." → "发送" | app.js |

---

## 结论

R2-DEEP-QA 仅在 CLI/API 层面通过，不代表产品可用。
修复后需 **真实浏览器重新验证**，通过后才能重新评分。
