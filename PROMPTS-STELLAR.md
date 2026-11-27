# N-Body Studio 恒星演化 · 深化轮提示词集（H/I/J 组 · 第四轮）

上一轮 G 组 6 条提示词（类型系统 / 寿命状态机 / 光谱渲染 / 超新星 / 遗骸 / 预设）**已全部实现**，
基线 103 项单元测试。本轮在其接口之上继续深化：**新增恒星类型（褐矮星 / 巨星相 / 沃尔夫-拉叶）、
寿命呈现（进度 / 日志 / 物理时钟）与恒星交互物理（星风 / 质量转移 / 冲击波汽化 / 潮汐瓦解）**。

---

## 0. 上一轮 G 组提示词回放（已实现，供追溯）

| # | 提示词目标（一行） | 验收锚点 | 状态 |
| --- | --- | --- | --- |
| G1 | 光谱型系统：OBAFGKM 按质量表推导（`spectralClass`），显式 `star.type` 不推导不演化 | 0.45→K / 0.8→G / 16→O | ✅ 已实现 |
| G2 | 寿命状态机：t_MS = 10000·M^-2.5 Myr，`advanceEvolution` 推进，M<0.8 永驻（`neverEvolves`） | 主序耗尽→遗骸事件 | ✅ 已实现 |
| G3 | 超新星：8–20 M☉ → II 型 → 中子星 1.4 M☉；≥20 → 黑洞 3 M☉；`kickRadius/kickGain` 径向冲量 | 事件文案「II 型超新星 → 中子星」 | ✅ 已实现 |
| G4 | 遗骸：白矮星 min(0.6M,1.4)；黑洞吸积开关 `stellar.accretion`；史瓦西半径标定 | 遗骸质量换算正确 | ✅ 已实现 |
| G5 | 光谱渲染：`colorMode: 'stellar'`，`STELLAR_COLORS` 唯一真源，遗骸徽标与闪光 | 太阳 G 型 #fff4ea | ✅ 已实现 |
| G6 | 预设「太阳系（光谱标定）」：G 型太阳 + 行星，验证整条单位换算链 | 配色切光谱后肉眼可辨 | ✅ 已实现 |

单位口径（唯一，勿再改动）：`M☉ = mass/massUnit`，`Myr = time/timeUnit`，`AU = 长度/lengthUnit`，
`c ≈ 6.324×10¹⁰ AU/Myr`，`R☉ = 0.00465 AU`，1 M☉ 史瓦西半径 = 1.974×10⁻⁸ AU。

---

## 1. 使用协议（与 PROMPTS.md 一致，基线更新）

### 1.1 完成定义（每条功能交付必须全部满足）

| # | 检查项 | 命令 / 动作 |
| --- | --- | --- |
| 1 | 类型检查零错误 | `npx tsc --noEmit` |
| 2 | 单元测试全绿且**只增不减** | `npm test`（当前基线 **103 项**） |
| 3 | 生产构建成功 | `npm run build` |
| 4 | 浏览器端到端验证 | `tools/verify-<feature>.mjs`（Playwright，`channel: 'msedge'`），零 console error / pageerror |
| 5 | 文档同步 | README「恒星演化」章节 + 快捷键表格（若新增按键）+ 本文件条目状态 |
| 6 | 变更报告 | 改动文件清单、新增测试数、e2e 结论、已知限制、需人工确认的点 |

> 禁止为迁就新代码删改既有测试。G 组既有断言若与本轮新语义（如巨星相插入演化路径）冲突，
> 先在变更报告中说明口径变化，再改断言并补覆盖新旧两条路径的测试。

### 1.2 变更报告模板

```text
改动文件：
  - src/... （做了什么）
  - tests/... （新增 N 项）
验证：tsc ✓ / npm test 103+N ✓ / build ✓ / e2e ✓（零报错）
快捷键：新增 X 项 / 无
已知限制：...
```

---

## 2. 通用上下文（每条提示词之前都要粘贴）

