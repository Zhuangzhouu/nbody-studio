import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nbodystudio.app',
  appName: 'N-Body Studio',
  webDir: 'dist',
  loggingBehavior: 'debug',
  android: {
    allowMixedContent: true,
    captureInput: true,
  },
};

export default config;
