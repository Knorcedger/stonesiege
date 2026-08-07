// One styled tooltip surface for every DOM control in the game. Native `title`
// attributes are deliberately removed: their timing, typography, and placement
// vary by browser and clash with Bannerfall's parchment/wood UI.

const STYLE_ID = 'bf-game-tooltip-style';
const TIP_ID = 'bf-game-tooltip';
const BOUND = 'bfTooltipBound';
let dismissBound = false;

const TOOLTIP_CSS = `
.bf-game-tooltip {
  position:fixed; z-index:1000; max-width:min(280px,calc(100vw - 16px));
  padding:7px 10px; box-sizing:border-box; pointer-events:none; display:none;
  white-space:pre-line; color:#1A1208; background:#DABE8D;
  border:1px solid #B99A6B; border-radius:3px;
  box-shadow:0 0 0 1px #8A6414 inset, 0 3px 10px rgba(10,8,5,.45);
  font:15px/1.2 "VT323",monospace; letter-spacing:.15px;
}
`;

function ensureTip(): HTMLDivElement {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = TOOLTIP_CSS;
    document.head.appendChild(style);
  }
  let tip = document.getElementById(TIP_ID) as HTMLDivElement | null;
  if (!tip) {
    tip = document.createElement('div');
    tip.id = TIP_ID;
    tip.className = 'bf-game-tooltip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
  }
  if (!dismissBound) {
    dismissBound = true;
    // A click can remove its own control (screen navigation / card rebuild), so
    // dismiss before the DOM changes rather than waiting for pointerleave.
    document.addEventListener('pointerdown', hideGameTooltip, { capture: true });
    window.addEventListener('blur', hideGameTooltip);
  }
  return tip;
}

/** Show text next to an element, clamped inside the viewport. */
export function showGameTooltip(text: string, anchor: HTMLElement): void {
  if (!text) return;
  const tip = ensureTip();
  tip.textContent = text;
  tip.style.display = 'block';
  const a = anchor.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const margin = 8;
  // Controls in the right-side command card must explain themselves without
  // covering that card's production queue. Prefer a fully side-by-side tooltip
  // there; use the normal below/above placement elsewhere.
  if (a.left + a.width / 2 > window.innerWidth * 0.62
    && a.left - t.width - margin >= margin) {
    const left = a.left - t.width - margin;
    const top = Math.max(margin, Math.min(
      window.innerHeight - t.height - margin,
      a.top + a.height / 2 - t.height / 2,
    ));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    return;
  }
  let left = a.left + a.width / 2 - t.width / 2;
  left = Math.max(margin, Math.min(window.innerWidth - t.width - margin, left));
  let top = a.bottom + 8;
  if (top + t.height > window.innerHeight - margin) top = a.top - t.height - 8;
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.max(margin, Math.round(top))}px`;
}

export function hideGameTooltip(): void {
  const tip = document.getElementById(TIP_ID) as HTMLDivElement | null;
  if (tip) tip.style.display = 'none';
}

/** Bind or update a Bannerfall tooltip. Safe to call repeatedly for dynamic labels. */
export function setGameTooltip(el: HTMLElement, text: string): void {
  el.removeAttribute('title');
  el.dataset.bfTooltip = text;
  el.setAttribute('aria-label', text.split('\n')[0]);
  if (el.dataset[BOUND]) return;
  el.dataset[BOUND] = '1';
  const show = (): void => showGameTooltip(el.dataset.bfTooltip ?? '', el);
  el.addEventListener('pointerenter', show);
  el.addEventListener('pointerleave', hideGameTooltip);
  el.addEventListener('focus', show);
  el.addEventListener('blur', hideGameTooltip);
}
