# N-Body Studio v2 · 2D/3D 多星引力模拟 + 完整 JSON 配置

浏览器内运行的 N 体引力模拟器。**TypeScript + Vite + WebGL2 + Web Worker**，零运行时依赖。
物理计算在 Worker 中完成，主线程只负责渲染与交互。

v2 新增：**2D/3D 切换**、**每个天体的 x/y/z、vx/vy/vz、质量、引力参数（μ/G）、碰撞半径完整可配**、
**完整模拟设置的 JSON 导入导出（含 gzip 与流式解析）**。

![3D 默认场景](shots2/01-3d-default.png)

---

## 发行与安装包

### GitHub 仓库

- 地址：`https://github.com/Zhuangzhouu/nbody-studio`（Public，可直接下载）
- 克隆：`git clone https://github.com/Zhuangzhouu/nbody-studio.git`

### Windows 桌面版（.exe）

预构建安装包在 GitHub Releases：

| 文件 | 说明 |
|---|---|
| `NBodyStudio-2.8.0-setup.exe`（73 MB） | NSIS 安装版，可选安装目录、创建桌面/开始菜单快捷方式 |

> **首次运行提示**：安装包未做代码签名，Windows SmartScreen 可能显示「未知发布者」。
> 在提示框点「更多信息」→「仍要运行」即可。绿色版同理。
| `NBodyStudio-2.8.0-win-x64-portable.zip`（103 MB） | 便携绿色版，解压即用、无需安装 |

本地重建：

```bash
npm install
npm run dist:win
```

产物位于 `release/`。主进程代码在 `electron/main.cjs`，渲染进程直接加载 Vite 构建产物。

### Android 版（.apk）

