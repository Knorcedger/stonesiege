// DOM HUD (ARCHITECTURE: HUD is DOM for crisp text + native touch targets).
// Top resource/pop/age bar (with idle-villager/idle-military cycle badges),
// selection info panel, context-sensitive command card (train / build /
// military verbs) with cost tooltips + queue progress, control-group chips,
// undo toast (~2 s), pause overlay, placement confirm/cancel.
// Styling follows ART_BIBLE §8 (dark wood + parchment + gold).
// Fonts: Jacquard 12 = display/headers only; Pixelify Sans = body text; all
// NUMERALS use VT323 (.bf-num) — Pixelify's 2/5 glyphs read as S and make
// HP/resource/pop counts ambiguous at a glance. Current/max counters (pop, HP)
// go through formatRatio: VT323's S-shaped '5' merges with an unspaced slash.
// Every tappable control has a ≥44px hit area (mobile-first): visually small
// buttons get an invisible centered ::after hit-area expansion.

import { type Entity, type EntityId, type GameState, type PlayerId, type ResourceType } from '@bf/sim/types';
import { gameData } from '@bf/data';
import type { GameAssets } from '../assets';
import type { IdleCategory } from '../selectionTools';
import {
  ageUpButton, buildMenuButtons, farmReseedButton, garrisonPanel, hasActiveRally,
  millAutoReseedButton, queueChipModel, researchMenuButtons, trainMenuButtons,
  unitVerbButtons, WAVE2_REASON,
  type ArmedVerb, type CardButtonModel, type PlayerCardView,
} from './cardModel';
import { marketPanelRows, TRADE_LOT, type TradeResource } from './marketModel';
import { PENDING_COMMAND_KINDS } from '@bf/sim/commands';
import { TRAIN_QUEUE_CAP } from '@bf/sim/production';
import { formatRatio } from './format';
import { CHIPS_HEIGHT_PX, CHIPS_NARROW_MAX_PX, CHIPS_TOP_NARROW_PX, CHIPS_TOP_PX } from './layout';
import { buildSettingsControls } from '../settingsUi';

export interface HudHost {
  assets: GameAssets;
  humanPlayer: PlayerId;
  getState(): GameState;
  getSelection(): Entity[];
  deselect(): void;
  trainUnit(buildingId: EntityId, defId: string): void;
  cancelTrain(buildingId: EntityId, index: number): void;
  researchTech(buildingId: EntityId, techId: string): void;
  cancelResearch(buildingId: EntityId): void;
  /** Ungarrison every occupant of a building OR a ram (unit host). */
  ungarrisonAll(buildingId: EntityId): void;
  /** Clear a production building's rally (GDD: "tap the flag control to clear"). */
  clearRally(buildingId: EntityId): void;
  /** Delete an own building (deleteEntity command — refunds queue + unbuilt fraction). */
  deleteBuilding(buildingId: EntityId): void;
  marketTrade(sell: ResourceType, buy: ResourceType, amount: number): void;
  reseedFarm(farmId: EntityId): void;
  /** Mill auto-reseed queue toggle (queueReseed command; state in PlayerState.autoReseed). */
  setAutoReseed(enabled: boolean): void;
  startPlacement(defId: string): void;
  confirmPlacement(): void;
  cancelPlacement(): void;
  getPlacement(): { defId: string; valid: boolean; affordable: boolean } | null;
  stopSelection(): void;
  /** Trebuchets: pack (fold to move) or unpack (deploy to fire) the selected trebs. */
  packSelection(pack: boolean): void;
  /** Toggle an armed "next tap = target" verb (attack-move / garrison / convert / heal). */
  armVerb(verb: ArmedVerb): void;
  getArmedVerb(): ArmedVerb | null;
  togglePause(): void;
  isPaused(): boolean;
  resumeGame(): void;
  resign(): void;
  /** Audible preview for the pause-overlay volume sliders (uiTap on release). */
  playUiSound(): void;
  /** Back to the title screen — the pause overlay's exit while spectating a finished match. */
  returnToTitle(): void;
  /** Idle-unit badges (GDD: touch answer to AoE2's `.` hotkey). */
  getIdleCounts(): Record<IdleCategory, number>;
  cycleIdle(cat: IdleCategory): void;
  /** Control groups (GDD: saved-selection chips). */
  getGroupCounts(): number[];
  saveGroup(index: number): boolean;
  selectGroup(index: number): void;
}

const RESOURCES: ResourceType[] = ['food', 'wood', 'gold', 'stone'];
const AGE_LABEL: Record<string, string> = {
  dark: 'Dark Age', feudal: 'Feudal Age', castle: 'Castle Age', imperial: 'Imperial Age',
};

/** Command-card cell metrics — must match the CSS (.bf-grid/.bf-cmdbtn/.bf-qitem: border-box 44px cells, 4px gaps). */
const CARD_CELL = 44;
const CARD_GAP = 4;
const CARD_COLS = 5;
/**
 * Full production-queue block height (TRAIN_QUEUE_CAP chips wrapped at 5/row),
 * reserved up front for any building that can queue: the card is bottom-anchored,
 * so a queue that grows a row would otherwise push the train buttons up ~44px
 * mid-tap and a spamming thumb would land on a single-tap-cancel queue chip.
 */
const QUEUE_ROWS = Math.ceil(TRAIN_QUEUE_CAP / CARD_COLS);
const QUEUE_BLOCK_PX = `${QUEUE_ROWS * CARD_CELL + (QUEUE_ROWS - 1) * CARD_GAP}px`;

