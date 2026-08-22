// Full-screen / edge DOM overlays that sit outside the command card:
// - age-advance celebration banner (transient, Cinzel display face)
// - wonder countdown banner (persistent strip while a wonder stands)
// - under-attack screen-edge red pulse
// - victory / defeat end screen (ART_BIBLE dark wood + parchment + gold),
//   with match time + full match statistics and navigation actions.
// Pure-DOM presentation; all game data arrives pre-derived (hud/summary.ts).

import type { MatchSummary } from './summary';
import { AGE_LABEL } from './cardModel';
import { HUD_LAYER, HUD_TOP_BAR_BOTTOM_VAR, TOP_BAR_CLEAR_PX } from './layout';

const OVERLAY_CSS = `
.bf-agebanner { position:absolute; left:50%; top:22%; transform:translateX(-50%); text-align:center;
  pointer-events:none; opacity:0; transition:opacity 0.5s; z-index:${HUD_LAYER.ageBanner}; }
.bf-agebanner.show { opacity:1; }
.bf-agebanner h2 { font-family:"Cinzel","Georgia",serif; font-weight:700; font-size:42px; color:#E6C04A;
  text-shadow:2px 2px 0 #1A1208, 0 0 24px rgba(230,192,74,0.5); margin:0; letter-spacing:2px; }
.bf-agebanner p { font-family:"Alegreya Sans","Trebuchet MS",sans-serif; font-size:16px; color:#EFDDB5;
  text-shadow:1px 1px 0 #1A1208; margin:4px 0 0; }
/* Same measured anchor as the objectives panel: the top bar wraps to a second
   row on narrow viewports and grows with HUD scale, so a fixed 48px lands
   underneath it and the bar's opaque panel hides the countdown. */
.bf-wonder { position:absolute; left:50%; top:var(${HUD_TOP_BAR_BOTTOM_VAR}, ${TOP_BAR_CLEAR_PX}px);
  transform:translateX(-50%); padding:4px 14px;
  display:none; font-family:"Alegreya Sans","Trebuchet MS",sans-serif; font-size:14px; color:#1A1208;
  background:linear-gradient(#F2E3B8,#DABE8D); border:1px solid #B99A6B; border-radius:3px;
  box-shadow:0 0 0 1px #8A6414; pointer-events:none; z-index:${HUD_LAYER.wonderBanner}; }
.bf-wonder.show { display:block; }
.bf-wonder .bf-num { font-family:"Alegreya Sans","Trebuchet MS",sans-serif; font-variant-numeric:tabular-nums; font-size:15px; }
.bf-attackpulse { position:absolute; inset:0; pointer-events:none; opacity:0; z-index:${HUD_LAYER.attackPulse};
  box-shadow:inset 0 0 0 3px rgba(179,38,30,0.9), inset 0 0 60px 18px rgba(179,38,30,0.45); }
.bf-attackpulse.show { animation:bfAttackPulse 1.6s ease-out; }
@keyframes bfAttackPulse { 0% {opacity:0;} 12% {opacity:1;} 55% {opacity:0.55;} 100% {opacity:0;} }
.bf-end { position:absolute; inset:0; display:none; align-items:center; justify-content:center;
  background:rgba(10,8,5,0.82); pointer-events:auto; z-index:${HUD_LAYER.endScreen};
  font-family:"Alegreya Sans","Trebuchet MS",sans-serif; }
.bf-end.show { display:flex; }
.bf-end-panel { width:min(520px, 88%); max-height:92%; overflow-y:auto; padding:24px 26px 20px;
  box-sizing:border-box; text-align:center; color:#EFDDB5;
  background:linear-gradient(#3a2a18,#2C1F12); border:2px solid #1A1208; border-radius:6px;
  box-shadow:0 0 0 1px #8A6414 inset, 0 0 0 3px #64492B inset, 0 12px 40px rgba(0,0,0,0.65); }
.bf-end-title { font-family:"Cinzel","Georgia",serif; font-weight:700; font-size:44px; line-height:1.05;
  margin:0 0 4px; letter-spacing:2px; text-shadow:2px 2px 0 #1A1208; }
.bf-end-title.victory { color:#E6C04A; }
.bf-end-title.defeat { color:#C05B4E; }
.bf-end-sub { font-size:14px; color:#B99A6B; margin:0 0 16px; }
.bf-end-time { font-family:"Alegreya Sans","Trebuchet MS",sans-serif; font-variant-numeric:tabular-nums; font-size:24px; color:#EFDDB5; margin:0 0 14px; }
.bf-end-stats { display:grid; grid-template-columns:1fr auto; gap:3px 24px; text-align:left;
  font-size:15px; margin:0 auto 18px; max-width:390px; }
.bf-end-stats h3 { grid-column:1 / -1; margin:9px 0 2px; padding-bottom:3px; color:#DABE8D;
  border-bottom:1px solid #64492B; font-size:14px; font-weight:500; letter-spacing:1px; text-transform:uppercase; }
.bf-end-stats h3:first-child { margin-top:0; }
.bf-end-stats .bf-num { font-family:"Alegreya Sans","Trebuchet MS",sans-serif; font-variant-numeric:tabular-nums; font-size:16px; text-align:right; color:#E6C04A; }
.bf-end-btn { display:block; width:100%; margin:8px 0 0; padding:11px 0; font-family:inherit; font-size:18px;
  color:#1A1208; background:linear-gradient(#EFDDB5,#DABE8D); border:1px solid #B99A6B; border-radius:4px;
  box-shadow:0 2px 0 #8A6414; cursor:pointer; letter-spacing:1px; }
.bf-end-btn:hover { background:linear-gradient(#F7EBCB,#E4CBA0); }
.bf-end-btn:active { transform:translateY(1px); box-shadow:0 1px 0 #8A6414; }
.bf-end-btn.ghost { background:none; color:#DABE8D; border-color:#64492B; box-shadow:none; }
`;

