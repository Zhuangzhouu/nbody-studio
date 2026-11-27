import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.goto('http://localhost:5173/');
const r = await p.evaluate(async () => {
  const ws = new WebSocket('ws://localhost:3001');
  const got = [];
  return await new Promise((res) => {
    ws.onopen = () => { for (let i = 0; i < 20; i++) ws.send(JSON.stringify({ t: 'join', room: 'stress', name: 'U' + i })); };
    ws.onmessage = (e) => { got.push(JSON.parse(e.data).t); if (got.length > 30) res({ ok: true, count: got.length, types: [...new Set(got)] }); };
    ws.onerror = () => res({ ok: false, err: 'onerror' });
    setTimeout(() => res({ ok: false, count: got.length }), 3000);
  });
});
console.log('STRESS', JSON.stringify(r));
await b.close();
