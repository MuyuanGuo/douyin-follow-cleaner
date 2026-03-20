/**
 * 本地调试：用 Playwright 打开抖音网页，便于在 Network 中对照接口。
 * 不自动取关；规则引擎请在扩展内使用。
 *
 * 运行：cd douyin-follow-cleaner && npm install && npx tsx playwright/scan.ts
 */
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded' });
  console.log('请在浏览器中手动登录并打开「我的」→ 关注列表页，然后使用 DevTools → Network 抓包。');
  console.log('按 Ctrl+C 结束。');
  await page.pause();
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