```text
项目：nbody-studio（E:\hd system\nbody-studio），浏览器内 N 体引力模拟器。
TypeScript + Vite + WebGL2 + Web Worker，零运行时 npm 依赖（仅 devDependencies：
vite / typescript / vitest），物理在 Worker，主线程只渲染与交互。

力学架构（与 PROMPTS.md 相同）：
- src/core/bodies.ts：SoA 天体（mass/grav/x/y/z/vx/vy/vz/ax/ay/az/radius）
- src/core/world.ts：step() = 清加速度 → 求力 → 积分 → 碰撞 → 快照
- src/core/forces/：direct / barnes-hut / particle-mesh / treepm，solver.ts 调度
- src/core/integrator.ts：verlet / rk4 / yoshida4
- src/worker/：physics.worker.ts + protocol.ts + client.ts（背压）
- src/render/、src/ui/：controls.ts 面板 / app.ts 编排 / hud.ts / shortcuts.ts 三层快捷键
- src/core/config/：validate.ts 严格校验 + 默认值补齐

恒星架构（G 组已实现，本轮全部基于这些符号扩展）：
- src/core/stellar.ts：
  - StarType = 'auto'|'planet'|OBAFGKM|'whiteDwarf'|'neutronStar'|'blackHole'（定义在 types.ts）
  - SPECTRAL_TABLE：光谱型质量带（升序，上界=下一档下界）；spectralClass(massPhys) 严格表查
  - mainSequenceLifespan(M)：t_MS = 10000·M^-2.5 Myr；neverEvolves(M)：M<0.8 永驻主序
  - advanceEvolution(...)：返回 EvolutionEvent[]，状态机推进的唯一入口
  - remnantMass(type, massUnit)；STELLAR_COLORS：11 类渲染色唯一真源（palette.ts 转换）
  - isExplicitStar / resolveStarType / evolves / physMass / physTime
- src/core/stellar-state.ts：applyStarConfig（世界重建时初始化恒星状态）、
  starAge(b,i,worldTimeMyr)、refreshStarAfterMassChange（质量变化后重推导光谱型）
- types.ts：StellarConfig { massUnit, timeUnit, lengthUnit, kickRadius, kickGain, accretion }；
  StarConfig { type?, age? }；StellarEvent { t, bodyId, text, remnant? }（Worker→主线程）
- 演化规则现状：auto 体 0.8–8 M☉ 主序耗尽→白矮星；8–20 → II 型超新星→中子星；
  ≥20 → 黑洞；显式 star.type 不推导不演化；行星不参与演化

硬性要求（每条提示词都必须遵守）：
1. 不引入任何运行时 npm 包。
2. tsc 零错误、npm test 只增不减、build 成功、e2e 零报错。
3. 涉及演化/质量转移的功能必须有质量与动量账目类单元测试（总质量含抛失/吸积账目守恒）。
4. 新 UI 文案接入现有双语机制；新快捷键走 shortcuts.ts 注册与冲突检测。
5. Worker 新消息在 protocol.ts 定义类型；事件一律走 StellarEvent 通道，不新开旁路。
6. 显式 star.type「不推导、不演化」的语义是本轮不可破坏的红线（允许刻意的非物理组合）。
```

---

## 3. H 组 · 恒星类型扩展

> ✅ **v2.6 已全部实现（2026-11-26）**：H1 褐矮星 / H2 巨星相 / H3 WR 相交付，
> 基线 103 → 114 项测试全绿，tsc/build 零错误，`tools/verify-stellar-h.mjs` e2e 零报错。
> 口径变化：advanceEvolution 新增相位参数（phase，默认 'ms'）；auto 推导不再产生 M 型；
> 星风流失改为每步连续应用（批量间隔仅用于事件聚合）。

### H1. 褐矮星（brownDwarf）✅

```text
【目标】补上行星与 M 矮星之间缺失的一类：褐矮星 0.013–0.45 M☉，氘燃烧下界之下不点火。

【需求】
1. StarType 新增 'brownDwarf'（配置层可显式指定，auto 推导得到）。先读 SPECTRAL_TABLE 与
   planet 的现行质量带，把 [行星上界, 0.45) 区间划给 brownDwarf；边界归属与现行表规则一致
   （上界含于下一档）。
2. 性质：永驻（neverEvolves 语义扩展：褐矮星不参与状态机）；不发光——STELLAR_COLORS 给
   暗红棕色 #9b6a5a，渲染 size 取 M 矮星的 0.8 倍；grav 照常参与引力。
3. stellarLabel 中文名「褐矮星」；README 光谱表插入一行；预设「太阳系（光谱标定）」追加
   一颗 0.05 M☉ 褐矮星作为演示。
4. spectralClass 单测补三条边界：0.013、0.45 的归属；显式 'brownDwarf' 的 0.1 M☉ 合法。

【验收】
- SPECTRAL_TABLE 全区间覆盖无空洞无重叠（表遍历断言）；
- 褐矮星在任意时长模拟中类型不变、不产生 StellarEvent；
- 显式指定行星质量设为 'brownDwarf' 依然成立（红线：显式不推导）。
```

