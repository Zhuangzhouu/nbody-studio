import { chromium } from 'playwright';
const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];
p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errs.push('CONSOLE: '+m.text())});
await p.goto('http://localhost:4173/',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>document.getElementById('boot')?.classList.contains('hidden'),null,{timeout:30000});
await p.waitForTimeout(1200);
// 物理分区：选 multipole 引擎
await p.evaluate(()=>{
 const h=[...document.querySelectorAll('.section-head')].find(x=>x.textContent?.includes('物理与引擎'));
 if(h?.parentElement) h.parentElement.dataset.collapsed='false';
});
await p.waitForTimeout(300);
const ok=await p.evaluate(()=>{
 const sel=[...document.querySelectorAll('#panel-body select')].find(s=>[...s.options].some(o=>o.value==='multipole'));
 if(!sel) return false;
 sel.value='multipole'; sel.dispatchEvent(new Event('change',{bubbles:true})); return true;
});
console.log('engine option found',ok);
await p.waitForTimeout(2500);
console.log('hud engine',await p.locator('#engine-badge').textContent());
console.log('debug',await p.evaluate(()=>window.__nbody.debug()));
// 切 preset 验证稳定
await p.selectOption('#preset-select','figure8');
await p.locator('#preset-apply').click();
await p.waitForTimeout(2000);
console.log('after preset',await p.locator('#engine-badge').textContent(),'n',await p.locator('#hud-n').textContent());
console.log('errors',errs.length?errs:'(无)');
await b.close();
