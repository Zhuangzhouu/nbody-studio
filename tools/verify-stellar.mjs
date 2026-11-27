import { chromium } from 'playwright';
const browser = await chromium.launch({ channel:'msedge', headless:true, args:['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:1500,height:950} });
const errors=[];
page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE: '+m.text())});
const log=(...a)=>console.log(...a);
const dbg=()=>page.evaluate(()=>window.__nbody.debug());

await page.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>document.getElementById('boot')?.classList.contains('hidden'),null,{timeout:45000});
await page.waitForTimeout(1200);

// 预设下拉在「预设场景」分区
log('== 太阳系预设 ==');
await page.selectOption('#preset-select','solar-system');
await page.locator('#preset-apply').click();
await page.waitForTimeout(2500);
log('hud n',await page.locator('#hud-n').textContent());

// 切换恒星光谱配色（物理分区里的显示下拉）
log('\n== 恒星光谱配色 ==');
await page.evaluate(()=>{
  const sel=[...document.querySelectorAll('#panel-body select')].find(s=>[...s.options].some(o=>o.value==='stellar'));
  if(sel){sel.value='stellar';sel.dispatchEvent(new Event('change',{bubbles:true}));}
});
await page.waitForTimeout(800);
log('color',await page.evaluate(()=>[...document.querySelectorAll('#panel-body select')].find(s=>s.value==='stellar')?.value));

// 超新星雨 + 快进
log('\n== 超新星雨 ==');
await page.selectOption('#preset-select','supernova-rain');
await page.locator('#preset-apply').click();
await page.waitForTimeout(2000);
// 快进：调整 speed 到 16
await page.evaluate(()=>{const s=document.getElementById('speed');if(s){s.value='16';s.dispatchEvent(new Event('input',{bubbles:true}));}});
await page.waitForTimeout(6000);
const d=await dbg();
log('step',d.step,'engine',await page.locator('#engine-badge').textContent());
log('events',await page.locator('#stellar-events').innerText());
log('drift',await page.locator('#hud-drift').textContent());

// 白矮星双星
log('\n== 白矮星双星 ==');
await page.selectOption('#preset-select','wd-binary');
await page.locator('#preset-apply').click();
await page.waitForTimeout(4000);
log('events',await page.locator('#stellar-events').innerText());

await page.screenshot({path:'shots-all/stellar.png'});
log('\nerrors',errors.length?errors:'(无)');
await browser.close();
