import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

const log = (...a) => console.log(...a);
const wait = (ms) => page.waitForTimeout(ms);
const hud = () => page.evaluate(() => ({
  n: document.getElementById('hud-n')?.textContent,
  step: document.getElementById('hud-step')?.textContent,
  engine: document.getElementById('engine-badge')?.textContent,
  drift: document.getElementById('hud-drift')?.textContent,
  merge: document.getElementById('hud-merge')?.textContent,
  debug: window.__nbody?.debug?.(),
}));

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('hidden'), null, { timeout: 45000 });
await wait(2000);
log('== 初始 ==', await hud());

// 预设
log('\n== 预设 figure-8 ==');
await page.selectOption('#preset-select', 'figure8');
await page.locator('#preset-apply').click();
await wait(2500);
log(await hud());

// 场景预设：星系对撞
log('\n== 预设 星系对撞 ==');
await page.selectOption('#preset-select', 'galaxy-collision');
await page.locator('#preset-apply').click();
await wait(4000);
log(await hud());

// 撤销/重做
log('\n== 撤销 / 重做 ==');
await page.keyboard.press('Control+z');
await wait(2000);
log('undo', await hud());
await page.keyboard.press('Control+y');
await wait(2000);
log('redo', await hud());

// 快捷键：创建（Ctrl+拖拽）
log('\n== Ctrl+拖拽创建 ==');
const before = await hud();
await page.mouse.move(800, 400);
await page.keyboard.down('Control');
await page.mouse.down();
await page.mouse.move(860, 430, { steps: 8 });
await page.mouse.up();
await page.keyboard.up('Control');
await wait(1500);
const after = await hud();
log('n:', before.n, '->', after.n);

// 诊断面板 / 势场
log('\n== 诊断分区 ==');
await page.keyboard.press('KeyJ').catch(() => {});
await page.locator('.section-head').filter({ hasText: '分析诊断' }).click();
await wait(1000);
log('metrics text', await page.locator('#metrics-drift').textContent());
log('perf display', await page.locator('#perf-values').evaluate((e) => getComputedStyle(e.parentElement).display));
await page.locator('#btn-field-overlay').click();
await wait(1500);
log('field overlay display', await page.locator('#field-overlay').evaluate((e) => e.style.display));
await page.locator('#btn-field-overlay').click();

// 质心漂移
log('\n== 质心漂移 ==');
await page.locator('#btn-remove-drift').click();
await wait(1500);
log(await hud());

// 分享链接
log('\n== 分享链接 ==');
await page.locator('#btn-share').click();
await wait(1200);
log('toasts', await page.locator('.toast').allTextContents());

// 录制
log('\n== WEBM 录制 ==');
await page.locator('#btn-record').click();
await wait(1500);
log('record label', await page.locator('#btn-record').textContent());
await page.locator('#btn-record').click();
await wait(1500);

// 快捷键帮助数量
await page.keyboard.press('Shift+Slash');
await wait(300);
log('help subtitle', await page.locator('.help-subtitle').textContent());
await page.keyboard.press('Escape');

// 新积分器与引擎（通过 UI 下拉）
log('\n== 新引擎/积分器 ==');
await page.evaluate(() => {
  const head = [...document.querySelectorAll('.section-head')].find((h) => h.textContent?.includes('物理与引擎'));
  const sec = head?.parentElement;
  if (sec) sec.dataset.collapsed = 'false';
});
await wait(300);
const engineSel = page.locator('#panel-body select').filter({ has: page.locator('option[value="treepm"]') }).first();
await engineSel.evaluate((el) => { el.value = 'treepm'; el.dispatchEvent(new Event('change', { bubbles: true })); });
await wait(2500);
log('engine ->', (await hud()).engine);
await page.evaluate(() => {
  const sel = [...document.querySelectorAll('#panel-body select')].find((s) => [...s.options].some((o) => o.value === 'yoshida4'));
  if (sel) { sel.value = 'yoshida4'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
});
await wait(2500);
log(await hud());

// 截图
await page.screenshot({ path: 'shots-all/final.png' });
await page.locator('#stage').screenshot({ path: 'shots-all/canvas.png' });

log('\n== 控制台错误 ==');
log(errors.length ? errors.join('\n') : '(无)');
await browser.close();
