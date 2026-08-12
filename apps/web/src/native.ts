// Thin native-shell bridge. Browser builds never load a native plugin; the
// Capacitor wrapper translates lifecycle/back events into cancelable DOM events
// so the game package stays platform-agnostic and remains easy to test on web.

import { Capacitor } from '@capacitor/core';
import { NATIVE_BACK_EVENT, NATIVE_PAUSE_EVENT } from '@bf/game/nativeEvents';

export async function installNativeBridge(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const { App } = await import('@capacitor/app');
  await App.addListener('pause', () => {
    window.dispatchEvent(new Event(NATIVE_PAUSE_EVENT));
  });
  await App.addListener('backButton', ({ canGoBack }) => {
    const event = new Event(NATIVE_BACK_EVENT, { cancelable: true });
    const unhandled = window.dispatchEvent(event);
    if (!unhandled) return;
    if (canGoBack) window.history.back();
    else void App.minimizeApp();
  });
}
