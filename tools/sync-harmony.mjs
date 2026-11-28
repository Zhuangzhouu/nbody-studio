/** 把 Vite dist 同步到鸿蒙 rawfile（构建 APK/HAP 前执行）。 */
import fs from 'node:fs';
import path from 'node:path';
const src = 'dist';
const dst = 'harmony/entry/src/main/resources/rawfile';
function copyDir(s, d) {
  fs.mkdirSync(d, { recursive: true });
  for (const e of fs.readdirSync(s, { withFileTypes: true })) {
    const sp = path.join(s, e.name), dp = path.join(d, e.name);
    if (e.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}
if (!fs.existsSync(src)) { console.error('dist 不存在，先 npm run build'); process.exit(1); }
copyDir(src, dst);
console.log(`synced ${src} -> ${dst}`);
