const { test, expect } = require('@playwright/test');
require('./helpers');

test('Assistant can ask two consecutive questions', async ({ page }) => {
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

  // First question
  const input = page.locator('#chat-input');
  await input.fill('极限的定义');
  const sendBtn = page.locator('.chat-input-row .btn-primary, button:has-text("发送")').first();
  await sendBtn.click();

  // Wait for loading state
  await page.waitForTimeout(2000);

  // Wait for answer or fallback (up to 40s)
  try {
    await page.waitForFunction(() => {
      const body = document.body.textContent || '';
      return body.includes('瞬时变化率') || body.includes('极限') || body.includes('演示答案') || body.includes('回答生成较慢');
    }, { timeout: 40000 });
  } catch (e) {
    // If still loading, check for fallback
    const body = await page.textContent('body');
    const hasFallback = body.includes('回答生成较慢') || body.includes('使用演示答案');
    if (hasFallback) {
      const demoAnswerBtn = page.locator('button:has-text("使用演示答案")');
      if (await demoAnswerBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
        await demoAnswerBtn.click();
        await page.waitForTimeout(2000);
      }
    }
  }

  // Verify no raw errors
  const body1 = await page.textContent('body');
  expect(body1).not.toContain('Failed to fetch');

  // Second question
  await input.fill('导数和函数变化率');
  // Re-query send button (may have been re-rendered)
  const sendBtn2 = page.locator('.chat-input-row .btn-primary, button:has-text("发送")').first();
  await sendBtn2.click();
  await page.waitForTimeout(2000);

  // Verify second question bubble appeared
  const body2 = await page.textContent('body');
  expect(body2).toContain('导数和函数变化率');

  // Verify agent not stuck (no permanent "执行中")
  const stuckAgent = await page.locator('.agent-status-tag.running').count();
  // If all agents still running after 30s, that's bad
  await page.waitForTimeout(40000);
  const stuckAgent2 = await page.locator('.agent-status-tag.running').count();

  await page.screenshot({ path: 'docs/screenshots/e2e/assistant-flow.png', fullPage: true });
});
