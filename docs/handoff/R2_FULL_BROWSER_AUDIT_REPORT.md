# R2 FULL BROWSER AUDIT REPORT

**Date:** 2026-05-20
**Commit:** a4d2067
**Status:** ❌ NOT passed — P0 issues found in code audit

---

## 0. Old QA Invalidation

R2-DEEP-QA (96/100) was based on CLI-level checks only. User's real browser found: send button unresponsive, Agent stuck running, Artifacts blank, citations not updating. Previous QA is VOID.

See: `docs/handoff/R2_QA_INVALIDATION_BROWSER_BLOCKER.md`

---

## 1. Security & Code Quality

| Check | Result |
|-------|--------|
| `git status --short` | Clean ✅ |
| `backend/.env` gitignored | ✅ |
| Key scan (tracked files) | All `sk-` matches are placeholders (`sk-...`, `***`) ✅ |
| `python -m compileall app` | Pass ✅ |
| `node --check app.js` | Pass ✅ |
| Backend health | `{"status":"ok"}` ✅ |
| DeepSeek | configured=true, mock=false ✅ |

---

## 2. Deep Code Audit — Risk Findings

### P0: Critical

| # | Issue | Impact | Evidence |
|---|-------|--------|----------|
| P0-1 | **5 complex onclick strings with broken escaping** | Clicks silently fail in browser | `navTo(\\''+`, `toggle(\\'`, `getElementById(\\'` patterns in template strings |
| P0-2 | ~~agent_traces / agent_trace field mismatch~~ | FALSE ALARM: backend /ask returns `agent_traces`, frontend reads `data.agent_traces` — match confirmed |
| P0-3 | **74 innerHTML assignments** | DOM event listeners lost on re-render | Every `.innerHTML =` destroys child event bindings |
| P0-4 | **Timer leak: 23 setTimeout, 7 clearTimeout** | Stale timers fire on wrong elements | Timers reference `lid` which may not exist after re-render |

### P1: High

| # | Issue | Impact |
|---|-------|--------|
| P1-1 | **18 silent catch blocks** | Errors swallowed with no user feedback |
| P1-2 | **Only 2 finally blocks for 19 try blocks** | State may not reset on failure paths |
| P1-3 | **11 `window.xxx` function assignments** | No namespace collision protection |
| P1-4 | **No AbortController usage** | Can't cancel in-flight requests |

### P2: Enhancement

| # | Issue |
|---|-------|
| P2-1 | Chart.js: 1 destroy, 1 create — correct, but no error guard on CDN fail |
| P2-2 | Mermaid initialization: no retry on render failure beyond fallback |
| P2-3 | No input sanitization on user questions |

---

## 3. Page-by-Page Code Assessment

| Page | Code Status | Browser Required |
|------|-------------|-----------------|
| Welcome/Login | ✅ demo-init flow complete | Verify visual |
| Learning Assistant | ⚠️ P0-1,P0-2,P0-3 impact | **MUST test clicks** |
| Artifacts (5 tabs) | ⚠️ innerHTML risk on tab switch | Verify no blank state |
| Resource Center | ✅ gen progress bar + summary | Verify 5-type generation |
| Course Management | ✅ | Verify switch |
| Knowledge Base | ✅ + upload endpoint | Verify search |
| Learning Path | ✅ | Verify timeline |
| Dashboard | ✅ | Verify sync |
| Settings | ✅ | Verify save/test |

---

## 4. Flow Assessment

| Flow | Code Status | Browser Required |
|------|-------------|-----------------|
| First-time demo login | ✅ | **MUST test** |
| Ask → answer → citations | ⚠️ P0-2 (field name) | **MUST test Network** |
| 12s slow notice | ✅ setTimeout(12000) | **MUST wait 12s** |
| 25s fallback card | ✅ setTimeout(25000) + DOM onclick | **MUST wait 25s** |
| Second question | ✅ askInFlight releases in finally | **MUST test consecutive** |
| Generate mindmap | ✅ | Verify visual |
| Generate quiz | ✅ renderInteractiveQuiz | **MUST test clicking** |
| Generate PPT | ✅ download_url | **MUST test download** |
| Error: backend down | ✅ try/catch → ErrorCard | Simulate |
| Error: empty input | ✅ "请输入问题" toast | Test |

---

## 5. Scoring (Post-Fix)

| Category | Max | Score | Notes |
|----------|-----|-------|-------|
| Send/ask reliability | 15 | 12 | Code fixed; P0-1,P0-2 still risk |
| State machine + fallback | 15 | 12 | Lock + release complete; timer leak risk |
| Agent Trace | 10 | 8 | EventBus wired; field name mismatch risk |
| Citation linkage | 10 | 10 | highlightSourceCard complete |
| Artifacts | 15 | 12 | 5 tabs with content; innerHTML risk |
| Resource generation | 10 | 9 | Pipeline verified; complex onclick risk |
| Quiz/PPT/Path | 10 | 9 | Interactive coded; escape risk in quiz onclick |
| Error handling | 10 | 7 | Structured ErrorCard; 18 silent catches |
| Visual/flow | 5 | 4 | Layout stable; browser visual TBD |
| **Total** | **100** | **83** | |

---

## 6. What MUST Be Browser-Verified

The following CANNOT be verified via CLI. User MUST test in browser:

1. **Send button click** → user bubble appears, loading, answer/fallback
2. **Network tab** → `/api/app/ask` POST with correct payload, response 200
3. **Console** → 0 red errors during full flow
4. **12s notice** → text changes to "AI 正在检索课程资料..."
5. **25s fallback** → card with "继续等待" + "使用演示答案" buttons
6. **Second question** → sends successfully after first completes
7. **Quiz clicking** → green/red feedback, score updates
8. **PPT download** → file downloads as .pptx
9. **Citation click** → source card highlights
10. **Radar chart** → renders, no hover jitter

---

## 7. Decision

**❌ Cannot record. Cannot submit.**

Code-level fixes applied for the send-button blocker (a4d2067).
But 4 P0 risks and 4 P1 risks remain that REQUIRE browser verification.

**Next:** User opens browser, runs full 20-step audit (section 6 above).
If all pass → re-score → can record.
If ANY fail → report specific error → fix ONLY that error.
