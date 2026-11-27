# N-Body Studio 恒星演化提示词集（G 组 · 第三轮）

6 条提示词**已全部实现**（G1 类型系统 / G2 寿命状态机 / G5 光谱渲染 / G3 超新星 / G4 遗骸 / G6 预设）。
基线 87 → **103 项单元测试**。验收命令见 README「恒星演化」章节。

---

# N-Body Studio 功能开发提示词集（增强版 v2）

23 条自包含的 AI 编程提示词（**全部已实现**，见 README「v2.1 增强功能一览」）。每条可直接复制投喂，内含**目标 / 需求 / 验收**三段，
A~E 组另附**改动文件**；关键前提与陷阱写在条目内并汇总于通用上下文。
无需再回头翻源码猜口径——所有关键函数签名、数据契约、投影与质量口径、既有陷阱都已写明。

**用法（三段式投喂）**：

1. 先粘贴 §2「通用上下文」（一次性，约 3k 字）；
2. 再粘贴要做的那一条提示词；
3. AI 交付后按 §1「完成定义」逐项验收，不符则原地迭代，不要另起会话重来。

**推荐顺序**：A 组（共享拾取/投影代码，一次会话做完）→ B 组（场景库）→ C 组（分析，C1 的 metrics 通道被 C4/E4 复用）→ D 组（物理内核，各自独立）→ E 组（工程）→ F 组（可选增强）。

---

## 1. 使用协议

### 1.1 完成定义（每条功能交付必须全部满足）

| # | 检查项 | 命令 / 动作 |
| --- | --- | --- |
| 1 | 类型检查零错误 | `npx tsc --noEmit` |
| 2 | 单元测试全绿且**只增不减** | `npm test`（当前基线 **68 项**） |
| 3 | 生产构建成功 | `npm run build` |
| 4 | 浏览器端到端验证 | `tools/verify-<feature>.mjs`（Playwright，`channel: 'msedge'`，`args: ['--enable-unsafe-swiftshader']`），零 console error / pageerror |
| 5 | 文档同步 | README 对应章节 + 快捷键表格（若新增按键）+ 本文件条目状态 |
| 6 | 变更报告 | 列出：改动文件清单、新增测试数、e2e 结论、已知限制、如需人工确认的点 |

> 禁止为了迁就新代码删改既有测试。若既有断言与新语义冲突，先在变更报告中说明口径变化，再改断言并补新测试。

### 1.2 变更报告模板（AI 每次交付时在末尾输出）

```text
改动文件：
  - src/... （做了什么）
  - tests/... （新增 N 项）
验证：tsc ✓ / npm test 68+N ✓ / build ✓ / e2e ✓（零报错）
快捷键：新增 X 项 / 无
已知限制：...
```

### 1.3 术语约定

- **μ**：每体引力参数 `grav`，单位与 `mass` 同（G 单独相乘）。`gravMass(i) = grav[i] × weight`。
- **代表粒子**：采样时一个粒子代表 `weight` 颗真实天体；采样只影响引力源强度，不改变逐体位置语义。
- **世界**：`World` 实例，唯一持有 `BodySet`，Worker 内单线程运行。
- **快照**：`Snapshot`，主线程只读；`vertex` 是交错数组 `[x,y,z,scalar,size] × count`（stride 20 字节）。

---

## 2. 通用上下文（每条提示词之前都要粘贴）

