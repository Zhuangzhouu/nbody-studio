/** 追加验证：生成器场景逐体导出、大文件流式导入、3D 引擎切换。 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('hidden'), null, { timeout: 30000 });
await page.waitForTimeout(1200);

await page.locator('.section-head').last().click();

// 生成器场景 → 请求 Worker 导出完整逐体配置
const dlPromise = page.waitForEvent('download');
await page.getByRole('button', { name: '导出完整 JSON' }).click();
const dl = await dlPromise;
await dl.saveAs('shots2/generated-export.json');
const cfg = JSON.parse(fs.readFileSync('shots2/generated-export.json', 'utf8'));
console.log('生成器导出', {
  bodies: cfg.bodies?.length,
  z0: cfg.bodies?.[0]?.z,
  hasG: typeof cfg.physics.G,
  dim: cfg.dimensions,
});

// 生成 3000 体大 JSON 文件，通过 file input 流式导入
const big = {
  schema: 'nbody-studio/v2',
  version: 2,
  dimensions: 3,
  physics: { ...cfg.physics, engine: 'auto', maxSimulated: 100000 },
  init: { ...cfg.init, count: 3000 },
  view: { ...cfg.view, trails: false },
  run: { playing: true, speed: 1 },
  bodies: Array.from({ length: 3000 }, (_, i) => ({
    id: i,
    x: (i % 60) - 30,
    y: Math.floor(i / 60) - 25,
    z: (i % 7) - 3,
    vx: 0,
    vy: 0.01 * ((i % 5) - 2),
    vz: 0,
    mass: 1,
    grav: 1 + (i % 3),
  })),
};
fs.writeFileSync('shots2/big-config.json', JSON.stringify(big));
await page.locator('#config-file').setInputFiles('shots2/big-config.json');
await page.waitForTimeout(2200);
console.log('流式导入 3000 体', await page.evaluate(() => ({
  n: document.getElementById('hud-n').textContent,
  step: document.getElementById('hud-step').textContent,
  status: document.querySelector('#panel-body .field-hint:last-of-type')?.textContent?.slice(0, 80),
})));

// 非法 JSON 提示
await page.locator('#config-text').fill('{ "schema": "bad", "bodies": [{"x":1}] }');
await page.getByRole('button', { name: '从文本应用' }).click();
await page.waitForTimeout(300);
const status = await page.locator('#panel-body .field-hint').last().textContent();
console.log('非法配置状态', status?.slice(0, 120));

console.log('errors', errors.length ? errors : '(无)');
await browser.close();
