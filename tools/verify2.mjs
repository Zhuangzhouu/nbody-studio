/** 端到端验证：2D/3D、JSON 导入导出、逐体配置、gzip、大规模输入。 */
import { chromium } from 'playwright';
import fs from 'node:fs';

fs.mkdirSync('shots2', { recursive: true });
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 1500, height: 900 },
  acceptDownloads: true,
});
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

const hud = () => page.evaluate(() => ({
  n: document.getElementById('hud-n').textContent,
  step: document.getElementById('hud-step').textContent,
  engine: document.getElementById('engine-badge').textContent,
  drift: document.getElementById('hud-drift').textContent,
  dim: window.__nbody?.debug?.()?.bounds?.length,
}));

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('hidden'), null, { timeout: 30000 });
await page.waitForTimeout(1800);
console.log('默认 3D 场景', await hud());
await page.screenshot({ path: 'shots2/01-3d-default.png' });

// 3D 拖拽旋转
await page.mouse.move(900, 450);
await page.mouse.down();
await page.mouse.move(1150, 520, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots2/02-3d-rotated.png' });

// 打开 JSON 配置区
await page.locator('.section-head').last().click();
await page.waitForTimeout(200);

// 模板 → 导入双体配置
await page.getByRole('button', { name: '填入参数模板' }).click();
await page.getByRole('button', { name: '从文本应用' }).click();
await page.waitForTimeout(1800);
console.log('双体逐体配置', await hud());
await page.screenshot({ path: 'shots2/03-two-body.png' });

// 导出完整 JSON 并落盘校验
const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: '导出完整 JSON' }).click();
const dl = await downloadPromise;
const target = 'shots2/exported.json';
await dl.saveAs(target);
const exported = JSON.parse(fs.readFileSync(target, 'utf8'));
console.log('导出配置', {
  schema: exported.schema,
  dim: exported.dimensions,
  bodies: exported.bodies?.length,
  first: exported.bodies?.[0],
  G: exported.physics.G,
});

// 修改导出配置：三体 + 每体不同引力参数 + 3D 显式坐标
const custom = {
  ...exported,
  dimensions: 3,
  init: { ...exported.init, count: 3 },
  bodies: [
    { id: 0, x: -10, y: 0, z: 0, vx: 0, vy: -0.35, vz: 0, mass: 2, grav: 2 },
    { id: 1, x: 10, y: 0, z: 0, vx: 0, vy: 0.35, vz: 0, mass: 2, grav: 4 },
    { id: 2, x: 0, y: 16, z: 8, vx: -0.2, vy: 0, vz: 0.1, mass: 0.5, grav: 0.5, radius: 0.6 },
  ],
};
await page.locator('#config-text').fill(JSON.stringify(custom, null, 2));
await page.getByRole('button', { name: '从文本应用' }).click();
await page.waitForTimeout(1600);
console.log('自定义三体 3D', await hud());
await page.screenshot({ path: 'shots2/04-custom-3body.png' });

// gzip 导出
const gzPromise = page.waitForEvent('download');
await page.getByRole('button', { name: '导出 gzip' }).click();
const gz = await gzPromise;
await gz.saveAs('shots2/exported.json.gz');
console.log('gzip', gz.suggestedFilename(), fs.statSync('shots2/exported.json.gz').size, 'bytes');

// 2D 切换（维度下拉是物理区第一个 select）
await page.locator('#panel-body select').nth(1).selectOption('2');
await page.waitForTimeout(1000);
await page.locator('.btn--apply').click();
await page.waitForTimeout(1500);
console.log('切到 2D', await hud());
await page.screenshot({ path: 'shots2/05-2d.png' });

// INT_MAX 输入校验与采样策略
await page.fill('#count-input', '2147483647');
await page.waitForTimeout(300);
const preview = await page.locator('.strategy').innerText();
console.log('INT_MAX 策略含采样提示', preview.includes('统计采样'));

console.log('errors', errors.length ? errors : '(无)');
await browser.close();