```text
项目：nbody-studio（E:\hd system\nbody-studio），浏览器内 2D/3D N 体引力模拟器。
技术栈：TypeScript + Vite + WebGL2 + Web Worker + Vitest + Playwright。
零运行时 npm 依赖；devDependencies 仅 playwright / tsx / typescript / vite / vitest。
脚本：npm run dev（5173）、npm run build（tsc --noEmit && vite build）、
      npm test（vitest run）、npm run bench / bench3（tsx 基准）、npm run preview（4173）。
当前基线：68 项单元测试全绿，生产构建与浏览器 e2e 均通过。

【架构地图】
- src/core/types.ts：全部数据契约。PhysicsParams / InitParams / ViewParams / RunParams /
  BodyConfig / SimulationConfig / Snapshot / Diagnostics。
- src/core/bodies.ts：SoA 天体集合 BodySet。数组 mass/grav/x/y/z/vx/vy/vz/ax/ay/az/radius/
  explicitRadius；标量 n/capacity/dimensions/weight/requested。
  现成方法：gravMass(i)、refreshRadii(k)、syncGravToMass()、bounds(pad)、centerOfMass()、
  zeroMomentum()、centerAtOrigin()、removeDead()、applyPhysics(p)。
- src/core/world.ts：编排。step() 内部 = 积分（Verlet/RK4 内部清加速度并求力）→ stepCount/time 累加
  → 碰撞 → removeDead/compactIfNeeded；快照是独立方法 snapshot()，由 Worker 在 frame 时调用，
  不在 step() 内。主线程通过 client 拿 Snapshot + Diagnostics + Strategy；bodies 存在时完全替代生成器。
- src/core/forces/：direct（O(N²)）/ barnes-hut（2D 四叉树、3D 各向异性八叉树、桶式叶+自动扩容）/
  particle-mesh（3D CIC 沉积 + 三轴 FFT 力场）；solver.ts 按 physics.engine 调度。
- src/core/integrator.ts：velocity Verlet / RK4，2D/3D 通用，每步求力次数分别为 1 / 4。
- src/core/collision.ts：3D 球形碰撞，none / merge / bounce，网格 sweep-and-prune。
- src/core/energy.ts：computeEnergy(b, G, softening, maxBodies=4096)，
  n > maxBodies 返回 null；动能用 mass，势能 U = -Σ_{i<j} G·gravMass_i·gravMass_j / √(r²+ε²)。
- src/core/generator.ts：六种分布（disc/cloud/cluster/collision/grid/binary），3D 用 thickness。
- src/core/scale-policy.ts：resolveStrategy(requested, physics, view) → Strategy
  {engine, simulated, weight, gridSize, renderCount, renderStride, trailsEnabled,
   collisionsEnabled, trailCount, notices, label, ...}。
  engineFor(n)：direct ≤2048、BH ≤20000，其余 PM；auto 模式下 3D 且 n>6000 也转 PM。
  采样上限 SIM_CAP = 2,000,000（simulated = min(requested, maxSimulated>0?maxSimulated:SIM_CAP)，
  weight = requested/simulated）；sampling='never' 时不采样，算力由用户自担。
  engine / sampling / maxSimulated / pmGrid 均可由用户显式覆盖，不设隐藏硬上限。
- src/core/config/：validate.ts（validateConfig(input, maxBodies=Infinity)、parseBodyConfig）、
  serialize.ts（configFromParams、bodiesFromSet(b, limit=Infinity)、configToJSON、parseConfigText、
  gzip、gunzip、downloadBlob）、stream.ts（StreamingConfigParser、parseConfigStreaming、parseConfigFile）。
- src/worker/：protocol.ts 定义 ToWorker = init / advance / physics / view / frame / request-bodies；
  FromWorker = ready / frame / bodies / error。client.ts 做背压：忙时参数排队、空闲帧补发。
- src/render/：camera.ts（2D 正交 + 3D 轨道相机状态）、renderer.ts（点精灵 + 轨迹 + 网格 +
  RGBA16F HDR + 1-exp(-exposure·c) 色调映射）、palette.ts。
- src/ui/：app.ts 总编排（48 项快捷键在此一处注册）、controls.ts 参数面板、body-editor.ts 逐条编辑器、
  hud.ts、shortcut-keys.ts（组合键解析/匹配/焦点保护）、shortcuts.ts（注册/派发/冲突检测/帮助数据）、
  help.ts（帮助 Modal）。
- tests/：vitest，68 项全绿。tools/：bench.ts / bench3.ts / verify*.mjs。

【关键口径（不要再读源码猜，直接用）】
1. 质量分工：mass = 惯性质量（动能、碰撞、并合）；grav = 引力质量 μ/G（引力源强度）。
   求力统一用 BodySet.gravMass(i) = grav[i] × weight。
2. 圆轨道相对速度：v_rel = √(G · (gravMass_1 + gravMass_2) / r)。
   惯系速度 = v_rel + 中心体当前速度；这与 energy.ts 的势能口径一致（势能用 gravMass，不用 mass）。
3. 3D 投影在顶点着色器完成，公式在 renderer.ts 的 PROJECT 常量：
   r = p - target；q = (r.x·cosYaw - r.y·sinYaw, r.x·sinYaw + r.y·cosYaw, r.z)；
   q2 = (q.x, q.y·cosPitch - q.z·sinPitch, q.y·sinPitch + q.z·cosPitch)；
   depth = max(0.1, distance - q2.z)；persp = distance / depth；
   clip.xy = q2.xy · zoom · persp / (resolution·0.5) + offsetX。
   注意：camera.ts 的 screenToWorld / worldToScreen 在 3D 下只是 target+zoom 近似，
   【不等于】上面这套投影。任何屏幕拾取/反投影/跟随都必须新写与 PROJECT 一致的 CPU 版本，
   并放在 camera.ts 中作为唯一真源，禁止在 UI 里各写一份。
4. Snapshot.vertex  stride=5 floats：[x, y, z, scalar, size]；轨迹 [x,y,z] × points × bodies，
   环形缓冲，最新点在 (head-1+points)%points，已填充数 trajectoryFilled。
5. 配置 schema 固定 'nbody-studio/v2'、version: 2；bodies 非空时完全替代生成器，
   不做归一、不随机化、不改字段。

【DOM 与面板分区速查】
- 顶层 id：app / stage(canvas) / panel / panel-body / btn-help / engine-badge / fps-badge /
  hud / hud-n / hud-t / hud-step / hud-energy / hud-drift / hud-merge / toast-host / boot /
  btn-play / ico-play / lbl-play / btn-step / btn-reset / speed / speed-value。
- 动态创建 id：config-file（controls.ts 创建的隐藏 file input）；数量输入 id=count-input。
- 逐条编辑器 DOM id 前缀 be-（字段 be-<key>，如 be-x / be-vz / be-mass；按钮 be-submit /
  be-cancel / be-load / be-apply）。
- controls.ts 的六个分区标题（toggleSection(title) 用它匹配）：
  系统规模 / 初始条件（位置 / 速度） / 物理与引擎 / 显示与轨迹 / 逐条设置天体数据 / JSON 配置 / 导入导出。
  （注意最后一项含空格与斜杠，匹配时用 includes('JSON 配置')。）

【已知陷阱（踩过，禁止重蹈）】
1. 2D 网格算不出正确的三维引力（1/r² 采样混叠）→ PM 必须 3D 网格 + 3D FFT。
2. CIC 沉积的质量要先转成密度（除以 dx³），否则力小几十倍。
3. 采样权重被重复计入会把 INT_MAX 星盘炸飞（速度 8→1412）→ 归一化基准必须先除以 weight。
4. BH 节点池耗尽会退化成大叶节点 → 桶式叶 + 节点池自动扩容；3D 用各向异性 sx/sy/sz。
5. 分布全在 z=0 但标为 3D 时，八分位索引 bit2 越界 → 检测平坦后退化四叉树并 mask (k-1)。
6. PM 对少数点质量存在频谱混叠 → 精度测试必须用平滑分布，禁止用单点探针断言 1/r²。
7. Worker 忙时参数更新会被静默丢弃 → 一律走 client.ts 排队补发，不要在 app 里直接 return。
8. 加法混合会把百万体烧成白饼 → 必须画到 RGBA16F 离屏缓冲再色调映射。
9. 窄屏 flex 滚动区缺 min-height:0 → 底部控制条被挤出面板。
10. HelpOverlay 必须在 shortcuts.register() 之后构造，否则帮助副标题显示「0 项」。
11. BodySet.gravMass() 目前对 grav<=0 回退到 mass（为兼容手工构造的测试体）→
    任何支持负 grav / 零 grav 的功能必须先改这里，并同步 energy/collision 的符号口径。
12. energy.ts 在 n>4096 时返回 null；诊断类功能要显式处理 null（显示「—」），不要当 0。
13. 快捷键单键在输入框/下拉框聚焦时必须让位；Ctrl/⌘ 组合与 Esc 例外。新键必须过冲突检测。
14. integrator.ts 的 stepVerlet() 已经是 Leapfrog KDK（半步踢-漂移-再踢）。
    不要再实现一遍「leapfrog」并声称它比 Verlet 更守恒——两者数学等价；
    真正更高阶的选择是 Yoshida 复合（见 D1）。
15. world.ts 的 step() 不含 snapshot()；快照由 Worker 在 frame 时单独取。
    诊断/录制类功能不要假设 step() 会返回渲染数据。

【硬性要求】
1. 不引入任何运行时 npm 包；浏览器原生 API 除外。
2. tsc 零错误、npm test 全绿（只增不减）、build 成功、e2e 零 console error。
3. 涉及物理的功能必须补守恒类单测（能量 / 动量 / 角动量）。
4. 新快捷键必须在 app.ts 的 registerShortcuts() 注册，自动进帮助数据；给出冲突检测结果。
5. 新 UI 控件加到 controls.ts 对应分区，风格与现有一致；文案中文为主、英文术语保留原样。
6. Worker 新消息必须在 protocol.ts 定义类型，client.ts 处理背压；禁止在 UI 里轮询 Worker 内部状态。
7. 交付末尾按「变更报告模板」输出。
```

