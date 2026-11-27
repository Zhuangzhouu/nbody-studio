/** 逐条数据编辑器端到端验证。 */
import { chromium } from 'playwright';
import fs from 'node:fs';

fs.mkdirSync('shots3', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('hidden'), null, { timeout: 30000 });

// 展开编辑器分区
await page.getByRole('button', { name: '逐条设置天体数据' }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots3/01-editor-empty.png' });

const fill = async (values) => {
  for (const [key, value] of Object.entries(values)) {
    await page.locator(`#be-${key}`).fill(String(value));
  }
};
const status = () => page.locator('.be-status').textContent();
const count = () => page.locator('.be-count').textContent();

// 1) 非法提交：质量负数 + x 非数字
await fill({ x: 'abc', mass: '-3' });
await page.locator('#be-submit').click();
console.log('非法提交状态', await status());
console.log('字段错误', {
  x: await page.locator('[data-error="x"]').textContent(),
  mass: await page.locator('[data-error="mass"]').textContent(),
});
console.log('列表数量', await count());
await page.screenshot({ path: 'shots3/02-validation.png' });

// 2) 合法提交两条
await fill({ id: '1', x: '-5', y: '0', z: '0', vx: '0', vy: '-0.4', vz: '0', mass: '2', grav: '3', radius: '' });
await page.locator('#be-submit').click();
await fill({ id: '2', x: '5', y: '0', z: '2', vx: '0', vy: '0.4', vz: '0', mass: '1', grav: '', radius: '0.3' });
await page.locator('#be-submit').click();
console.log('两条提交后', await count(), await status());
console.log('列表首条', await page.locator('.be-item').first().innerText());
await page.screenshot({ path: 'shots3/03-two-rows.png' });

// 3) 修改第一条的 x
await page.locator('.be-item').first().getByRole('button', { name: '修改' }).click();
console.log('编辑态', await page.locator('.be-form-title').textContent(), await status());
await page.locator('#be-x').fill('-12');
await page.locator('#be-submit').click();
console.log('修改后', await page.locator('.be-item').first().innerText(), await status());

// 4) 删除第二条
await page.locator('.be-item').nth(1).getByRole('button', { name: '删除' }).click();
console.log('删除后', await count(), await status());

// 5) 应用到模拟
await page.locator('#be-apply').click();
await page.waitForTimeout(1600);
console.log('应用后 HUD', await page.evaluate(() => ({
  n: document.getElementById('hud-n').textContent,
  step: document.getElementById('hud-step').textContent,
})));
await page.screenshot({ path: 'shots3/04-applied.png' });

// 6) 从模拟载入
await page.locator('.be-item').first().getByRole('button', { name: '删除' }).click();
console.log('清空列表后', await count());
await page.locator('#be-load').click();
await page.waitForTimeout(900);
console.log('载入后', await count(), await status());

// 7) 切 2D，z/vz 应禁用
await page.locator('#panel-body select').nth(1).selectOption('2');
await page.waitForTimeout(300);
console.log('2D z/vz disabled', await page.locator('#be-z').isDisabled(), await page.locator('#be-vz').isDisabled());
console.log('维度状态', await status());

console.log('errors', errors.length ? errors : '(无)');
await browser.close();
