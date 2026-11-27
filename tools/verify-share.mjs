import { chromium } from 'playwright';
const browser = await chromium.launch({ channel:'msedge', headless:true, args:['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport:{width:1200,height:800} });
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:5173/',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>document.getElementById('boot')?.classList.contains('hidden'),null,{timeout:30000});

// 用自定义双体配置
await page.locator('.section-head').filter({hasText:'JSON 配置'}).click();
await page.fill('#config-text', JSON.stringify({
  schema:'nbody-studio/v2', version:2, dimensions:2,
  physics:{...{G:1,dt:0.01,softening:0,theta:0.6,integrator:'verlet',collision:'none',restitution:0.7,bodyRadius:0.08,engine:'direct',sampling:'never',maxSimulated:0,pmGrid:0,adaptiveDt:false,dtSafety:0.3,escapeRadius:0,rSplitGrids:2.5}},
  init:{count:2,distribution:'disc',radius:10,massMin:1,massMax:1,totalMass:2,normalizeMass:false,spin:0,jitter:0,thickness:0,seed:1},
  view:{trails:false,trailLength:1,trailBodies:2,trailPoints:10,maxRenderPoints:100,colorMode:'speed',pointSize:3,glow:true,showGrid:false},
  run:{playing:true,speed:1},
  bodies:[{id:7,x:-2,y:0,z:0,vx:0,vy:-0.5,vz:0,mass:1},{id:8,x:2,y:0,z:0,vx:0,vy:0.5,vz:0,mass:1,grav:3}],
}));
await page.getByRole('button',{name:'从文本应用'}).click();
await page.waitForTimeout(2000);
console.log('source n', await page.locator('#hud-n').textContent());

// 通过快捷键复制分享链接，读剪贴板
await page.context().grantPermissions(['clipboard-read','clipboard-write']);
await page.keyboard.press('Control+Shift+c');
await page.waitForTimeout(1000);
const url = await page.evaluate(() => navigator.clipboard.readText());
console.log('url length', url.length, 'hash?', url.includes('#c='));

// 新页面打开链接
const page2 = await browser.newPage({ viewport:{width:1200,height:800} });
page2.on('pageerror',e=>errors.push('p2:'+e.message));
await page2.goto(url,{waitUntil:'domcontentloaded'});
await page2.waitForFunction(()=>document.getElementById('boot')?.classList.contains('hidden'),null,{timeout:30000});
await page2.waitForTimeout(1500);
console.log('loaded n', await page2.locator('#hud-n').textContent());
console.log('hash cleared', await page2.evaluate(()=>location.hash === ''));
// 逐体字段校验
await page2.locator('.section-head').filter({hasText:'逐条设置天体数据'}).click();
const bodiesText = await page2.locator('.be-list').innerText();
console.log('bodies contain grav=3:', bodiesText.includes('3'));
console.log('errors', errors.length?errors:'(无)');
await browser.close();