---

## 3. A 组 · 交互三件套

> 三条共享「屏幕坐标 ↔ 世界坐标」与「拾取/选中状态」，建议一次会话做完，公共代码放 camera.ts。

### A1. 拖放创建天体（弹弓式）

```text
【目标】在画布上按住拖出速度矢量，松手在该处生成一个以该速度运动的天体。

【改动文件】camera.ts（3D 反投影唯一真源）、app.ts（手势状态机）、worker/protocol.ts + client.ts + physics.worker.ts
（addBodies）、bodies.ts（push 扩容）、body-editor.ts（可选：新体同步到列表）、hud.ts（首次提示）。

【需求】
1. 先在 app.ts 以注释表列出当前手势占用，再确定创建手势。现状：左键拖拽 = 3D 旋转 / 2D 平移；
   Shift+拖拽 = 平移；滚轮 = 缩放；单击(<5px 且 <300ms) 预留给 A2 拾取。
   建议采用「Ctrl+左键拖拽」或「右键拖拽（preventDefault contextmenu）」创建，二选一并说明。
2. 新增 Camera.screenToWorldPlane(sx, sy, width, height)：
   - 2D：直接复用现有 screenToWorld（正交，精确）。
   - 3D：求屏幕射线与「过 target、法向为视线方向」的平面的交点。必须按通用上下文「关键口径」
     第 3 条的 yaw/pitch/persp 公式做逆变换，不能调用现有 3D screenToWorld（那只是近似）。
   - 写成 camera.ts 的公开方法，供 A1/A2/A3 共用；补单测：对已知世界点 project→unproject 往返误差 < 1e-6。
3. 交互：mousedown 记录起点世界坐标 → mousemove 画起点到当前位置的箭头（WebGL 线段 + 箭头头部，
   复用 renderer.ts 的 LINE 程序，颜色用选中高亮色）→ mouseup 生成天体：
   position = 起点，velocity = (终点 - 起点) × dragSensitivity（默认 1，可在显示分区加滑块）。
4. 新天体：mass 取参数面板当前默认质量（init.massMax 或新增 defaultMass），grav = mass；
   radius 按 bodyRadius 换算；按住 Shift 表示静止体（v=0）。2D 强制 z=vz=0。
5. Worker 新增 addBodies(bodies: BodyConfig[])。BodySet 增加 ensureCapacity / pushBody：
   只扩容 SoA 数组并复制旧值，不重建 World、不清空轨迹缓冲；
   requested/simulated/weight 语义保持不变（采样模式下新加入的代表粒子继承当前 weight）。
6. 暂停状态下同样可用：addBodies 后立刻 pushFrame()，快照含新体。
7. HUD/状态栏首次使用时给一次性提示，说明创建手势与 Shift 语义（用 localStorage 记录已提示）。

【验收】
- 播放与暂停两种状态下创建的天体都立即参与引力与渲染（HUD 天体数 +1，快照 vertex 数 +1）。
- 连续创建 1000 个不触发 World 重建：在 window.__nbody.debug() 中增加 rebuildCount 字段，
  e2e 创建前后读该值并断言相等（该调试钩子已存在，直接扩字段即可）。
- 3D 下创建体的投影落点与鼠标松手位置偏差 < 6px（用 camera 往返单测 + e2e 截图比对）。
- addBodies 后轨迹缓冲不串位：给已有体先跑 20 步，再插入新体，前 20 个历史点仍属于原体。
```

### A2. 点击拾取 + 悬停信息卡

```text
【目标】悬停显示天体信息卡，点击选中并高亮，可与逐条编辑器互通。

【改动文件】camera.ts（复用 A1 的投影）、app.ts（拾取/选中/悬停状态）、renderer.ts（选中高亮）、
body-editor.ts（载入该体）、worker/protocol.ts + client.ts + physics.worker.ts（removeBody）、
bodies.ts（swap-remove）、shortcuts.ts（Delete 注册）、styles/main.css。

【需求】
1. 拾取用「屏幕空间最近邻」：把快照 vertex 的前 3 个分量经 Camera 的 CPU 投影（与着色器一致）
   投到屏幕，取与鼠标距离最小者；阈值 = max(8px, pointSize × 1.5)。
   N > 10 万时先按 renderStride 抽样粗筛，再对候选邻域精确比较，保证 < 2ms。
2. 悬停：跟随鼠标的 div，最多 4 行（id / mass / |v| / 位置），延迟 150ms 出现，鼠标离开即隐藏。
   悬停不改变选中状态。
3. 点击选中：renderer.ts 增加 selectedIndex uniform，对该体画描边圈（点精灵外环换色，复用 palette）。
   再次点击空白取消选中。选中状态存在 app.ts，不写回 Worker。
4. 信息卡加「载入编辑器」按钮：把该体 x/y/z/vx/vy/vz/mass/grav/radius/id 回填 body-editor.ts 表单，
   并切到「编辑」态（复用现有修改流程），状态栏提示「已载入第 N 条，可修改后应用」。
5. Worker 新消息 removeBody(indexOrId)：SoA 做 swap-remove（一次性移动全部数组含 explicitRadius），
   并同步：轨迹缓冲中该体的段要删除或整体重排、selectedIndex 失效则清零、跟随目标自动解除。
   注意 BodySet 没有稳定 id 数组（BodyConfig.id 只回显），因此以「当前快照中的索引」为准，
   传给 Worker 的也是索引；文档写明并合后索引会变。
6. Delete 快捷键走 app.ts registerShortcuts()，输入框聚焦时让位；与 A1 的创建手势不冲突
   （单击才算拾取，拖拽不算）。

【验收】
- N=5000 时悬停拾取 < 2ms（在 app.ts 埋 performance.now 计数，e2e 读平均值）。
- 删除中间索引的体后模拟继续正常运行，其余体轨迹不串位（单测：轨迹第 k 体段索引映射正确）。
- 「载入编辑器」回填的字段与该体当前实际值一致（含 grav 与 radius，e2e 逐字段比对）。
- Delete 在输入框聚焦时不删除天体（e2e：聚焦 count-input 按 Delete，HUD 数量不变）。
```

### A3. 跟随镜头

