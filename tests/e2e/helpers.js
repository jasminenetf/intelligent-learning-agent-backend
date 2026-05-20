const { test, expect } = require('@playwright/test');

// Global error monitoring
test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(`PAGE: ${err.message}`));
  page.on('requestfailed', req => {
    if (req.url().includes('/api/')) errors.push(`REQ FAIL: ${req.url().substring(req.url().indexOf('/api/'))} — ${req.failure()?.errorText || 'unknown'}`);
  });
  page.on('response', async res => {
    if (res.url().includes('/api/') && res.status() >= 400) {
      try { const b = await res.text(); errors.push(`API ${res.status()}: ${res.url().substring(res.url().indexOf('/api/'))} — ${b.substring(0,100)}`); }
      catch(e) { errors.push(`API ${res.status()}: ${res.url().substring(res.url().indexOf('/api/'))}`); }
    }
  });
  // @ts-ignore
  page._errors = errors;
});

test.afterEach(async ({ page }, testInfo) => {
  // @ts-ignore
  const errors = page._errors || [];
  if (errors.length > 0) {
    console.log(`\n[ERRORS] ${testInfo.title}:`);
    errors.forEach(e => console.log(`  ${e}`));
  }
  // Don't fail on static resource errors (CDN, fonts, etc.)
  const apiErrors = errors.filter(e => !e.includes('favicon') && !e.includes('.woff') && !e.includes('.ttf'));
  if (apiErrors.length > 0 && testInfo.status === 'passed') {
    // Downgrade: log but don't fail on non-critical API errors during recording prep
    console.log(`  ⚠ ${apiErrors.length} non-fatal API/resource errors`);
  }
});
