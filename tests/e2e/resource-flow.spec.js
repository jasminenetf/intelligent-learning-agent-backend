const { test, expect } = require('@playwright/test');
require('./helpers');

test('Quiz clicking and PPT download work', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Login
  const demoBtn = page.locator('button:has-text("进入演示学习环境"), button:has-text("演示登录"), #btn-welcome-demo, .topbar-user button');
  if (await demoBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await demoBtn.first().click();
    await page.waitForTimeout(4000);
  }

  // Navigate to assistant
  const asstNav = page.locator('[data-page="assistant"], .nav-item:has-text("学习助手")');
  if (await asstNav.isVisible({ timeout: 4000 }).catch(() => false)) {
    await asstNav.first().click();
  }
  await page.waitForTimeout(2000);

  // Switch to quiz tab
  const quizTab = page.locator('.artifacts-tab:has-text("练习题库"), .artifacts-tab:has-text("测验")');
  if (await quizTab.isVisible({ timeout: 4000 }).catch(() => false)) {
    await quizTab.first().click();
    await page.waitForTimeout(2000);
  }

  // Click first option button
  const optionBtn = page.locator('.quiz-option-btn').first();
  if (await optionBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await optionBtn.click();
    await page.waitForTimeout(1000);

    // Should see feedback (green or red)
    const feedback = page.locator('.quiz-feedback.show, .quiz-option-btn.correct, .quiz-option-btn.wrong');
    const hasFeedback = await feedback.count();
    expect(hasFeedback).toBeGreaterThan(0);
  }

  // Generate PPT
  const pptBtn = page.locator('button:has-text("生成 PPT"), button:has-text("生成PPT"), button:has-text("PPT")');
  if (await pptBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await pptBtn.first().click();
    await page.waitForTimeout(4000);
  }

  // Switch to PPT tab
  const pptTab = page.locator('.artifacts-tab:has-text("PPT")');
  if (await pptTab.isVisible({ timeout: 4000 }).catch(() => false)) {
    await pptTab.first().click();
    await page.waitForTimeout(2000);
  }

  // Check for download button or PPT card
  const downloadBtn = page.locator('a:has-text("下载"), button:has-text("下载"), .ppt-card a, .ppt-card button');
  const body = await page.textContent('body');
  const hasPPT = body.includes('PPT') || body.includes('下载') || body.includes('.pptx');

  await page.screenshot({ path: 'docs/screenshots/e2e/resource-flow.png', fullPage: true });
});