```text
【目标】选中某天体后，相机每帧锁定该体位置。

【改动文件】camera.ts（followTarget + 投影真源）、app.ts（每帧更新与解除条件）、
body-editor.ts / 信息卡（入口）、shortcuts.ts（X 键）、README（快捷键表）。

【需求】
1. Camera 增加 followTarget: number | null（索引，与 A2 的选中索引同口径）。
   每帧渲染前从最新快照取该体位置：2D 更新 cx/cy；3D 更新 targetX/targetY/targetZ。
   取不到（索引越界、体被删、快照为空）则自动置 null 并在状态栏提示「目标已消失，跟随已解除」。
2. 入口：信息卡加「跟随 / 解除」按钮；快捷键建议 X —— 实现前先调用 shortcuts.conflicts()
   检查，若被占用改用一个未占用的字母，并在变更报告中说明最终按键。
3. 跟随中按 F（自适应取景）改为「以目标体为基准的局部取景」：包围盒取目标体周围 ±init.radius/4，
   不重新计算全局 bounds。
4. 用户手动平移/旋转相机（panPixels / rotate / zoomAt）时自动解除跟随，避免"跟随时拖不动"的困惑。
5. 跟随只改视图，不改物理：Worker 不收任何新消息，快照与模拟状态完全不受影响。

【验收】
- 双星系统开启跟随其中一颗后，画面稳定锁定（e2e 连续 60 帧读取该体屏幕坐标，标准差 < 2px），另一颗绕其运动。
- 目标体被碰撞并合（removeDead）后跟随自动解除，无报错。
- 跟随时按 F 不会把镜头拉到全系统；手动拖拽后 followTarget 变 null。
```

---

## 4. B 组 · 场景库

### B1. 预设场景库

```text
【目标】控件区新增「预设场景」下拉 + 应用按钮，一键载入经典构型。

【改动文件】新增 src/core/presets.ts；controls.ts 新分区；app.ts 接入；tests/presets.test.ts；README。

【需求】新增 presets.ts 导出 PresetDef[]：
{ name, description, dimensions, physics?, init?, bodies: BodyConfig[] }，全部用模拟单位。
预设最终编译为 SimulationConfig（用 configFromParams 取默认值再覆盖），走与 JSON 导入
完全相同的 validate → acceptConfig → rebuild 管线；禁止另开一条初始化路径。

必须包含：
1. figure-8 三体（G=1，三体等质量 1）：
   r1 = (0.97000436, -0.24308753, 0)，r2 = -r1，r3 = (0,0,0)；
   v3 = (-0.93240737, -0.86473146, 0)，v1 = v2 = -v3/2；dimensions=2，dt=0.02。
2. 拉格朗日等边三角旋转解：三等质量体位于边长 d 的等边三角形顶点，绕质心以
   v = √(G·m/d) 匀速旋转（速度垂直于该体到质心连线，xy 平面）。
3. 中心恒星 + 行星：中心 mass=1000，5 颗行星按圆轨道助手公式分布在 r=4..20
   （用通用上下文「关键口径」第 2 条的 v_rel 公式），另加一颗 e=0.6 的彗星椭圆轨道。
4. 双星 + 环星：两颗等质量体互相圆轨道（间距 d，各自速度 √(G·m/(2d))），
   第三颗小体在外围大圆轨道。
5. 星系对撞：用现有 disc 生成器生成两份各 2000 体的盘，中心各放一个大质量核，
   两盘相向偏置并给整体平移速度。注意：生成器产出是 BodySet，需用 bodiesFromSet 转 BodyConfig，
   再手动平移两份的 x/vx 后合并；不要直接把两个 World 拼起来。
6. 随机云（= 现有默认生成器行为，作为「重置」项；bodies 为空，走 init 路径）。
7. 正负混合示例（2 正 1 负 grav），为 D4 预留；D4 未实现前该项禁用并注明原因。

【验收】
- figure-8 运行一个周期（dt=0.02 约 316 步）后三体回到近似初始位置（位置误差 < 0.05，Verlet 即可），
  写成单元测试。
- 拉格朗日预设运行 5000 步三角形边长变化 < 2%。
- 每个预设都能通过 validateConfig 并成功重建（遍历 PresetDef[] 的测试）。
- e2e：下拉逐个切换预设，HUD 天体数与预设 bodies.length 一致，零报错。
```

### B2. 圆轨道助手

```text
【目标】逐条编辑器支持「环绕模式」：选定中心天体，输入半径，自动算出圆轨道速度并填表。

【改动文件】src/core/orbit.ts（新增纯函数，供 B2/C2 共用）、body-editor.ts、tests/orbit.test.ts。

【需求】
1. orbit.ts 先实现共用内核：
   circularOrbit(center: BodyConfigLike, radius: number, plane: 'xy'|'xz'|'yz', G: number)
   → {x,y,z,vx,vy,vz}（相对中心的位置/速度），速度方向按平面右手系定向。
2. 口径已确认，直接用：μ = G · (center.gravMass + body.gravMass)，
   v_rel = √(μ / r)；其中 gravMass = grav × weight，与 energy.ts 的势能口径一致。
   最终写入表单的速度 = v_rel + 中心体当前速度（从快照读，中心体静止时为 0）。
3. UI：body-editor.ts 表单加「环绕计算」开关；打开后显示中心体下拉（列出现有体 id + mass，
   取自最新快照）、轨道半径 r、轨道平面（2D 固定 xy；3D 可选 xy/xz/yz）、「计算并填入」按钮。
4. 填入后仍走既有提交校验，不绕过 body-form.ts；2D 下 z/vz 强制 0。
5. 中心体本身在运动（双星外圈行星场景）时，速度要叠加中心体速度，不能只给相对速度。

【验收】
- 单测：中心体静止 mass=1000、环绕体 m=1、r=10，运行若干步后位矢模长波动 < 1%。
- 单测：中心体带恒定速度 (1, -0.5, 0) 时，合成速度 = 相对速度 + 中心速度，且轨道仍稳定。
- e2e：开启环绕计算→选中心→填 r→填入→提交，列表新增天体且速度字段为计算值。
```

---

## 5. C 组 · 分析诊断

> C1 建立的 metrics 通道被 C4 / E4 复用，先做 C1。

### C1. 能量/动量曲线图

