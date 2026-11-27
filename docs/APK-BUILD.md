# N-Body Studio · Android APK 构建指南

本项目以 Capacitor 5 封装 Web 应用为原生 Android 工程。当前开发环境**未安装 JDK 与 Android SDK**，
因此这里提供完整工程与可复现的构建步骤，你在装有 Android Studio 的机器上一键构建 APK。

## 前置条件

| 组件 | 版本要求 | 说明 |
|---|---|---|
| JDK | 17 | Android Gradle Plugin 8.x 要求 |
| Android Studio | Hedgehog (2023.1) 或更新 | 自带 SDK 与构建工具 |
| Android SDK | API 33+ | 通过 SDK Manager 安装 |
| Node.js | 18+ | 已具备 |

## 构建步骤

### 1. 安装依赖并构建 Web 资源

```bash
npm install
npm run build
```

产出 `dist/`（Vite 已配置 `base: './'`，资源为相对路径，适合本地加载）。

### 2. 同步 Capacitor

```bash
npx cap sync android
```

该命令把 `dist/` 复制进 `android/app/src/main/assets/public/`，并同步原生配置。

### 3. 生成 APK

**方式 A — Android Studio（推荐）**

1. 用 Android Studio 打开 `android/` 目录
2. 等待 Gradle Sync 完成
3. 菜单 `Build → Build Bundle(s) / APK(s) → Build APK(s)`
4. 产物位于 `android/app/build/outputs/apk/debug/app-debug.apk`

**方式 B — 命令行**

```bash
cd android
./gradlew assembleDebug      # Windows: gradlew.bat assembleDebug
```

### 4. 安装到设备

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

## 常见问题

- **`cap sync` 报 `android` 目录不存在**：先执行 `npx cap add android`。
- **Gradle 下载慢**：在 `gradle/wrapper/gradle-wrapper.properties` 中把 distributionUrl 指向国内镜像。
- **WebGL2 不可用**：确保设备支持 WebGL2（绝大部分 2018 年后的安卓设备支持）；应用内会给出明确错误提示。
- **性能**：物理计算在 Web Worker 中运行，中低端设备建议把天体数控制在 10 万以内。

## 已生成的原生工程

`android/` 目录由 `npx cap add android` 生成后提交到仓库；`capacitor.config.ts` 中已配置：

- `appId`: `com.nbodystudio.app`
- `webDir`: `dist`
- `android`: `allowMixedContent: true`（允许 file:// 加载本地资源）

若需要调整应用名，编辑 `android/app/src/main/res/values/strings.xml`。
