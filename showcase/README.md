# N-Body Studio 宣传片

交互页面与视频成片，内容一致（约 70 秒，9 个分镜）：

| 文件 | 说明 | 打开方式 |
|---|---|---|
| `index.html` | **交互版**：CSS 动画分镜，可播放/暂停/跳转章节 | 浏览器直接打开，或经 dev server 访问 `http://localhost:5173/showcase/` |
| `canvas.html` | **录制源**：Canvas 渲染版，与交互版画面一致 | 供 `tools/record-canvas.mjs` 录制使用 |
| `nbody-studio-promo.mp4` | **推荐成片**：H.264，1440×810，约 70 秒，11 MB | 微信/QQ/任意播放器，**发群首选** |
| `nbody-studio-promo.webm` | 备用成片：VP9，1440×810，约 70 秒，39 MB | 支持 WebM 的浏览器 |

## 分镜

| # | 时间 | 内容 |
|---|---|---|
| 1 | 0–6.5s | 片头：Logo + N-Body Studio + 副标题 |
| 2 | 6.5–13.5s | 规模：1 → 2,147,483,647 数字滚动 + 三项统计 |
| 3 | 13.5–21s | 四档引擎卡片依次弹出 |
| 4 | 21–29s | 主界面截图 + 参数配置要点 |
| 5 | 29–38s | **演示流程**：选构型 → 调参数 → 运行观察（三步卡片 + 实操截图） |
| 6 | 38–46s | 1–10 体工作台 + 少体截图 |
| 7 | 46–55s | 恒星演化：光谱色带 + 遗骸 + 事件流 |
| 8 | 55–62s | 工程能力：JSON / 分享 / 录制 / 快捷键 / 撤销 / 测试 |
| 9 | 62–69s | 片尾：技术栈 + 零依赖 |

## 重新录制

```bash
npm run dev                        # 先启动服务器
node tools/record-mp4.mjs          # 推荐：直接录制 MP4（H.264），输出 showcase/nbody-studio-promo.mp4
node tools/record-canvas.mjs       # 备用：录制 WebM（VP9）
```

MP4 由 Edge 原生 `MediaRecorder`（`video/mp4;codecs=avc1.42E01E`）直接编码生成，
**不是**由 WebM 转码而来，因此无需 ffmpeg，画质无损、体积仅约 WebM 的四分之一。

录制使用浏览器原生 `MediaRecorder`（VP9，6 Mbps），不依赖 ffmpeg 或任何运行时包。
生成的 WebM 由 MediaRecorder 写入，duration 字段为占位值（`Infinity`），浏览器可正常播放与拖动；
若需精确时长元数据，可在有 ffmpeg 的环境中执行 `ffmpeg -i in.webm -c copy out.webm` 重封装。

## 素材

`assets/` 下的 5 张 PNG 均来自项目真实运行截图（星系对撞、1–10 体工作台、恒星演化、百万体、3D 视图）。