### H2. 巨星相（红巨星 / 红超巨星）

```text
【目标】主序耗尽不再直接变遗骸：先经巨星相，还原「红巨星膨胀→坍缩/爆発」的可见过程。

【需求】
1. 运行时新增类型 'giant' 与 'supergiant'（仅状态机内部，配置层 StarType 不加这两个字符串，
   校验层拒收）。STELLAR_COLORS 增补：giant #ff9a6f、supergiant #ff8f5f。
2. 演化路径改写（advanceEvolution）：
   - 0.8–8 M☉：主序耗尽 → giant（时长 0.1×t_MS）→ 白矮星（remnantMass 规则不变）；
   - 8–20 M☉：主序耗尽 → supergiant（0.05×t_MS）→ II 型超新星 → 中子星；
   - ≥20 M☉：主序耗尽 → supergiant（0.05×t_MS）→ H3 的 WR 相 → 超新星 → 黑洞。
3. 渲染：giant 点大小 = 主序 ×6，supergiant ×14（size 写进快照 scalar 通道，palette 侧
   按类型取倍率）；事件文案如「主序耗尽 → 红巨星」「红超巨星坍缩 → II 型超新星」。
4. 显式 star.type 恒星照旧完全不演化（红线）；永驻矮星路径不变。
5. 既有 G 组断言若只测「主序→遗骸」终点，补中间相断言，不删原断言语义。

【验收】
- 单测：2 M☉ 体运行超过 1.1×t_MS 后为白矮星，且事件序列恰含「红巨星」一条；
- 10 M☉ 体事件序列 = 主序 → 红超巨星 → II 型超新星 → 中子星，顺序与时间戳单调；
- M<0.8 的体运行 10×t_MS(1) 无任何事件（永驻回归）。
```

### H3. 沃尔夫-拉叶相（wolfRayet）

```text
【目标】≥20 M☉ 恒星在超新星前经历剥离包层的 WR 相，并伴随剧烈质量流失。

【需求】
1. 运行时新增 'wolfRayet'（同样仅状态机内部），颜色 #7a9cff，点大小 ×3。
2. 进入 WR 相时启动质量流失：dM/dt = 0.4·M Myr⁻¹（指数衰减），WR 寿命 = 0.05×t_MS；
   相结束时走超新星→黑洞分支，黑洞质量仍按 remnantMass 取 3 M☉（流失不改变遗骸锚点）。
   质量变化必须经 refreshStarAfterMassChange 重推导并同步 SoA mass/grav。
3. 每次流失累积写入一条 StellarEvent（text 含「星风流失 ΔM=…M☉」，聚合每 10 Myr 一条，
   避免事件风暴）；流失期间动量不变（质量缩放不改速度）。
4. README 演化规则补 WR 分支图示。

【验收】
- 单测：25 M☉ 体在 WR 相结束时质量约为进入时的 89%（指数衰减断言，容差 ±1%）；
- 整条演化事件序列：主序 → 红超巨星 → 沃尔夫-拉叶 → 超新星 → 黑洞；
- 流失前后系统总动量变化 < 1e-12。
```

---

## 4. I 组 · 寿命呈现

> ✅ **v2.7 已全部实现（2026-11-26）**：I1 信息卡 / I2 演化日志 / I3 HUD 物理时钟交付，
> 基线 114 → 116 项测试全绿，tsc/build 零错误，`tools/verify-stellar-i.mjs` e2e 零报错
> （HUD 显示 `X.XX Myr · N/s`；超新星后信息卡切到「中子星 1.40 M☉ · 遗骸」；日志 50 行倒序 + 复制按钮）。
> 实现口径：I1 采用提示词 fallback——「最近演化天体卡」，数据由 StellarEvent 新增 `star` 快照字段
> 携带（零额外 Worker 通信）；Shift+E 开关「分析诊断与性能」分区。

### I1. 恒星信息卡（年龄/寿命进度）✅