const AGE_FLAVOR: Record<string, string> = {
  'Feudal Age': 'Your banners rise over new workshops.',
  'Castle Age': 'Stone keeps and knights answer your call.',
  'Imperial Age': 'The full might of your realm is unleashed.',
};

export class Overlays {
  private el: HTMLDivElement;
  private ageBanner: HTMLDivElement;
  private ageTitle: HTMLHeadingElement;
  private ageSub: HTMLParagraphElement;
  private ageTimer: ReturnType<typeof setTimeout> | null = null;
  private wonderStrip: HTMLDivElement;
  private attackPulse: HTMLDivElement;
  private endScreen: HTMLDivElement;
  private endShown = false;

  constructor(root: HTMLElement) {
    if (!document.getElementById('bf-overlay-style')) {
      const style = document.createElement('style');
      style.id = 'bf-overlay-style';
      style.textContent = OVERLAY_CSS;
      document.head.appendChild(style);
    }
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    root.appendChild(this.el);

    this.ageBanner = document.createElement('div');
    this.ageBanner.className = 'bf-agebanner';
    this.ageTitle = document.createElement('h2');
    this.ageSub = document.createElement('p');
    this.ageBanner.append(this.ageTitle, this.ageSub);
    this.el.appendChild(this.ageBanner);

    this.wonderStrip = document.createElement('div');
    this.wonderStrip.className = 'bf-wonder';
    this.el.appendChild(this.wonderStrip);

    this.attackPulse = document.createElement('div');
    this.attackPulse.className = 'bf-attackpulse';
    this.el.appendChild(this.attackPulse);

    this.endScreen = document.createElement('div');
    this.endScreen.className = 'bf-end';
    this.el.appendChild(this.endScreen);
  }

  destroy(): void {
    this.el.remove();
  }

  /** Transient celebration banner ("Castle Age!"), ~4.5 s. */
  showAgeBanner(ageLabel: string): void {
    this.ageTitle.textContent = `${ageLabel}!`;
    this.ageSub.textContent = AGE_FLAVOR[ageLabel] ?? 'A new age dawns.';
    this.ageBanner.classList.add('show');
    if (this.ageTimer) clearTimeout(this.ageTimer);
    this.ageTimer = setTimeout(() => this.ageBanner.classList.remove('show'), 4500);
  }

