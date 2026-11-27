# N-Body Studio 自主提示词集（50 轮）

> ✅ **50 轮全部完成（2026-11-27）**：每轮一条可独立验证的小增强，
> 分 5 批执行，164+7=171 项测试全绿，tsc / build 通过。


生成方式：AI 基于当前代码扫描自主提出，每轮一条可独立验证的小增强。
执行方式：找提示词 → 完成 → 验证（tsc / vitest / build），每 10 轮汇总一次。

## 第 1 批 · 数值与工具（1–10）

1. mathx 增加 `formatDuration(ms)`：毫秒→「x.x s / x.x min」，单测。
2. mathx 增加 `wrapAngle(rad)`：角度归一到 [-π,π]，单测。
3. mathx 增加 `smoothStep01(t)`：三次平滑，单测。
4. mathx 增加 `nearlyEqual(a,b,eps)`：近似比较，单测。
5. mathx 增加 `hexToRgb(hex)`：#rrggbb→[r,g,b] 0–1，单测。
6. mathx 增加 `rgbToHex(r,g,b)`：与 5 往返，单测。
7. mathx 增加 `formatScientific(v, digits)`：统一科学计数，单测。
8. mathx 增加 `significantDigits(v, n)`：有效位截断，单测。
9. mathx 增加 `mod(a,n)`：正模（处理负数），单测。
10. mathx 增加 `lerpAngle(a,b,t)`：角度插值走最短弧，单测。

## 第 2 批 · 物理纯函数（11–20）

11. physics 新增 `orbitalPeriod(a, M, G)`：开普勒第三定律，单测。
12. physics 新增 `escapeVelocity(r, M, G)`，单测。
13. physics 新增 `schwarzschildRadius(M, G, c)`，单测。
14. physics 新增 `virialRatio(ke, pe)`：2KE/|PE|，单测。
15. physics 新增 `specificOrbitalEnergy(r, v, mu)`，单测。
16. physics 新增 `eccentricityVector` 辅助（rx,vx,mu）→ e 标量，单测。
17. physics 新增 `semiMajorAxis(r, v, mu)`，单测。
18. physics 新增 `hillRadius(a, m, M)`，单测。
19. physics 新增 `rocheLimit(m1, m2, densityRatio)`，单测。
20. physics 新增 `dynamicalTime(M, R, G)`，单测。

## 第 3 批 · 配置与校验（21–30）

21. validate 校验 `physics.dt > 0`，非法给精确路径。
22. validate 校验 `physics.theta ∈ (0, 2]`。
23. validate 校验 `view.pointSize ∈ [0.5, 20]`。
24. validate 校验 `stellar.kickGain ∈ [0, 100]`。
25. validate 校验 `stellar.lengthUnit > 0`。
26. validate 校验 `init.radius > 0`。
27. validate 校验 `init.massMax >= massMin`。
28. validate 校验 `physics.pmGrid ∈ [4, 1024]` 且为 2 的幂。
29. validate 校验 `view.trailLength ∈ [2, 10000]`。
30. validate 校验 `stellar.massUnit/timeUnit` 有限数（拒绝 NaN/Inf）。

## 第 4 批 · 快捷键与 UI（31–40）

31. 快捷键 `Shift+Home` 清除质心漂移（复用 removeDrift）。
32. 快捷键 `Ctrl+Shift+R` 重置全部物理参数到默认。
33. 快捷键 `KeyP` 导出当前轨迹 CSV。
34. 快捷键 `Shift+P` 录制 WEBM 切换。
35. 快捷键 `Ctrl+D` 复制分享链接（Ctrl+Shift+C 的别名）。
36. HUD 增加「采样权重」显示（weight>1 时）。
37. HUD 增加「步长 dt」显示。
38. HUD 增加「积分器」显示。
39. 帮助面板按分类折叠（点击标题）。
40. 预设下拉增加「无冲突检测」说明文案。

## 第 5 批 · 稳健性（41–50）

41. client：`pendingCommand` 队列上限 1，多次覆盖避免内存累积（已有，补测试）。
42. worker：捕获 `world.step()` 异常，post error 而非静默崩溃。
43. world：`snapshot()` 对 NaN 位置做钳制，防止渲染器崩溃。
44. renderer：点大小上限保护（≤64px）。
45. renderer：轨迹点数上限保护。
46. collab：房间号长度上限 64（已有，补测试）。
47. guard：分享链接 gzip 解压后大小上限（防 zip bomb）。
48. validate：配置文本 JSON 深度上限（防深层递归爆栈）。
49. collab：客户端消息大小上限（发送前检查）。
50. README：汇总 50 轮改动 + 最终验证命令。

---

## 执行记录

| 批次 | 轮次 | 主题 | 验证 |
|---|---|---|---|
| 1 | 1–10 | 数值工具 | 9 项新测试 |
| 2 | 11–20 | 物理公式 | 11 项新测试 |
| 3 | 21–30 | 配置校验 | 既有 19 项回归通过 |
| 4 | 31–40 | 快捷键与 HUD | 快捷键 58→63，HUD +2 项 |
| 5 | 41–50 | 稳健性 | 7 项新测试 |