```text
【目标】选中恒星时直观看到「它多老、还能活多久、现在处于哪个阶段」。

【需求】
1. 复用/扩展拾取信息卡（若无拾取功能，则做 HUD 常驻「最近事件天体」卡片，不新做完整拾取）。
   恒星行显示：光谱型徽标（STELLAR_COLORS 色点 + starLabel）、物理质量 physMass(M☉)、
   starAge 换算的物理年龄 Myr、该型 t_MS、相位（主序/红巨星/红超巨星/沃尔夫-拉叶/遗骸）。
2. 进度条：age/t_MS（巨星相换成巨星内剩余时间）；遗骸显示「死亡于 X Myr」。
3. 数值每帧从最新快照计算，不开新 Worker 通道；无恒星（全行星）时整卡隐藏。

【验收】
- e2e：太阳系预设选中太阳显示 G 型 / 1.0 M☉ / 进度条；快进触发超新星后卡片切到
  「遗骸 · 死亡于 ≈ X Myr」；数值与单测口径一致（Myr 保留 3 位有效数字）。
```

### I2. 演化事件日志面板

```text
【目标】把 StellarEvent 通道的数据变成可回看的时间线。

【需求】
1. 面板新增「演化日志」折叠区：倒序列表最近 50 条事件，行格式
   `t=X Myr · #<bodyId> · <text>`，remnant 非空时行首加 STELLAR_COLORS 色点。
2. 世界重建时清空；面板可一键复制全部（浏览器 clipboard API）。
3. 快捷键 Shift+E 开关面板（注册前在 help 数据查冲突，被占用则换空闲键并声明）。
4. 事件存储上限 200 条环形缓冲（主线程侧），防止长跑内存增长。

【验收】
- e2e：快进至超新星触发，日志出现且倒序正确、色点颜色正确；
- 连续 1000 条事件内存不增长（环形缓冲断言，纯函数单测）。
```

### I3. HUD 物理时钟

```text
【目标】HUD 同步显示模拟时间与物理时间，建立「一帧 = 多少万年」的直观感。

【需求】
1. HUD 时间区显示两行：`sim t = 12345.6` 与 `= 12345.6 Myr`（physTime 换算；timeUnit=1 时
   两行相同则合并一行）；另显示演化速率 `1 s ≈ X Myr`（由当前 speed×dt×fps 估计）。
2. 不新增 Worker 消息，复用快照携带的世界时间。

【验收】
- 改 timeUnit=0.001 后 HUD 的 Myr 行正确 ×1000（e2e 断言文本）；
- 暂停时速率行显示 0。
```

---

## 5. J 组 · 恒星交互物理

> ✅ **v2.8 已全部实现（2026-11-26）**：J1 星风 / J3 冲击波汽化 / J4 潮汐瓦解 / J2 质量转移交付，
> 基线 116 → 125 项测试全绿，tsc/build 零错误，`tools/verify-stellar-j.mjs` e2e 零报错
> （wind 配置在浏览器跑通恒星全路径：红超巨星 → WR 星风 20.0→18.0 M☉ → 超新星 → 黑洞）。
> 实现口径：J1 星风流失连续应用（1e-4·M Myr⁻¹，仅主序 >8 M☉）；J2 事件聚合 1 Myr；
> J3/J4 移除走 mass=0 + 既有 compactIfNeeded 阈值（与 G4 吸积同机制）；开关走 `stellar` JSON 节
> （wind/transfer/tidalFactor），与 accretion 同层，未加 GUI 控件。

### J1. 星风质量流失（stellar.wind）✅

```text
【目标】大质量主序星持续丢质量，轨道与光谱型随之缓慢演化。

【需求】
1. StellarConfig 新增 wind: boolean（默认 false），validate 补默认值。
2. 规则：M > 8 M☉ 且处于主序的 auto 体，dM/dt = 10⁻⁴·M Myr⁻¹；每 10 Myr 应用一次批量
   更新（ SoA mass/grav 同步 + refreshStarAfterMassChange，质量跨越光谱带界即换型），
   并按 I2 同款聚合写 StellarEvent。
3. 遗骸化锚点（remnantMass）按「耗尽时刻质量」计算，不由初始质量决定——文档说明此口径。
4. 质量降到 8 M☉ 以下星风自动停止（规则只对主序 >8 成立）。

【验收】
- 单测：20 M☉ 孤立体运行 1000 Myr 质量降幅 ≈ 9.5%（e^-0.1，容差 ±3%）；
- 总动量变化 < 1e-12；跨带换型产生一条 StellarEvent；
- wind=false 回归：与现行为逐位一致（既有测试不改即过）。
```

### J2. 双星质量转移（stellar.transfer）

```text
【目标】近距离双星主星向伴星转移质量（洛希瓣溢出的简化模型）。

【需求】
1. StellarConfig 新增 transfer: boolean（默认 false）。
2. 触发条件（每 10 Myr 检查一次，只对两颗演化恒星）：间距 d < 3×(r1+r2) 且 M_donor > 1.2×
   M_accretor；速率 dM/dt = 0.05·M_donor Myr⁻¹；分配：80% 落到 accretor，20% 抛失出系统
   （抛失质量立即移除，StellarEvent 记「抛失 ΔM」）。
