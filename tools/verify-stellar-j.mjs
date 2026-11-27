import { chromium } from 'playwright';
const browser = await chromium.launch({ channel:'msedge', headless:true, args:['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:1500,height:950} });
const errors=[];
page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE: '+m.text())});
const log=(...a)=>console.log(...a);

await page.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>document.getElementById('boot')?.classList.contains('hidden'),null,{timeout:45000});
await page.waitForTimeout(1000);

// J1：wind=true 的 20 M☉ 星（JSON 注入）
log('== J1 星风（wind=true）==');
const cfg = {
  schema:'nbody-studio/v2', version:2, dimensions:2,
  physics:{ G:1, dt:0.01, softening:0, theta:0.6, integrator:'verlet', collision:'none',
            restitution:0.7, bodyRadius:0.08, engine:'direct', sampling:'auto', maxSimulated:2000000, pmGrid:0 },
  init:{ count:1, distribution:'disc', radius:32, massMin:0.6, massMax:1.8, totalMass:2000,
         normalizeMass:true, spin:1, jitter:0.02, thickness:0.08, seed:20261126 },
  view:{ trails:false, trailLength:1, trailBodies:400, trailPoints:48, maxRenderPoints:250000,
         colorMode:'stellar', pointSize:2.6, glow:true, showGrid:true },
  run:{ playing:true, speed:16 },
  stellar:{ massUnit:1, timeUnit:1, lengthUnit:1, kickRadius:10, kickGain:1,
            accretion:false, wind:true, transfer:false, tidalFactor:100 },
  bodies:[{ id:1, x:0, y:0, vx:0, vy:0.1, mass:20 }],
};
// 展开「JSON 配置」分区（默认折叠）
await page.keyboard.press('KeyJ');
await page.waitForTimeout(400);
await page.locator('#config-text').fill(JSON.stringify(cfg));
await page.getByRole('button', { name: '从文本应用' }).click();
await page.waitForTimeout(9000);
// 展开分析分区
await page.evaluate(()=>{const s=[...document.querySelectorAll('[data-collapsed]')].find(x=>x.textContent?.includes('分析诊断'));if(s&&s.dataset.collapsed==='true')s.querySelector('div,summary,h3')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
await page.waitForTimeout(400);
const ev=await page.locator('#stellar-events').innerText();
log('events:',ev.replace(/\n/g,' | ').slice(0,300));
log('hasWindEvent', ev.includes('星风流失'), 'hasRedSG', ev.includes('红超巨星'));

await page.screenshot({path:'shots-all/stellar-j.png'});
log('\nerrors',errors.length?errors:'(无)');
await browser.close();
process.exit(errors.length?1:0);
