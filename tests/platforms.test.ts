import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/** 四平台适配的静态契约测试。 */
describe('多平台工程契约', () => {
  it('iOS 工程完整且含 iPad 适配', () => {
    const plist = readFileSync('ios/App/App/Info.plist');
    const text = plist.toString('latin1');
    expect(text).toContain('UISupportedInterfaceOrientations~ipad');
    expect(text).toContain('UIApplicationSupportsMultipleScenes');
    expect(existsSync('ios/App/App/public/index.html')).toBe(true);
  });

  it('鸿蒙工程含 WebView 壳与资源', () => {
    const page = readFileSync('harmony/entry/src/main/ets/pages/Index.ets', 'utf8');
    expect(page).toContain('Web({ src: $rawfile(\'index.html\')');
    expect(page).toContain('javaScriptAccess(true)');
    expect(page).toContain('.onBackPress');
    const mod = readFileSync('harmony/entry/src/main/module.json5', 'utf8');
    expect(mod).toContain('"phone", "tablet", "2in1"');
    expect(existsSync('harmony/entry/src/main/resources/rawfile/index.html')).toBe(true);
  });

  it('iOS 与鸿蒙都有构建文档', () => {
    const doc = readFileSync('docs/PLATFORM-BUILD.md', 'utf8');
    expect(doc).toContain('iOS / iPadOS');
    expect(doc).toContain('HarmonyOS');
    expect(doc).toContain('Linux');
  });

  it('Linux 目标配置为 deb', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.build.linux.target).toContain('deb');
    expect(pkg.scripts['dist:linux']).toContain('electron-builder --linux');
  });
});