3. 动量简化：转移质量携带系统质心速度（即转移不产生净推力），抛失质量带走其原位置
   质心速度——两条都写进 README「简化模型说明」。
4. donor 光谱型随质量下降实时重推导（refreshStarAfterMassChange）；accretor 增质后若
   跨 8 M☉ 界，进入正常演化（含超新星）。
5. 质量账目：主线程维护 cumulativeAccount（转移量+抛失量+吸积量），单测核对。

【验收】
- 单测：5 M☉ + 3 M☉ 近距双星运行至 donor 降到 4 M☉：总账目（两体现质量+抛失量）与初始
  总质量误差 < 1e-9；事件序列含转移与抛失记录；
- transfer=false 回归零影响。
```

### J3. 超新星冲击波汽化

```text
【目标】超新星不只是冲量：kickRadius 内的小天体被直接「汽化」。

【需求】
1. 超新星触发时（现有分支），对 kickRadius 半径内每个体判定：planet / brownDwarf /
   whiteDwarf → 移除并记 StellarEvent（text「被冲击波汽化」，remnant 字段填 'shockwave'）；
   恒星只吃现有径向冲量（kickGain 规则不变）。
2. 汽化体若正处于逐条编辑器列表/选中状态，UI 侧同步清理选中。
3. README 演化规则补一句；这条行为独立于 wind/transfer 开关，始终生效（kickRadius=0 仍
   表示关闭全部冲量与汽化）。

【验收】
- 单测：构造超新星 + 半径内 1 行星 1 恒星：行星移除、事件出现、恒星保留且有速度增量；
- 半径外天体完全不受影响（位置速度逐位对比）。
```

### J4. 黑洞潮汐瓦解吸积

```text
【目标】把 accretion 从开关升级为完整机制：潮汐瓦解半径 + 质量增长 + 吸积盘反馈。

【需求】
1. StellarConfig 新增 tidalFactor: number（默认 100，范围 [0,1e6]，validate 校验）；
   潮汐瓦解半径 r_td = tidalFactor × r_s（r_s 按黑洞当前质量实时算）。
2. accretion=true 时：planet / brownDwarf / whiteDwarf 进入 r_td → 移除，质量并入黑洞
   （mass/grav 同步，r_s 增大），StellarEvent text「潮汐瓦解 · 并入 ΔM=…M☉」；
   恒星进入 r_td → 不瞬时吸积，改为每 1 Myr 剥离 1% 质量（持续吸积，直到耗尽或移出）。
3. 渲染：吸积事件触发吸积盘光环亮度脉冲（renderer 侧复用现有黑洞亮环素材加 flash 通道）。
4. 质量账目并入 I2/J2 的 cumulativeAccount。

【验收】
- 单测：1 M☉ 黑洞 tidalFactor=100 时 r_td 数值正确（按标定常链换算断言）；
- 行星落入：黑洞质量增量 = 行星质量（1e-12 级账目）；恒星持续剥离速率正确；
- accretion=false 回归零影响。
```

---

## 6. 版本切分与依赖

| 版本 | 内容 | 依赖 |
| --- | --- | --- |
| v2.6 | H1 褐矮星 → H2 巨星相 → H3 WR 相（顺序做，H2 改写演化路径） | 无 |
| v2.7 | I1 信息卡 → I3 物理时钟 → I2 事件日志（日志依赖 H 组事件变多后才有价值） | I2 依赖 H 组 |
| v2.8 | J1 星风 → J3 汽化 → J4 潮汐瓦解 → J2 质量转移（J2 最复杂，放最后） | J1/J2 依赖 refreshStarAfterMassChange 既有口径；J3/J4 依赖 I2 的日志展示 |

集成回归（每版本收尾必跑）：太阳系（光谱标定）预设 + 双星预设 + figure-8 预设全部重放，
恒星预设开 wind+transfer+accretion 快进至全部遗骸化，零报错、账目闭合。

---

## 7. 附录：常用验收命令速查

```bash
cd nbody-studio
npx tsc --noEmit        # 类型检查
npm test                # 单元测试（基线 103，只增不减）
npm run build           # 生产构建
npm run dev             # 开发服务器（e2e 前置，http://localhost:5173）
node tools/verify-<feature>.mjs   # 浏览器端到端（Edge headless）
```
