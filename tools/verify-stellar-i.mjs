import { chromium } from 'playwright';
const browser = await chromium.launch({ channel:'msedge', headless:true, args:['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:1500,height:950} });
const errors=[];
page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE: '+m.text())});
const log=(...a)=>console.log(...a);

await page.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>document.getElementById('boot')?.classList.contains('hidden'),null,{timeout:45000});
await page.waitForTimeout(1200);

// I3：HUD 物理时钟
log('== I3 HUD 物理时钟 ==');
log('hud-myr', await page.locator('#hud-myr').textContent());

// I1/I2：超新星雨触发演化 → 信息卡 + 日志
log('\n== I1/I2 超新星雨 ==');
await page.selectOption('#preset-select','supernova-rain');
await page.locator('#preset-apply').click();
await page.waitForTimeout(2000);
await page.evaluate(()=>{const s=document.getElementById('speed');if(s){s.value='16';s.dispatchEvent(new Event('input',{bubbles:true}));}});
await page.waitForTimeout(9000);
// 展开「分析诊断与性能」分区查看卡片与日志
await page.evaluate(()=>{
  const h=[...document.querySelectorAll('#panel .section-header, details summary')].find(x=>x.textContent?.includes('分析诊断'));
  h?.dispatchEvent(new MouseEvent('click',{bubbles:true}));
});
await page.waitForTimeout(500);
const card=await page.locator('#stellar-card').innerText().catch(()=>'(空)');
log('star-card:',card.replace(/\n/g,' | ').slice(0,300));
const evCount=await page.locator('#stellar-events .field-hint').count();
log('log rows (显示上限50):',evCount);
const firstRow=await page.locator('#stellar-events .field-hint').first().innerText().catch(()=>'');
log('newest row:',firstRow.slice(0,120));

// Shift+E 快捷键切换分区
log('\n== Shift+E ==');
await page.keyboard.press('Shift+KeyE');
await page.waitForTimeout(400);
const collapsed=await page.evaluate(()=>{
  const sec=[...document.querySelectorAll('#panel > section, #panel details')].find(x=>x.textContent?.includes('分析诊断'));
  return sec?.dataset.collapsed ?? '(n/a)';
});
log('section collapsed after Shift+E:',collapsed);

await page.screenshot({path:'shots-all/stellar-i.png'});
log('\nerrors',errors.length?errors:'(无)');
await browser.close();
process.exit(errors.length?1:0);
