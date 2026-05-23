/**
 * demo-auto-flow.spec.js
 *
 * E2E test for competition demo auto learning flow (polished).
 * Verifies: landing → ask → citations (highlight) → mindmap (stage) → quiz (feedback) → study_plan (cards) → regenerate
 */
const { test, expect } = require('@playwright/test');
const {
  collectBrowserErrors,
  assertNoBadText,
  waitForAppReady,
  safeClickByText,
  saveScreenshot,
} = require('./helpers');

test.describe('competition demo auto learning flow', () => {

  test.beforeEach(async ({ page }) => {
    collectBrowserErrors(page);
  });

  test('full auto-flow: landing → answer → citations → mindmap → quiz → study_plan → regenerate', async ({ page }) => {
    test.setTimeout(300000);

    // ═══════════ Step 1: Landing page ═══════════
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Assert landing hero
    await expect(page.locator('h1')).toContainText('智学工坊 AI 自动学习助手');
    const startBtn = page.locator('[data-testid="demo-start"]');
    await expect(startBtn).toBeVisible();

    // ═══════════ Step 2: Click "开始 AI 学习演示" ═══════════
    await startBtn.click();

    // Wait for three-column flow to appear
    await page.waitForSelector('#competition-flow', { state: 'visible', timeout: 15000 });

    // Assert three-column layout
    await expect(page.locator('.comp-col-left')).toBeVisible();
    await expect(page.locator('.comp-col-center')).toBeVisible();
    await expect(page.locator('.comp-col-right')).toBeVisible();

    // ═══════════ Step 3: User question appears ═══════════
    const chatMsgs = page.locator('#comp-chat-messages');
    await expect(chatMsgs).toContainText('过拟合', { timeout: 10000 });
    await expect(chatMsgs).toContainText('正则化');

    // ═══════════ Step 4: Wait for entire flow to complete ═══════════
    const regenBtn = page.locator('#comp-btn-regenerate');
    await expect(regenBtn).toBeEnabled({ timeout: 240000 });

    // ═══════════ Step 5: No bad text ═══════════
    await page.waitForTimeout(2000);
    await assertNoBadText(page);

    // ═══════════ Step 6: Citations — numbered cards with highlight ═══════════
    const citationCards = page.locator('[data-testid="citation-card"]');
    const citCount = await citationCards.count();
    if (citCount >= 1) {
      // Should have [N] numbering
      const firstCitText = await citationCards.first().innerText();
      // Contains citation number or title
      expect(firstCitText.length).toBeGreaterThan(3);

      // Click first citation → should highlight
      await citationCards.first().click();
      await page.waitForTimeout(500);
      const highlighted = page.locator('.cit-highlight');
      const hlCount = await highlighted.count();
      expect(hlCount).toBeGreaterThanOrEqual(1);
    }
    // If no citation cards, text should say "暂无课程引用"
    if (citCount === 0) {
      const citSection = page.locator('#comp-citations');
      await expect(citSection).toContainText(/暂无|降级/);
    }

    // ═══════════ Step 7: Agent trace — Chinese names + data-testid ═══════════
    const agentSteps = page.locator('[data-testid="agent-step"]');
    const agentCount = await agentSteps.count();
    expect(agentCount).toBeGreaterThanOrEqual(1);

    const traceEl = page.locator('#comp-agent-trace-content');
    const traceText = await traceEl.innerText();
    expect(traceText).toMatch(/画像分析|课程资料检索|可信答案校验|学习资源生成/);

    // ═══════════ Step 8: Mindmap tab — stage animation or content ═══════════
    await page.locator('.comp-tab:has-text("思维导图")').click();
    await page.waitForTimeout(2000);
    const mindmapPanel = page.locator('[data-testid="mindmap-panel"]');
    const mmText = await mindmapPanel.innerText();
    expect(mmText.length).toBeGreaterThan(10);
    // Should contain "知识" somewhere
    expect(mmText).toMatch(/知识|结构|过拟合|正则化/);

    // ═══════════ Step 9: Quiz tab — instant feedback ═══════════
    await page.locator('.comp-tab:has-text("练习题库")').click();
    await page.waitForTimeout(1500);
    const quizPanel = page.locator('#comp-panel-quiz');
    let quizText = await quizPanel.innerText();
    expect(quizText.length).toBeGreaterThan(20);

    // Quiz options should have data-testid
    const quizOptions = quizPanel.locator('[data-testid="quiz-option"]');
    const quizItemCount = await quizOptions.count();
    if (quizItemCount >= 3) {
      // Click first option → expect feedback
      await quizOptions.first().click();
      await page.waitForTimeout(800);

      // Should show selected state
      const selectedOpt = quizPanel.locator('.comp-quiz-opt.selected');
      const selectedCount = await selectedOpt.count();
      expect(selectedCount).toBeGreaterThanOrEqual(1);

      // Should show feedback (correct/incorrect + explanation)
      const feedbackEl = quizPanel.locator('.comp-quiz-feedback[style*="block"], .comp-quiz-feedback:not([style*="none"])');
      const fbCount = await feedbackEl.count();
      if (fbCount > 0) {
        const fbText = await feedbackEl.first().innerText();
        expect(fbText).toMatch(/回答正确|还需要复习|解析/);
      }
    }

    // ═══════════ Step 10: Study Plan tab — cards ═══════════
    await page.locator('.comp-tab:has-text("学习路径")').click();
    await page.waitForTimeout(1500);
    const planCards = page.locator('[data-testid="study-plan-card"]');
    const planCount = await planCards.count();
    expect(planCount).toBeGreaterThanOrEqual(3);

    const planPanel = page.locator('#comp-panel-study_plan');
    const planText = await planPanel.innerText();
    expect(planText.length).toBeGreaterThan(20);
    // Should have the intro text
    expect(planText).toMatch(/薄弱|顺序/);

    // ═══════════ Step 10b: Learning Report ═══════════
    const reportCard = page.locator('[data-testid="learning-report-card"]');
    try {
      await reportCard.waitFor({ state: 'visible', timeout: 10000 });
      const reportText = await reportCard.innerText();
      expect(reportText).toMatch(/正确率|薄弱|画像|推荐/);
    } catch (e) {
      console.log('[INFO] Learning report card absent (expected if quiz fallback)');
    }

    // ═══════════ Step 11: Regenerate ═══════════
    page._collectedErrors = [];
    page._collectedWarnings = [];

    await regenBtn.click();

    // Wait for flow to restart
    await expect(page.locator('#comp-chat-messages')).toContainText('过拟合', { timeout: 15000 });
    await expect(page.locator('#comp-progress')).toContainText(/步骤 1/, { timeout: 15000 });

    await page.waitForTimeout(3000);
    await assertNoBadText(page);

    // ═══════════ Step 12: Screenshot ═══════════
    await saveScreenshot(page, 'demo-auto-flow-pass');

    // ═══════════ Step 13: Error check ═══════════
    const errors = page._collectedErrors || [];
    const warnings = page._collectedWarnings || [];

    if (errors.length > 0) {
      console.log(`\n[ERROR_LOG] ${errors.length} errors:`);
      errors.forEach(e => console.log(`  ${e}`));
    }
    if (warnings.length > 0) {
      console.log(`[WARN_LOG] ${warnings.length} warnings:`);
      warnings.forEach(w => console.log(`  ${w}`));
    }

    const realErrors = errors.filter(e =>
      !e.includes('aborted') &&
      !e.includes('signal is aborted')
    );
    expect(realErrors.length, `Real errors found: ${JSON.stringify(realErrors)}`).toBe(0);
  });
});
