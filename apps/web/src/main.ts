// Entry point. The game shell (menus, practice mode, campaign) lives in @bf/game.
const app = document.getElementById('app')!;
app.innerHTML = '<div style="color:#c9b98a;font:16px monospace;padding:2rem">Bannerfall — bootstrapping…</div>';

async function boot() {
  const { startApp } = await import('@bf/game');
  await startApp(app);
}

boot().catch((err) => {
  app.innerHTML = `<pre style="color:#e66;padding:2rem">${String(err?.stack ?? err)}</pre>`;
});
