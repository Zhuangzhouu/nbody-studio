# N-Body Studio 自主提示词集 · 第三批（50 轮）

> ✅ **50 轮全部完成（2026-11-28）**：226 项测试全绿，v3.2.0 发布。


生成依据：扫描已有 mathx(28) / physics-formulas(10) / dynamics(9) / geometry(14) 函数
及 63 项快捷键，选取尚未覆盖的增强点。执行：找提示词 → 完成 → 发布。

## 第 1 批 · 数值补全（1–10）

1. mathx 增加 `range(values)` 极差 max-min，单测。
2. mathx 增加 `rms(values)` 均方根，单测。
3. mathx 增加 `product(values)` 连乘，单测。
4. mathx 增加 `countBy(values, pred)` 条件计数，单测。
5. mathx 增加 `unique(values)` 去重（保持顺序），单测。
6. mathx 增加 `chunk(values, size)` 分块，单测。
7. mathx 增加 `zip(a, b)` 配对，单测。
8. mathx 增加 `formatRatio(a, b)` 比率格式化，单测。
9. mathx 增加 `clamp01(v)` 快捷钳制，单测。
10. mathx 增加 `inverseLerp(a, b, v)` 反插值，单测。

## 第 2 批 · 物理补全（11–20）

11. physics-formulas 增加 `orbitalSpeedAt(r, a, mu)` 活力公式，单测。
12. 增加 `gravitationalBindingEnergy(M, m, r, G)`，单测。
13. 增加 `tidalRadius(m, M, a)` 洛希瓣近似，单测。
14. 增加 `freeFallTime(r, M, G)`，单测。
15. 增加 `surfaceGravity(M, R, G)`，单测。
16. 增加 `densityFromMassRadius(M, R)`，单测。
17. 增加 `keplerSolver(M, E, e)` 迭代解偏近点角，单测。
18. 增加 `lorentzFactor(v, c)`，单测。
19. 增加 `relativisticBeta(v, c)`，单测。
20. 增加 `angularFrequency(a, M, G)` 平均运动，单测。

## 第 3 批 · 数据完整性（21–30）

21. serialize 导出时校验 bodies 数组长度 ≤ 1e6，超限报错。
22. serialize 导入时校验 star.type 枚举（已有，补边界测试）。
23. validate 校验 `physics.dtSafety ∈ (0,1]`，单测。
24. validate 校验 `view.trailBodies ≥ 0`，单测。
25. validate 校验 `physics.maxSimulated ≥ 0`，单测。
26. validate 校验 `stellar.kickRadius ≥ 0`，单测。
27. validate 校验 `init.seed` 为整数，单测。
28. validate 校验 `init.spin ∈ [-1,1]`，单测。
29. validate 校验 `view.glow` 为布尔，单测。
30. validate 校验 `physics.collision='merge'` 时 restitution 忽略提示。

## 第 4 批 · UI 增强（31–40）

31. 信息卡增加「比角动量 h」行。
32. 信息卡增加「动能 Ek」行。
33. 少体工作台增加「总质量」汇总行。
34. 少体工作台增加「质心速度」汇总行。
35. 预设分区增加「随机种子」显示。
36. 分析面板增加「导出诊断 CSV」按钮。
37. 性能面板增加「显示耗时占比」开关。
38. 事件流增加「按类型过滤」下拉。
39. 帮助面板支持点击快捷键直接执行（需确认）。
40. 工具提示统一使用 title 属性（补缺）。

## 第 5 批 · 验证与发布（41–50）

41. 全量单测回归。
42. tsc 零错误检查。
43. 生产构建验证。
44. 浏览器 e2e 启动验证。
45. HUD DOM 契约测试通过。
46. 协作协议测试通过。
47. 快捷键冲突检测。
48. 更新 README 第三批章节。
49. 版本升级至 v3.2.0。
50. commit + push 发布。
