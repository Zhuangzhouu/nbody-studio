# 多平台构建指南

N-Body Studio 是 Web 技术栈（TypeScript + WebGL2 + Web Worker），
通过 **Capacitor 5**（移动）与 **Electron 28**（桌面）覆盖五个平台。

## 平台矩阵

| 平台 | 工程位置 | 构建方式 | 本机可构建 |
|---|---|---|---|
| Windows | `electron/` + `package.json` | `npm run dist:win` | ✅ 已交付 setup.exe / 便携 ZIP |
| Android | `android/` | Android Studio / gradlew | ✅ 工程已生成，APK 需 Android SDK |
| iOS | `ios/App/` | Xcode（必须 macOS） | ❌ 工程已生成，需 Mac 构建 |
| iPadOS | 同 iOS 工程 | 同 iOS（Info.plist 已配 iPad 方向） | ❌ 需 Mac 构建 |
| HarmonyOS | `harmony/` | DevEco Studio | ❌ 工程已生成，需 HarmonyOS SDK |
| Linux | Electron | `npm run dist:linux` | ✅ AppImage + deb |

---

## 1. iOS / iPadOS（需 macOS + Xcode）

前置：macOS 12+、Xcode 14+、CocoaPods、Apple Developer 账号（真机/上架需要）。

```bash
# 在你的 Mac 上（克隆本仓库后）
npm install
npm run build
npx cap sync ios
cd ios/App
pod install
open App.xcworkspace
```

在 Xcode 中：

1. 选择 `App` target → Signing & Capabilities，设置你的 Team 与 Bundle ID；
2. **iPadOS**：`Info.plist` 已配置 `UISupportedInterfaceOrientations~ipad`
   与 `UIApplicationSupportsMultipleScenes`，支持横竖屏与分屏；
3. 选模拟器或真机，⌘R 运行；Archive → Distribute 导出 IPA。

> Windows 上无法生成 IPA：iOS 签名与编译强制依赖 macOS/Xcode。
> 仓库中 `ios/` 是完整原生工程，拷贝至 Mac 即可直接构建。

## 2. HarmonyOS（需 DevEco Studio）

前置：DevEco Studio 4.0+、HarmonyOS SDK API 11+。

```bash
# Windows / macOS 均可
npm run build
node tools/sync-harmony.mjs   # 把 dist 同步到 rawfile
```

在 DevEco Studio 中：

1. Open Project → 选择 `harmony/` 目录；
2. 等待 Sync 完成（首次会下载依赖）；
3. 连接真机或启动模拟器，Run `entry`；
4. Build → Build Hap(s)/APP(s) 生成 HAP。

**架构**：ArkTS WebView 加载 `rawfile/index.html`，物理计算在 WebView 内的
Web Worker 中执行，原生层只提供容器、全屏与返回键桥接。
`deviceTypes` 已配置 `phone / tablet / 2in1`，覆盖手机、平板与 PC 形态。

## 3. Linux

### 已有交付：绿色版 tar.gz

`dist-packages/NBodyStudio-3.3.0-linux-x64.tar.gz`（约 70 MB）包含完整
Electron 运行时与 `N-Body Studio` 可执行文件，在任意 x64 Linux 上：

```bash
tar -xzf NBodyStudio-3.3.0-linux-x64.tar.gz
cd NBodyStudio
chmod +x "N-Body Studio"
./N-Body Studio
```

### 在 Linux 上构建系统安装包

Windows 无法生成 AppImage（需 symlink 权限）与 deb（需 `fpm` 工具）。
在目标 Linux 机器上执行：

```bash
npm install
npm run build
npm run dist:linux        # 生成 AppImage + deb
```

产物在 `release-linux/`：

| 文件 | 说明 |
|---|---|
| `NBodyStudio-3.3.0-x86_64.AppImage` | 免安装，赋予执行权限后直接运行 |
| `NBodyStudio-3.3.0-amd64.deb` | Debian/Ubuntu 系安装包 |

## 4. 通用注意事项

- **Web Worker**：移动 WebView 中 Worker 可用；若某些定制 ROM 禁用，
  可在 `PhysicsClient` 中降级到主线程（需改代码）。
- **性能**：移动端建议天体数 ≤ 10 万并选 PM 引擎；1–10 体工作台不受影响。
- **触摸**：已实现单指平移/旋转、双指缩放、长按创建（见 `app-enhanced.ts`）。
- **资源同步**：每次改源码后必须 `npm run build`，再 `npx cap sync` 或
  `node tools/sync-harmony.mjs`，否则原生工程内仍是旧资源。