Capacitor 5 原生工程已生成在 `android/`。本环境无 JDK / Android SDK，
请在装有 Android Studio 的机器上按 [`docs/APK-BUILD.md`](docs/APK-BUILD.md) 构建：

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`

### 宣传片

`showcase/nbody-studio-promo.mp4`（H.264，约 70 秒，11 MB）可直接发群；
`showcase/index.html` 为可交互版本。详见 [`showcase/README.md`](showcase/README.md)。

---

## 快速开始

```bash
cd nbody-studio
npm install
npm run dev          # http://localhost:5173
```

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 类型检查 + 生产构建 |
| `npm test` | 139 项单元测试（含恒星演化 H/I/J 全路径、3D 物理、JSON、快捷键解析） |
| `npm run bench` | 2D 规模基准 |
| `npm run bench3` | 3D 规模基准 |
| `node tools/verify2.mjs` / `verify3.mjs` / `verify-editor.mjs` / `verify-shortcuts.mjs` / `verify-stellar.mjs` | 真实浏览器端到端验证（需先 `npm run dev`） |

---

## JSON 配置（v2 核心）

配置结构 `nbody-studio/v2`，完整示例：

```json
{
  "schema": "nbody-studio/v2",
  "version": 2,
  "dimensions": 3,
  "physics": {
    "G": 1, "dt": 0.02, "softening": 0.6, "theta": 0.6,
    "integrator": "verlet", "collision": "none",
    "restitution": 0.7, "bodyRadius": 0.08,
    "engine": "auto", "sampling": "auto",
    "maxSimulated": 2000000, "pmGrid": 0
  },
  "init": {
    "count": 2, "distribution": "disc", "radius": 32,
    "massMin": 0.6, "massMax": 1.8, "totalMass": 2000,
    "normalizeMass": true, "spin": 1, "jitter": 0.02,
    "thickness": 0.08, "seed": 20261125
  },
  "view": {
    "trails": true, "trailLength": 1, "trailBodies": 400,
    "trailPoints": 48, "maxRenderPoints": 250000,
    "colorMode": "speed", "pointSize": 2.6,
    "glow": true, "showGrid": true
  },
  "run": { "playing": true, "speed": 1 },
  "bodies": [
    { "id": 0, "x": -1, "y": 0, "z": 0, "vx": 0, "vy": -0.5, "vz": 0, "mass": 1 },
    { "id": 1, "x": 1, "y": 0, "z": 0, "vx": 0, "vy": 0.5, "vz": 0, "mass": 1, "grav": 2 }
  ]
}
```

关键语义：

- `bodies` 存在且非空时**完全替代生成器**：每一颗星的全部字段都来自配置，不做质量归一、不做随机化。
- `grav` 是**引力质量（μ/G）**，可与惯性质量 `mass` 不同（上例第二颗星质量为 1，引力质量为 2）。省略时等于 `mass`。
- `radius` 是显式碰撞半径；省略时由 `mass` 与 `physics.bodyRadius` 换算。
- `2D` 模式下 `z/vz` 会被强制归零；`3D` 下完整参与引力、积分与渲染。
- 省略的字段自动回退到默认值；非法字段给出精确路径（如 `bodies[3].vy 必须是有限数字`）。

**界面操作**：左侧最下方「JSON 配置 / 导入导出」分区：
- 「填入参数模板」给出可直接编辑的双体示例；
- 「从文本应用」校验并重建模拟；
- 文件输入支持 `.json` 与 `.json.gz`；
- 「导出完整 JSON / gzip」导出**当前运行时**逐体状态（包括当前位置与速度，可作为新的初始条件）；
- 「仅参数」导出不含 bodies 的模板。

超大配置的 bodies 数组使用**流式解析**：逐对象回调、不构造完整的临时对象数组后再处理，
因此导入内存占用不随天体数线性增长。gzip 使用浏览器原生 `CompressionStream` / `DecompressionStream`，
无第三方依赖。

---

## 快捷键（57 项）

顶栏「⌘ 快捷键」按钮或 `?` / `F1` 打开完整帮助面板，按 6 组列出全部动作。`Esc` 关闭帮助或取消编辑。
输入框聚焦时单键快捷键自动让位（例如在数量框里打 `?` 不会弹帮助），`Ctrl / ⌘` 组合键始终可用。

| 分组 | 代表按键 |
| --- | --- |
| 模拟控制 | `Space` 播放/暂停 · `R` 重置 · `→` 单步 · `Shift+→` 快进 10 步 · `+/-` 调速 · `0` 恢复 1× · `Ctrl+Enter` 应用 |
| 相机 | `F` 自适应 · `Shift+F` 复位旋转 · `WASD` 平移 · `Q/E` 旋转 · `Z/C` 俯仰 · `[ / ]` 缩放 · `1/2/3` 视角预设 · `Home` 全景 |
| 显示 | `H` 辉光 · `G` 网格 · `T` 轨迹 · `V` 配色 · `N` HUD · `B` 逐条编辑器 · `J` JSON 配置 · `Shift+E` 演化日志 |
| 物理 | `U` 2D/3D · `Y` 引擎 · `I` 积分器 · `M` 碰撞 · `O` 采样 · `,` / `.` 调整 θ |
| 配置与编辑 | `Ctrl+S` 完整 JSON · `Ctrl+Shift+S` gzip · `Ctrl+Alt+S` 仅参数 · `Ctrl+O` 导入 · `Ctrl+K` 数量框 · `Ctrl+B` 逐条编辑器 · `Ctrl+L` 载入逐体数据 |
| 帮助 | `?` / `F1` 帮助 · `Esc` 关闭 |

实现分为三层：`shortcut-keys.ts`（组合键解析/匹配/焦点判定，纯函数可单测）、
`shortcuts.ts`（集中注册、派发、冲突检测、帮助数据）、`help.ts`（帮助面板）。
所有快捷键在 `app.ts` 一处注册；面板侧提供同步方法，保证快捷键修改后控件状态不脱节。

![快捷键帮助](shots4/01-help.png)

---

## 多人使用与安全防护

### 能多人使用吗？

**当前架构：可以多人同时访问，但各自独立运行，不共享状态。**

| 场景 | 支持 | 说明 |
|---|---|---|
| 多人各自打开网址做模拟 | ✓ | 纯静态前端，每个浏览器独立跑 Web Worker，互不干扰 |
| 分享配置给他人 | ✓ | 通过 URL 分享链接（gzip + base64 编码在 hash 里） |
| 多人实时协作同一星系 | ✗ | 无后端、无 WebSocket，没有共享状态 |
| 服务端统一算力 | ✗ | 算力全在本地浏览器，取决于各自的机器 |

部署方式：把 `dist/` 目录放到任意静态托管（GitHub Pages、Nginx、对象存储）即可，
**无需服务器程序、无需数据库**。多人访问只是下载同一份静态文件。

若需要实时协作或服务端算力，需另加后端（WebSocket 房间 + 状态同步），属于独立工程。

### 防 DDoS / 客户端资源防护

本项目**无后端、无 API、无 WebSocket**，所以不存在攻击者打垮服务器的传统 DDoS 面。
真实风险是「恶意配置让客户端自己卡死」，已实现三道闸（`src/ui/guard.ts`）：

1. **输入体积**：分享链接 hash ≤16K 字符、配置文本 ≤12MB、导入文件 ≤24MB；
2. **调用频率**：重建间隔 ≥250ms，防止连续点击/脚本高频触发堆积 Worker 任务；
3. **计算超时**：Worker 30 秒无响应给出提示，建议降低规模或增大软化；
4. **内存硬闸**：`resolveStrategy` 强制 512MB 预算（约 416 万体），
   即使 `sampling:'never'` 也拒绝分配超限数组（见上一节）。

部署到公网时，**托管平台层面**的防护（CDN 限流、WAF、带宽封顶）由平台提供，
静态站点本身无需额外代码。

---

## 性能优化（v2.9）

| 优化项 | 效果 |
|---|---|
| 直接求和预热 `gravMass`/`gravRatio` 到局部数组 | 1000 体 6.2→3.0 ms/步（2.0×）；2000 体 26.9→11.8 ms/步（2.3×） |
| FFT 预计算位反转置换对 | PM 1 万体 20.5→7.6 ms/步（2.7×）；5 万体 11.0 ms/步 |
| 多极祖先检查改为 O(1) 标记数组 | 多极 5000 体 215→183 ms/步（15%） |

基准命令：`npx tsx tools/bench-solver.ts`（固定引擎，排除自动采样干扰）。
物理口径未变，131 项测试全绿。

---

## 自适应四极多极引擎

新增可选引擎 `multipole`（引擎下拉里的「自适应四极多极」）：

- **为什么不用均匀网格（桶排）**：网格间距固定，天体分布跨多个数量级时，
  要么格数爆炸、要么近场分辨率不足。多极引擎用**自适应八叉树按密度细分**，
  开角判据 `块尺寸/距离 < θ` 是**尺度无关的**，天然覆盖大动态范围。
- **比 Barnes-Hut 更准（但更慢）**：BH 只保留单极（质心+质量），误差 O(s/d)；
  多极额外保留四极矩张量 Q，误差 O((s/d)³)。远场测试中多极与直接求和精确到
  10 位有效数字，而单极有 0.02% 偏差。代价更严的开角判据使遍历节点增加，
  实测约比 BH 慢 3 倍——这是精度换速度的明确权衡。
- **精度控制**：`physics.theta` 减小可提高精度；实测 θ=0.6 折半判据下误差 <2%。
- **适用**：对精度敏感的中等规模引力场（≤1 万体），尤其是分布不均匀的星系/星团。
  追求速度用 BH；更大规模用 PM / TreePM。

实现：`src/core/forces/multipole.ts`，二阶矩按平行轴定理增量维护，
排除自身祖先节点避免自作用，四极展开在近距自动退化。

---

## 恒星演化（G 组）

### 单位换算链（唯一口径）

| 量 | 公式 | 默认值 |
|---|---|---|
| 物理质量 | M☉ = mass / massUnit | massUnit = 1 |
| 物理时间 | Myr = world.time / timeUnit | timeUnit = 1 |
| 物理长度 | AU = 模拟长度 / lengthUnit | lengthUnit = 1 |
| 光速 | c = 6.324×10¹⁰ AU/Myr | 由 299792.458 km/s × 3.15576e13 s/Myr ÷ 1.496e8 km/AU |
| 太阳半径 | R☉ = 0.00465 AU | 695700 km ÷ 1.496e8 km/AU |
| 史瓦西半径 | r_s = 2GM/c²，1 M☉ → 2953 m = 1.974e-8 AU | G_AU 由此反标定 |

**主序寿命** t_MS = 10000·M^-2.5 Myr：M=1 → 10000 Myr；M=20 → 5.59 Myr；M=0.3 → 2.03e5 Myr。
（提示词原文中的 56.6/3.4e6 是笔误，实现以指定公式为准，已在变更报告说明。）

### 光谱型—质量—颜色—寿命

| 型 | 质量 M☉ | 色 | 色值 | t_MS |
|---|---|---|---|---|
| O | ≥16 | 蓝 | #9bb0ff | ≤12 Myr |
| B | 2.1–16 | 蓝白 | #aabfff | 12–800 Myr |
| A | 1.4–2.1 | 白 | #cad7ff | 0.8–2.6 Gyr |
| F | 1.04–1.4 | 黄白 | #f8f7ff | 2.6–5.7 Gyr |
| G | 0.8–1.04 | 黄 | #fff4ea | 5.7–10 Gyr |
| K | 0.45–0.8 | 橙 | #ffd2a1 | 永驻 |
| 褐矮星（H1） | 0.013–0.45 | 暗红棕 | #9b6a5a | 永驻（不点火） |
| 行星（auto） | <0.013 | 灰 | #8a8f98 | — |

> H1：auto 推导不再产生 M 型（0.013–0.45 归褐矮星，<0.013 归行星）；M 仍可显式指定。

演化相位（H2/H3，仅运行时，不进配置层）：红巨星 #ff9a6f、红超巨星 #ff8f5f、沃尔夫-拉叶 #7a9cff。
遗骸：白矮星 #cfe0ff、中子星 #ccddff、黑洞黑核亮环 #ffaa33、行星 #8a8f98。

### 演化规则

`auto` 体按质量推导光谱型并进状态机；显式 `star.type` 不推导、不演化（允许 0.1 M☉ 黑洞等刻意的非物理组合）。
主序耗尽先经**巨星相**（H2）：0.8–8 M☉ → 红巨星（0.1×t_MS）→ 白矮星（遗骸质量 min(0.6M,1.4)）；
8–20 M☉ → 红超巨星（0.05×t_MS）→ II 型超新星 → 中子星（1.4 M☉）；
≥20 M☉ → 红超巨星 → **沃尔夫-拉叶相**（0.05×t_MS，星风流失 dM/dt=0.4·M Myr⁻¹，H3）→ 超新星 → 黑洞（3 M☉）。
光谱配色下相位体点大小 ×6/×14/×3，褐矮星 ×0.8。M<0.8（含褐矮星）永驻主序。并合时黑洞可开启吸积（`stellar.accretion`）。

### 恒星交互（J 组，`stellar` 配置节）

| 开关 | 语义 |
| --- | --- |
| `wind: true` | J1：M > 8 M☉ 主序星持续星风流失 dM/dt = 1e-4·M Myr⁻¹；遗骸锚点按**耗尽时刻质量** |
| `transfer: true` | J2：近距双星洛希瓣溢出（间距 < 3×(r1+r2) 且 M_donor > 1.2×M_acc），速率 0.05·M_d Myr⁻¹，80% 落到伴星 / 20% 抛失出系统 |
| `tidalFactor > 0` + `accretion` | J4：黑洞潮汐瓦解半径 r_td = tidalFactor × r_s；行星/褐矮星/白矮星进入即整体并入（动量加权），恒星持续剥离（1%/Myr） |
| 超新星（恒开） | J3：kickRadius > 0 时，半径内的行星/褐矮星/白矮星被冲击波直接汽化（事件「被冲击波汽化」） |

**简化模型说明**（J 组）：星风/剥离不改速度（质量缩放不带动量交换）；J2 转移不产生推力、
抛失质量直接离系统（系统动量不严格守恒）；流失/剥离量在事件流中按 ΔM 记账。
已知限制：导出 JSON 时相位退化为 `auto` + age 0（相位不持久化，导入后从零龄主序重新演化）。

### 演示步骤

1. 选「太阳系（光谱标定）」→ 配色切「恒星光谱」，观察 G 型太阳与灰色行星；
2. 选「大质量星团（超新星雨）」→ 加快速度，HUD 事件流按质量从大到小出现「II 型超新星 → BH/NS」；
3. 选「白矮星双星」→ 两颗 0.8 M☉ 星因预置 age 很快变 WD，继续绕转。

![恒星演化演示](shots-all/stellar.png)

**已知限制**：超新星抛射包层不生成粒子（瞬时离开系统），冲量为对称近似；WD/NS 碰撞半径取物理值，
显示半径另设下限以保证可拾取；并合后年龄取质量加权近似。

---

## ★ 1–10 体工作台（主功能分区）

面板顶部的独立分区，把少体精确模拟从通用控件中抽离，一屏完成配置与诊断：

- **数量**：1–10 快捷按钮，一点即生成对应数量的圆轨道系统；
- **经典构型**：单星、双星圆轨道、figure-8 三体、拉格朗日等边三角、恒星+行星、双星+环星；
- **精确模式**：一键切换为「直接求和 + Verlet + 零软化 + 无采样 + 无碰撞 + 轨迹全开」；
- **实时状态表**：逐体显示 id / 距心距离 r / 实时速度 |v| / 惯性质量 m / 引力参数 μ；
- **双体轨道要素**：选中恰好 2 体时显示半长轴 a、偏心率 e、周期 T、|L| 与能量漂移。

实现要点：少体快照额外携带 `[vx,vy,vz]×count`（大规模为 null，不浪费带宽）；
取景对 ≤10 体改用真实包围盒而非分位数包络；渲染对 ≤10 体放大点尺寸与亮度；
上限刻意保持在 10 体，更多天体请用下方的通用分区。

![1–10 体工作台](shots-all/fewbody.png)

---

## v2.1 增强功能一览

本版本把 `PROMPTS.md` 中的 23 条功能全部落地：

| 组 | 功能 | 入口 |
| --- | --- | --- |
| A | 拖放创建（`Ctrl`/右键拖拽弹弓）、点击拾取+悬停卡、跟随镜头 | 画布 / `Delete` / `X` |
| B | 6 个预设场景（figure-8、拉格朗日、恒星行星、双星环星、星系对撞、正负混合）、圆轨道助手 | 「预设场景」/「逐条设置」 |
| C | 能量与角动量曲线、双体轨道要素、质心工具与维里比率、逃逸计数 | 「分析诊断与性能」 |
| D | Yoshida4 四阶辛积分、自适应步长、TreePM 混合引擎、负 grav、Plummer 软化统一 | 「物理与引擎」 |
| E | URL 分享（`Ctrl+Shift+C`）、WEBM 录制、配置撤销重做、性能分段条 | 「分析诊断与性能」/ 快捷键 |
| F | PNG 导出（`Ctrl+P`）、轨迹 CSV、触屏手势、势场热力图（`L`）、视图回放 | 「分析诊断与性能」 |

**物理口径变更（D4）**：`grav` 现在可为 0 / 负数。加速度按 `a_i = (grav_i/m_i)·Σ G·grav_j·r/r³`
计算，使 `F_ij = -F_ji` 在 `grav ≠ mass` 时依然成立（动量守恒）。`grav=0` 的天体不施力也不受力。

**引擎分级（D3）**：`auto` 现在为 direct ≤2048 → BH ≤20000（3D >6000 转 PM）→ PM <20000 → TreePM ≥20000。
TreePM 以网格距 `rSplitGrids` 倍划远近场，近场用 Plummer 短距修正。

![完整功能](shots-all/final.png)

---

## 逐条设置天体数据（GUI）

左侧「**逐条设置天体数据**」分区提供不依赖 JSON 的逐条录入界面：

1. 在表单中填写 `x / y / z / vx / vy / vz / 质量 / 引力参数 / 碰撞半径`，按回车或点「提交新增」；
2. 提交后立刻在「已设置 N 条」列表中显示该条数据（含位置、速度、引力参数与半径）；
3. 列表每条都有「修改 / 删除」：修改会把该条回填到表单，按钮变为「保存修改」，可取消；
4. 「应用到模拟」把当前列表作为逐体配置重建世界；「从模拟载入」可把当前运行中的天体取回列表继续逐条改；
5. 校验与反馈：非数字、空值、质量 ≤ 0、引力参数 ≤ 0、负半径、非法/重复 id 会**定位到具体字段**显示红字，
   状态栏按 信息 / 成功 / 警告 / 错误 四种级别给出明确文案；2D 模式下 `z / vz` 自动置零并禁用。

该编辑器与 JSON 配置互通：导入含 `bodies` 的配置会自动同步到列表；编辑器修改后导出也会带上最新列表。

![逐条编辑与校验](shots3/03-two-rows.png)

---

## 不设人为上限

v2 移除了旧版对碰撞、轨迹与积分规模的强制限制：

| 项目 | 配置 | 行为 |
| --- | --- | --- |
| 引擎 | `physics.engine` | `auto` / `direct` / `barnes-hut` / `particle-mesh`，可强制 |
| 采样 | `physics.sampling` | `auto`（超上限才采样）/ `never`（绝不采样）/ `always` |
| 积分上限 | `physics.maxSimulated` | `0` = 不限；默认 200 万只在 auto 模式生效 |
| PM 网格 | `physics.pmGrid` | `0` = 自动；可设到 512（代价 ∝ 格数³） |
| 积分器 | `physics.integrator` | RK4 可用于**任意引擎与规模**（代价自负） |
| 碰撞 | `physics.collision` | 大 N 也不自动关闭，只提示成本 |
| 轨迹 | `view.trailBodies` / `trailPoints` | 可设为全部天体与任意历史长度 |
| 渲染 | `view.maxRenderPoints` | `0` = 全部绘制 |

`INT_MAX` 输入仍可用：auto 默认采样为 200 万代表粒子，权重按 `N/N_sim` 缩放，
弹窗明确标注这是蒙特卡洛估计；选择 `never` 则真的尝试逐一积分（可能耗尽内存，用户自担）。

---

## 2D / 3D 物理

| 组件 | 2D | 3D |
| --- | --- | --- |
| 直接求和 | 平面距离，O(N²) | 三维距离，O(N²) |
| Barnes-Hut | 四叉树 | 八叉树（各向异性节点，自动扩容） |
| 粒子网格 | 三维网格 + 薄层沉积 | 完整三维 CIC + 三轴 FFT 场 |
| 碰撞 | 圆形 | 球形（体积相加的并合） |
| 积分 | Verlet / RK4 | Verlet / RK4（含 z 分量） |
| 渲染 | 正交相机 | 轨道相机（拖拽旋转、滚轮缩放）+ 透视 |

3D auto 引擎对八叉树代价做了启发式：6000 体以上自动改用 PM；用户可强制选择 BH。

### 操作

- 拖拽：2D 平移 / 3D 旋转（按住 Shift 平移）
- 滚轮：缩放；双击或 `F`：自适应取景
- `Space`：暂停/继续；`→`：单步；`R`：重置

---

## 工程结构

```
src/core/
  bodies.ts             SoA 天体集合（mass/grav/x/y/z/vx/vy/vz/ax/ay/az/radius）
  types.ts              完整数据契约（含 BodyConfig / SimulationConfig）
  params.ts             默认值
  generator.ts          2D/3D 六种初始分布
  integrator.ts         Verlet / RK4（2D/3D 通用）
  collision.ts          sweep-and-prune 球形碰撞
  energy.ts             动能 + 势能（使用 grav）
  scale-policy.ts       用户可控的引擎/采样/渲染/轨迹策略
  config/validate.ts    JSON 严格校验与默认值补齐
  config/serialize.ts   导出、gzip、下载
  config/stream.ts      流式 bodies 解析（含 File 分块）
  forces/               direct / barnes-hut(2D/3D) / particle-mesh(3D) / fft(3D)
  world.ts              编排 + 逐体配置世界 + 5 分量快照
