import { chromium } from 'playwright';
const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errs.push(m.text())});
// 直接调用 Worker 的 resolveStrategy 验证安全闸（Node 侧单测已覆盖），
// 浏览器侧验证：URL 分享链接导入超大配置不崩
const cfg={
  schema:'nbody-studio/v2',version:2,dimensions:2,
  physics:{G:1,dt:0.01,softening:0.1,theta:0.6,integrator:'verlet',collision:'none',engine:'particle-mesh',sampling:'never',maxSimulated:0,pmGrid:64},
  init:{count:2000000000,distribution:'disc',radius:10,massMin:1,massMax:1,seed:1},
  view:{trails:false,maxRenderPoints:250000,colorMode:'speed',pointSize:3,glow:true},
  run:{playing:false,speed:1},
};
// 用 base64url 编码成分享 hash（格式参照 makeShareUrl）
const json=JSON.stringify(cfg);
const hash='H4sIAAAAAAAACjWQQW7DMAwE_7JnpbXTNgd9IKcCRfMCxWIcAjJliLSTNPDfC9mtTkuCmuXyCe2uNAR4yDnHx05tipxf5z0cZirKWeD3DpEHklrpWo7Xh3Kn8E8c4VuHaPDNS9M6aL4YCUtfG62DXclC1QcHFqO-BMsFvuITGRy6nBJvTpAsBAeSnoXgMYZi3CXaDaRXOGgYxrTCITRTgcMQ7icephSMInzjMA7HwhH-8L5US7a6ZpcnMfh98_9qJrXC58k268jawaGEyJPCt01Fq36yrAlXHe6rVqpW7eIwM90q3krgpPCXkJTWnb5JIpWvzGL1Zh-bZ5dTLp851mw6VozDWGdO_EPwbw59yjd4KxMtDmWSSh9TeKyh__DbT98uyy9y5EO1wQEAAA';
await p.goto('http://localhost:4173/#c='+hash,{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>document.getElementById('boot')?.classList.contains('hidden'),null,{timeout:40000}).catch(()=>{});
console.log('boot hidden',await p.evaluate(()=>document.getElementById('boot')?.classList.contains('hidden')));
console.log('debug',await p.evaluate(()=>{const d=window.__nbody.debug();return{simulated:d.simulated,requested:d.requested}}));
console.log('errors',errs.length?errs.slice(0,3):'(无)');
await b.close();
