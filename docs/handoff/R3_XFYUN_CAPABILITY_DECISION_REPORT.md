# R3: 科大讯飞能力决策报告

**日期:** 2026-05-24
**阶段:** R3-XFYUN-STRATEGY-FINALIZE
**上阶段:** R3-UI-FIX-2 (commit 1d4143c)

---

## 1. 当前 Commit

```
1d4143c test: fix ui-audit nav selector for restructured sidebar
```

共 8 个未推送 commits on main。

---

## 2. 调研来源

| 来源 | 类型 | 内容 |
|------|------|------|
| [讯飞开放平台](https://www.xfyun.cn/) | 官网 | 星火大模型、语音合成、语音听写、OCR、语音评测 |
| [星火大模型 HTTP 接口文档](https://www.xfyun.cn/doc/spark/HTTP%E8%B0%83%E7%94%A8%E6%96%87%E6%A1%A3.html) | 技术文档 | OpenAI-compatible API, base_url, 鉴权方式 |
| 小程序语音能力文档 | 能力列表 | TTS/ASR/OCR/翻译 小程序集成方案 |

---

## 3. 调研能力数量

共调研 **7 项** 科大讯飞 AI 能力：

1. 星火认知大模型 (Spark LLM) — **已接入** ✅
2. 语音合成 (TTS) — **配置预留** ⚠️
3. 语音听写 (ASR) — **未接入** ❌
4. OCR 文字识别 — **配置预留** ⚠️
5. 语音评测 — **未接入** ❌
6. 数字人/虚拟人 — **配置预留** ⚠️
7. 翻译/多语言 — **未接入** ❌

---

## 4. 最终推荐方案：A+

**方案 A+：稳妥交付版**

```
✅ 保留 SparkProvider 可配置能力
✅ DeepSeek 作为默认稳定模型  
✅ 不切 Spark 默认模型
✅ 不做完整数字人视频
✅ 不做 ASR/OCR/语音评测真实接入
✅ 可选：轻量"微课讲解稿"文本卡片（不调外部 API）
```

---

## 5. 是否做完整数字人：否

原因：
- 需要真实 API 密钥和商业授权
- 视频链路引入播放器、流控、降级等新风险
- 7 分钟演示里会抢走学习闭环主线
- 答辩中声明"已预留入口 + 未来规划"比硬做更可信

---

## 6. 是否做真实 TTS：否

除非后续有充足时间（2-3 天）和真实凭证，否则不做。
当前策略：文档中明确 TTS 接入路径，作为微课讲解稿的下一步扩展。

---

## 7. 是否做 OCR：否

放入未来扩展。OCR_OUTPUT_DIR 已在 `.env.example` 中预置配置项。
当前已有 AI 导论课程知识库（ChromaDB），OCR 对当前演示非必需。

---

## 8. 是否做 ASR：否

放入未来扩展。ASR 需要麦克风权限管理、浏览器兼容适配，
在录屏场景下增加不可控变量。

---

## 9. Spark 当前定位

```
定位：已接入，可配置，不默认切换。

三层 fallback 链：
  Spark (优先) → DeepSeek (稳定) → Mock (离线容灾)

配置方式：
  SPARK_ENABLED=true
  SPARK_API_PASSWORD=<真实密钥>
  
切换方式：
  前端设置页 → 选择 Spark → 保存 → 立即生效
  或 .env 中 LLM_PROVIDER=spark
```

---

## 10. 最适合当前比赛版的讯飞能力

```
SparkProvider 可配置接入 + 微课讲解稿（轻量文本）
```

- SparkProvider：体现国产模型接入能力，已完整实现
- 微课讲解稿：体现数字人/语音讲解前置能力，不依赖外部 API

---

## 11. 是否新增代码：默认不新增

本轮 **只写文档，不改业务代码**。

如果时间充裕（2-3 天），可选新增"生成微课讲解稿"按钮：
- 纯前端文本生成，不调 TTS/数字人 API
- 展示在"数字人课堂助手"卡片
- 失败不影响主流程
- 需额外 commit，message: `feat: add micro-lecture script card for digital tutor`

---

## 12. 是否允许进入最终交付材料阶段：允许

条件：
- Quality Gate 通过
- E2E 通过（如只写文档，运行 claude_quality_gate.sh 即满足）
- 策略文档三件套完成（本报告 + XFYUN_AI_CAPABILITY_STRATEGY.md + 科大讯飞能力使用说明.md）

---

## 13. 提交

```
本轮 commit message:
  docs: finalize XFYUN capability strategy for competition delivery

如后续新增微课讲解稿代码，单独 commit:
  feat: add micro-lecture script card for digital tutor
```

---

**报告结束。**
