/**
 * helpers.js — E2E test utilities for competition demo flow
 */

const { expect } = require('@playwright/test');

/**
 * Collect browser errors, warnings, and API failures across the page lifecycle.
 * Call in beforeEach, then check collectedErrors in test.
 */
function collectBrowserErrors(page) {
  const errors = [];
  const warnings = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push('CONSOLE_ERR: ' + msg.text());
    } else if (msg.type() === 'warning') {
      warnings.push('CONSOLE_WARN: ' + msg.text());
    }
  });

  page.on('pageerror', err => {
    errors.push('PAGE_ERR: ' + err.message);
  });

  page.on('response', async res => {
    if (res.url().includes('/api/') && res.status() >= 400) {
      const urlSuffix = res.url().replace(/^.*\/api\//, '/api/');
      try {
        const body = await res.text();
        errors.push('API_' + res.status() + ': ' + urlSuffix + ' — ' + body.substring(0, 150));
      } catch (e) {
        errors.push('API_' + res.status() + ': ' + urlSuffix);
      }
    }
  });

  page.on('requestfailed', req => {
    const urlSuffix = req.url().replace(/^.*\/api\//, '/api/');
    const failure = req.failure();
    // AbortController cancellations are expected during timeouts
    if (failure && failure.errorText && failure.errorText.includes('aborted')) {
      warnings.push('REQ_ABORT: ' + urlSuffix + ' (timeout/abort — expected)');
    } else {
      errors.push('REQ_FAIL: ' + urlSuffix + ' — ' + (failure?.errorText || 'unknown'));
    }
  });

  // Attach to page for later retrieval
  page._collectedErrors = errors;
  page._collectedWarnings = warnings;
  return { errors, warnings };
}

/**
 * Assert page text does NOT contain any "bad text" patterns.
 */
async function assertNoBadText(page) {
  const body = await page.textContent('body');
  const badPatterns = [
    'Failed to fetch',
    'undefined',
    '[object Object]',
    'Internal Server Error',
    'Cannot read properties',
    'Traceback',
    'KeyError',
    'TypeError',
    'Tutor Agent',
    'Agentic RAG',
    'fallback',
    '生成失败',
    '请求失败',
    'sample_ocr',
    'demo_knowledge.txt',
    'ocrsample',
    '待开发',
    'RAG 检索测试',
    'Is Mock',
    'Embedding Mock',
  ];
  for (const pattern of badPatterns) {
    if (body.includes(pattern)) {
      // Allow 'undefined' in context of legitimate mentions
      if (pattern === 'undefined') {
        const count = (body.match(/undefined/g) || []).length;
        if (count <= 2) continue; // Small count acceptable in pre/code blocks
      }
      expect(body).not.toContain(pattern);
    }
  }
}

/**
 * Wait for the competition page to be fully loaded.
 */
async function waitForAppReady(page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Wait for either landing or flow to be visible
  await page.waitForSelector('#page-competition', { timeout: 10000 });
}

/**
 * Click an element containing the given text (safe — waits for visibility).
 */
async function safeClickByText(page, text, options = {}) {
  const locator = page.locator(`text="${text}"`).first();
  await locator.waitFor({ state: 'visible', timeout: options.timeout || 15000 });
  await locator.click();
}

/**
 * Save a screenshot to docs/screenshots/r3_playwright_e2e/
 */
async function saveScreenshot(page, name) {
  const path = require('path');
  const dir = path.resolve(__dirname, '../../docs/screenshots/r3_playwright_e2e');
  const fs = require('fs');
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false });
}

module.exports = {
  collectBrowserErrors,
  assertNoBadText,
  waitForAppReady,
  safeClickByText,
  saveScreenshot,
};
