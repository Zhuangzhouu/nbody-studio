import { chromium } from 'playwright';
const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errs.push(m.text())});
// 1) 正常启动
await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>document.getElementById('boot')?.classList.contains('hidden'),null,{timeout:30000});
console.log('normal boot n',await p.locator('#hud-n').textContent());
// 2) 超长 hash 被忽略，仍正常启动
await p.goto('http://localhost:5173/#c='+'x'.repeat(17000),{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>document.getElementById('boot')?.classList.contains('hidden'),null,{timeout:30000}).catch(()=>{});
console.log('long hash boot',await p.evaluate(()=>document.getElementById('boot')?.classList.contains('hidden')));
console.log('long hash n',await p.locator('#hud-n').textContent());
console.log('errors',errs.length?errs.slice(0,3):'(无)');
await b.close();