```text
【目标】实时显示动能、势能、总能量、|L| 随时间折线，量化能量漂移。

【改动文件】worker/protocol.ts（metrics 消息）、physics.worker.ts（自适应采样）、client.ts、
controls.ts 或 hud.ts（120px canvas）、styles/main.css、README。

【需求】
1. Worker 每 k 步计算一次（自适应 k：目标每秒回报 20 次，k = clamp(round(20/(stepsPerSec)),1,1000)），
   用 computeEnergy 取 KE/PE；另算 |L| = |Σ mass·r×v| 与 |p| = |Σ mass·v|。
   n > 4096 时 computeEnergy 返回 null：此时该点记为 NaN 并在 UI 标记「样本过大，能量不可用」，
   不要把 null 当 0（见陷阱 12）。
2. protocol.ts 新增 FromWorker: { type:'metrics', step, time, ke, pe, total, angularMomentum,
   momentum, drift: number|null }。client.ts 走背压，忙时只保留最新一条。
3. UI：面板新增 120px canvas（2D ctx，零依赖），四条曲线可勾选显示，X 轴为最近 300 个采样，
   每条曲线独立归一化；下方一行显示 (E-E0)/|E0|，E0 为本次重建后的首个有效值。
4. 世界重建时清空历史数组与 E0。渲染不得阻塞物理 Worker。

【验收】
- 二体圆轨道默认参数下漂移显示 < 1e-6 量级。
- 切换 RK4 与 Verlet 能看到漂移差异（README 加一行观察说明即可，不强制断言）。
- e2e：读 canvas 非空像素 + 漂移文本存在；大 N 时显示「不可用」而非报错。
```

### C2. 双体轨道要素

```text
【目标】选中两个天体时，信息卡显示相对轨道要素。

【改动文件】src/core/orbit.ts（复用 B2 内核，新增 elements）、A2 信息卡、tests/orbit.test.ts。

【需求】
1. orbit.ts 新增 orbitalElements(state1, state2, G)：
   μ = G · (gravMass_1 + gravMass_2)；
   相对位矢 r = r2 - r1，相对速度 v = v2 - v1；
   ε = |v|²/2 - μ/|r|；a = -μ/(2ε)；
   e = |v×h|/μ - 1，其中 h = r×v（2D 用 z 分量，3D 用三维叉积）；
   T = 2π√(a³/μ)（仅 e < 1）；e ≥ 1 返回 {escape: true}。
2. 口径同通用上下文「关键口径」第 2 条：引力用 gravMass（含 weight），动能/惯性用 mass，不要混用。
3. 信息卡在恰好选中两体时显示 a / e / T 三行；e ≥ 1 显示「逃逸轨道」；
   选中 1 体或 ≥3 体时隐藏该区块（复用 A2 的多选状态，若 A2 只支持单选，
   则用「Shift+点击追加选中第二体」实现，并在快捷键帮助里注明）。
4. 退化情形：|r| ≈ 0 或 ε ≈ 0 时返回 null，UI 显示「—」。

【验收】
- 单测：r=10、v=√(μ/10) 的圆轨道断言 a≈10、e<1e-6、T≈2π√(10³/μ)。
- 单测：抛物线速度 v=√(2μ/r) 断言 |e-1| < 1e-6。
- 单测：两体带共同整体速度时要素不变（伽利略不变性）。
```

### C3. 质心工具

```text
【目标】一键移除质心漂移，并可切换质心参考系显示。

【改动文件】worker/protocol.ts（removeDrift）、client.ts、physics.worker.ts、
BodySet（已有 zeroMomentum / centerAtOrigin，直接使用）、hud.ts、shortcuts.ts、README。

【需求】
1. Worker 新消息 removeDrift：调用 bodies.zeroMomentum()（总动量清零，每体速度减 v_cm）；
   增加一个可选布尔 centerPosition，为 true 时再调用 centerAtOrigin()。
2. HUD 显示 |v_cm|（保留 3 位有效数字），每次 frame 都更新；值为 0 时显示 0。
3. 「质心参考系显示」只影响相机：Camera 增加 comReference 布尔，开启时每帧把
   2D cx/cy 或 3D target 设为快照的质心（worker 需在 Diagnostics 里补 comX/comY/comZ）。
   不改物理状态。
4. 快捷键注册（建议 Shift+R，实现前查冲突）+ 帮助面板同步；输入框聚焦时让位。

【验收】
- 单测：随机 N 体整体平移速度 (3,-2,1) 后调用 zeroMomentum，总动量 < 1e-12。
- 单测：centerAtOrigin 后 centerOfMass() 三轴坐标 < 1e-12。
- e2e：点按钮后 |v_cm| 归零，快捷键触发同样生效。
```

### C4. 维里比率与逃逸计数

```text
【目标】HUD 增加两行诊断：维里比率 Q = 2K/|U|，逃逸体计数。

【改动文件】复用 C1 的 metrics 通道、validate.ts（physics.escapeRadius 默认 10×init.radius）、
types.ts（PhysicsParams 增字段）、hud.ts、tests。

【需求】
1. metrics 消息带 virial 与 escapeCount。Q = 2K/|U|；U≈0 或 null 时 Q 显示「—」。
2. 逃逸定义：|r - 质心| > physics.escapeRadius；默认值在 validate.ts 补为 init.radius × 10，
   用户可显式配置（正数校验）。
3. HUD 两行：维里 Q（3 位有效数字）、逃逸 N；建议给 Q 加颜色提示
   （0.5 < Q < 2 正常，其余偏黄），样式与现有 HUD 一致。
4. 不额外引入新消息类型，挂在 C1 的 metrics 上；C1 未实现时本条先实现 metrics 最小子集。

【验收】
- 单测：静态均匀盘初始 Q 量级合理（宽松断言 0.5 < Q < 2）。
- 单测：一个体放在 20×radius 处被计为逃逸，其余不逃逸。
- e2e：HUD 两行有数值；escapeRadius 改小后逃逸数上升。
```

---

## 6. D 组 · 物理内核（每条独立，互不依赖）

### D1. 四阶辛积分器（Yoshida）+ Leapfrog 别名澄清

