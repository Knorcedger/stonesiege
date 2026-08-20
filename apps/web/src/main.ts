// Entry point. The game shell (menus, practice mode, campaign) lives in @bf/game.
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/jacquard-12/latin-400.css';
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-600.css';
import '@fontsource/vt323/latin-400.css';

import { appOpenEvent } from '@bf/game/analytics/events';
import { installNativeBridge, nativePlatform } from './native';
import { createWebAnalytics, type WebAnalytics } from './analytics';

const app = document.getElementById('app')!;
app.innerHTML = '<div style="color:#c9b98a;font:16px monospace;padding:2rem">StoneSiege — bootstrapping…</div>';

/**
 * The only place that reads the analytics configuration. Measurement is on
 * only for a production build with a measurement id configured — a dev server
 * must never pollute the property with playtesting.
 */
function bootAnalytics(): WebAnalytics {
  return createWebAnalytics({
    measurementId: import.meta.env.DEV ? undefined : import.meta.env.VITE_GA_ID,
    appVersion: __APP_VERSION__,
    platform: nativePlatform(),
  });
}

async function boot() {
  await installNativeBridge();
  // Nothing analytics-related is awaited: a launch must not wait on, or be
  // able to fail because of, a measurement request.
  const { analytics, isNewSession } = bootAnalytics();
  if (isNewSession) analytics.track(appOpenEvent());
  const capturePreset = new URLSearchParams(window.location.search).get('capture');
  if (import.meta.env.DEV && capturePreset === 'citadel') {
    sessionStorage.setItem('bf.nav.hint.v1', JSON.stringify({
      kind: 'startScenario',
      scenarioId: 'showcase-citadel',
    }));
  }
  const { startApp } = await import('@bf/game');
  await startApp(app, { analytics });
}

boot().catch((err) => {
  app.innerHTML = `<pre style="color:#e66;padding:2rem">${String(err?.stack ?? err)}</pre>`;
});
