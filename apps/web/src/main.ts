// Entry point. The game shell (menus, practice mode, campaign) lives in @bf/game.
import '@fontsource/alegreya-sans/latin-400.css';
import '@fontsource/alegreya-sans/latin-500.css';
import '@fontsource/alegreya-sans/latin-700.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cinzel/latin-700.css';

import { appOpenEvent } from '@bf/game/analytics/events';
import { installNativeBridge, nativePlatform } from './native';
import { createWebAnalytics, type WebAnalytics } from './analytics';
import { renderBootError } from './bootError';

const app = document.getElementById('app')!;
app.innerHTML = '<div style="color:#c9b98a;font:16px monospace;padding:2rem">StoneSiege — bootstrapping…</div>';

/**
 * The only place that reads the analytics configuration. Measurement is on
 * only for a production build with a first-party endpoint configured — a dev
 * server must never pollute the service with playtesting.
 */
function bootAnalytics(): WebAnalytics {
  return createWebAnalytics({
    endpoint: import.meta.env.DEV ? undefined : import.meta.env.VITE_ANALYTICS_ENDPOINT,
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
  console.error('StoneSiege failed during initial boot.', err);
  renderBootError(app, err, { retry: () => window.location.reload() });
});
