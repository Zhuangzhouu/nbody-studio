/** 快捷键系统端到端验证。 */
import { chromium } from 'playwright';
import fs from 'node:fs';

fs.mkdirSync('shots4', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.getElementById('boot')?.classList.contains('hidden'), null, { timeout: 30000 });
await page.waitForTimeout(1000);

const helpVisible = () => page.evaluate(() => (document.getElementById('shortcut-help')?.style.display ?? 'none') !== 'none');

// 1) ? 打开帮助
await page.keyboard.press('Shift+Slash');
await page.waitForTimeout(250);
console.log('帮助打开', await helpVisible());
console.log('帮助条目数', await page.locator('.help-row').count());
console.log('帮助分组', await page.locator('.help-group-title').allTextContents());
await page.screenshot({ path: 'shots4/01-help.png' });

// 2) Esc 关闭
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
console.log('Esc 关闭', !(await helpVisible()));

// 3) 输入框中按 ? 不应打开帮助
await page.locator('#count-input').focus();
await page.keyboard.type('?');
await page.waitForTimeout(150);
console.log('输入焦点保护（? 不弹帮助）', !(await helpVisible()));
await page.locator('#count-input').fill('1200');
await page.locator('#count-input').blur();

// 4) 播放/暂停 + 单步
const playText = () => page.locator('#lbl-play').textContent();
console.log('初始播放态', await playText());
await page.keyboard.press('Space');
await page.waitForTimeout(120);
console.log('Space 后', await playText());
const before = await page.locator('#hud-step').textContent();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(500);
console.log('单步', before, '->', await page.locator('#hud-step').textContent());

// 5) 速度 + / -
await page.keyboard.press('Equal');
await page.waitForTimeout(100);
console.log('加速后', await page.locator('#speed-value').textContent());
await page.keyboard.press('Minus');
await page.waitForTimeout(100);
console.log('减速后', await page.locator('#speed-value').textContent());

// 6) 显示开关
const toggle = (label) => page.locator('.toggle').filter({ hasText: label }).locator('input').isChecked();
console.log('网格初始', await toggle('参考网格'));
await page.keyboard.press('KeyG');
await page.waitForTimeout(120);
console.log('G 切换后', await toggle('参考网格'));
await page.keyboard.press('KeyT');
await page.waitForTimeout(120);
console.log('T 切换后轨迹', await toggle('轨迹线'));

// 7) 维度 / 引擎 / 积分器快捷键与面板同步
const selectValue = (label) => page.locator('.field').filter({ hasText: label }).locator('select').first().inputValue();
console.log('维度初始', await selectValue('维度'));
await page.keyboard.press('KeyU');
await page.waitForTimeout(200);
console.log('U 后维度', await selectValue('维度'));
await page.keyboard.press('KeyY');
await page.waitForTimeout(200);
console.log('Y 后引擎', await selectValue('求解引擎'));
await page.keyboard.press('KeyI');
await page.waitForTimeout(200);
console.log('I 后积分器', await selectValue('积分器'));

// 8) Ctrl+K 聚焦、Ctrl+B 展开编辑器并聚焦
await page.keyboard.press('Control+k');
await page.waitForTimeout(100);
console.log('Ctrl+K 焦点', await page.evaluate(() => document.activeElement?.id));
await page.keyboard.press('Control+b');
await page.waitForTimeout(150);
console.log('Ctrl+B 焦点', await page.evaluate(() => document.activeElement?.id));

// 9) 顶栏按钮打开帮助 + 点击遮罩关闭
await page.locator('#btn-help').click();
await page.waitForTimeout(150);
console.log('按钮打开帮助', await helpVisible());
await page.mouse.click(1400, 500);
await page.waitForTimeout(150);
console.log('遮罩关闭帮助', !(await helpVisible()));

// 10) Ctrl+S 导出
const dl = page.waitForEvent('download');
await page.keyboard.press('Control+s');
const download = await dl;
console.log('Ctrl+S 导出文件名', download.suggestedFilename());

console.log('errors', errors.length ? errors : '(无)');
await browser.close();
