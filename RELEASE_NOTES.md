# N-Body Studio v2.8.0

浏览器内的 2D/3D N 体引力模拟器。TypeScript + Vite + WebGL2 + Web Worker，**零运行时依赖**。

## 下载

| 文件 | 说明 |
|---|---|
| `NBodyStudio-2.8.0-x64.exe` | Windows 安装版（NSIS），可选目录、创建桌面快捷方式 |
| `NBodyStudio-2.8.0-portable.exe` | Windows 便携版，双击即用 |
| `nbody-studio-promo.mp4` | 70 秒宣传片（约 11 MB） |

Android 版请使用 `android/` 目录的 Capacitor 工程构建，详见 `docs/APK-BUILD.md`。

## 核心能力

- **规模**：1 → 2,147,483,647（INT_MAX）。四档引擎自动切换：
  直接求和 ≤2,048 / Barnes-Hut ≤20,000 / 粒子网格 PM ≤2,000,000 / TreePM ≥20,000。
- **维度**：完整 2D / 3D，每体 `x/y/z`、`vx/vy/vz`、`mass`、`grav`（μ/G）、`radius` 可独立配置。
- **物理**：Verlet / RK4 / Yoshida4 积分器、自适应步长、Plummer 软化、负引力、球形碰撞（并合/弹性）。
- **恒星演化**：O/B/A/F/G/K/M 光谱分类、主序寿命、超新星冲击波、WD/NS/BH 遗骸、事件流。
- **交互**：拖放创建、点击拾取、跟随镜头、57 项快捷键、1–10 体专用工作台。
- **工程**：JSON 完整配置（gzip/流式）、URL 分享、WEBM 录制、撤销重做、性能面板、103→125 项测试。

## 性能参考

| 规模 | 引擎 | 单步耗时 |
|---|---|---|
| 1 万 | Barnes-Hut | ~8.5 ms |
| 5 万 | PM | ~12 ms |
| 20 万 | PM | ~25 ms |
| 100 万 | PM | ~185 ms |

## 源码与仓库

公开仓库：`https://github.com/Zhuangzhouu/nbody-studio`（可直接下载）

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 125 项测试
npm run build      # 生产构建
```

## 已知限制

- PM 对少数点质量不可靠（频谱混叠），平滑分布下精度良好。
- WebM 由 MediaRecorder 生成，duration 元数据为占位值，播放不受影响；MP4 版本元数据完整。
- 超新星抛射包层不生成粒子，冲量为对称近似。
