# N-Body Studio 自主提示词集 · 第二批（50 轮）

生成依据：扫描现有 19 个测试文件、63 项快捷键、9 个预设、18 个 mathx 函数后，
选取尚未覆盖的增强点。每轮一条，可独立验证。执行：找提示词 → 完成 → 发布（分批推送）。

## 第 1 批 · 统计工具（1–10）

1. mathx 增加 `mean(values)` 算术平均，单测。
2. mathx 增加 `variance(values)` 总体方差，单测。
3. mathx 增加 `stdDev(values)` 标准差，单测。
4. mathx 增加 `median(values)` 中位数（排序副本），单测。
5. mathx 增加 `quantile(values, q)` 线性插值分位数，单测。
6. mathx 增加 `sum(values)` 求和，单测。
7. mathx 增加 `minMax(values)` 返回 [min,max]，单测。
8. mathx 增加 `movingAverage(values, window)` 滑动平均，单测。
9. mathx 增加 `normalize(values)` 归一化到 [0,1]，单测。
10. mathx 增加 `histogram(values, bins)` 直方图计数，单测。

## 第 2 批 · 向量几何（11–20）

11. geometry 新增 `dist2(ax,ay,bx,by)`，单测。
12. geometry 新增 `dist3(ax,ay,az,bx,by,bz)`，单测。
13. geometry 新增 `dot2/ dot3`，单测。
14. geometry 新增 `cross2` 标量叉积，单测。
15. geometry 新增 `cross3` 向量叉积，单测。
16. geometry 新增 `norm2/norm3`，单测。
17. geometry 新增 `normalize2/normalize3`，单测。
18. geometry 新增 `angleBetween2`，单测。
19. geometry 新增 `rotate2(x,y,rad)`，单测。
20. geometry 新增 `lerp2/lerp3`，单测。

## 第 3 批 · 诊断数值（21–30）

21. diagnostics 新增 `centerOfMass` 已在 bodies，补单测确认守恒。
22. diagnostics 新增 `momentOfInertia(bodies)` 转动惯量，单测。
23. diagnostics 新增 `virialCoefficient(ke,pe)` 别名，单测。
24. diagnostics 新增 `totalAngularMomentum` 已在 dynamics，补单测。
25. diagnostics 新增 `specificAngularMomentum(r,v)`，单测。
26. diagnostics 新增 `roc(r,v,mu)` 拉普拉斯-龙格-楞次向量模，单测。
27. diagnostics 新增 `inclination(Lx,Ly,Lz)`，单测。
28. diagnostics 新增 `trueAnomaly(e,E)`，单测。
29. diagnostics 新增 `meanAnomaly(M_e,e)` 迭代解，单测。
30. diagnostics 新增 `orbitEnergyFromElements(a,mu)`，单测。

## 第 4 批 · UI 与交互（31–40）

31. 信息卡增加「采样权重」行（weight>1 时显示）。
32. 信息卡增加「物理质量 M☉」行（已有则补测试）。
33. 少体状态表增加「能量贡献」列（每体动能）。
34. 少体状态表增加「角动量贡献」列。
35. HUD 增加「维里比率」显示（已有 diag.virial）。
36. HUD 增加「逃逸数」显示（diag.escapeCount）。
37. 分析面板增加「重置曲线」按钮。
38. 性能面板增加「重置 EMA」按钮。
39. 事件流增加「清空」按钮。
40. 帮助面板快捷键列表支持搜索过滤。

## 第 5 批 · 工程与文档（41–50）

41. 补充 R1–R10 测试覆盖率说明。
42. 补充 R11–R20 物理公式来源注释。
43. 验证 R21–R30 校验错误路径文案精确。
44. 验证 R31–R40 快捷键无冲突（跑 shortcuts 测试）。
45. 验证 R41–R50 稳健性测试通过。
46. 更新 README 第二批清单入口。
47. 更新版本号至 v3.1。
48. 生成第二批完成报告。
49. 全量回归（tsc/vitest/build/e2e）。
50. 发布（commit + push + Release 说明更新）。