```text
【目标】新增真正更高阶的辛积分器，显著改善长期能量漂移；同时澄清「leapfrog」不是新功能。

【重要前提 —— 实现前必读，否则会做出无效改动】
现有 integrator.ts 的 stepVerlet() 注释已写明「半步踢-漂移-再踢」，它【就是】
Leapfrog KDK（kick(v+=a·dt/2) → drift(x+=v·dt) → compute a → kick(v+=a·dt/2)）。
因此「新增 leapfrog 并期望它比现有 Verlet 更守恒」在数学上不成立——两者完全等价。
禁止再实现一个名为 leapfrog 的重复积分器，也不要写「leapfrog 优于 Verlet」的断言。
本条改为实现一个真正有区分度的四阶辛积分器：Yoshida 三重跳（composition of KDK）。

【改动文件】integrator.ts、types.ts（IntegratorKind 加 "yoshida4"）、validate.ts（枚举）、
controls.ts（下拉 + 快捷键 I 循环）、README、tests/integrator.test.ts。

【需求】
1. Yoshida 4 阶系数（3 次 KDK 复合）：
   w1 = 1 / (2 - 2^(1/3))，w0 = -2^(1/3) / (2 - 2^(1/3))，满足 2w1 + w0 = 1、2w1³ + w0³ = 0。
   单步 = KDK(w1·dt) → KDK(w0·dt) → KDK(w1·dt)，其中 w0 为负（时间反向子步，属正常）。
2. 力复用：每个 KDK 子步复用上一段末尾的加速度做第一次 kick，只在 drift 后求一次新力；
   因此整步共 3 次求力（现有 Verlet 为 1 次）。在 README 明确写出 3× 代价。
3. world.ts 的 step() 现在按 b.integratorKind 单入口分派，新的 yoshida4 必须走同一入口，
   保持「积分 → 碰撞 → removeDead」顺序不变；2D/3D 通用，z 分量与 x/y 同样处理。
4. physics.integrator 增加 "yoshida4"；validate.ts 枚举补上；params.ts 默认值保持 verlet 不变。
5. 快捷键 I 循环改为 verlet → yoshida4 → rk4 → verlet；帮助与 README 表格同步。
6. 可选（低优先）：给 "leapfrog" 加一个只读别名映射到 verlet，让用户按名称能找到，
   但不得在 UI 下拉里重复列出，也不要写进守恒对比测试。

【验收】
- 单测：w1/w0 满足 2w1+w0==1 且 |2w1³+w0³| < 1e-12。
- 单测：二体椭圆轨道（e=0.5）跑 10⁴ 步，yoshida4 能量漂移 < verlet 同条件漂移一个数量级以上；
  2D/3D 各一组（这条断言能成立，因为 4 阶 vs 2 阶，而 leapfrog vs verlet 不能）。
- 单测：yoshida4 单步总动量守恒（< 1e-12），负子步不会破坏辛性。
- e2e：快捷键 I 三次回到 verlet，下拉框状态与 state 同步。
```

### D2. 自适应步长

```text
【目标】近距离交会时自动缩小 dt，避免穿透与能量爆炸。

【改动文件】types.ts（adaptiveDt / dtSafety）、validate.ts（默认 false / 0.3，范围 (0,1]）、
controls.ts、world.ts、Diagnostics（dtEff）、hud.ts、tests/adaptive.test.ts。

【需求】
1. 策略：每步取 max|a| 估计时标 τ = √(softening / max|a|)，
   dt_eff = clamp(dtSafety · τ, dtMin, dt)，dtMin = dt/64。
   max|a| = 0 时 dt_eff = dt。世界内用 dt_eff 积分，并写入 Diagnostics.dtEff 上报 HUD。
2. 只与 direct / barnes-hut 组合开放；engine=particle-mesh 时忽略并在状态栏提示
   「PM 网格步长语义不同，自适应步长已忽略」。
3. dt_eff 序列必须平滑：相邻步变化 < 4 倍（用一阶低通或限制速实现）。
4. 快照/轨迹时间轴用真实累积时间（world.time += dt_eff），不要用名义 dt，否则轨迹时间失真。

【验收】
- 单测：两体近心点交会（近日距 < 0.2·10·softening），自适应开启时能量漂移比固定 dt 小一个数量级。
- 单测：dt_eff 序列相邻变化 < 4 倍，且始终 ∈ [dt/64, dt]。
- e2e：开启后 HUD 显示当前 dt_eff；切到 PM 后提示出现且 dt_eff 回到 dt。
```

### D3. TreePM 混合引擎

```text
【目标】新增 engine: "treepm"：近场用 Barnes-Hut，远场用 PM，精度与速度兼得。

【改动文件】types.ts（EngineKind 加 "treepm"）、validate.ts、forces/treepm.ts（新增）、
solver.ts、scale-policy.ts、README、tests/treepm.test.ts、tools/bench-treepm.ts。

【需求】
1. 新配置 physics.rSplitGrids（默认 2.5，>0），r_split = rSplitGrids × h（h = PM 网格间距）。
2. 实现取「实空间短距修正」路线（最简单、误差可控）：
   - PM 负责全部远场（ρ→φ→∇φ）。
   - 对每个天体，遍历其 r < r_split 邻域内的其它天体，用 BH 树给出精确近场对，
     并减去 PM 在同一邻域的网格插值贡献（即对 PM 做短距补偿），两段相加无重复计数。
   - 若减去网格贡献的代价过高，允许退化为「PM 只算 r > r_split 的远场、近场全由 BH 补」，
     但必须在 README 明确写出该近似与误差来源，并在变更报告里标注。
3. solver.ts 接入 "treepm"；auto 策略在现有 3D 启发式之后，N ≥ 20000 时优先 treepm。
4. README 引擎表加一行，说明它与单独 BH / PM 的适用边界。

【验收】
- 单测：均匀立方体 2000 体，treepm 与 direct 的每体加速度相对误差中位数 < 2%（PM 单独做不到）。
- 基准：2 万体 treepm 步耗时 < direct 的 1/10（tools/bench-treepm.ts 输出对比）。
- 单测：rSplitGrids 增大时结果单调趋近 pure PM（趋势断言即可）。
```

### D4. 允许负 grav（排斥）

```text
【目标】放开 grav > 0 限制，支持负引力参数（排斥力），可玩带电粒子与「宇宙膨胀」类比。

【改动文件】validate.ts、body-form.ts（红字规则）、bodies.ts（gravMass 回退逻辑）、
forces/direct.ts + barnes-hut.ts + particle-mesh.ts（逐引擎确认）、collision.ts、energy.ts、
presets.ts（正负混合示例）、README。

【需求】
1. validate.ts：grav 改为任意有限实数；0 视为合法但该体不施力（受其它体吸引仍成立），文档说明。
2. 【必须先改】BodySet.gravMass() 现在是 `grav[i] > 0 ? grav[i] : mass[i]`，
   负 grav 与零 grav 会被错误回退到 mass。改为「grav 是否有效由配置决定」：
   在 BodySet 增加显式的 gravValid/useGrav 标记（或统一约定 grav===0 表示不施力，
   不再回退 mass），并同步修改所有手工构造 BodySet 的测试工厂，使其显式写入 grav。
   禁止用 `!== 0` 之类的隐式判断替代标记，否则零 grav 语义会丢失。
3. 逐引擎确认：direct / BH / PM 代入 gravMass 时没有 abs() 或 >0 假设；
   PM 的密度沉积允许负值（rho 可为负，FFT 线性成立）。
   collision 的并合质量用 mass（惯性），并合后 grav 按 gravMass 加权守恒。
   energy.ts 的 U = -Σ G·gravMass_i·gravMass_j/r 对负数天然成立，无需改公式。
4. body-editor.ts 的红字规则同步：grav 允许 0 与负数，仅拒绝非数字。
5. presets.ts 加「正负混合」示例（2 正 1 负），README「关键语义」补一条。

【验收】
- 单测：等大正负 grav 两体，加速度大小相等方向相反，总动量守恒 < 1e-12。
- 单测：三体一负两正系统总能量有限且漂移 < 1e-6（关闭碰撞）。
- 单测：grav=0 的体不施力但仍受力（与 mass 回退明确区分）。
- e2e：逐条编辑器提交 grav=-1 成功，不再报红字。
```

