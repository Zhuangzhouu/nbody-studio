import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const errs = [];
const p1 = await ctx.newPage(), p2 = await ctx.newPage();
for (const [i, p] of [p1, p2].entries()) {
  p.on('pageerror', e => errs.push(`p${i + 1}: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(`p${i + 1}: ${m.text()}`); });
  await p.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.getElementById('boot')?.classList.contains('hidden'), null, { timeout: 30000 });
}
console.log('== 两个页面就绪 ==');
// 两个页面加入同一房间
await p1.fill('#collab-room', 'e2e-room');
await p1.click('#collab-join');
await p2.fill('#collab-room', 'e2e-room');
await p2.click('#collab-join');
await p1.waitForTimeout(1200);
console.log('p1 status', await p1.locator('#collab-status').textContent());
console.log('p2 status', await p2.locator('#collab-status').textContent());
console.log('p1 members', (await p1.locator('#collab-members').innerText()).replace(/\n/g, ' | '));
console.log('p2 members', (await p2.locator('#collab-members').innerText()).replace(/\n/g, ' | '));
// 主控（p1）切换预设，验证 p2 同步
await p1.selectOption('#preset-select', 'figure8');
await p1.click('#preset-apply');
await p1.waitForTimeout(2500);
console.log('p1 n', await p1.locator('#hud-n').textContent(), 'p2 n', await p2.locator('#hud-n').textContent());
// 播放状态同步
await p1.evaluate(() => { const btn = document.getElementById('btn-play'); if (btn) btn.click(); });
await p1.waitForTimeout(800);
console.log('p1 play', await p1.locator('#btn-play').textContent(), 'p2 play', await p2.locator('#btn-play').textContent());
console.log('errors', errs.length ? errs.slice(0, 4) : '(无)');
await b.close();
