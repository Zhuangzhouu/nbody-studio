import web_webview from '@ohos.web.webview';

/**
 * N-Body Studio 鸿蒙壳：ArkTS WebView 加载本地 dist/index.html。
 * 物理计算在 WebView 内的 Web Worker 执行，原生层只提供容器与返回键桥接。
 */
@Entry
@Component
struct Index {
  controller: web_webview.WebviewController = new web_webview.WebviewController();
  @State private ready: boolean = false;

  build() {
    Column() {
      if (!this.ready) {
        LoadingProgress()
          .width(48)
          .height(48)
          .color('#5eead4')
      }
      Web({ src: $rawfile('index.html'), controller: this.controller })
        .visibility(this.ready ? Visibility.Visible : Visibility.None)
        .width('100%')
        .height('100%')
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .databaseAccess(true)
        .fileAccess(true)
        .mixedMode(MixedMode.All)
        .zoomAccess(false)
        .overviewModeAccess(false)
        .onPageEnd(() => {
          this.ready = true;
        })
        .onError((e) => {
          console.error(`[NBody] WebView error: ${JSON.stringify(e)}`);
        })
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#060b14')
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
    .onBackPress(() => {
      if (this.controller.accessBackward()) {
        this.controller.backward();
        return true;
      }
      return false;
    })
  }
}
