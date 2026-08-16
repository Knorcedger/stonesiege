/// <reference types="@capacitor/app" />
/// <reference types="@capacitor/splash-screen" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stonesiege.app',
  appName: 'StoneSiege',
  webDir: 'dist',
  backgroundColor: '#0d0b08',
  loggingBehavior: 'none',
  zoomEnabled: false,
  android: {
    allowMixedContent: false,
    backgroundColor: '#0d0b08',
    webContentsDebuggingEnabled: false,
  },
  ios: {
    allowsLinkPreview: false,
    backgroundColor: '#0d0b08',
    contentInset: 'never',
    preferredContentMode: 'mobile',
    scrollEnabled: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    App: {
      disableBackButtonHandler: true,
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 900,
      backgroundColor: '#0d0b08',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
    },
    SystemBars: {
      // Prevent Capacitor's default visible state from overriding the native
      // fullscreen flags before the web app has finished booting.
      hidden: true,
      style: 'DARK',
      animation: 'NONE',
    },
  },
};

export default config;
