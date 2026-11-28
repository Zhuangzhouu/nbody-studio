import UIAbility from '@ohos.app.ability.UIAbility';
import hilog from '@ohos.hilog';
import window from '@ohos.window';
import { BusinessError } from '@ohos.base';
import Want from '@ohos.app.ability.Want';
import AbilityConstant from '@ohos.app.ability.AbilityConstant';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(0x0000, 'NBodyStudio', '%{public}s', 'Ability onCreate');
  }

  onDestroy(): void {
    hilog.info(0x0000, 'NBodyStudio', '%{public}s', 'Ability onDestroy');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    // immersive 模式：隐藏状态栏与导航条，扩大画布
    windowStage.loadContent('pages/Index', (err: BusinessError) => {
      if (err.code) {
        hilog.error(0x0000, 'NBodyStudio', 'loadContent failed: %{public}s', JSON.stringify(err));
        return;
      }
      windowStage.getMainWindow().then((win: window.Window) => {
        win.setWindowLayoutFullScreen(true).catch((e: BusinessError) => {
          hilog.warn(0x0000, 'NBodyStudio', 'fullscreen failed: %{public}s', JSON.stringify(e));
        });
      });
    });
  }

  onWindowStageDestroy(): void {}
  onForeground(): void {}
  onBackground(): void {}

  /** 返回键交给 WebView 处理（goback），无历史时由系统退出。 */
  onBackPress(): boolean {
    return false;
  }
}
