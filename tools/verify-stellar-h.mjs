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

// H1：太阳系预设（含 0.05 M☉ 褐矮星）+ 光谱配色
log('== H1 太阳系（含褐矮星）==');
await page.selectOption('#preset-select','solar-system');
await page.locator('#preset-apply').click();
await page.waitForTimeout(2500);
log('hud n',await page.locator('#hud-n').textContent());
await page.evaluate(()=>{
  const sel=[...document.querySelectorAll('#panel-body select')].find(s=>[...s.options].some(o=>o.value==='stellar'));
  if(sel){sel.value='stellar';sel.dispatchEvent(new Event('change',{bubbles:true}));}
});
await page.waitForTimeout(800);
const d0=await dbg();
log('snapshot count',d0?.count ?? '(n/a)');

// H2/H3：超新星雨快进，期待巨星/WR/超新星事件
log('\n== H2/H3 超新星雨（8–40 M☉，含 WR 路径）==');
await page.selectOption('#preset-select','supernova-rain');
await page.locator('#preset-apply').click();
await page.waitForTimeout(2000);
await page.evaluate(()=>{const s=document.getElementById('speed');if(s){s.value='16';s.dispatchEvent(new Event('input',{bubbles:true}));}});
await page.waitForTimeout(9000);
const d1=await dbg();
log('step',d1?.step);
const evText=await page.locator('#stellar-events').innerText();
log('events head:',evText.slice(0,600).replace(/\n/g,' | '));
const hasGiant=evText.includes('红超巨星');
const hasWR=evText.includes('沃尔夫-拉叶');
const hasSN=evText.includes('超新星');
log('hasGiant',hasGiant,'hasWR',hasWR,'hasSN',hasSN);
if(!hasGiant||!hasSN){ log('WARN: 期望的演化事件尚未出现（快进时长可能不足）'); }

await page.screenshot({path:'shots-all/stellar-h.png'});
log('\nerrors',errors.length?errors:'(无)');
await browser.close();
process.exit(errors.length?1:0);
