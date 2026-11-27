import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 950 }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));

const log = (...a) => console.log(...a);
const hud = async () => page.evaluate(() => ({
  n: document.getElementById('hud-n').textContent,
  t: document.getElementById('hud-t').textContent,
  step: document.getElementById('hud-step').textContent,
  energy: document.getElementById('hud-energy').textContent,
  drift: document.getElementById('hud-drift').textContent,
  engine: document.getElementById('engine-badge').textContent,
  fps: document.getElementById('fps-badge').textContent,
  strategy: document.querySelector('.strategy')?.innerText.replace(/\n+/g, ' | '),
  applyDisabled: document.querySelector('.btn--apply')?.disabled,
  hint: document.querySelector('#panel-body .field-hint')?.textContent?.trim(),
}));

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('hidden'), null, {
  timeout: 45000,
});
await page.waitForTimeout(1200);
log('== 默认场景 ==');
log(await hud());
await page.screenshot({ path: `${OUT}/01-default.png` });
await page.locator('#stage').screenshot({ path: `${OUT}/01-canvas.png` });

// 规模预设：INT_MAX
log('\n== 输入 INT_MAX ==');
await page.getByRole('button', { name: 'INT_MAX' }).click();
await page.waitForTimeout(300);
log(await hud());
await page.screenshot({ path: `${OUT}/02-intmax-preview.png` });
await page.locator('.btn--apply').click();
await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('hidden'), null, { timeout: 60000 });
await page.waitForTimeout(2500);
log(await hud());
await page.screenshot({ path: `${OUT}/03-intmax-running.png` });

// 非法输入
log('\n== 非法输入 0 ==');
await page.fill('#count-input', '0');
await page.waitForTimeout(200);
log(await hud());
await page.screenshot({ path: `${OUT}/04-invalid.png` });

// 回到 5000
log('\n== 5000 体 ==');
await page.fill('#count-input', '5000');
await page.waitForTimeout(200);
await page.locator('.btn--apply').click();
await page.waitForTimeout(2000);
log(await hud());
await page.screenshot({ path: `${OUT}/05-5000.png` });

// 一百万
log('\n== 1e6 体 ==');
const t0 = Date.now();
await page.fill('#count-input', '1e6');
await page.locator('.btn--apply').click();
await page.waitForTimeout(3500);
log('apply+settle ms', Date.now() - t0);
log(await hud());
await page.screenshot({ path: `${OUT}/06-1m.png` });
await page.locator('#stage').screenshot({ path: `${OUT}/06-canvas.png` });

// 暂停 / 单步
log('\n== 暂停 / 单步 ==');
await page.keyboard.press('Space');
await page.waitForTimeout(400);
const before = await hud();
await page.getByRole('button', { name: '单步' }).click();
await page.waitForTimeout(700);
const after = await hud();
log('step advanced:', before.step, '->', after.step);
await page.keyboard.press('Space');

// 缩放 + 平移
await page.mouse.move(900, 500);
await page.mouse.wheel(0, -400);
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/07-zoom.png` });

// 检查画布是否真的绘制了内容
const canvasInfo = await page.evaluate(() => {
  const c = document.getElementById('stage');
  return { w: c.width, h: c.height, clientW: c.clientWidth, clientH: c.clientHeight };
});
log('\ncanvas', canvasInfo);
const canvasSize = fs.statSync(`${OUT}/06-canvas.png`).size;
log('canvas png bytes', canvasSize);

log('\n== 控制台错误 ==');
log(errors.length ? errors.join('\n') : '(无)');
await browser.close();
