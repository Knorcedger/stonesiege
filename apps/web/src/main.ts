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

import { installNativeBridge } from './native';

const app = document.getElementById('app')!;
app.innerHTML = '<div style="color:#c9b98a;font:16px monospace;padding:2rem">StoneSiege — bootstrapping…</div>';

async function boot() {
  await installNativeBridge();
  const { startApp } = await import('@bf/game');
  await startApp(app);
}

boot().catch((err) => {
  app.innerHTML = `<pre style="color:#e66;padding:2rem">${String(err?.stack ?? err)}</pre>`;
});
