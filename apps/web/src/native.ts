// Thin native-shell bridge. Browser builds never load a native plugin; the
// Capacitor wrapper translates lifecycle/back events into cancelable DOM events
// so the game package stays platform-agnostic and remains easy to test on web.

import { Capacitor, SystemBars, SystemBarType } from '@capacitor/core';
import { NATIVE_BACK_EVENT, NATIVE_PAUSE_EVENT } from '@bf/game/nativeEvents';

async function applyGameSystemBars(): Promise<void> {
  try {
    // Keep the top notification/status bar out of the landscape game while
    // preserving the platform navigation/gesture affordance at the bottom.
    await SystemBars.hide({ bar: SystemBarType.StatusBar, animation: 'NONE' });
    await SystemBars.show({ bar: SystemBarType.NavigationBar, animation: 'NONE' });
  } catch (error) {
    // A system-UI failure should never prevent the game itself from starting.
    console.warn('Could not apply native system bar visibility', error);
  }
}

/**
 * 'web' | 'ios' | 'android'. Reported as an analytics parameter rather than
 * used to gate anything: all three platforms measure identically.
 */
export function nativePlatform(): string {
  try {
    return Capacitor.getPlatform();
  } catch {
    return 'web';
  }
}

export async function installNativeBridge(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const { App } = await import('@capacitor/app');
  await applyGameSystemBars();
  await App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void applyGameSystemBars();
  });
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