src/render/             WebGL2：投影着色器、点精灵、轨迹、HDR 色调映射
src/worker/             物理 Worker + 背压客户端（含逐体导出协议）
src/ui/                 参数面板（含 JSON 区）、HUD、应用编排
tests/                  125 项测试
tools/                  基准 + 浏览器验证脚本
```

---

## 验证结果

- **139 项单元测试全部通过**（H 组 +11、I 组 +2、J 组 +9）：2D/3D 二体轨道能量与动量守恒、逐体引力参数、2D 四叉树与
  3D 八叉树误差收敛、3D PM 与直接求和整体吻合、gzip/流式/校验、逐体配置驱动 World。
- **浏览器端到端**（Edge headless）：默认 3D → 3D 拖拽旋转 → JSON 模板双体 →
  完整 JSON 导出（逐体字段核对）→ gzip 导出 → 自定义三体 3D → 2D 切换 → INT_MAX 策略 →
  3000 体大文件流式导入 → 非法配置错误提示，控制台零报错。
- **3D 基准**（Node）：1 万体 PM 8.5ms/步，5 万体 12ms，20 万体 25ms，100 万体 185ms。

已知限制：PM 对少数点质量会因频谱截断产生伪力，适用于平滑的大 N 密度场；
3D BH 代价高，auto 模式超过 6000 体转 PM；gzip 依赖浏览器 CompressionStream（现代浏览器均支持）。
