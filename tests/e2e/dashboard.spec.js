const { test, expect } = require('@playwright/test');
require('./helpers');

test('Dashboard loads without fetch errors', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Login if welcome screen is shown
  const demoBtn = page.locator('button:has-text("进入演示学习环境"), button:has-text("演示登录"), #btn-welcome-demo, .topbar-user button');
  if (await demoBtn.first().isVisible({ timeout: 3000 }).catch(() => false)) {
    await demoBtn.first().click();
    await page.waitForTimeout(4000);
  }

  // Navigate to dashboard
  const dashboardNav = page.locator('[data-page="dashboard"], .nav-item:has-text("数据看板")');
  if (await dashboardNav.isVisible({ timeout: 3000 }).catch(() => false)) {
    await dashboardNav.first().click();
  }
  await page.waitForTimeout(2000);

  // Check NO raw errors
  const body = await page.textContent('body');
  expect(body).not.toContain('Failed to fetch');
  expect(body).not.toContain('undefined');
  expect(body).not.toContain('[object Object]');

  // Check for expected content
  const hasContent = body.includes('高等数学') || body.includes('课程') || body.includes('知识点');
  expect(hasContent).toBeTruthy();

  await page.screenshot({ path: 'docs/screenshots/e2e/dashboard.png', fullPage: true });
});
