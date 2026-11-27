import { chromium } from 'playwright';
const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errs.push(m.text())});
await p.goto('http://localhost:4173/',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>document.getElementById('boot')?.classList.contains('hidden'),null,{timeout:30000});
// 通过 UI 应用超大配置（sampling=never, maxSimulated=0, count=20亿）
await p.evaluate(()=>{
  const heads=[...document.querySelectorAll('.section-head')];
  const h=heads.find(x=>x.textContent?.includes('JSON 配置'));
  if(h?.parentElement) h.parentElement.dataset.collapsed='false';
  const cfg={
    schema:'nbody-studio/v2',version:2,dimensions:2,
    physics:{G:1,dt:0.01,softening:0.1,theta:0.6,integrator:'verlet',collision:'none',engine:'particle-mesh',sampling:'never',maxSimulated:0,pmGrid:64},
    init:{count:2000000000,distribution:'disc',radius:10,massMin:1,massMax:1,seed:1},
    view:{trails:false,maxRenderPoints:250000,colorMode:'speed',pointSize:3,glow:true},
    run:{playing:false,speed:1},
  };
  const t=document.getElementById('config-text');
  if(t){t.value=JSON.stringify(cfg);t.dispatchEvent(new Event('input',{bubbles:true}));}
});
await p.evaluate(()=>{
  const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.includes('应用并重置'));
  if(b) b.click();
});
await p.waitForTimeout(4000);
console.log('boot hidden',await p.evaluate(()=>document.getElementById('boot')?.classList.contains('hidden')));
console.log('debug',await p.evaluate(()=>{const d=window.__nbody.debug();return{simulated:d.simulated,requested:d.requested}}));
console.log('errors',errs.length?errs.slice(0,3):'(无)');
await b.close();