### D5. Plummer 软化核统一

```text
【目标】三个引擎的软化统一为 Plummer 核：a = -μ·r/(r²+ε²)^{3/2}。

【改动文件】forces/direct.ts + barnes-hut.ts + particle-mesh.ts、README、tests/solvers.test.ts。

【需求】
1. 先读三个文件，盘点各自软化实现与差异，在变更报告中列出「改前 / 改后」对照表。
2. direct 与 BH 直接换成 Plummer 形式（把分母 r³ 换成 (r²+ε²)^{3/2}）。
   PM 的实空间短距修正用 Plummer 的解析形式近似（网格法不追求精确 Fourier 变换），
   README 说明其近似性。
3. 物理语义不变：softening 仍是 ε。若既有收敛测试容差需微调，在报告里逐条说明理由，
   不得直接放宽阈值掩盖回归。
4. grav 口径不变（gravMass），负 grav 若已实现则符号自然沿用它。

【验收】
- 三引擎在 2000 体均匀球上与 direct 的一致性误差不劣于改前。
- 近距二体（r = 0.1ε）力有限且光滑：在 r ∈ [0.05ε, 0.2ε] 上数值微分连续（相对跳变 < 1%）。
- 单测：ε→0 时 direct 结果收敛到纯 1/r² 解。
```

---

## 7. E 组 · 工程与分享

### E1. URL 分享

```text
【目标】把完整配置压进链接，打开即复现。

【改动文件】serialize.ts（shareUrl / readHash）、main.ts、controls.ts、app.ts、shortcuts.ts、README。

【需求】
1. serialize.ts 新增 shareUrl(config): Promise<string>：
   configToJSON → TextEncoder → gzip（原生 CompressionStream）→ base64url → location.origin + path + '#c=<data>'。
   解析方向 readHash(): Promise<SimulationConfig | null>。
2. 启动时 main.ts 解析 hash：走与文件导入相同的 validateConfig + acceptConfig + rebuild 管线；
   成功后 history.replaceState 清掉 hash（避免刷新意外重置）并状态栏提示「已从链接载入」；
   失败则保留 hash 并给明确错误，不崩溃。
3. 控件加「复制分享链接」按钮（navigator.clipboard，失败降级为选中文本框）+
   快捷键 Ctrl+Shift+C（注册 + 冲突检测 + 帮助同步）。
4. bodies 超过 500 条时提示体积并降级为「仅参数」链接（附一行说明）。
5. 不引第三方编码库。

【验收】
- e2e：导出链接 → 新页面带 hash 打开 → bodies 数、逐体坐标、physics 参数与源配置逐字段一致。
- e2e：非法 hash（如 #c=@@@）给出明确错误且不白屏。
```

### E2. 画面录制导出 webm

```text
【目标】把 canvas 画面录成 .webm 保存（零依赖）。

【改动文件】controls.ts（录制按钮 + 红点计时）、app.ts（MediaRecorder 生命周期）、styles/main.css、README。

【需求】
1. stage.captureStream(60) + MediaRecorder：优先 'video/webm;codecs=vp9'，
   不支持回退 vp8，再回退默认 MIME；用 MediaRecorder.isTypeSupported 判断。
2. 控件区加「开始 / 停止录制」按钮；录制中显示红点 + 计时（秒）；停止后触发下载
   nbody-<ISO 时间戳>.webm（用现有 downloadBlob）。
3. 录制不影响模拟与 Worker：不得因为录制改动画布尺寸或渲染频率。
4. 连续录制 > 5 分钟时提示内存占用（用 setInterval 计时 + toast，一次性提示）。
5. 页面卸载 / 重建世界时若仍在录制，先 stop 并保存，避免丢失。

【验收】
- e2e：开始录制 → 等 2 秒 → 停止 → 产物 blob.size > 0（不校验编码细节）。
- e2e：录制期间 HUD 步数持续增长（证明未阻塞模拟）。
```

### E3. 配置撤销/重做

```text
【目标】所有「重建世界」类操作可撤销。

【改动文件】新增 src/ui/history.ts（纯栈逻辑）、app.ts（接入）、shortcuts.ts、tests/history.test.ts、README。

【需求】
1. app.ts 用 history.ts 维护配置快照栈（上限 50，深拷贝 SimulationConfig：
   用 structuredClone，bodies 数组也要复制）。
2. 任何成功重建前 push 当前配置，并记录操作名：
   参数应用 / JSON 导入 / 逐条应用 / 预设切换 / A1 创建的第一条 / D 类物理切换。
   连续拖放创建只在第一条前 push 一次（用「批量编辑事务」标记）。
3. Ctrl+Z 弹栈恢复，Ctrl+Y 或 Ctrl+Shift+Z 重做；恢复走标准 validate → rebuild，
   状态栏提示「已撤销 / 重做：<操作名>」。输入框聚焦时让位（Ctrl+Z 在输入框里是文本撤销）。
4. 快捷键注册 + 冲突检测 + 帮助面板同步。

【验收】
- 单测：history.ts 的 push/pop/redo/clear/上限 50 行为（纯函数，不依赖 DOM）。
- e2e：改数量→应用→Ctrl+Z 回到旧数量→Ctrl+Y 恢复；中文提示文本出现。
```

### E4. 性能面板

```text
【目标】展示每步耗时拆解与实时吞吐。

【改动文件】world.ts / physics.worker.ts（分段计时）、protocol.ts（复用 C1 metrics 或新增 perf 消息）、
hud.ts 或 controls.ts（可折叠块）、styles/main.css。

【需求】
1. Worker 每步测三段：求力 / 积分 / 碰撞（performance.now），指数滑动平均（α=0.15）后上报。
   若 C1 已实现，挂在 metrics 消息上；否则新增 {type:'perf', ...}，并在 client.ts 处理背压。
2. 面板新增可折叠「性能」块：fps、ms/步总计 + 三段比例条、活跃 N、当前引擎、
   当前 dt_eff（若 D2 开启）、渲染点数。样式与 HUD 一致，零依赖（纯 div + CSS 宽度百分比）。
3. 无 metrics / perf 消息时（旧协议或 Worker 未就绪）整块隐藏，不报错。
4. 分段条颜色语义固定：求力=青、积分=紫、碰撞=橙；与配色模式无关。

【验收】
- e2e：切换引擎后三段条比例变化（direct 求力占比 > BH 求力占比）。
- e2e：无 metrics 时不显示该块且控制台无报错。
```