const HUD_CSS = `
.bf-hud { position:absolute; inset:0; pointer-events:none; font-family:"Pixelify Sans","VT323",monospace; color:#EFDDB5; user-select:none; -webkit-user-select:none; }
.bf-num { font-family:"VT323",monospace; } /* numerals: Pixelify's 2/5 read as S — VT323 digits are unambiguous */
.bf-panel { background:linear-gradient(#3a2a18,#2C1F12); border:1px solid #1A1208; box-shadow:0 0 0 1px #8A6414 inset, 0 0 0 2px #64492B inset; border-radius:4px; }
.bf-top { position:absolute; top:6px; left:6px; right:6px; height:34px; display:flex; align-items:center; gap:12px; padding:0 10px; pointer-events:auto; }
.bf-res { display:flex; align-items:center; gap:5px; font-size:16px; }
.bf-res canvas { width:22px; height:22px; image-rendering:pixelated; }
.bf-age { margin-left:auto; font-size:16px; color:#E6C04A; letter-spacing:1px; }
.bf-btn { position:relative; pointer-events:auto; background:#46331F; color:#EFDDB5; border:1px solid #8A6414; border-radius:3px; font-family:inherit; font-size:14px; padding:3px 10px; cursor:pointer; }
.bf-btn:active { transform:translate(1px,1px); }
.bf-btn:disabled { color:#8a8a8a; border-color:#5a5a5a; cursor:default; }
/* ≥44px touch targets (mobile-first): invisible centered hit-area expansion keeps visuals small */
.bf-btn::after, .bf-idle::after, .bf-mbtn::after { content:""; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:max(100%,44px); height:max(100%,44px); }
.bf-idle { position:relative; display:flex; align-items:center; gap:3px; background:#46331F; border:1px solid #8A6414; border-radius:3px; padding:1px 5px; cursor:pointer; pointer-events:auto; color:#EFDDB5; font-family:inherit; }
.bf-idle canvas { width:22px; height:22px; image-rendering:pixelated; }
.bf-idle:disabled { opacity:0.4; cursor:default; }
.bf-idlecount { font-family:"VT323",monospace; font-size:18px; line-height:1; color:#E6C04A; min-width:11px; text-align:center; }
.bf-selpanel { position:absolute; left:6px; bottom:172px; width:172px; padding:8px; pointer-events:auto; display:none; }
.bf-selpanel.show { display:block; }
.bf-selrow { display:flex; gap:8px; align-items:center; }
.bf-selrow canvas { width:40px; height:40px; image-rendering:pixelated; border:1px solid #8A6414; }
.bf-selname { font-size:15px; flex:1; }
.bf-selhp { font-size:14px; color:#DABE8D; }
.bf-x { position:absolute; top:2px; right:2px; width:22px; height:22px; padding:0; line-height:18px; font-size:14px; }
.bf-card { position:absolute; right:6px; bottom:6px; width:246px; padding:8px; pointer-events:auto; display:none; }
.bf-card.show { display:block; }
.bf-cardtitle { font-size:13px; color:#C29422; margin:0 0 6px 2px; letter-spacing:1px; }
.bf-grid { display:grid; grid-template-columns:repeat(5,44px); gap:4px; }
/* border-box: 44px means 44px INCLUDING border+padding, so buttons fill the grid's
   44px tracks exactly and the 4px gaps stay real (content-box made them 48px,
   overflowing the tracks and collapsing the gaps) */
.bf-cmdbtn { position:relative; box-sizing:border-box; width:44px; height:44px; padding:1px; background:#2C1F12; border:1px solid #8A6414; border-radius:3px; cursor:pointer; pointer-events:auto; }
.bf-cmdbtn canvas { width:40px; height:40px; image-rendering:pixelated; display:block; }
/* disabled look via class (NOT the disabled attribute): a tap must still show the reason tip */
.bf-cmdbtn:disabled, .bf-cmdbtn.disabled { border-color:#5a5a5a; opacity:0.9; }
.bf-cmdbtn:disabled canvas, .bf-cmdbtn.disabled canvas { filter:grayscale(1) brightness(0.55); }
.bf-cmdbtn.active { border-color:#E6C04A; box-shadow:0 0 0 1px #E6C04A; }
/* non-blocking warning badge (housed): the order still queues — never grays the button */
.bf-cmdbadge { position:absolute; top:0; right:2px; font-size:13px; line-height:1; color:#E6C04A; text-shadow:1px 1px 0 #1A1208, -1px 1px 0 #1A1208, 1px -1px 0 #1A1208, -1px -1px 0 #1A1208; pointer-events:none; }
/* wrap: TRAIN_QUEUE_CAP is 15 — 3 rows of 5 border-box 44px chips fit the 246px
   card. min-height is set from JS (QUEUE_BLOCK_PX) for buildings that can queue:
   the FULL block is reserved up front so chips appearing/completing never move
   the bottom-anchored card's train buttons under the player's thumb */
.bf-queue { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
.bf-queue:empty { margin-top:0; }
.bf-qitem { position:relative; box-sizing:border-box; flex-shrink:0; width:44px; height:44px; padding:1px; border:1px solid #64492B; background:#2C1F12; cursor:pointer; pointer-events:auto; } /* 44px hard floor: cancel-a-unit mis-taps are costly */
.bf-qitem canvas { width:40px; height:40px; image-rendering:pixelated; display:block; }
.bf-qprog { position:absolute; left:0; bottom:0; height:3px; background:#C29422; }
.bf-tip { position:absolute; right:6px; bottom:200px; max-width:250px; padding:6px 9px; font-size:14px; color:#1A1208; background:#DABE8D; border:1px solid #B99A6B; border-radius:3px; display:none; pointer-events:none; }
.bf-note { font-size:13px; color:#DABE8D; margin:5px 2px 0; min-height:0; }
.bf-note:empty { display:none; }
.bf-market { display:none; flex-direction:column; gap:6px; margin-top:6px; }
.bf-market.show { display:flex; }
.bf-mrow { display:flex; align-items:center; gap:6px; }
.bf-mrow canvas { width:22px; height:22px; image-rendering:pixelated; }
/* native ≥44px height (touch-target contract): trades mutate the stockpile
   instantly, so a thumb tap must never land on the adjacent resource row */
.bf-mbtn { position:relative; box-sizing:border-box; flex:1; min-height:44px; pointer-events:auto; background:#46331F; color:#EFDDB5; border:1px solid #8A6414; border-radius:3px; font-family:"VT323",monospace; font-size:15px; padding:4px 2px; cursor:pointer; }
.bf-mbtn.disabled { color:#8a8a8a; border-color:#5a5a5a; }
.bf-garrison { display:none; margin-top:6px; }
.bf-garrison.show { display:block; }
.bf-goccrow { display:flex; gap:3px; flex-wrap:wrap; margin:4px 0 6px; }
.bf-goccrow canvas { width:24px; height:24px; image-rendering:pixelated; border:1px solid #64492B; }
.bf-toast { position:absolute; left:50%; bottom:120px; transform:translateX(-50%); padding:6px 10px; display:none; align-items:center; gap:10px; font-size:14px; pointer-events:auto; }
.bf-toast.show { display:flex; }
/* scrollable overlay + margin:auto box: the settings block can exceed short
   (landscape-phone) viewports — flex centering alone would clip the top */
.bf-pause { position:absolute; inset:0; background:rgba(10,8,5,0.72); display:none; overflow-y:auto; pointer-events:auto; z-index:40; }
.bf-pause.show { display:flex; }
.bf-pausebox { margin:auto; display:flex; align-items:center; flex-direction:column; gap:14px; padding:24px 16px; }
.bf-pause h2 { font-family:"Jacquard 12","Pixelify Sans",monospace; font-size:42px; color:#E6C04A; margin:0; }
/* in-match settings (same controls as the menu screen — see settingsUi.ts) */
.bf-pausesettings { width:min(320px, 88vw); text-align:left; }
.bf-place { position:absolute; left:50%; bottom:14px; transform:translateX(-50%); padding:8px 10px; display:none; gap:10px; pointer-events:auto; }
.bf-place.show { display:flex; }
/* top-center: the only HUD region that never collides with minimap (168px, bottom-left),
   command card (bottom-right) or the placement bar (bottom-center) on phone widths.
   Geometry comes from hud/layout.ts — the message banner and objectives panel
   position themselves below/around the strip from the same constants. */
.bf-chips { position:absolute; left:50%; top:${CHIPS_TOP_PX}px; transform:translateX(-50%); display:flex; gap:6px; pointer-events:auto; }
.bf-chips.hide { display:none; }
.bf-chip { position:relative; width:${CHIPS_HEIGHT_PX}px; height:${CHIPS_HEIGHT_PX}px; padding:0; background:#DABE8D; color:#1A1208; border:1px solid #B99A6B; border-radius:3px; box-shadow:0 0 0 1px #8A6414 inset; font-family:"VT323",monospace; font-size:22px; line-height:1; cursor:pointer; pointer-events:auto; }
.bf-chip.empty { background:#3a2a18; color:#B99A6B; border-color:#64492B; box-shadow:none; }
.bf-chipcount { position:absolute; right:3px; bottom:1px; font-size:14px; color:#64492B; }
/* ---- narrow widths (portrait phones): compress the top bar. It may wrap to a
   second row, but every control — the pause button above all — stays on-screen
   and tappable. Group chips drop below the (possibly two-row) bar. ---- */
@media (max-width: ${CHIPS_NARROW_MAX_PX}px) {
  .bf-top { flex-wrap:wrap; height:auto; min-height:34px; gap:2px 7px; padding:3px 8px; }
  .bf-res { font-size:14px; gap:2px; }
  .bf-res canvas { width:18px; height:18px; }
  .bf-poplabel { display:none; } /* numerals carry the meaning on phones */
  .bf-age { font-size:13px; letter-spacing:0; }
  .bf-chips { top:${CHIPS_TOP_NARROW_PX}px; }
}
/* The 168px minimap and the 246px command card cannot share one <=480px row —
   shrink the minimap so the card's train/build buttons are never covered, and
   lift the selection panel clear of the card's tallest layout (~190px). */
@media (max-width: 480px) {
  .bf-mini canvas { width:112px !important; height:112px !important; image-rendering:pixelated; }
  .bf-selpanel { bottom:200px; }
}
`;

