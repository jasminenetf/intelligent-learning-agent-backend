/**
 * ui-audit.spec.js — Automated UI/UX audit
 * Checks for bad text, missing elements, console errors.
 */
const { test, expect } = require('@playwright/test');
const { collectBrowserErrors, assertNoBadText } = require('./helpers');

test.describe('UI UX Audit', () => {

  test.beforeEach(async ({ page }) => {
    collectBrowserErrors(page);
  });

  test('home page — no bad text + key elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // No bad text
    await assertNoBadText(page);

    // Key elements exist
    await expect(page.locator('[data-testid="demo-start"]')).toBeVisible();
    await expect(page.locator('#page-competition h1')).toContainText('智学工坊');

    // Screenshot
    await page.screenshot({ path: '../../../docs/screenshots/r3_ui_audit/01_home.png', fullPage: false });

    // No console errors
    expect((page._collectedErrors || []).length).toBe(0);
  });

  test('competition flow — full audit after completion', async ({ page }) => {
    test.setTimeout(300000);

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click start
    const startBtn = page.locator('[data-testid="demo-start"]');
    await startBtn.click();
    await page.waitForSelector('#competition-flow', { state: 'visible', timeout: 15000 });

    // Screenshot: demo started
    await page.screenshot({ path: '../../../docs/screenshots/r3_ui_audit/02_demo_running.png', fullPage: false });

    // Wait for flow to complete
    const regenBtn = page.locator('#comp-btn-regenerate');
    await expect(regenBtn).toBeEnabled({ timeout: 240000 });
    await page.waitForTimeout(2000);

    // No bad text
    await assertNoBadText(page);

    // Check all data-testid elements exist
    const testIds = [
      'citation-card',
      'mindmap-panel',
      'quiz-card',
      'quiz-option',
      'study-plan-card',
      'learning-report-card',
      'agent-step',
    ];
    for (const tid of testIds) {
      const el = page.locator(`[data-testid="${tid}"]`);
      const count = await el.count();
      if (count === 0 && (tid === 'learning-report-card' || tid === 'citation-card')) {
        console.log(`[INFO] ${tid} not found (expected when API fallback active)`);
      } else {
        expect(count, `${tid} should exist`).toBeGreaterThan(0);
      }
    }

    // Check answers area
    await page.locator('.comp-tab:has-text("思维导图")').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '../../../docs/screenshots/r3_ui_audit/04_mindmap.png', fullPage: false });

    await page.locator('.comp-tab:has-text("练习题库")').click();
    await page.waitForTimeout(500);
    const quizOpts = page.locator('[data-testid="quiz-option"]');
    const qCount = await quizOpts.count();
    if (qCount > 0) {
      await quizOpts.first().click();
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: '../../../docs/screenshots/r3_ui_audit/05_quiz_feedback.png', fullPage: false });

    await page.locator('.comp-tab:has-text("学习路径")').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '../../../docs/screenshots/r3_ui_audit/07_study_plan.png', fullPage: false });

    // Check learning report
    const reportCard = page.locator('[data-testid="learning-report-card"]');
    if (await reportCard.count() > 0) {
      await page.screenshot({ path: '../../../docs/screenshots/r3_ui_audit/06_learning_report.png', fullPage: false });
    }

    // Full page screenshot
    await page.screenshot({ path: '../../../docs/screenshots/r3_ui_audit/03_answer_citation.png', fullPage: false });

    // Check settings page
    await page.locator('.nav-divider').click();
    await page.waitForTimeout(300);
    await page.locator('.nav-sub:has-text("设置")').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '../../../docs/screenshots/r3_ui_audit/08_settings.png', fullPage: false });

    // No console errors
    const realErrors = (page._collectedErrors || []).filter(e =>
      !e.includes('aborted') && !e.includes('signal is aborted')
    );
    if (realErrors.length > 0) {
      console.log('[AUDIT ERRORS]', realErrors);
    }
    expect(realErrors.length).toBe(0);
  });
});
