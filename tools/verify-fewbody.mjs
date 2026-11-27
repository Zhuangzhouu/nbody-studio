import { chromium } from 'playwright';
const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1500,height:950}});
const errs=[];
p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text())});
const hud=()=>p.evaluate(()=>({n:document.getElementById('hud-n')?.textContent,engine:document.getElementById('engine-badge')?.textContent,step:document.getElementById('hud-step')?.textContent,debug:window.__nbody?.debug?.()}));
await p.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>document.getElementById('boot')?.classList.contains('hidden'),null,{timeout:30000});
await p.waitForTimeout(1500);

console.log('== 分区存在 ==');
console.log('title', await p.locator('.section-head').first().textContent());
console.log('num buttons', await p.locator('.fb-num').count());

console.log('\n== 经典构型：figure-8 ==');
await p.getByRole('button',{name:'figure-8 三体'}).click();
await p.waitForTimeout(2500);
console.log(await hud());
console.log('status', await p.locator('#fb-status').textContent());

console.log('\n== 实时状态表 ==');
await p.waitForTimeout(1500);
console.log('rows', await p.locator('#fb-body-table .fb-row').count());
console.log('elements', await p.locator('#fb-elements').textContent());

console.log('\n== 精确模式 ==');
await p.locator('#fb-precision').click();
await p.waitForTimeout(2000);
console.log(await hud());

console.log('\n== 数量 10 ==');
await p.locator('.fb-num').nth(9).click();
await p.waitForTimeout(2500);
console.log('hud n', (await hud()).n, 'rows', await p.locator('#fb-body-table .fb-row').count());

console.log('\n== 双星 + 轨道要素 ==');
await p.getByRole('button',{name:'双星圆轨道'}).click();
await p.waitForTimeout(2500);
console.log('elements', await p.locator('#fb-elements').textContent());

await p.screenshot({path:'shots-all/fewbody.png'});
console.log('\nerrors', errs.length?errs:'(无)');
await b.close();