function costText(cost: Partial<Record<ResourceType, number>>): string {
  const parts: string[] = [];
  for (const r of RESOURCES) {
    const v = cost[r];
    if (v) parts.push(`${v} ${r}`);
  }
  return parts.join(', ') || 'free';
}

export class Hud {
  private root: HTMLElement;
  private host: HudHost;
  private el: HTMLDivElement;
  private resSpans = new Map<ResourceType, HTMLSpanElement>();
  private popSpan!: HTMLSpanElement;
  private ageSpan!: HTMLSpanElement;
  private pauseBtn!: HTMLButtonElement;
  private selPanel!: HTMLDivElement;
  private selIcon!: HTMLDivElement;
  private selName!: HTMLDivElement;
  private selHp!: HTMLDivElement;
  private card!: HTMLDivElement;
  private cardTitle!: HTMLDivElement;
  private cardGrid!: HTMLDivElement;
  private queueRow!: HTMLDivElement;
  private tip!: HTMLDivElement;
  private toast!: HTMLDivElement;
  private toastLabel!: HTMLSpanElement;
  private toastUndoBtn!: HTMLButtonElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private toastUndoFn: (() => void) | null = null;
  private pauseOverlay!: HTMLDivElement;
  private placeBar!: HTMLDivElement;
  private placeConfirm!: HTMLButtonElement;
  private placeLabel!: HTMLSpanElement;
  private idleBtns = new Map<IdleCategory, { btn: HTMLButtonElement; count: HTMLSpanElement }>();
  private chipStrip!: HTMLDivElement;
  private chipEls: Array<{ btn: HTMLButtonElement; count: HTMLSpanElement }> = [];
  private lastCardKey = '';
  private queueProgressEls: Array<{ el: HTMLDivElement; buildingId: EntityId; index: number }> = [];
  private utilRow!: HTMLDivElement;
  private noteRow!: HTMLDivElement;
  private marketBox!: HTMLDivElement;
  private garrisonBox!: HTMLDivElement;
  private resignArmed = false;
  private resignBtn!: HTMLButtonElement;
  /** Spectating a finished match: Resign becomes Return to Title (sim drops all commands). */
  private matchFinished = false;

  /** The minimap panel mounts here (bottom-left). */
  readonly minimapSlot: HTMLDivElement;

  constructor(root: HTMLElement, host: HudHost) {
    this.root = root;
    this.host = host;
    if (!document.getElementById('bf-hud-style')) {
      const style = document.createElement('style');
      style.id = 'bf-hud-style';
      style.textContent = HUD_CSS;
      document.head.appendChild(style);
    }
    this.el = document.createElement('div');
    this.el.className = 'bf-hud';
    root.appendChild(this.el);

    this.buildTopBar();
    this.buildSelectionPanel();
    this.buildCard();
    this.buildToast();
    this.buildPauseOverlay();
    this.buildPlacementBar();
    this.buildGroupChips();

    this.minimapSlot = document.createElement('div');
    this.minimapSlot.className = 'bf-mini';
    this.minimapSlot.style.cssText = 'position:absolute;left:6px;bottom:6px;pointer-events:auto;';
    this.el.appendChild(this.minimapSlot);
  }

  destroy(): void {
    this.el.remove();
  }

  // ------------------------------------------------------------------ update

  update(): void {
    const state = this.host.getState();
    const p = state.players[this.host.humanPlayer];
    if (p) {
      for (const r of RESOURCES) {
        const span = this.resSpans.get(r);
        if (span) span.textContent = String(Math.floor(p.stockpile[r] ?? 0));
      }
      // formatRatio, NOT `${pop}/${popCap}`: an unspaced '/5' merges into '$' in VT323
      this.popSpan.textContent = formatRatio(p.pop, p.popCap);
      this.ageSpan.textContent = AGE_LABEL[p.age] ?? p.age;
    }
    this.pauseBtn.textContent = this.host.isPaused() ? '▶' : 'II';
    this.pauseOverlay.classList.toggle('show', this.host.isPaused());
    // "Continue watching" spectating: applyCommands drops everything once
    // state.finished, so Resign would silently no-op — swap it for the only
    // meaningful action so the player is never stranded without a way out.
    if (state.finished !== this.matchFinished) {
      this.matchFinished = state.finished;
      this.resetResign();
    }
    if (!this.host.isPaused() && this.resignArmed) this.resetResign();
    this.updateIdleButtons();
    this.updateGroupChips();
    this.updateSelectionPanel();
    this.updateCard(state);
    this.updatePlacementBar();
  }

