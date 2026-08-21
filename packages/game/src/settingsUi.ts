// Shared settings controls: volume/camera/HUD sliders + HP-bar toggle, used by
// BOTH the menu settings screen (screens/menu.ts) and the in-match pause
// overlay (hud/hud.ts) — changing the volume must never cost a resign.
// Injects its own stylesheet so it also works on boots that never showed the
// menu (post-reload scenario deep links skip showMenu entirely).
// updateSettings persists and notifies subscribers (audio engine, camera, HP
// bars) on every change, so sliders apply live while dragging.

import { getSettings, updateSettings } from './settings';
import type { ProductionSpeed } from '@bf/sim/types';

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
.bf-set-seg button:focus-visible { outline:3px solid #FFE98A; outline-offset:2px;
  box-shadow:0 0 0 2px #16100a; }
.bf-set-row input[type=range]:focus-visible { outline:3px solid #FFE98A; outline-offset:3px; }
.bf-set-hint { margin:5px 0 7px; color:#8F7A59; font:13px/1.25 "Alegreya Sans","Trebuchet MS",sans-serif; }
.bf-set-devtools { margin-top:18px; padding:12px 14px 7px; text-align:left; background:#1d1409;
  border:1px dashed #8A6414; border-radius:5px; }
.bf-set-devtitle { color:#E6C04A; font:15px "Pixelify Sans",monospace; letter-spacing:1px; }
`;

export interface SettingsControlsOptions {
  /**
   * Fires when a slider is RELEASED (input 'change', not per-drag-step): the
   * audible-preview hook — play a uiTap so the player hears the level they
   * just set instead of tuning blind.
   */
  onSliderRelease?: () => void;
  /** In a live match, record the deterministic speed change at the next tick. */
  onProductionSpeedChange?: (speed: ProductionSpeed) => void;
}

/**
 * Append the full settings control set (master/sfx/ambient volume, camera
 * speed, production speed, HP-bar visibility) to `container`. Controls read the live settings at
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

  label('PRODUCTION SPEED');
  const speedSeg = document.createElement('div');
  speedSeg.className = 'bf-set-seg';
  const speedOptions: ProductionSpeed[] = [1, 2, 4];
  const speedBtns: HTMLButtonElement[] = [];
  for (const speed of speedOptions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${speed}×`;
    const refresh = (): void => {
      const active = getSettings().productionSpeed === speed;
      b.classList.toggle('on', active);
      b.setAttribute('aria-pressed', String(active));
    };
    refresh();
    b.addEventListener('click', () => {
      updateSettings({ productionSpeed: speed });
      speedBtns.forEach((btn, i) => {
        const active = speedOptions[i] === speed;
        btn.classList.toggle('on', active);
        btn.setAttribute('aria-pressed', String(active));
      });
      opts.onProductionSpeedChange?.(speed);
    });
    speedBtns.push(b);
    speedSeg.appendChild(b);
  }
  container.appendChild(speedSeg);
  const speedHint = document.createElement('div');
  speedHint.className = 'bf-set-hint';
  speedHint.textContent = 'Construction, training, upgrades and gathering. Movement, combat and animations stay unchanged.';
  container.appendChild(speedHint);

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
    b.type = 'button';
    b.textContent = opt.text;
    const active = getSettings().showHpBars === opt.on;
    b.classList.toggle('on', active);
    b.setAttribute('aria-pressed', String(active));
    b.addEventListener('click', () => {
      updateSettings({ showHpBars: opt.on });
      segBtns.forEach((btn, i) => {
        const selected = options[i].on === opt.on;
        btn.classList.toggle('on', selected);
        btn.setAttribute('aria-pressed', String(selected));
      });
    });
    segBtns.push(b);
    seg.appendChild(b);
  }
  container.appendChild(seg);
}