  /** Persistent strip while a completed wonder stands (null hides it). */
  setWonderBanner(html: { owner: string; timeText: string } | null): void {
    if (!html) {
      this.wonderStrip.classList.remove('show');
      return;
    }
    this.wonderStrip.replaceChildren();
    this.wonderStrip.appendChild(document.createTextNode(`${html.owner}'s Wonder stands — `));
    const t = document.createElement('span');
    t.className = 'bf-num';
    t.textContent = html.timeText;
    this.wonderStrip.appendChild(t);
    this.wonderStrip.classList.add('show');
  }

  /** Screen-edge red pulse for underAttack (sim already throttles the event). */
  pulseUnderAttack(): void {
    this.attackPulse.classList.remove('show');
    // force a reflow so re-adding the class restarts the CSS animation
    void this.attackPulse.offsetWidth;
    this.attackPulse.classList.add('show');
  }

  get endScreenShown(): boolean {
    return this.endShown;
  }

  /**
   * Victory/defeat end screen. Shown once. Buttons are caller-supplied so the
   * practice flow (Return to Title / Continue watching) and the campaign flow
   * (Continue / Retry / Return to scenarios) share one panel. A button with
   * dismiss:true closes the overlay instead of leaving the game.
   */
  showEndScreen(
    victory: boolean,
    summary: MatchSummary,
    opts: {
      title?: string;
      sub?: string;
      buttons: Array<{ label: string; ghost?: boolean; dismiss?: boolean; onClick?: () => void }>;
    },
  ): void {
    if (this.endShown) return;
    this.endShown = true;
    this.endScreen.replaceChildren();
    const panel = document.createElement('div');
    panel.className = 'bf-end-panel';

    const title = document.createElement('h2');
    title.className = `bf-end-title ${victory ? 'victory' : 'defeat'}`;
    title.textContent = opts.title ?? (victory ? 'Victory!' : 'Defeat');
    const sub = document.createElement('p');
    sub.className = 'bf-end-sub';
    sub.textContent = opts.sub ?? (victory
      ? 'Your banner flies over the field.'
      : 'Your banner has fallen.');
    const time = document.createElement('p');
    time.className = 'bf-end-time';
    time.textContent = `Match time ${summary.timeText}`;

    const stats = document.createElement('div');
    stats.className = 'bf-end-stats';
    const section = (label: string): void => {
      const h = document.createElement('h3');
      h.textContent = label;
      stats.appendChild(h);
    };
    const row = (label: string, value: string): void => {
      const l = document.createElement('span');
      l.textContent = label;
      const v = document.createElement('span');
      v.className = 'bf-num';
      v.textContent = value;
      stats.append(l, v);
    };
    const count = (value: number): string => Math.round(value).toLocaleString('en-US');

    section('Economy');
    row('Food gathered', count(summary.tallies.foodGathered));
    row('Wood gathered', count(summary.tallies.woodGathered));
    row('Gold gathered', count(summary.tallies.goldGathered));
    row('Stone gathered', count(summary.tallies.stoneGathered));

    section('Realm');
    row('Final age', AGE_LABEL[summary.age] ?? summary.age);
    row('Peak population', count(summary.tallies.peakPopulation));
    row('Units trained', count(summary.tallies.unitsTrained));
    row('Buildings completed', count(summary.tallies.buildingsBuilt));
    row('Technologies', count(summary.techsResearched));

    section('Battle');
    row('Enemies slain', count(summary.tallies.unitsKilled));
    row('Buildings razed', count(summary.tallies.buildingsRazed));
    row('Units lost', count(summary.tallies.unitsLost));
    row('Buildings lost', count(summary.tallies.buildingsLost));
    row('Units standing', String(summary.unitsAlive));
    row('Buildings standing', String(summary.buildingsAlive));

    panel.append(title, sub, time, stats);
    for (const b of opts.buttons) {
      const btn = document.createElement('button');
      btn.className = `bf-end-btn${b.ghost ? ' ghost' : ''}`;
      btn.textContent = b.label;
      btn.addEventListener('click', () => {
        if (b.dismiss) this.endScreen.classList.remove('show');
        b.onClick?.();
      });
      panel.appendChild(btn);
    }
    this.endScreen.appendChild(panel);
    this.endScreen.classList.add('show');
  }
}
