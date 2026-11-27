import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto('http://localhost:5173/showcase/canvas.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__canvasPromo?.ready, null, { timeout: 20000 });
const total = await page.evaluate(() => window.__canvasPromo.total);
const mime = await page.evaluate(() => {
  return ['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1','video/mp4']
    .find(m => MediaRecorder.isTypeSupported(m));
});
console.log('录制格式', mime, '时长', total, '秒');

await page.evaluate(() => { window.__recordDone = window.__canvasPromo.startRecording('mp4'); });
await page.waitForTimeout((total + 1.2) * 1000);
await page.evaluate(() => window.__canvasPromo.stopRecording());
const b64 = await page.evaluate(() => window.__recordDone);
const out = 'showcase/nbody-studio-promo.mp4';
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('视频已保存', out, (fs.statSync(out).size / 1024 / 1024).toFixed(2), 'MB');
console.log('errors', errors.length ? errors : '(无)');
await browser.close();
