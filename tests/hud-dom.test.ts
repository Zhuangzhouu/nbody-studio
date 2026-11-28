import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** 防止 HUD 类引用了 HTML 中不存在的 DOM 节点（曾导致初始化失败）。 */
describe('HUD DOM 契约', () => {
  it('hud.ts 引用的所有 #hud-* 节点都在 index.html 中定义', () => {
    const hud = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const refs = [...hud.matchAll(/\$\('(hud-[^']+)'\)/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(5);
    for (const id of refs) {
      expect(html, `缺少 DOM 节点 #${id}`).toContain(`id="${id}"`);
    }
  });

  it('顶栏徽标节点同样存在', () => {
    const hud = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const refs = [...hud.matchAll(/\$\('([a-z-]+-badge)'\)/g)].map((m) => m[1]);
    for (const id of refs) expect(html, `缺少徽标 #${id}`).toContain(`id="${id}"`);
  });
});
