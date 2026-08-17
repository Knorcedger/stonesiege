// Shared settings controls: volume/camera/HUD sliders + HP-bar toggle, used by
// BOTH the menu settings screen (screens/menu.ts) and the in-match pause
// overlay (hud/hud.ts) — changing the volume must never cost a resign.
// Injects its own stylesheet so it also works on boots that never showed the
// menu (post-reload scenario deep links skip showMenu entirely).
// updateSettings persists and notifies subscribers (audio engine, camera, HP
// bars) on every change, so sliders apply live while dragging.

import { getSettings, updateSettings } from './settings';

const SETTINGS_CSS = `
.bf-set-label { text-align:left; font-size:13px; color:#B99A6B; letter-spacing:1px; margin:12px 0 4px;
  font-family:"Pixelify Sans",monospace; }
.bf-set-row { display:flex; align-items:center; gap:10px; margin:2px 0; min-height:28px; }
.bf-set-row input[type=range] { flex:1; accent-color:#E6C04A; margin:0; }
.bf-set-val { flex:0 0 44px; text-align:right; font-family:"VT323",monospace; font-size:16px;
  color:#E6C04A; }
.bf-set-seg { display:flex; gap:6px; }
.bf-set-seg button { flex:1; padding:8px 0; font-family:"Pixelify Sans",monospace; font-size:14px;
  cursor:pointer; color:#DABE8D; background:#241809; border:1px solid #64492B; border-radius:4px; }
.bf-set-seg button.on { color:#1A1208; background:linear-gradient(#EFDDB5,#DABE8D); border-color:#B99A6B;
  box-shadow:0 1px 0 #8A6414; }
`;

export interface SettingsControlsOptions {
  /**
   * Fires when a slider is RELEASED (input 'change', not per-drag-step): the
   * audible-preview hook — play a uiTap so the player hears the level they
   * just set instead of tuning blind.
   */
  onSliderRelease?: () => void;
}

/**
 * Append the full settings control set (master/sfx/ambient volume, camera
 * speed, HP-bar visibility) to `container`. Controls read the live settings at
 * build time and write through updateSettings on every interaction.
 */
export function buildSettingsControls(container: HTMLElement, opts: SettingsControlsOptions = {}): void {
  if (!document.getElementById('bf-settings-style')) {
    const style = document.createElement('style');
    style.id = 'bf-settings-style';
    style.textContent = SETTINGS_CSS;
    document.head.appendChild(style);
  }

  const label = (text: string): void => {
    const l = document.createElement('div');
    l.className = 'bf-set-label';
    l.textContent = text;
    container.appendChild(l);
  };

  const slider = (
    name: string, value: number, min: number, max: number,
    fmt: (v: number) => string, apply: (v: number) => void,
  ): void => {
    label(name);
    const row = document.createElement('div');
    row.className = 'bf-set-row';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.value = String(Math.round(value));
    const val = document.createElement('span');
    val.className = 'bf-set-val';
    val.textContent = fmt(Math.round(value));
    input.addEventListener('input', () => {
      const v = Number(input.value);
      val.textContent = fmt(v);
      apply(v); // live: the audio engine ramps while the thumb moves
    });
    input.addEventListener('change', () => opts.onSliderRelease?.());
    row.append(input, val);
    container.appendChild(row);
  };

  const s = getSettings();
  slider('MASTER VOLUME', s.masterVolume * 100, 0, 100, (v) => `${v}%`,
    (v) => updateSettings({ masterVolume: v / 100 }));
  slider('SOUND EFFECTS', s.sfxVolume * 100, 0, 100, (v) => `${v}%`,
    (v) => updateSettings({ sfxVolume: v / 100 }));
  slider('AMBIENT', s.ambientVolume * 100, 0, 100, (v) => `${v}%`,
    (v) => updateSettings({ ambientVolume: v / 100 }));
  slider('CAMERA SPEED', s.cameraSpeed * 100, 50, 200, (v) => `${v}%`,
    (v) => updateSettings({ cameraSpeed: v / 100 }));
  slider('HUD SIZE', s.hudScale * 100, 75, 125, (v) => `${v}%`,
    (v) => updateSettings({ hudScale: v / 100 }));

  // HP-bar visibility: self-contained segmented toggle (updates its own .on
  // classes — no host re-render needed, unlike the old menu implementation)
  label('HEALTH BARS');
  const seg = document.createElement('div');
  seg.className = 'bf-set-seg';
  const options: Array<{ on: boolean; text: string }> = [
    { on: true, text: 'Shown' },
    { on: false, text: 'Hidden' },
  ];
  const segBtns: HTMLButtonElement[] = [];
  for (const opt of options) {
    const b = document.createElement('button');
    b.textContent = opt.text;
    b.classList.toggle('on', getSettings().showHpBars === opt.on);
    b.addEventListener('click', () => {
      updateSettings({ showHpBars: opt.on });
      segBtns.forEach((btn, i) => btn.classList.toggle('on', options[i].on === opt.on));
    });
    segBtns.push(b);
    seg.appendChild(b);
  }
  container.appendChild(seg);
}