  showUndoToast(label: string, onUndo: (() => void) | null): void {
    this.toastLabel.textContent = label;
    this.toastUndoFn = onUndo;
    this.toastUndoBtn.style.display = onUndo ? '' : 'none';
    this.toast.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove('show'), 2000);
  }

  // ------------------------------------------------------------------ builders

  private buildTopBar(): void {
    const bar = document.createElement('div');
    bar.className = 'bf-panel bf-top';
    for (const r of RESOURCES) {
      const box = document.createElement('div');
      box.className = 'bf-res';
      box.appendChild(this.host.assets.getIconCanvas(`icon/res/${r}`));
      const span = document.createElement('span');
      span.className = 'bf-num';
      span.textContent = '0';
      box.appendChild(span);
      this.resSpans.set(r, span);
      bar.appendChild(box);
    }
    const pop = document.createElement('div');
    pop.className = 'bf-res';
    const popLabel = document.createElement('span');
    popLabel.className = 'bf-poplabel';
    popLabel.textContent = 'Pop ';
    pop.appendChild(popLabel);
    this.popSpan = document.createElement('span');
    this.popSpan.className = 'bf-num';
    pop.appendChild(this.popSpan);
    bar.appendChild(pop);

    // Idle-unit cycle badges (GDD: the touch answer to AoE2's `.` hotkey)
    this.addIdleButton(bar, 'villager', 'icon/villager', 'Idle villagers — tap to cycle');
    this.addIdleButton(bar, 'military', 'icon/militia', 'Idle military — tap to cycle');

    this.ageSpan = document.createElement('span');
    this.ageSpan.className = 'bf-age';
    bar.appendChild(this.ageSpan);

    this.pauseBtn = document.createElement('button');
    this.pauseBtn.className = 'bf-btn';
    this.pauseBtn.textContent = 'II';
    this.pauseBtn.addEventListener('click', () => this.host.togglePause());
    bar.appendChild(this.pauseBtn);
    this.el.appendChild(bar);
  }

  private addIdleButton(bar: HTMLElement, cat: IdleCategory, icon: string, title: string): void {
    const btn = document.createElement('button');
    btn.className = 'bf-idle';
    btn.title = title;
    btn.appendChild(this.host.assets.getIconCanvas(icon));
    const count = document.createElement('span');
    count.className = 'bf-idlecount';
    count.textContent = '0';
    btn.appendChild(count);
    btn.addEventListener('click', () => this.host.cycleIdle(cat));
    bar.appendChild(btn);
    this.idleBtns.set(cat, { btn, count });
  }

  private updateIdleButtons(): void {
    const counts = this.host.getIdleCounts();
    for (const [cat, ui] of this.idleBtns) {
      const n = counts[cat];
      const text = String(n);
      if (ui.count.textContent !== text) ui.count.textContent = text;
      ui.btn.disabled = n === 0;
    }
  }

  private buildSelectionPanel(): void {
    this.selPanel = document.createElement('div');
    this.selPanel.className = 'bf-panel bf-selpanel';
    const row = document.createElement('div');
    row.className = 'bf-selrow';
    this.selIcon = document.createElement('div');
    row.appendChild(this.selIcon);
    const col = document.createElement('div');
    col.style.flex = '1';
    this.selName = document.createElement('div');
    this.selName.className = 'bf-selname';
    this.selHp = document.createElement('div');
    this.selHp.className = 'bf-selhp bf-num';
    col.appendChild(this.selName);
    col.appendChild(this.selHp);
    row.appendChild(col);
    this.selPanel.appendChild(row);
    const x = document.createElement('button');
    x.className = 'bf-btn bf-x';
    x.textContent = '✕';
    x.title = 'Deselect';
    x.addEventListener('click', () => this.host.deselect());
    this.selPanel.appendChild(x);
    this.el.appendChild(this.selPanel);
  }

  private buildCard(): void {
    this.card = document.createElement('div');
    this.card.className = 'bf-panel bf-card';
    this.cardTitle = document.createElement('div');
    this.cardTitle.className = 'bf-cardtitle';
    this.cardGrid = document.createElement('div');
    this.cardGrid.className = 'bf-grid';
    this.noteRow = document.createElement('div');
    this.noteRow.className = 'bf-note bf-num'; // age-up requirement counters etc.
    this.marketBox = document.createElement('div');
    this.marketBox.className = 'bf-market';
    this.garrisonBox = document.createElement('div');
    this.garrisonBox.className = 'bf-garrison';
    this.queueRow = document.createElement('div');
    this.queueRow.className = 'bf-queue';
    this.utilRow = document.createElement('div'); // delete-building etc.
    this.card.appendChild(this.cardTitle);
    this.card.appendChild(this.cardGrid);
    this.card.appendChild(this.noteRow);
    this.card.appendChild(this.marketBox);
    this.card.appendChild(this.garrisonBox);
    this.card.appendChild(this.queueRow);
    this.card.appendChild(this.utilRow);
    this.el.appendChild(this.card);

    this.tip = document.createElement('div');
    this.tip.className = 'bf-tip bf-num'; // cost/time numerals dominate tooltips
    this.el.appendChild(this.tip);
  }

  private buildToast(): void {
    this.toast = document.createElement('div');
    this.toast.className = 'bf-panel bf-toast';
    this.toastLabel = document.createElement('span');
    this.toastLabel.className = 'bf-num'; // toasts carry counts ("Selected all … (12)")
    this.toast.appendChild(this.toastLabel);
    this.toastUndoBtn = document.createElement('button');
    this.toastUndoBtn.className = 'bf-btn';
    this.toastUndoBtn.textContent = 'Undo';
    this.toastUndoBtn.addEventListener('click', () => {
      this.toastUndoFn?.();
      this.toastUndoFn = null;
      this.toast.classList.remove('show');
    });
    this.toast.appendChild(this.toastUndoBtn);
    this.el.appendChild(this.toast);
  }

  private buildPauseOverlay(): void {
    this.pauseOverlay = document.createElement('div');
    this.pauseOverlay.className = 'bf-pause';
    const box = document.createElement('div');
    box.className = 'bf-pausebox';
    const h = document.createElement('h2');
    h.textContent = 'Paused';
    const btn = document.createElement('button');
    btn.className = 'bf-btn';
    btn.style.fontSize = '18px';
    btn.textContent = 'Resume';
    btn.addEventListener('click', () => this.host.resumeGame());
    // In-match settings (shared builder with the menu screen): volume, camera
    // speed and HP bars were otherwise only reachable by resigning the match.
    // Slider release plays a uiTap so the player HEARS the level they set.
    const settings = document.createElement('div');
    settings.className = 'bf-pausesettings';
    buildSettingsControls(settings, { onSliderRelease: () => this.host.playUiSound() });
    // Resign (GDD: a human can resign at any time) — two taps to confirm,
    // because a mis-tap here forfeits the whole match.
    this.resignBtn = document.createElement('button');
    this.resignBtn.className = 'bf-btn';
    this.resignBtn.style.cssText = 'font-size:16px;color:#DABE8D;';
    this.resignBtn.textContent = 'Resign';
    this.resignBtn.addEventListener('click', () => {
      if (this.matchFinished) {
        // post-match spectating: the sim would drop a resign — leave instead
        this.host.returnToTitle();
        return;
      }
      if (!this.resignArmed) {
        this.resignArmed = true;
        this.resignBtn.textContent = 'Tap again to resign';
        this.resignBtn.style.color = '#C05B4E';
        return;
      }
      this.resetResign();
      this.host.resign();
    });
    box.append(h, btn, settings, this.resignBtn);
    this.pauseOverlay.appendChild(box);
    this.pauseOverlay.addEventListener('click', (e) => {
      if (e.target === this.pauseOverlay) this.host.resumeGame();
    });
    this.el.appendChild(this.pauseOverlay);
  }

  private resetResign(): void {
    this.resignArmed = false;
    this.resignBtn.textContent = this.matchFinished ? 'Return to Title' : 'Resign';
    this.resignBtn.style.color = '#DABE8D';
  }

  /**
   * Control-group chips (GDD Mobile UX): long-press an empty chip to save the
   * current selection, long-press an occupied chip to overwrite it, tap to
   * reselect, tap the active group again to center the camera on it.
   */
  private buildGroupChips(): void {
    const LONG_PRESS_MS = 450;
    this.chipStrip = document.createElement('div');
    this.chipStrip.className = 'bf-chips';
    const n = this.host.getGroupCounts().length;
    for (let i = 0; i < n; i++) {
      const btn = document.createElement('button');
      btn.className = 'bf-chip empty';
      btn.appendChild(document.createTextNode(String(i + 1)));
      const count = document.createElement('span');
      count.className = 'bf-chipcount bf-num';
      btn.appendChild(count);
      let timer: ReturnType<typeof setTimeout> | null = null;
      let longFired = false;
      const cancelTimer = (): void => {
        if (timer) clearTimeout(timer);
        timer = null;
      };
      btn.addEventListener('pointerdown', () => {
        longFired = false;
        cancelTimer();
        timer = setTimeout(() => {
          longFired = true;
          const saved = this.host.saveGroup(i);
          this.showUndoToast(saved ? `Group ${i + 1} saved` : 'Select units to save a group', null);
        }, LONG_PRESS_MS);
      });
      btn.addEventListener('pointerup', () => {
        cancelTimer();
        if (!longFired) this.host.selectGroup(i);
      });
      btn.addEventListener('pointerleave', cancelTimer);
      btn.addEventListener('pointercancel', cancelTimer);
      this.chipStrip.appendChild(btn);
      this.chipEls.push({ btn, count });
    }
    this.el.appendChild(this.chipStrip);
  }

  private updateGroupChips(): void {
    // hide while placing: placement is a deliberate commit/abort moment (GDD) —
    // no selection-switching affordances competing with confirm/cancel
    this.chipStrip.classList.toggle('hide', this.host.getPlacement() !== null);
    const counts = this.host.getGroupCounts();
    this.chipEls.forEach((chip, i) => {
      const n = counts[i] ?? 0;
      chip.btn.classList.toggle('empty', n === 0);
      const text = n > 0 ? String(n) : '';
      if (chip.count.textContent !== text) chip.count.textContent = text;
      chip.btn.title = n > 0
        ? `Group ${i + 1} (${n}) — tap: select, tap again: center camera, long-press: overwrite`
        : `Group ${i + 1} — long-press with a selection to save`;
    });
  }

  private buildPlacementBar(): void {
    this.placeBar = document.createElement('div');
    this.placeBar.className = 'bf-panel bf-place';
    this.placeLabel = document.createElement('span');
    this.placeLabel.className = 'bf-num'; // "House — 25 wood": the cost numeral must be legible
    this.placeLabel.style.cssText = 'font-size:16px;align-self:center;';
    this.placeConfirm = document.createElement('button');
    this.placeConfirm.className = 'bf-btn';
    this.placeConfirm.textContent = 'Build here';
    this.placeConfirm.addEventListener('click', () => this.host.confirmPlacement());
    const cancel = document.createElement('button');
    cancel.className = 'bf-btn';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => this.host.cancelPlacement());
    this.placeBar.appendChild(this.placeLabel);
    this.placeBar.appendChild(this.placeConfirm);
    this.placeBar.appendChild(cancel);
    this.el.appendChild(this.placeBar);
  }

  // ------------------------------------------------------------------ dynamic

  private updateSelectionPanel(): void {
    const sel = this.host.getSelection();
    if (sel.length === 0) {
      this.selPanel.classList.remove('show');
      return;
    }
    this.selPanel.classList.add('show');
    const first = sel[0];
    const def = gameData.units[first.defId] ?? gameData.buildings[first.defId] ?? gameData.resources[first.defId];
    const name = def?.name ?? first.defId;
    this.selName.textContent = sel.length > 1 ? `${name} ×${sel.length}` : name;
    this.selHp.textContent = first.kind === 'resource'
      ? `${first.amountLeft ?? 0} left`
      : `HP ${formatRatio(Math.max(0, first.hp), first.maxHp)}`;
    const iconName = def?.icon ?? `icon/${first.defId}`;
    if (this.selIcon.dataset.icon !== iconName) {
      this.selIcon.dataset.icon = iconName;
      this.selIcon.replaceChildren(this.host.assets.getIconCanvas(iconName));
    }
  }

  /** PlayerCardView for the pure card model (cardModel.ts). */
  private playerView(state: GameState): PlayerCardView | null {
    const p = state.players[this.host.humanPlayer];
    if (!p) return null;
    return {
      stockpile: p.stockpile,
      age: p.age,
      civ: p.setup.civ,
      researchedTechs: p.researchedTechs,
      pop: p.pop,
      popCap: p.popCap,
    };
  }

  /** Every tech currently sitting in ANY own production queue (sim alreadyQueued mirror). */
  private queuedTechIds(state: GameState): string[] {
    const out: string[] = [];
    for (const e of state.entities.values()) {
      if (e.kind !== 'building' || e.player !== this.host.humanPlayer || !e.trainQueue) continue;
      for (const item of e.trainQueue) {
        if (item.techId !== undefined) out.push(item.techId);
      }
    }
    return out;
  }

  /** Completed own building defIds (age-up requirement + build-prereq input). */
  private completedBuildingDefIds(state: GameState): string[] {
    const out: string[] = [];
    for (const e of state.entities.values()) {
      if (e.kind !== 'building' || e.player !== this.host.humanPlayer || e.hp <= 0) continue;
      if ((e.buildProgress ?? 1000) < 1000) continue;
      out.push(e.defId);
    }
    return out;
  }

  /**
   * Rebuild-signature of every resource-/prereq-dependent button model the card
   * would render for this selection. The model functions are cheap (a handful
   * of defs each), so recomputing them per frame keeps enabled states and
   * reasons EXACT at affordability boundaries — and completed-building changes
   * (a mill finishing enables Farm and the age-up) refresh the card too.
   */
  private cardButtonsKey(state: GameState, sel: Entity[]): string {
    const view = this.playerView(state);
    if (!view) return '';
    const parts: string[] = [];
    const push = (btns: readonly CardButtonModel[]): void => {
      for (const b of btns) {
        parts.push(`${b.id}=${b.enabled ? 1 : 0}${b.badge ? 'b' : ''}${b.reason ? `(${b.reason})` : ''}`);
      }
    };
    const buildings = sel.filter((e) => e.kind === 'building');
    const units = sel.filter((e) => e.kind === 'unit');
    const villagers = units.filter((e) => e.defId === 'villager');
    if (buildings.length === 1 && units.length === 0 && (buildings[0].buildProgress ?? 1000) >= 1000) {
      const b = buildings[0];
      const busy = !!b.research;
      const queued = this.queuedTechIds(state);
      push(trainMenuButtons(view, b.defId));
      push(researchMenuButtons(view, b.defId, busy, queued));
      if (b.defId === 'townCenter') {
        const up = ageUpButton(view, this.completedBuildingDefIds(state), busy, queued);
        if (up) push([up]);
      }
      if (b.defId === 'farm') push([farmReseedButton(b, view.stockpile)]);
      if (b.defId === 'market') {
        const rates = state.marketRates;
        const stock = {
          food: view.stockpile.food, wood: view.stockpile.wood,
          stone: view.stockpile.stone, gold: view.stockpile.gold,
        };
        const pendingReason = PENDING_COMMAND_KINDS.has('marketTrade') ? WAVE2_REASON : null;
        for (const row of marketPanelRows(stock, pendingReason, rates ?? undefined)) {
          parts.push(`${row.res}=${row.sellGold}/${row.buyGold}/${row.sellEnabled ? 1 : 0}${row.buyEnabled ? 1 : 0}`);
        }
      }
      if (hasActiveRally(b)) parts.push('rallyset');
    }
    if (villagers.length > 0) {
      push(buildMenuButtons(view.stockpile, view.age, view.researchedTechs, this.completedBuildingDefIds(state)));
    }
    return parts.join(',');
  }

  private updateCard(state: GameState): void {
    const sel = this.host.getSelection().filter((e) => e.player === this.host.humanPlayer);
    const placement = this.host.getPlacement();
    const player = state.players[this.host.humanPlayer];

    // signature so we only rebuild the DOM when contents change
    const popKey = player && player.popCap - player.pop <= 5 ? `${player.pop}/${player.popCap}` : 'ok';
    const key = [
      placement ? `place:${placement.defId}` : '',
      sel.map((e) =>
        `${e.id}:${e.defId}:${e.trainQueue?.length ?? ''}:${e.trainQueue?.[0]?.started ?? ''}` +
        `:${e.buildProgress ?? ''}:${e.research?.techId ?? ''}:${e.garrison?.length ?? ''}` +
        `:${e.rally ? `${e.rally.x},${e.rally.y},${e.rally.targetId ?? ''}` : ''}` +
        `:${e.amountLeft !== undefined ? (e.amountLeft > 0 ? 'r' : 'x') : ''}`,
      ).join('|'),
      this.host.getArmedVerb() ?? '',
      player?.age ?? '',
      // exact per-button enabled/reason/badge bits — the old floor(stockpile/25)
      // buckets went stale at every affordability boundary that is not a
      // multiple of 25 (militia 60f/20g, spearman 35f, farm 60w, watchTower
      // 35w, gate 30s, stoneWall 5s) and ignored marketRates drift
      this.cardButtonsKey(state, sel),
      popKey,
      player?.researchedTechs.length ?? 0,
      player?.autoReseed ? 'ar' : '',
      // research buttons gray out when their tech queues at ANY own building
      sel.length === 1 && sel[0].kind === 'building' ? this.queuedTechIds(state).join(',') : '',
    ].join('#');
    if (key !== this.lastCardKey) {
      this.lastCardKey = key;
      this.rebuildCard(state, sel, !!placement);
    }
    // live queue progress (unit and research items alike — both tick at the front)
    for (const q of this.queueProgressEls) {
      const b = state.entities.get(q.buildingId);
      const item = b?.trainQueue?.[q.index];
      if (item) {
        const frac = q.index === 0 ? 1 - item.ticksLeft / item.totalTicks : 0;
        q.el.style.width = `${Math.round(frac * 100)}%`;
      }
    }
  }

  private rebuildCard(state: GameState, sel: Entity[], placementActive: boolean): void {
    this.cardGrid.replaceChildren();
    this.queueRow.replaceChildren();
    this.queueRow.style.minHeight = '0px'; // production buildings re-reserve below
    this.utilRow.replaceChildren();
    this.noteRow.textContent = '';
    this.marketBox.replaceChildren();
    this.marketBox.classList.remove('show');
    this.garrisonBox.replaceChildren();
    this.garrisonBox.classList.remove('show');
    this.queueProgressEls = [];
    this.tip.style.display = 'none';
    if (placementActive || sel.length === 0) {
      this.card.classList.remove('show');
      return;
    }
    const view = this.playerView(state);
    if (!view) return;

    const buildings = sel.filter((e) => e.kind === 'building');
    const units = sel.filter((e) => e.kind === 'unit');
    const villagers = units.filter((e) => e.defId === 'villager');
    let shown = false;

    if (buildings.length === 1 && units.length === 0) {
      shown = this.rebuildBuildingCard(state, buildings[0], view) || shown;
    } else if (buildings.length > 1 && units.length === 0) {
      const def = gameData.buildings[buildings[0].defId];
      this.cardTitle.textContent = `${def?.name ?? buildings[0].defId} ×${buildings.length} — tap ground to rally`;
      shown = true;
    }

    if (villagers.length > 0) {
      this.cardTitle.textContent = 'Build';
      // cardModel decides enabled/gray: only genuinely unavailable actions
      // (unaffordable, unmet building prereq, or a verb the sim would silently
      // drop) render disabled — mirroring the sim's hasBuildPrereqs.
      for (const bb of buildMenuButtons(view.stockpile, view.age, view.researchedTechs, this.completedBuildingDefIds(state))) {
        this.addButton(
          bb.icon,
          `${bb.name}\n${costText(bb.cost ?? {})} • ${bb.timeSeconds}s`,
          bb.enabled,
          false,
          () => this.host.startPlacement(bb.id),
          bb.reason,
        );
      }
      shown = true;
    }

    if (units.length > 0) {
      if (villagers.length === 0) this.cardTitle.textContent = 'Commands';
      // attack-move / stop / garrison / convert / heal / pack (cardModel decides
      // visibility per selection contents and wave-2 enabled-ness)
      for (const vb of unitVerbButtons(units, this.host.getArmedVerb())) {
        const onClick = vb.id === 'stop'
          ? () => this.host.stopSelection()
          : vb.id === 'pack' || vb.id === 'unpack'
            ? () => this.host.packSelection(vb.id === 'pack')
            : vb.verb !== undefined
              ? () => this.host.armVerb(vb.verb!)
              : () => undefined;
        this.addButton(vb.icon, vb.tip, vb.enabled, vb.active ?? false, onClick, vb.reason);
      }
      // A single selected ram (unit garrison host) gets the same garrison panel
      // as buildings — without it, garrisoned infantry had no UI exit at all.
      if (sel.length === 1 && units.length === 1) {
        const gp = garrisonPanel(units[0], (id) => state.entities.get(id));
        if (gp && gp.count > 0) {
          this.rebuildGarrisonPanel(units[0].id, gp.occupants, gp.count, gp.capacity, gp.ungarrisonEnabled, gp.reason);
        }
      }
      shown = true;
    }

    this.card.classList.toggle('show', shown);
  }

  /** Card for exactly one own building: train + research + specials. */
  private rebuildBuildingCard(state: GameState, b: Entity, view: PlayerCardView): boolean {
    const def = gameData.buildings[b.defId];
    const name = def?.name ?? b.defId;
    if ((b.buildProgress ?? 1000) < 1000) {
      this.cardTitle.textContent = `${name} — under construction`;
      this.addDeleteButton(b); // a misplaced foundation must be cancellable
      return true;
    }
    let shown = false;
    this.cardTitle.textContent = name;
    // reserve the FULL queue block whenever this building can queue at all, so
    // chips appearing (or completing) never displace the buttons above them
    if ((def?.trains?.length ?? 0) > 0 || (def?.researches?.length ?? 0) > 0) {
      this.queueRow.style.minHeight = QUEUE_BLOCK_PX;
    }

    // ---- train buttons (housed renders as a non-blocking badge — queueing
    // while housed is AoE2-correct, the sim stalls the item at the front)
    const trainBtns = trainMenuButtons(view, b.defId);
    for (const tb of trainBtns) {
      this.addButton(
        tb.icon,
        `${tb.name}\n${costText(tb.cost ?? {})} • ${tb.timeSeconds}s${tb.badge ? `\n${tb.badge.note}` : ''}`,
        tb.enabled, false,
        () => this.host.trainUnit(b.id, tb.id),
        tb.reason,
        tb.badge?.glyph,
      );
      shown = true;
    }

    // ---- research buttons (blacksmith/university/monastery/castle uniques
    // and unit-line upgrades at their production building)
    const busy = !!b.research;
    // player-wide queued techs (the sim's alreadyQueued gate spans ALL buildings)
    const queuedTechs = this.queuedTechIds(state);
    for (const rb of researchMenuButtons(view, b.defId, busy, queuedTechs)) {
      this.addButton(
        rb.icon,
        `${rb.name}\n${costText(rb.cost ?? {})} • ${rb.timeSeconds}s`,
        rb.enabled, false,
        () => this.host.researchTech(b.id, rb.id),
        rb.reason,
      );
      shown = true;
    }

    // ---- age-up on the TC, with requirement feedback ('2 Feudal Age buildings needed')
    if (b.defId === 'townCenter') {
      const up = ageUpButton(view, this.completedBuildingDefIds(state), busy, queuedTechs);
      if (up) {
        this.addButton(
          up.icon,
          `Advance to ${up.name}\n${costText(up.cost ?? {})} • ${up.timeSeconds}s`,
          up.enabled, false,
          () => this.host.researchTech(b.id, up.techId),
          up.reason,
        );
        if (!up.requirementMet) this.noteRow.textContent = up.requirementText;
        shown = true;
      }
    }

    // ---- specials: farm reseed, mill auto-reseed, market trade panel
    if (b.defId === 'farm') {
      const fb = farmReseedButton(b, view.stockpile);
      this.addButton(fb.icon, `${fb.tip}\n${costText(fb.cost ?? {})}`, fb.enabled, false, () => this.host.reseedFarm(b.id), fb.reason);
      if ((b.amountLeft ?? 0) <= 0) this.noteRow.textContent = 'Fallow — out of food';
      shown = true;
    }
    if (b.defId === 'mill') {
      const on = state.players[this.host.humanPlayer]?.autoReseed ?? false;
      const mb = millAutoReseedButton(on);
      this.addButton(mb.icon, mb.tip, mb.enabled, mb.active ?? false, () => this.host.setAutoReseed(!on), mb.reason);
      shown = true;
    }
    if (b.defId === 'market') {
      this.rebuildMarketPanel(view);
      shown = true;
    }

    // ---- garrisoned-building panel (occupant icons + ungarrison all)
    const gp = garrisonPanel(b, (id) => state.entities.get(id));
    if (gp && gp.count > 0) {
      this.rebuildGarrisonPanel(b.id, gp.occupants, gp.count, gp.capacity, gp.ungarrisonEnabled, gp.reason);
      shown = true;
    }

    // ---- shared production queue chips (units AND research — one chip each,
    // cancelTrain is index-precise for both; the sim refunds techs via refundItem)
    (b.trainQueue ?? []).forEach((item, i) => {
      const model = queueChipModel(item);
      const chip = document.createElement('div');
      chip.className = 'bf-qitem';
      chip.title = model.isTech
        ? `Researching ${model.name} (tap to cancel)`
        : `${model.name} (tap to cancel)`;
      chip.appendChild(this.host.assets.getIconCanvas(model.icon));
      const prog = document.createElement('div');
      prog.className = 'bf-qprog';
      chip.appendChild(prog);
      chip.addEventListener('click', () => this.host.cancelTrain(b.id, i));
      this.queueRow.appendChild(chip);
      this.queueProgressEls.push({ el: prog, buildingId: b.id, index: i });
      shown = true;
    });

    // ---- housed queue-stall feedback (sim production.ts: a unit item at the
    // front waits, unstarted, until pop room opens)
    const front = b.trainQueue?.[0];
    if (front && front.techId === undefined && !front.started) {
      const p = state.players[this.host.humanPlayer];
      if (p && p.pop + (gameData.units[front.defId]?.pop ?? 1) > p.popCap) {
        const stall = 'Housed — build more houses';
        this.noteRow.textContent = this.noteRow.textContent
          ? `${this.noteRow.textContent} · ${stall}` : stall;
      }
    }

    // ---- rally flag control (GDD: "tap the flag control to clear")
    if (hasActiveRally(b)) {
      const btn = document.createElement('button');
      btn.className = 'bf-btn';
      btn.style.cssText = 'margin-top:6px;margin-right:6px;';
      btn.textContent = 'Clear rally';
      btn.title = 'Remove the rally flag — new units step out beside the building again';
      btn.addEventListener('click', () => this.host.clearRally(b.id));
      this.utilRow.appendChild(btn);
      shown = true;
    }

    this.addDeleteButton(b);
    return shown;
  }

  /**
   * Delete for own buildings (foundations included): the sim's deleteEntity
   * refunds the queue and the unbuilt foundation fraction. Destructive, so it
   * takes two taps to confirm (same pattern as Resign).
   */
  private addDeleteButton(b: Entity): void {
    const btn = document.createElement('button');
    btn.className = 'bf-btn';
    btn.style.cssText = 'margin-top:6px;color:#DABE8D;';
    const isFoundation = (b.buildProgress ?? 1000) < 1000;
    btn.textContent = isFoundation ? 'Cancel construction' : 'Delete building';
    let armed = false;
    btn.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        btn.textContent = 'Tap again to confirm';
        btn.style.color = '#C05B4E';
        return;
      }
      this.host.deleteBuilding(b.id);
    });
    this.utilRow.appendChild(btn);
  }

  /** GDD market: buy/sell each resource ×100 with live rate + ~30% fee shown. */
  private rebuildMarketPanel(view: PlayerCardView): void {
    this.cardTitle.textContent = 'Market — Trade (30% fee)';
    this.marketBox.classList.add('show');
    const pendingReason = PENDING_COMMAND_KINDS.has('marketTrade')
      ? `trading ${WAVE2_REASON}`
      : null;
    const stock: Partial<Record<TradeResource | 'gold', number>> = {
      food: view.stockpile.food, wood: view.stockpile.wood,
      stone: view.stockpile.stone, gold: view.stockpile.gold,
    };
    // live global rates from the sim (drift with every trade); base rates only for mocks
    const rates = this.host.getState().marketRates;
    for (const row of marketPanelRows(stock, pendingReason, rates ?? undefined)) {
      const rowEl = document.createElement('div');
      rowEl.className = 'bf-mrow';
      rowEl.appendChild(this.host.assets.getIconCanvas(`icon/res/${row.res}`));
      const sell = document.createElement('button');
      sell.className = 'bf-mbtn' + (row.sellEnabled ? '' : ' disabled');
      sell.textContent = `Sell ${TRADE_LOT} → +${row.sellGold}g`;
      sell.addEventListener('click', () => {
        if (row.sellEnabled) this.host.marketTrade(row.res, 'gold', TRADE_LOT);
        else this.showTip(`Sell ${TRADE_LOT} ${row.res}\n(${row.sellReason ?? ''})`);
      });
      const buy = document.createElement('button');
      buy.className = 'bf-mbtn' + (row.buyEnabled ? '' : ' disabled');
      buy.textContent = `Buy ${TRADE_LOT} → −${row.buyGold}g`;
      buy.addEventListener('click', () => {
        if (row.buyEnabled) this.host.marketTrade('gold', row.res, TRADE_LOT);
        else this.showTip(`Buy ${TRADE_LOT} ${row.res}\n(${row.buyReason ?? ''})`);
      });
      rowEl.appendChild(sell);
      rowEl.appendChild(buy);
      this.marketBox.appendChild(rowEl);
    }
    if (pendingReason) this.noteRow.textContent = 'Rates are estimates until the market sim lands';
  }

  private rebuildGarrisonPanel(
    buildingId: EntityId,
    occupants: Array<{ id: EntityId; icon: string }>,
    count: number,
    capacity: number,
    ungarrisonEnabled: boolean,
    reason?: string,
  ): void {
    this.garrisonBox.classList.add('show');
    const label = document.createElement('div');
    label.className = 'bf-note bf-num';
    label.textContent = `Garrisoned ${formatRatio(count, capacity)}`;
    const row = document.createElement('div');
    row.className = 'bf-goccrow';
    for (const occ of occupants) {
      row.appendChild(this.host.assets.getIconCanvas(occ.icon));
    }
    const btn = document.createElement('button');
    btn.className = 'bf-btn';
    btn.textContent = 'Ungarrison all';
    if (!ungarrisonEnabled) {
      btn.classList.add('disabled');
      btn.style.color = '#8a8a8a';
    }
    btn.addEventListener('click', () => {
      if (ungarrisonEnabled) this.host.ungarrisonAll(buildingId);
      else this.showTip(`Ungarrison\n(${reason ?? 'unavailable'})`);
    });
    this.garrisonBox.appendChild(label);
    this.garrisonBox.appendChild(row);
    this.garrisonBox.appendChild(btn);
  }

  /**
   * `icon` is the FINAL frame to render — cardModel already picked the colored
   * icon or its `/gray` companion, so gray can only mean genuinely unavailable.
   * `badge` is a non-blocking warning glyph (housed) over a still-live button.
   */
  private addButton(icon: string, tooltip: string, enabled: boolean, active: boolean, onClick: () => void, disabledReason?: string, badge?: string): void {
    const btn = document.createElement('button');
    btn.className = 'bf-cmdbtn' + (active ? ' active' : '') + (enabled ? '' : ' disabled');
    // class instead of the disabled attribute: disabled buttons still receive the
    // tap so we can surface WHY they are disabled (cost / wave-2 gating)
    btn.setAttribute('aria-disabled', String(!enabled));
    btn.appendChild(this.host.assets.getIconCanvas(icon));
    if (badge) {
      const span = document.createElement('span');
      span.className = 'bf-cmdbadge';
      span.textContent = badge;
      btn.appendChild(span);
    }
    const fullTip = enabled ? tooltip : `${tooltip}\n(${disabledReason ?? 'not enough resources'})`;
    btn.addEventListener('click', () => {
      if (enabled) onClick();
      else this.showTip(fullTip);
    });
    btn.addEventListener('pointerenter', () => this.showTip(fullTip));
    btn.addEventListener('pointerleave', () => (this.tip.style.display = 'none'));
    this.cardGrid.appendChild(btn);
  }

  private showTip(text: string): void {
    this.tip.textContent = '';
    text.split('\n').forEach((line, i) => {
      if (i > 0) this.tip.appendChild(document.createElement('br'));
      this.tip.appendChild(document.createTextNode(line));
    });
    this.tip.style.display = 'block';
  }

  private updatePlacementBar(): void {
    const placement = this.host.getPlacement();
    if (!placement) {
      this.placeBar.classList.remove('show');
      return;
    }
    this.placeBar.classList.add('show');
    const def = gameData.buildings[placement.defId];
    this.placeLabel.textContent = `${def?.name ?? placement.defId} — ${costText(def?.cost ?? {})}`;
    this.placeConfirm.disabled = !placement.valid || !placement.affordable;
    // an unmet building prereq blocks EVERY tile (sim canPlace → hasBuildPrereqs);
    // name the missing building instead of showing a bare 'Blocked'
    let blockedText = 'Blocked';
    if (!placement.valid && def?.requiresBuildings) {
      const completed = new Set(this.completedBuildingDefIds(this.host.getState()));
      const missing = def.requiresBuildings.find((req) => !completed.has(req));
      if (missing !== undefined) {
        blockedText = `Needs a ${gameData.buildings[missing]?.name ?? missing}`;
      }
    }
    this.placeConfirm.textContent = !placement.affordable
      ? 'Need resources'
      : placement.valid ? 'Build here' : blockedText;
  }
}
