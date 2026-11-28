# N-Body Studio 自主提示词集 · 第四批（50 轮）

> ✅ **50 轮全部完成（2026-11-28）**：251 项测试全绿，v3.3.0 发布。


生成依据：扫描 55 源文件 / 26 测试文件 / 26 个工具脚本，
选取尚未覆盖的增强点。执行：找提示词 → 完成 → 发布。

## 第 1 批 · 字符串与格式化（1–10）

1. mathx 增加 `truncate(str, max)` 省略号截断，单测。
2. mathx 增加 `padZero(n, width)` 前导零，单测。
3. mathx 增加 `formatSI(v, unit)` SI 前缀格式化，单测。
4. mathx 增加 `formatSigned(v, digits)` 带符号格式化，单测。
5. mathx 增加 `formatClock(seconds)` mm:ss 计时，单测。
6. mathx 增加 `splitLines(text, maxLen)` 中文折行，单测。
7. mathx 增加 `escapeHtml(s)` HTML 转义，单测。
8. mathx 增加 `unescapeHtml(s)` 反向转义，单测。
9. mathx 增加 `camelToLabel(s)` 驼峰转标签，单测。
10. mathx 增加 `truncateMiddle(s, head, tail)` 中间省略，单测。

## 第 2 批 · 数组与集合（11–20）

11. mathx 增加 `first(values, pred)` 查找首个，单测。
12. mathx 增加 `last(values)` 末元素，单测。
13. mathx 增加 `take(values, n)` / `drop(values, n)`，单测。
14. mathx 增加 `flatten(arrays)` 展平一层，单测。
15. mathx 增加 `groupBy(values, keyFn)` 分组，单测。
16. mathx 增加 `partition(values, pred)` 二分，单测。
17. mathx 增加 `shuffle(values, rng)` 固定种子洗牌，单测。
18. mathx 增加 `sample(values, n, rng)` 抽样，单测。
19. mathx 增加 `rotateArray(values, k)` 循环移位，单测。
20. mathx 增加 `counts(values)` 频次映射，单测。

## 第 3 批 · 配置与状态（21–30）

21. README 快捷键数 57 → 63 修正。
22. 版本号与 README 批次入口一致性检查。
23. validate 校验 `init.count ≤ 2147483647`（已有，补边界测试）。
24. validate 校验 `physics.softening ≥ 0`（已有，补测试）。
25. validate 校验 `stellar.accretion` 为布尔（已有，补测试）。
26. serialize 导出 JSON 深度 ≤64（已有，补测试）。
27. 配置导入错误提示包含精确路径（抽检 3 项）。
28. auto 引擎分级阈值单测补充（2048/20000 边界）。
29. 内存安全闸单测补充（512MB 上限）。
30. 分享链接往返单测补充（star 字段保真）。

## 第 4 批 · 诊断与信息（31–40）

31. 信息卡增加「维里比率」显示（diag.virial 已有）。
32. 信息卡增加「逃逸状态」标记。
33. 少体工作台标题显示当前引擎。
34. 少体工作台标题显示积分器。
35. HUD 增加「模拟速度倍率」显示。
36. 性能面板增加「单步耗时」大字显示。
37. 诊断曲线图例增加当前值显示。
38. 事件流显示事件计数总数。
39. 预设下拉显示每个预设的天体数。
40. 工具提示补齐 10 个缺失控件。

## 第 5 批 · 验证与发布（41–50）

41. 全量单测回归。
42. tsc 零错误检查。
43. 生产构建验证。
44. 浏览器启动与 DOM 契约验证。
45. 快捷键冲突检测。
46. 协作协议测试通过。
47. HUD DOM 测试通过。
48. README 第四批章节。
49. 版本升级至 v3.3.0。
50. commit + push 发布。
