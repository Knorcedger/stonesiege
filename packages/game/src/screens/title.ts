// Title screen (DOM): dark wood + parchment per ART_BIBLE §8, Jacquard 12
// display face (Google Fonts, with pixel-safe fallbacks when offline).

const TITLE_CSS = `
.bf-title { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  background:
    radial-gradient(ellipse at 50% 30%, rgba(230,192,74,0.08), transparent 60%),
    repeating-linear-gradient(90deg, #2C1F12 0 46px, #33241511 46px 48px),
    linear-gradient(#241809, #16100a);
  font-family:"Pixelify Sans","VT323",monospace; color:#EFDDB5; }
.bf-title-panel { width:min(420px, 86vw); padding:34px 30px 30px; text-align:center;
  background:linear-gradient(#3a2a18,#2C1F12); border:2px solid #1A1208; border-radius:6px;
  box-shadow:0 0 0 1px #8A6414 inset, 0 0 0 3px #64492B inset, 0 12px 40px rgba(0,0,0,0.6); }
.bf-title-name { font-family:"Jacquard 12","Pixelify Sans",monospace; font-size:56px; line-height:1;
  color:#E6C04A; text-shadow:2px 2px 0 #1A1208; margin:0 0 6px; letter-spacing:2px; }
.bf-title-sub { font-size:14px; color:#B99A6B; margin:0 0 26px; letter-spacing:1px; }
.bf-title-btn { display:block; width:100%; margin:10px 0; padding:12px 0; font-family:inherit; font-size:20px;
  color:#1A1208; background:linear-gradient(#EFDDB5,#DABE8D); border:1px solid #B99A6B; border-radius:4px;
  box-shadow:0 2px 0 #8A6414; cursor:pointer; letter-spacing:1px; }
.bf-title-btn:hover:not(:disabled) { background:linear-gradient(#F7EBCB,#E4CBA0); }
.bf-title-btn:active:not(:disabled) { transform:translateY(1px); box-shadow:0 1px 0 #8A6414; }
.bf-title-btn:disabled { color:#7a7266; background:#4a3a26; border-color:#3a2d1c; box-shadow:none; cursor:default; }
.bf-title-soon { font-size:12px; color:#B99A6B; display:block; margin-top:2px; }
`;

function ensureFonts(): void {
  if (document.getElementById('bf-fonts')) return;
  const link = document.createElement('link');
  link.id = 'bf-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Jacquard+12&family=Pixelify+Sans:wght@400;600&family=VT323&display=swap';
  document.head.appendChild(link);
}

/** Show the title screen; resolves when the player picks Practice. */
export function showTitleScreen(root: HTMLElement): Promise<'practice'> {
  ensureFonts();
  if (!document.getElementById('bf-title-style')) {
    const style = document.createElement('style');
    style.id = 'bf-title-style';
    style.textContent = TITLE_CSS;
    document.head.appendChild(style);
  }
  return new Promise((resolve) => {
    const screen = document.createElement('div');
    screen.className = 'bf-title';
    const panel = document.createElement('div');
    panel.className = 'bf-title-panel';

    const h1 = document.createElement('h1');
    h1.className = 'bf-title-name';
    h1.textContent = 'Bannerfall';
    const sub = document.createElement('p');
    sub.className = 'bf-title-sub';
    sub.textContent = 'Raise your banner. Advance the ages.';

    const practice = document.createElement('button');
    practice.className = 'bf-title-btn';
    practice.textContent = 'Practice';
    practice.addEventListener('click', () => {
      screen.remove();
      resolve('practice');
    });

    const campaign = document.createElement('button');
    campaign.className = 'bf-title-btn';
    campaign.disabled = true;
    campaign.innerHTML = 'Campaign<span class="bf-title-soon">coming soon</span>';

    panel.append(h1, sub, practice, campaign);
    screen.appendChild(panel);
    root.appendChild(screen);
  });
}