---

## 8. F 组 · 可选增强（与现有架构契合，零运行时依赖）

### F1. 快照导出 PNG

```text
【目标】把当前画面导出为 PNG。

【需求】stage.toBlob(...) → downloadBlob('nbody-<timestamp>.png', blob)；
注意 HDR 后处理已渲染到默认帧缓冲，直接 toBlob 即得最终画面；
若启用 preserveDrawingBuffer=false 导致空白，须在渲染后同一帧内导出（用 requestAnimationFrame 排队）。
控件加按钮 + 快捷键（建议 Ctrl+P，先查冲突）；README 更新。

【验收】e2e：点击后产物非空且 PNG 签名正确（前 8 字节 89 50 4E 47）。
```

### F2. 轨迹导出 CSV

```text
【目标】导出选中天体（或前 K 个体）的历史轨迹为 CSV。

【需求】Worker 新消息 requestTrail(indices) → trails 消息（Float32Array 按 [x,y,z] × points）。
主线程用 Blob 拼 CSV：body_id,point_index,t,x,y,z；时间用 world.time 序列（D2 开启时用实际 dt_eff）。
不引第三方库；大量点时提示行数。控件加按钮。

【验收】单测：环形缓冲展开顺序正确（最新点在最后）；e2e：导出 CSV 行数 = trajectoryFilled × 体数。
```

### F3. 触屏手势

```text
【目标】移动端支持单指平移/旋转、双指缩放。

【需求】用 Pointer Events 统一鼠标与触摸；与 A1 创建手势、A2 拾取共存：
单指短按(<300ms, <8px)=拾取；单指拖拽=平移/旋转；双指=缩放(+旋转，3D)；
长按(>500ms)=进入创建模式。相机操作统一走 camera.ts 的 panPixels/rotate/zoomAt。
窄屏面板已是底部抽屉（50vh），画布交互区在上方，注意 touch-action: none。

【验收】Playwright 触摸模拟：双指缩放后 camera.zoom 变化；长按拖动后天体数 +1。
```

### F4. 引力势场热力图

```text
【目标】可选叠加显示 PM 网格上的势场/场强热力图。

【需求】注意 PM 的 rho 是密度、wRe/wIm 是打包后的力场 gx/gy；
势 φ 目前没有单独缓存（solve 内 re/im 存的是 ρ̂，随后被谱解覆盖）。
需在 ParticleMeshSolver 中新增 φ 的实空间数组（逆变换后保存），或在 solve 里直接降采样导出。
Worker 在 frame 消息里附带降采样后的场切片（z=目标层或 max|ρ| 层，64×64 Float32）。
主线程上传为 R8/R32F 纹理，在后处理阶段按 alpha 混合到画面（不参与 HDR 累加）。
控件加载入开关与色标图例；2D 模式下取 z=0 层。

【验收】e2e：开关后画面像素分布变化；关闭后与原先逐像素一致（截图 diff）。
```

### F5. 时间轴回放

```text
【目标】记录最近若干帧快照，支持倒放与慢放。

【需求】主线程环形缓冲保存最近 300 个 Snapshot 的 vertex 副本（按 maxRenderPoints 上限控制内存，
超出时提示并降级）；暂停后时间轴滑块可拖动回放，播放速度独立于物理 speed。
回放期间不向 Worker 发 advance；退出回放时询问「回到最新状态」或「从当前回放帧继续」。
注意：这是纯视图回放，不回滚物理状态，必须在 UI 明示。

【验收】e2e：暂停→拖动到中途→HUD 步数显示历史值→点「回到最新」恢复。
```

---

## 9. 版本切分与依赖

| 版本 | 内容 | 依赖前置 | 复杂度 | 主要新增文件 |
| --- | --- | --- | --- | --- |
| v2.1 | 交互三件套 A1+A2+A3 | 无（三条同批做，共享投影） | 高 | camera.ts 扩展、app 手势状态机 |
| v2.2 | 场景与教学 B1+B2+C1 | B2 的 orbit.ts 被 C2 复用 | 中 | presets.ts、orbit.ts、metrics 通道 |
| v2.3 | 诊断完善 C2+C3+C4+E4 | C1（metrics） | 中 | orbit.ts 扩展、history 无关 |
| v2.4 | 内核升级 D1(Yoshida4)+D2 | 无（互相独立，可分两次发版） | 高 | integrator / world 改造 |
| v2.5 | 分享发布 E1+E2+E3 | E3 需要 presets（B1）才能覆盖「预设切换」 | 中 | history.ts、shareUrl |
| 择机 A | TreePM D3 | 建议先做 D5 统一软化 | 高 | forces/treepm.ts |
| 择机 B | 负 grav D4 + 软化统一 D5 | D4 先于 D5（D5 要沿用负号语义） | 中 | bodies.ts 语义改造 |
| 择机 C | F1~F5 | A2（选中状态）→ F2/F4；E2 → F1 无强依赖 | 低~中 | 原生 API 封装 |

> 依赖规则：先建立「唯一真源」再让多处复用——投影放 camera.ts（A1/A2/A3/F3）、
> 轨道口径放 orbit.ts（B2/C2）、配置入口只有 validate + acceptConfig（B1/E1/E3）。
> 违反这条规则的提示词实现会在后续版本里产生难以定位的不一致。

---

## 10. 附录：常用验收命令速查

```bash
# 开发服务器（e2e 前置）
npm run dev                       # http://localhost:5173

# 三层验证
npx tsc --noEmit                  # 类型检查
npm test                          # 全部单元测试（基线 68）
npm run build                     # 类型检查 + 生产构建

# 性能基准
npm run bench                     # 2D：direct / BH / PM
npm run bench3                    # 3D：direct / BH / PM

# 端到端（需 dev 或 preview 已运行）
node tools/verify2.mjs            # 3D / JSON / 导入导出
node tools/verify3.mjs            # 大配置流式导入 / 逐体导出
node tools/verify-editor.mjs      # 逐条编辑 / 校验 / 应用 / 载入
node tools/verify-shortcuts.mjs   # 快捷键 / 帮助 / 焦点保护

# 生产预览
npm run preview                   # http://localhost:4173
```

> 新增功能时复制任一个 `verify-*.mjs` 改写成 `verify-<feature>.mjs`，
> 统一用 `channel: 'msedge'`、`args: ['--enable-unsafe-swiftshader']`、
> 监听 `pageerror` 与 `console.error`，并在结束时断言「零报错」。
