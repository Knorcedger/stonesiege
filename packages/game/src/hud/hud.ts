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

import {
  type Entity, type EntityId, type Formation, type GameState, type PlayerId,
  type ProductionSpeed, type ResourceType,
} from '@bf/sim/types';
import { gameData } from '@bf/data';
import type { GameAssets } from '../assets';
import {
  hasOwnedCompletedBuilding, isTownBellSeeking, selectionTypeCounts, type IdleCategory,
} from '../selectionTools';
import {
  ageUpButton, buildMenuButtons, farmReseedButton, garrisonPanel, hasActiveRally,
  millAutoReseedButton, queueChipModel, queueStacks, researchMenuButtons, trainMenuButtons,
  unitNameForCiv, unitVerbButtons, WAVE2_REASON,
  type ArmedVerb, type CardButtonModel, type PlayerCardView,
} from './cardModel';
import { marketPanelRows, TRADE_LOT, type TradeResource } from './marketModel';
import { PENDING_COMMAND_KINDS } from '@bf/sim/commands';
import { TRAIN_QUEUE_CAP } from '@bf/sim/production';
import { formatRatio } from './format';
import { HUD_NARROW_MAX_PX, hudStageExtentPercent } from './layout';
import { buildSettingsControls } from '../settingsUi';
import { hideGameTooltip, setGameTooltip, showGameTooltip } from '../tooltip';
import type { UnitDisplayStats } from '../simBridge';
import { formatMatchTime } from './summary';
import { getSettings, onSettingsChanged, updateSettings } from '../settings';
import { extendedTooltip, techExtendedTip, unitExtendedTip } from './helpText';

export interface HudHost {
  assets: GameAssets;
  humanPlayer: PlayerId;
  getState(): GameState;
  getSelection(): Entity[];
  /** Fully resolved for the selected unit owner's civ and researched technologies. */
  getUnitStats(player: PlayerId, defId: string): UnitDisplayStats | null;
  deselect(): void;
  trainUnit(buildingId: EntityId, defId: string): void;
  cancelTrain(buildingId: EntityId, index: number): void;
  researchTech(buildingId: EntityId, techId: string): void;
  cancelResearch(buildingId: EntityId): void;
  /** Ungarrison every occupant of a building OR a ram (unit host). */
  ungarrisonAll(buildingId: EntityId): void;
  /** Toggle the selected Town Center's emergency villager shelter. */
  townBell(buildingId: EntityId): void;
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
  /** Toggle an armed "next tap = target" verb (rally / attack-move / garrison / convert / heal). */
  armVerb(verb: ArmedVerb): void;
  getArmedVerb(): ArmedVerb | null;
  setFormation(formation: Formation): void;
  getFormation(): Formation;
  /** Select, center, and cycle a completed own building type. */
  focusBuilding(defId: string): boolean;
  togglePause(): void;
  isPaused(): boolean;
  resumeGame(): void;
  /** Change construction/training/research timing without changing movement speed. */
  setProductionSpeed(speed: ProductionSpeed): void;
  resign(): void;
  /** Audible preview for the pause-overlay volume sliders (uiTap on release). */
  playUiSound(): void;
  /** Back to the title screen — the pause overlay's exit while spectating a finished match. */
  returnToTitle(): void;
  /** Persist the current resumable match snapshot on this device immediately. */
  saveGame(): void;
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
/** Three five-button rows, excluding WASD so camera movement always wins. */
export const COMMAND_HOTKEYS = ['q', 'e', 'r', 't', 'y', 'f', 'g', 'h', 'j', 'k', 'z', 'x', 'c', 'v', 'b'] as const;

export function commandRepeatCount(shiftKey: boolean, shiftRepeat: number): number {
  return shiftKey ? Math.max(1, shiftRepeat) : 1;
}

export interface PausePresentationTarget {
  button: {
    textContent: string | null;
    setAttribute(name: string, value: string): void;
  };
  overlay: {
    classList: { toggle(token: string, force?: boolean): boolean };
    setAttribute(name: string, value: string): void;
  };
}

export interface PauseControlHost {
  togglePause(): void;
  returnToTitle(): void;
}

/** Pause button intent stays testable independently of the DOM event binding. */
export function activatePauseControl(host: PauseControlHost, matchFinished: boolean): void {
  if (matchFinished) host.returnToTitle();
  else host.togglePause();
}

export type ResignControlAction = 'arm' | 'resign' | 'returnToTitle';

/** A destructive resign always requires a second activation; finished matches exit directly. */
export function resignControlAction(matchFinished: boolean, armed: boolean): ResignControlAction {
  if (matchFinished) return 'returnToTitle';
  return armed ? 'resign' : 'arm';
}

/** Keep the visible pause state synchronous with the action that changed it. */
export function syncPausePresentation(
  target: PausePresentationTarget,
  matchFinished: boolean,
  paused: boolean,
): void {
  target.button.textContent = matchFinished ? 'MENU' : paused ? '▶' : 'II';
  target.button.setAttribute('aria-label', matchFinished ? 'Return to menu' : paused ? 'Resume game' : 'Pause game');
  target.button.setAttribute('aria-pressed', String(!matchFinished && paused));
  target.overlay.classList.toggle('show', paused);
  target.overlay.setAttribute('aria-hidden', String(!paused));
}

/**
 * Full production-queue block height (TRAIN_QUEUE_CAP chips wrapped at 5/row),
 * reserved up front for any building that can queue: the card is bottom-anchored,
 * so a queue that grows a row would otherwise push the train buttons up ~44px
 * mid-tap and a spamming thumb would land on a single-tap-cancel queue chip.
 */
const QUEUE_ROWS = Math.ceil(TRAIN_QUEUE_CAP / CARD_COLS);
const QUEUE_BLOCK_PX = `${QUEUE_ROWS * CARD_CELL + (QUEUE_ROWS - 1) * CARD_GAP}px`;

const HUD_CSS = `
.bf-hud { position:absolute; inset:0; pointer-events:none; font-family:"Alegreya Sans","Trebuchet MS",sans-serif; color:#F2E6CB; user-select:none; -webkit-user-select:none; text-shadow:0 1px 1px rgba(0,0,0,.65); }
.bf-hudstage { position:absolute; left:0; top:0; width:100%; height:100%; pointer-events:none; transform-origin:top left; }
.bf-num { font-family:"Alegreya Sans","Trebuchet MS",sans-serif; font-variant-numeric:tabular-nums; }
.bf-panel { background:linear-gradient(145deg,rgba(55,39,24,.96),rgba(25,17,11,.97)); border:1px solid #25170c; box-shadow:0 0 0 1px rgba(196,146,58,.7) inset, 0 0 0 3px rgba(87,57,29,.72) inset, 0 6px 18px rgba(0,0,0,.34); border-radius:6px; backdrop-filter:blur(2px); }
.bf-top { position:absolute; top:6px; left:6px; right:6px; height:34px; display:flex; align-items:center; gap:12px; padding:0 10px; pointer-events:auto; }
.bf-res { display:flex; align-items:center; gap:5px; font-size:16px; }
.bf-res canvas { width:22px; height:22px; image-rendering:auto; }
.bf-age { margin-left:auto; font-size:16px; color:#E6C04A; letter-spacing:1px; }
.bf-time { min-width:42px; text-align:right; color:#DABE8D; font-size:18px; }
.bf-btn { position:relative; pointer-events:auto; background:#46331F; color:#EFDDB5; border:1px solid #8A6414; border-radius:3px; font-family:inherit; font-size:14px; padding:3px 10px; cursor:pointer; }
.bf-btn:active { transform:translate(1px,1px); }
.bf-btn:disabled { color:#8a8a8a; border-color:#5a5a5a; cursor:default; }
.bf-helpbtn { box-sizing:border-box; width:28px; height:28px; padding:0; font:bold 19px/26px "VT323",monospace; }
/* ≥44px touch targets (mobile-first): invisible centered hit-area expansion keeps visuals small */
.bf-btn::after, .bf-idle::after, .bf-mbtn::after { content:""; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:max(100%,44px); height:max(100%,44px); }
.bf-idle { position:relative; display:flex; align-items:center; gap:3px; background:#46331F; border:1px solid #8A6414; border-radius:3px; padding:1px 5px; cursor:pointer; pointer-events:auto; color:#EFDDB5; font-family:inherit; }
.bf-idle canvas { width:22px; height:22px; image-rendering:auto; }
.bf-idle:disabled { opacity:0.4; cursor:default; }
.bf-idlecount { font-family:"VT323",monospace; font-size:18px; line-height:1; color:#E6C04A; min-width:11px; text-align:center; }
.bf-rightcluster { position:absolute; right:6px; bottom:6px; width:264px; display:flex; flex-direction:column; align-items:stretch; gap:6px; pointer-events:none; }
.bf-selpanel { position:relative; width:246px; padding:8px; pointer-events:auto; display:none; }
.bf-selpanel.show { display:block; }
.bf-selrow { display:flex; gap:8px; align-items:center; padding-right:36px; }
.bf-selrow canvas { width:40px; height:40px; image-rendering:auto; border:1px solid #8A6414; }
.bf-selicon.mixed { width:40px; height:40px; display:grid; grid-template-columns:repeat(2,19px); grid-auto-rows:19px; gap:2px; }
.bf-selicon.mixed canvas { box-sizing:border-box; width:19px; height:19px; }
.bf-selname { font-size:15px; flex:1; }
.bf-selhp { font-size:14px; color:#DABE8D; }
.bf-selcarry { display:none; align-items:center; gap:5px; min-height:22px; font-size:16px; color:#E6C04A; }
.bf-selcarry.show { display:flex; }
.bf-selcarry canvas { width:22px; height:22px; border:0; image-rendering:auto; }
.bf-selstats { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:2px 8px; margin-top:6px; padding-top:5px; border-top:1px solid #64492B; color:#DABE8D; font:14px/1.05 "VT323",monospace; }
.bf-selstats:empty { display:none; }
.bf-selstat { min-width:0; white-space:nowrap; cursor:help; outline:none; }
.bf-selstat:focus-visible { box-shadow:0 1px 0 #E6C04A; }
.bf-selstat strong { color:#E6C04A; font-weight:normal; }
.bf-x { position:absolute; top:0; right:0; box-sizing:border-box; width:44px; height:44px; padding:0; line-height:40px; font-size:20px; touch-action:manipulation; }
.bf-card { position:relative; width:246px; padding:8px; pointer-events:auto; display:none; }
.bf-card.show { display:block; }
.bf-cardtitle { font-size:13px; color:#C29422; margin:0 0 6px 2px; letter-spacing:1px; }
.bf-cardtitle.with-icon { display:flex; align-items:center; gap:7px; min-height:34px; color:#E6C04A; }
.bf-cardtitle.with-icon canvas { width:32px; height:32px; flex:0 0 32px; image-rendering:auto; border:1px solid #8A6414; background:#2C1F12; }
.bf-cardtitle.with-icon .bf-buildingtitle { min-width:0; line-height:1.15; }
.bf-grid { display:grid; grid-template-columns:repeat(5,44px); gap:4px; }
.bf-cardsection { grid-column:1/-1; padding-top:3px; color:#E6C04A; font:14px/1 "VT323",monospace; letter-spacing:.5px; border-bottom:1px solid #64492B; }
.bf-cardsection.hint { color:#DABE8D; border-bottom:0; padding-top:1px; }
/* border-box: 44px means 44px INCLUDING border+padding, so buttons fill the grid's
   44px tracks exactly and the 4px gaps stay real (content-box made them 48px,
   overflowing the tracks and collapsing the gaps) */
.bf-cmdbtn { position:relative; box-sizing:border-box; width:44px; height:44px; padding:1px; background:#2C1F12; border:1px solid #8A6414; border-radius:3px; cursor:pointer; pointer-events:auto; }
.bf-cmdbtn canvas { width:40px; height:40px; image-rendering:auto; display:block; }
/* disabled look via class (NOT the disabled attribute): a tap must still show the reason tip */
.bf-cmdbtn:disabled, .bf-cmdbtn.disabled { border-color:#5a5a5a; opacity:0.9; }
.bf-cmdbtn:disabled canvas, .bf-cmdbtn.disabled canvas { filter:grayscale(1) brightness(0.55); }
.bf-cmdbtn.active { border-color:#E6C04A; box-shadow:0 0 0 1px #E6C04A; }
.bf-formationicon { position:relative; display:block; width:40px; height:40px; pointer-events:none; }
.bf-formationdot { position:absolute; width:5px; height:5px; border-radius:50%; background:#DABE8D; box-shadow:0 0 0 1px #1A1208; transform:translate(-50%,-50%); }
.bf-cmdbtn.active .bf-formationdot { background:#E6C04A; }
.bf-quicknav { display:flex; gap:4px; height:44px; }
.bf-quickbtn { width:44px; height:44px; padding:1px; border:1px solid #8A6414; border-radius:3px; background:#2C1F12; cursor:pointer; pointer-events:auto; }
.bf-quickbtn canvas { width:40px; height:40px; display:block; image-rendering:auto; }
.bf-cmddir { position:absolute; right:1px; bottom:1px; min-width:25px; padding:0 2px; box-sizing:border-box; background:rgba(26,18,8,.92); border:1px solid #C29422; color:#F4EEDD; font:12px/12px "VT323",monospace; text-align:center; pointer-events:none; }
.bf-cmddir.out { color:#9ED0FF; border-color:#6D9CC4; }
/* non-blocking warning badge (housed): the order still queues — never grays the button */
.bf-cmdbadge { position:absolute; top:0; right:2px; font-size:13px; line-height:1; color:#E6C04A; text-shadow:1px 1px 0 #1A1208, -1px 1px 0 #1A1208, 1px -1px 0 #1A1208, -1px -1px 0 #1A1208; pointer-events:none; }
.bf-cmdkey { position:absolute; left:1px; top:1px; min-width:12px; padding:0 2px; box-sizing:border-box; background:rgba(26,18,8,.9); color:#E6C04A; border:1px solid #64492B; font:12px/12px "VT323",monospace; text-align:center; pointer-events:none; }
/* wrap: TRAIN_QUEUE_CAP is 15 — 3 rows of 5 border-box 44px chips fit the 246px
   card. min-height is set from JS (QUEUE_BLOCK_PX) for buildings that can queue:
   the FULL block is reserved up front so chips appearing/completing never move
   the bottom-anchored card's train buttons under the player's thumb */
.bf-queue { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
.bf-queue:empty { margin-top:6px; } /* reserve spacing: first queued unit must not move the card */
.bf-queuetitle { display:none; margin:7px 2px 0; padding-top:4px; border-top:1px solid #64492B; color:#E6C04A; font:14px/1 "VT323",monospace; }
.bf-queuetitle.show { display:block; }
.bf-queuetitle.stalled { margin-top:7px; padding:5px 6px; color:#FFD08A; background:rgba(132,35,24,.7); border:1px solid #D56A45; border-radius:3px; }
.bf-qitem { position:relative; box-sizing:border-box; flex-shrink:0; width:44px; height:44px; padding:1px; border:1px solid #64492B; background:#2C1F12; cursor:pointer; pointer-events:auto; } /* 44px hard floor: cancel-a-unit mis-taps are costly */
.bf-qitem.blocked { border-color:#E06B48; box-shadow:0 0 0 1px rgba(224,107,72,.55); }
.bf-qitem canvas { width:40px; height:40px; image-rendering:auto; display:block; }
.bf-qprog { position:absolute; left:0; bottom:0; height:3px; background:#C29422; }
.bf-qcount { position:absolute; right:1px; bottom:3px; min-width:20px; padding:0 2px; box-sizing:border-box; background:rgba(26,18,8,.94); color:#F4EEDD; font:15px/14px "VT323",monospace; text-align:center; pointer-events:none; }
.bf-qblocked { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(78,18,13,.62); color:#FFD08A; font:bold 19px/1 "VT323",monospace; pointer-events:none; }
.bf-note { font-size:13px; color:#DABE8D; margin:5px 2px 0; min-height:0; }
.bf-note:empty { display:none; }
.bf-market { display:none; flex-direction:column; gap:6px; margin-top:6px; }
.bf-market.show { display:flex; }
.bf-mrow { display:flex; align-items:center; gap:6px; }
.bf-mrow canvas { width:22px; height:22px; image-rendering:auto; }
/* native ≥44px height (touch-target contract): trades mutate the stockpile
   instantly, so a thumb tap must never land on the adjacent resource row */
.bf-mbtn { position:relative; box-sizing:border-box; flex:1; min-height:44px; pointer-events:auto; background:#46331F; color:#EFDDB5; border:1px solid #8A6414; border-radius:3px; font-family:"VT323",monospace; font-size:15px; padding:4px 2px; cursor:pointer; }
.bf-mbtn.disabled { color:#8a8a8a; border-color:#5a5a5a; }
.bf-garrison { display:none; margin-top:6px; }
.bf-garrison.show { display:block; }
.bf-goccrow { display:flex; gap:3px; flex-wrap:wrap; margin:4px 0 6px; }
.bf-goccrow canvas { width:24px; height:24px; image-rendering:auto; border:1px solid #64492B; }
.bf-toast { position:absolute; left:50%; bottom:120px; transform:translateX(-50%); padding:6px 10px; display:none; align-items:center; gap:10px; font-size:14px; pointer-events:auto; }
.bf-toast.show { display:flex; }
/* scrollable overlay + margin:auto box: the settings block can exceed short
   (landscape-phone) viewports — flex centering alone would clip the top */
.bf-pause { position:absolute; inset:0; background:rgba(10,8,5,0.72); display:none; overflow-y:auto; pointer-events:auto; z-index:40; }
.bf-pause.show { display:flex; }
.bf-pausebox { margin:auto; display:flex; align-items:center; flex-direction:column; gap:14px; padding:24px 16px; }
.bf-pause h2 { font-family:"Jacquard 12","Pixelify Sans",monospace; font-size:42px; color:#E6C04A; margin:0; }
/* in-match settings (same controls as the menu screen — see settingsUi.ts) */
.bf-pausesettings { width:min(320px, 88%); text-align:left; }
.bf-pausesection { box-sizing:border-box; width:min(320px,88%); padding:10px 12px; color:#DABE8D; background:rgba(36,24,9,.72); border:1px solid #64492B; border-radius:4px; }
.bf-pausetitle { color:#E6C04A; font:15px/1 "Pixelify Sans",monospace; letter-spacing:1px; }
.bf-pausehint { margin-top:5px; font:14px/1.25 "VT323",monospace; }
.bf-pausesaverow { display:flex; align-items:center; gap:10px; margin-top:8px; }
.bf-pausestate { color:#E6C04A; font:15px/1 "VT323",monospace; }
.bf-help { position:absolute; inset:0; background:rgba(10,8,5,.78); display:none; overflow-y:auto; pointer-events:auto; z-index:45; }
.bf-help.show { display:flex; }
.bf-helpbox { box-sizing:border-box; width:min(430px,calc(100% - 24px)); margin:auto; padding:20px; }
.bf-helphead { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
.bf-helphead h2 { margin:0; color:#E6C04A; font:32px/1 "Jacquard 12","Pixelify Sans",monospace; }
.bf-helptext { color:#DABE8D; font:15px/1.35 "Pixelify Sans",monospace; }
.bf-helptext strong { color:#E6C04A; font-weight:normal; }
.bf-helptoggle { width:100%; min-height:44px; margin:12px 0; padding:8px 12px; display:flex; align-items:center; justify-content:space-between; gap:10px; text-align:left; }
.bf-helpstate { color:#E6C04A; font:18px/1 "VT323",monospace; }
.bf-place { position:absolute; left:50%; bottom:14px; transform:translateX(-50%); padding:8px 10px; display:none; gap:10px; pointer-events:auto; }
.bf-place.show { display:flex; }
/* Control groups live in Pause: useful on demand without permanently covering the battlefield. */
.bf-chips { display:flex; justify-content:center; gap:6px; margin-top:8px; pointer-events:auto; }
.bf-chips.hide { display:none; }
.bf-chip { position:relative; width:44px; height:44px; padding:0; background:#DABE8D; color:#1A1208; border:1px solid #B99A6B; border-radius:3px; box-shadow:0 0 0 1px #8A6414 inset; font-family:"VT323",monospace; font-size:22px; line-height:1; cursor:pointer; pointer-events:auto; }
.bf-chip.empty { background:#3a2a18; color:#B99A6B; border-color:#64492B; box-shadow:none; }
.bf-chipcount { position:absolute; right:3px; bottom:1px; font-size:14px; color:#64492B; }
/* ---- narrow widths (portrait phones): compress the top bar. It may wrap to a
   second row, but every control — the pause button above all — stays on-screen
   and tappable. ---- */
@media (max-width: ${HUD_NARROW_MAX_PX}px) {
  .bf-top { flex-wrap:wrap; height:auto; min-height:34px; gap:2px 7px; padding:3px 8px; }
  .bf-res { font-size:14px; gap:2px; }
  .bf-res canvas { width:18px; height:18px; }
  .bf-poplabel { display:none; } /* numerals carry the meaning on phones */
  .bf-age { font-size:13px; letter-spacing:0; }
  .bf-time { min-width:36px; font-size:16px; }
}
/* The 168px minimap and the 246px command card cannot share one <=480px row —
   shrink the minimap so the card's train/build buttons are never covered, and
   lift the selection panel clear of the card's tallest layout (~190px). */
@media (max-width: 480px) {
  .bf-mini > canvas { width:112px !important; height:112px !important; image-rendering:auto; }
  .bf-rightcluster { right:4px; bottom:4px; }
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

function formatStat(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export interface UnitStatRow {
  label: string;
  value: string;
  explanation: string;
}

/** Player-facing unit statistics use full names and define unfamiliar RTS terms. */
export function unitStatRows(stats: UnitDisplayStats): UnitStatRow[] {
  return [
    { label: 'Attack', value: formatStat(stats.attack), explanation: 'Damage dealt by each hit before armor and bonuses.' },
    {
      label: 'Armor',
      value: `${formatStat(stats.meleeArmor)}/${formatStat(stats.pierceArmor)}`,
      explanation: 'Melee armor / pierce armor. Each number reduces that damage type per hit.',
    },
    { label: 'Range', value: formatStat(stats.range), explanation: 'Maximum attack distance, measured in tiles.' },
    { label: 'Speed', value: formatStat(stats.speed), explanation: 'Movement speed, measured in tiles per second.' },
    {
      label: 'Line of Sight',
      value: formatStat(stats.los),
      explanation: 'How far this unit can see through fog, measured in tiles.',
    },
    {
      label: 'Rate of Fire',
      value: `${formatStat(stats.rofSeconds)}s`,
      explanation: 'Seconds between attacks. Lower is faster.',
    },
  ];
}

export class Hud {
  private root: HTMLElement;
  private host: HudHost;
  private el: HTMLDivElement;
  private stage: HTMLDivElement;
  private stopSettingsListener: (() => void) | null = null;
  private resSpans = new Map<ResourceType, HTMLSpanElement>();
  private popSpan!: HTMLSpanElement;
  private ageSpan!: HTMLSpanElement;
  private timeSpan!: HTMLSpanElement;
  private pauseBtn!: HTMLButtonElement;
  private helpBtn!: HTMLButtonElement;
  private selPanel!: HTMLDivElement;
  private selIcon!: HTMLDivElement;
  private selName!: HTMLDivElement;
  private selHp!: HTMLDivElement;
  private selCarry!: HTMLDivElement;
  private selCarryAmount!: HTMLSpanElement;
  private selStats!: HTMLDivElement;
  private card!: HTMLDivElement;
  private cardTitle!: HTMLDivElement;
  private cardGrid!: HTMLDivElement;
  private queueTitle!: HTMLDivElement;
  private queueRow!: HTMLDivElement;
  private toast!: HTMLDivElement;
  private toastLabel!: HTMLSpanElement;
  private toastUndoBtn!: HTMLButtonElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private toastUndoFn: (() => void) | null = null;
  private pauseOverlay!: HTMLDivElement;
  private helpOverlay!: HTMLDivElement;
  private placeBar!: HTMLDivElement;
  private placeConfirm!: HTMLButtonElement;
  private placeLabel!: HTMLSpanElement;
  private idleBtns = new Map<IdleCategory, { btn: HTMLButtonElement; count: HTMLSpanElement }>();
  private quickNavBtns = new Map<'townCenter' | 'barracks', HTMLButtonElement>();
  private chipStrip!: HTMLDivElement;
  private chipEls: Array<{ btn: HTMLButtonElement; count: HTMLSpanElement }> = [];
  private pauseGroups!: HTMLDivElement;
  private groupStatus!: HTMLDivElement;
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
  private commandHotkeys = new Map<string, HTMLButtonElement>();
  private nextCommandHotkey = 0;
  private hotkeyListener!: (event: KeyboardEvent) => void;
  private rightCluster!: HTMLDivElement;

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
    this.stage = document.createElement('div');
    this.stage.className = 'bf-hudstage';
    this.el.appendChild(this.stage);
    this.applyHudScale(getSettings().hudScale);
    this.stopSettingsListener = onSettingsChanged((settings) => this.applyHudScale(settings.hudScale));

    this.buildTopBar();
    this.rightCluster = document.createElement('div');
    this.rightCluster.className = 'bf-rightcluster';
    this.stage.appendChild(this.rightCluster);
    this.buildSelectionPanel();
    this.buildCard();
    this.buildToast();
    this.buildPauseOverlay();
    this.buildHelpOverlay();
    this.buildPlacementBar();
    this.buildGroupChips();
    this.bindCommandHotkeys();

    this.minimapSlot = document.createElement('div');
    this.minimapSlot.className = 'bf-mini';
    this.minimapSlot.style.cssText = 'position:absolute;left:6px;bottom:6px;display:flex;flex-direction:column;gap:4px;pointer-events:auto;';
    this.stage.appendChild(this.minimapSlot);
    this.buildQuickNavigation();
  }

  destroy(): void {
    hideGameTooltip();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.stopSettingsListener?.();
    window.removeEventListener('keydown', this.hotkeyListener);
    this.el.remove();
  }

  private applyHudScale(scale: number): void {
    const extent = hudStageExtentPercent(scale);
    this.stage.style.width = `${extent}%`;
    this.stage.style.height = `${extent}%`;
    this.stage.style.transform = `scale(${scale})`;
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
    const elapsed = formatMatchTime(state.tick);
    if (this.timeSpan.textContent !== elapsed) this.timeSpan.textContent = elapsed;
    // "Continue watching" spectating: applyCommands drops everything once
    // state.finished, so Resign would silently no-op — swap it for the only
    // meaningful action so the player is never stranded without a way out.
    if (state.finished !== this.matchFinished) {
      this.matchFinished = state.finished;
      this.resetResign();
    }
    this.syncPauseUi();
    if (!this.host.isPaused() && this.resignArmed) this.resetResign();
    this.updateQuickNavigation(state);
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

    this.timeSpan = document.createElement('span');
    this.timeSpan.className = 'bf-time bf-num';
    this.timeSpan.textContent = '0:00';
    setGameTooltip(this.timeSpan, 'Elapsed game time');
    bar.appendChild(this.timeSpan);

    this.helpBtn = document.createElement('button');
    this.helpBtn.className = 'bf-btn bf-helpbtn';
    this.helpBtn.textContent = '?';
    this.helpBtn.setAttribute('aria-expanded', 'false');
    setGameTooltip(this.helpBtn, 'Help and tooltip settings');
    this.helpBtn.addEventListener('click', () => {
      hideGameTooltip();
      this.helpOverlay.classList.add('show');
      this.helpBtn.setAttribute('aria-expanded', 'true');
    });
    bar.appendChild(this.helpBtn);

    this.pauseBtn = document.createElement('button');
    this.pauseBtn.className = 'bf-btn';
    this.pauseBtn.textContent = 'II';
    this.pauseBtn.setAttribute('aria-label', 'Pause game');
    this.pauseBtn.setAttribute('aria-pressed', 'false');
    this.pauseBtn.addEventListener('click', () => {
      activatePauseControl(this.host, this.matchFinished);
      if (!this.matchFinished) this.syncPauseUi();
    });
    bar.appendChild(this.pauseBtn);
    this.stage.appendChild(bar);
  }

  private addIdleButton(bar: HTMLElement, cat: IdleCategory, icon: string, title: string): void {
    const btn = document.createElement('button');
    btn.className = 'bf-idle';
    setGameTooltip(btn, title);
    btn.appendChild(this.host.assets.getIconCanvas(icon));
    const count = document.createElement('span');
    count.className = 'bf-idlecount';
    count.textContent = '0';
    btn.appendChild(count);
    btn.addEventListener('click', () => this.host.cycleIdle(cat));
    bar.appendChild(btn);
    this.idleBtns.set(cat, { btn, count });
  }

  private buildQuickNavigation(): void {
    const nav = document.createElement('div');
    nav.className = 'bf-quicknav';
    const add = (defId: 'townCenter' | 'barracks'): void => {
      const def = gameData.buildings[defId];
      const btn = document.createElement('button');
      btn.className = 'bf-quickbtn';
      btn.appendChild(this.host.assets.getIconCanvas(def?.icon ?? `icon/${defId}`));
      setGameTooltip(btn, `Focus ${def?.name ?? defId}\nTap again to cycle`);
      btn.addEventListener('click', () => {
        if (!this.host.focusBuilding(defId)) this.showTip(`No completed ${def?.name ?? defId}`, btn);
      });
      if (defId === 'barracks') btn.hidden = true;
      this.quickNavBtns.set(defId, btn);
      nav.appendChild(btn);
    };
    add('townCenter');
    add('barracks');
    this.minimapSlot.appendChild(nav);
  }

  private updateQuickNavigation(state: GameState): void {
    const barracksBtn = this.quickNavBtns.get('barracks');
    if (barracksBtn) {
      barracksBtn.hidden = !hasOwnedCompletedBuilding(state, this.host.humanPlayer, 'barracks');
    }
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
    this.selIcon.className = 'bf-selicon';
    row.appendChild(this.selIcon);
    const col = document.createElement('div');
    col.style.flex = '1';
    this.selName = document.createElement('div');
    this.selName.className = 'bf-selname';
    this.selHp = document.createElement('div');
    this.selHp.className = 'bf-selhp bf-num';
    this.selCarry = document.createElement('div');
    this.selCarry.className = 'bf-selcarry bf-num';
    this.selCarryAmount = document.createElement('span');
    col.appendChild(this.selName);
    col.appendChild(this.selHp);
    col.appendChild(this.selCarry);
    row.appendChild(col);
    this.selPanel.appendChild(row);
    this.selStats = document.createElement('div');
    this.selStats.className = 'bf-selstats';
    this.selPanel.appendChild(this.selStats);
    const x = document.createElement('button');
    x.className = 'bf-btn bf-x';
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Deselect current selection');
    setGameTooltip(x, 'Deselect');
    x.addEventListener('click', () => this.host.deselect());
    this.selPanel.appendChild(x);
    this.rightCluster.appendChild(this.selPanel);
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
    this.queueTitle = document.createElement('div');
    this.queueTitle.className = 'bf-queuetitle';
    this.queueRow = document.createElement('div');
    this.queueRow.className = 'bf-queue';
    this.utilRow = document.createElement('div'); // delete-building etc.
    this.card.appendChild(this.cardTitle);
    this.card.appendChild(this.cardGrid);
    this.card.appendChild(this.noteRow);
    this.card.appendChild(this.marketBox);
    this.card.appendChild(this.garrisonBox);
    this.card.appendChild(this.queueTitle);
    this.card.appendChild(this.queueRow);
    this.card.appendChild(this.utilRow);
    this.rightCluster.appendChild(this.card);

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
    this.stage.appendChild(this.toast);
  }

  private buildPauseOverlay(): void {
    this.pauseOverlay = document.createElement('div');
    this.pauseOverlay.className = 'bf-pause';
    this.pauseOverlay.setAttribute('role', 'dialog');
    this.pauseOverlay.setAttribute('aria-modal', 'true');
    this.pauseOverlay.setAttribute('aria-label', 'Paused game menu');
    this.pauseOverlay.setAttribute('aria-hidden', 'true');
    const box = document.createElement('div');
    box.className = 'bf-pausebox';
    const h = document.createElement('h2');
    h.textContent = 'Paused';
    const btn = document.createElement('button');
    btn.className = 'bf-btn';
    btn.style.fontSize = '18px';
    btn.textContent = 'Resume';
    btn.addEventListener('click', () => this.resumeGame());
    // In-match settings (shared builder with the menu screen): volume, camera
    // speed and HP bars were otherwise only reachable by resigning the match.
    // Slider release plays a uiTap so the player HEARS the level they set.
    const settings = document.createElement('div');
    settings.className = 'bf-pausesettings';
    buildSettingsControls(settings, {
      onSliderRelease: () => this.host.playUiSound(),
      onProductionSpeedChange: (speed) => this.host.setProductionSpeed(speed),
    });

    const saveSection = document.createElement('div');
    saveSection.className = 'bf-pausesection';
    const saveTitle = document.createElement('div');
    saveTitle.className = 'bf-pausetitle';
    saveTitle.textContent = 'SAVE GAME';
    const saveHint = document.createElement('div');
    saveHint.className = 'bf-pausehint';
    saveHint.textContent = 'StoneSiege keeps one resumable match locally on this device. It autosaves every 15 seconds and when the app is backgrounded.';
    const saveRow = document.createElement('div');
    saveRow.className = 'bf-pausesaverow';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'bf-btn';
    saveBtn.textContent = 'Save now';
    const saveState = document.createElement('span');
    saveState.className = 'bf-pausestate';
    saveBtn.addEventListener('click', () => {
      this.host.saveGame();
      saveState.textContent = 'Saved locally';
    });
    saveRow.append(saveBtn, saveState);
    saveSection.append(saveTitle, saveHint, saveRow);

    this.pauseGroups = document.createElement('div');
    this.pauseGroups.className = 'bf-pausesection';
    const groupTitle = document.createElement('div');
    groupTitle.className = 'bf-pausetitle';
    groupTitle.textContent = 'CONTROL GROUPS';
    const groupHint = document.createElement('div');
    groupHint.className = 'bf-pausehint';
    groupHint.textContent = 'Hold a number to assign the currently selected units. Tap an assigned group to select it and resume. These are temporary unit shortcuts, not game saves.';
    this.groupStatus = document.createElement('div');
    this.groupStatus.className = 'bf-pausestate';
    this.pauseGroups.append(groupTitle, groupHint, this.groupStatus);
    // Resign (GDD: a human can resign at any time) — two taps to confirm,
    // because a mis-tap here forfeits the whole match.
    this.resignBtn = document.createElement('button');
    this.resignBtn.className = 'bf-btn';
    this.resignBtn.style.cssText = 'font-size:16px;color:#DABE8D;';
    this.resignBtn.textContent = 'Resign';
    this.resignBtn.addEventListener('click', () => {
      switch (resignControlAction(this.matchFinished, this.resignArmed)) {
        case 'returnToTitle':
          // post-match spectating: the sim would drop a resign — leave instead
          this.host.returnToTitle();
          return;
        case 'arm':
          this.resignArmed = true;
          this.resignBtn.textContent = 'Tap again to resign';
          this.resignBtn.style.color = '#C05B4E';
          return;
        case 'resign':
          this.resetResign();
          this.host.resign();
          return;
      }
    });
    box.append(h, btn, saveSection, this.pauseGroups, settings, this.resignBtn);
    this.pauseOverlay.appendChild(box);
    this.pauseOverlay.addEventListener('click', (e) => {
      if (e.target === this.pauseOverlay) this.resumeGame();
    });
    this.el.appendChild(this.pauseOverlay);
  }

  private syncPauseUi(): void {
    syncPausePresentation(
      { button: this.pauseBtn, overlay: this.pauseOverlay },
      this.matchFinished,
      this.host.isPaused(),
    );
  }

  private resumeGame(): void {
    this.host.resumeGame();
    this.syncPauseUi();
  }

  private buildHelpOverlay(): void {
    this.helpOverlay = document.createElement('div');
    this.helpOverlay.className = 'bf-help';
    this.helpOverlay.setAttribute('role', 'dialog');
    this.helpOverlay.setAttribute('aria-modal', 'true');
    this.helpOverlay.setAttribute('aria-label', 'Help and tooltip settings');
    const box = document.createElement('div');
    box.className = 'bf-panel bf-helpbox';
    const head = document.createElement('div');
    head.className = 'bf-helphead';
    const h = document.createElement('h2');
    h.textContent = 'Help & tips';
    const close = document.createElement('button');
    close.className = 'bf-btn';
    close.textContent = 'Close';
    const closeHelp = (): void => {
      this.helpOverlay.classList.remove('show');
      this.helpBtn.setAttribute('aria-expanded', 'false');
    };
    close.addEventListener('click', closeHelp);
    head.append(h, close);

    const intro = document.createElement('div');
    intro.className = 'bf-helptext';
    intro.innerHTML = '<strong>Hover or focus any command icon</strong> to learn its cost and purpose. Extended tips add exact upgrade effects, unit roles, and combat counters.';

    const toggle = document.createElement('button');
    toggle.className = 'bf-btn bf-helptoggle';
    toggle.setAttribute('role', 'switch');
    const toggleLabel = document.createElement('span');
    toggleLabel.textContent = 'Extended tooltips';
    const toggleState = document.createElement('span');
    toggleState.className = 'bf-helpstate';
    const refreshToggle = (): void => {
      const enabled = getSettings().extendedTooltips;
      toggleState.textContent = enabled ? 'ON' : 'OFF';
      toggle.setAttribute('aria-checked', String(enabled));
    };
    toggle.addEventListener('click', () => {
      updateSettings({ extendedTooltips: !getSettings().extendedTooltips });
      refreshToggle();
      this.lastCardKey = ''; // rebuild live command tips on the next HUD update
      hideGameTooltip();
    });
    toggle.append(toggleLabel, toggleState);
    refreshToggle();

    const examples = document.createElement('div');
    examples.className = 'bf-helptext';
    examples.innerHTML = '<strong>Examples</strong><br>Wheelbarrow makes villagers move faster and carry more.<br>Spearmen counter cavalry; archers and skirmishers counter spearmen.';

    box.append(head, intro, toggle, examples);
    this.helpOverlay.appendChild(box);
    this.helpOverlay.addEventListener('click', (e) => {
      if (e.target === this.helpOverlay) closeHelp();
    });
    this.el.appendChild(this.helpOverlay);
  }

  private bindCommandHotkeys(): void {
    this.hotkeyListener = (event: KeyboardEvent): void => {
      if (this.helpOverlay.classList.contains('show')) {
        if (event.key === 'Escape') {
          event.preventDefault();
          this.helpOverlay.classList.remove('show');
          this.helpBtn.setAttribute('aria-expanded', 'false');
          this.helpBtn.focus();
        }
        // Help is modal: keep camera/pause/command listeners behind it dormant.
        event.stopImmediatePropagation();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || this.host.isPaused()
        || this.host.getPlacement() !== null
        || !this.card.classList.contains('show')) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      const btn = this.commandHotkeys.get(event.key.toLowerCase());
      if (!btn) return;
      event.preventDefault();
      btn.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, shiftKey: event.shiftKey,
      }));
    };
    window.addEventListener('keydown', this.hotkeyListener);
  }

  private resetResign(): void {
    this.resignArmed = false;
    this.resignBtn.textContent = this.matchFinished ? 'Return to Title' : 'Resign';
    this.resignBtn.style.color = '#DABE8D';
  }

  /**
   * Pause-menu control groups: long-press to assign/overwrite the current
   * selection; tap a populated group to select it and return to the match.
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
          this.groupStatus.textContent = saved
            ? `Group ${i + 1} assigned` : 'Select units before assigning a group';
        }, LONG_PRESS_MS);
      });
      btn.addEventListener('pointerup', () => {
        cancelTimer();
        if (!longFired) {
          if ((this.host.getGroupCounts()[i] ?? 0) === 0) {
            this.groupStatus.textContent = `Group ${i + 1} is empty`;
            return;
          }
          this.host.selectGroup(i);
          this.host.resumeGame();
        }
      });
      btn.addEventListener('pointerleave', cancelTimer);
      btn.addEventListener('pointercancel', cancelTimer);
      this.chipStrip.appendChild(btn);
      this.chipEls.push({ btn, count });
    }
    this.pauseGroups.appendChild(this.chipStrip);
  }

  private updateGroupChips(): void {
    const counts = this.host.getGroupCounts();
    this.chipEls.forEach((chip, i) => {
      const n = counts[i] ?? 0;
      chip.btn.classList.toggle('empty', n === 0);
      const text = n > 0 ? String(n) : '';
      if (chip.count.textContent !== text) chip.count.textContent = text;
      setGameTooltip(chip.btn, n > 0
        ? `Control group ${i + 1} (${n}) — tap to select and resume, hold to overwrite`
        : `Control group ${i + 1} — hold to assign the current selection`);
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
    this.stage.appendChild(this.placeBar);
  }

  // ------------------------------------------------------------------ dynamic

  private updateSelectionPanel(): void {
    const sel = this.host.getSelection();
    if (sel.length === 0) {
      this.selPanel.classList.remove('show');
      return;
    }
    const first = sel[0];
    // A selected own building's name/health now lives with its actions in the
    // bottom-right card. Avoid duplicating half its details above the minimap.
    if (sel.length === 1 && first.kind === 'building' && first.player === this.host.humanPlayer) {
      this.selPanel.classList.remove('show');
      return;
    }
    this.selPanel.classList.add('show');
    const def = gameData.units[first.defId] ?? gameData.buildings[first.defId] ?? gameData.resources[first.defId];
    const ownerCiv = this.host.getState().players[first.player]?.setup.civ ?? '';
    const name = first.kind === 'unit'
      ? unitNameForCiv(first.defId, ownerCiv)
      : def?.name ?? first.defId;
    const typeCounts = selectionTypeCounts(sel);
    const mixed = sel.length > 1 && typeCounts.length > 1;
    if (mixed) {
      const allUnits = sel.every((e) => e.kind === 'unit');
      const allBuildings = sel.every((e) => e.kind === 'building');
      this.selName.textContent = `${allUnits ? 'Mixed units' : allBuildings ? 'Mixed buildings' : 'Mixed selection'} ×${sel.length}`;
    } else {
      this.selName.textContent = sel.length > 1 ? `${name} ×${sel.length}` : name;
    }
    const selectedUnitHelp = !mixed && first.kind === 'unit'
      ? unitExtendedTip(gameData.units[first.defId]) : '';
    setGameTooltip(
      this.selName,
      extendedTooltip(this.selName.textContent ?? name, selectedUnitHelp, getSettings().extendedTooltips),
    );
    if (sel.length > 1 && sel.every((e) => e.kind !== 'resource')) {
      const hp = sel.reduce((sum, e) => sum + Math.max(0, e.hp), 0);
      const maxHp = sel.reduce((sum, e) => sum + e.maxHp, 0);
      this.selHp.textContent = `HP ${formatRatio(hp, maxHp)}`;
    } else {
      this.selHp.textContent = first.kind === 'resource'
        ? `${first.amountLeft ?? 0} left`
        : `HP ${formatRatio(Math.max(0, first.hp), first.maxHp)}`;
    }
    const carrying = sel.length === 1 && first.kind === 'unit' && first.carrying && first.carrying.amount > 0
      ? first.carrying
      : null;
    if (carrying) {
      if (this.selCarry.dataset.resource !== carrying.type) {
        this.selCarry.dataset.resource = carrying.type;
        this.selCarry.replaceChildren(
          this.host.assets.getIconCanvas(`icon/res/${carrying.type}`),
          this.selCarryAmount,
        );
      }
      this.selCarryAmount.textContent = String(carrying.amount);
      this.selCarry.classList.add('show');
      setGameTooltip(this.selCarry, `Carrying ${carrying.amount} ${carrying.type}`);
    } else {
      this.selCarry.classList.remove('show');
      this.selCarry.dataset.resource = '';
      this.selCarry.replaceChildren();
    }
    if (mixed) {
      const key = typeCounts.map((t) => `${t.defId}:${t.count}`).join('|');
      if (this.selStats.dataset.key !== key) {
        this.selStats.dataset.key = key;
        this.selStats.replaceChildren(...typeCounts.map((type) => {
          const item = document.createElement('span');
          item.className = 'bf-selstat';
          item.textContent = `${type.name} `;
          const count = document.createElement('strong');
          count.textContent = `×${type.count}`;
          item.appendChild(count);
          return item;
        }));
      }
    } else if (first.kind === 'unit') {
      const stats = this.host.getUnitStats(first.player, first.defId);
      if (stats) {
        const values = unitStatRows(stats);
        const key = values.flatMap(({ label, value }) => [label, value]).join('|');
        if (this.selStats.dataset.key !== key) {
          this.selStats.dataset.key = key;
          this.selStats.replaceChildren(...values.map(({ label, value, explanation }) => {
            const item = document.createElement('span');
            item.className = 'bf-selstat';
            item.tabIndex = 0;
            const heading = document.createElement('strong');
            heading.textContent = label;
            item.append(heading, ` ${value}`);
            setGameTooltip(item, `${label}: ${value}\n${explanation}`);
            return item;
          }));
        }
      } else {
        delete this.selStats.dataset.key;
        this.selStats.replaceChildren();
      }
    } else {
      delete this.selStats.dataset.key;
      this.selStats.replaceChildren();
    }
    if (mixed) {
      const iconKey = typeCounts.map((t) => t.icon).join('|');
      if (this.selIcon.dataset.icon !== iconKey) {
        this.selIcon.dataset.icon = iconKey;
        this.selIcon.replaceChildren(...typeCounts.slice(0, 4).map((t) => this.host.assets.getIconCanvas(t.icon)));
      }
      this.selIcon.classList.add('mixed');
    } else {
      const iconName = def?.icon ?? `icon/${first.defId}`;
      if (this.selIcon.dataset.icon !== iconName) {
        this.selIcon.dataset.icon = iconName;
        this.selIcon.replaceChildren(this.host.assets.getIconCanvas(iconName));
      }
      this.selIcon.classList.remove('mixed');
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
      productionSpeed: state.productionSpeed ?? 2,
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
    const parts: string[] = [`speed=${view.productionSpeed ?? 1}`];
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
        const sheltered = (b.garrison ?? []).filter((id) => state.entities.get(id)?.sheltering).length;
        const seeking = [...state.entities.values()].filter((e) =>
          isTownBellSeeking(e, this.host.humanPlayer, b.id)).length;
        const outside = [...state.entities.values()].filter((e) => e.kind === 'unit'
          && e.player === this.host.humanPlayer && e.hp > 0 && e.garrisonedIn === undefined
          && !!gameData.units[e.defId]?.gather).length;
        parts.push(`bell=${sheltered + seeking}/${outside}`);
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
      push(buildMenuButtons(
        view.stockpile, view.age, view.researchedTechs, this.completedBuildingDefIds(state),
        view.productionSpeed,
      ));
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
        `${e.id}:${e.defId}:${e.trainQueue?.map((q) => q.techId ?? q.defId).join(',') ?? ''}:${e.trainQueue?.[0]?.started ?? ''}` +
        `:${e.hp}/${e.maxHp}:${e.buildProgress ?? ''}:${e.research?.techId ?? ''}:${e.garrison?.length ?? ''}` +
        `:${e.rally ? `${e.rally.x},${e.rally.y},${e.rally.targetId ?? ''}` : ''}` +
        `:${e.amountLeft !== undefined ? (e.amountLeft > 0 ? 'r' : 'x') : ''}`,
      ).join('|'),
      this.host.getArmedVerb() ?? '',
      this.host.getFormation(),
      player?.age ?? '',
      // exact per-button enabled/reason/badge bits — the old floor(stockpile/25)
      // buckets went stale at every affordability boundary that is not a
      // multiple of 25 (militia 60f/20g, spearman 35f, farm 60w, watchTower
      // 35w, gate 30s, stoneWall 5s) and ignored marketRates drift
      this.cardButtonsKey(state, sel),
      popKey,
      player?.researchedTechs.length ?? 0,
      player?.autoReseed ? 'ar' : '',
      getSettings().extendedTooltips ? 'help+' : 'help-',
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
    this.commandHotkeys.clear();
    this.nextCommandHotkey = 0;
    this.cardGrid.replaceChildren();
    this.cardTitle.classList.remove('with-icon');
    this.queueRow.replaceChildren();
    this.queueRow.style.minHeight = '0px'; // production buildings re-reserve below
    this.queueTitle.textContent = '';
    this.queueTitle.classList.remove('show', 'stalled');
    this.utilRow.replaceChildren();
    this.noteRow.textContent = '';
    this.marketBox.replaceChildren();
    this.marketBox.classList.remove('show');
    this.garrisonBox.replaceChildren();
    this.garrisonBox.classList.remove('show');
    this.queueProgressEls = [];
    hideGameTooltip();
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
      this.cardTitle.textContent = `${def?.name ?? buildings[0].defId} ×${buildings.length}`;
      if ((def?.trains?.length ?? 0) > 0) {
        this.addButton(
          'icon/cmd/rally',
          'Set rally point\nNext tap chooses where newly trained units will travel',
          true,
          this.host.getArmedVerb() === 'rally',
          () => this.host.armVerb('rally'),
        );
      }
      shown = true;
    }

    if (villagers.length > 0) {
      this.cardTitle.textContent = 'Build';
      // cardModel decides enabled/gray: only genuinely unavailable actions
      // (unaffordable, unmet building prereq, or a verb the sim would silently
      // drop) render disabled — mirroring the sim's hasBuildPrereqs.
      for (const bb of buildMenuButtons(
        view.stockpile, view.age, view.researchedTechs, this.completedBuildingDefIds(state),
        view.productionSpeed,
      )) {
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
      const soldiers = units.filter((e) => {
        const def = gameData.units[e.defId];
        return e.defId !== 'villager' && !!def && !def.herdable && !def.huntable
          && def.attacks.length > 0;
      });
      if (soldiers.length >= 3) {
        this.addCardSection('Formation');
        for (const formation of ['line', 'rectangle', 'wedge'] as const) {
          this.addFormationButton(formation, this.host.getFormation() === formation);
        }
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
    const health = `HP ${formatRatio(Math.max(0, b.hp), b.maxHp)}`;
    if (b.player !== this.host.humanPlayer) {
      this.cardTitle.textContent = (b.buildProgress ?? 1000) < 1000
        ? `${name} — under construction`
        : name;
      return true;
    }
    if ((b.buildProgress ?? 1000) < 1000) {
      this.setBuildingCardTitle(
        def?.icon ?? `icon/${b.defId}`,
        `${name} · ${health} · ${Math.floor((b.buildProgress ?? 0) / 10)}% built`,
      );
      this.addDeleteButton(b); // a misplaced foundation must be cancellable
      return true;
    }
    let shown = false;
    this.setBuildingCardTitle(def?.icon ?? `icon/${b.defId}`, `${name} · ${health}`);
    const front = b.trainQueue?.[0];
    const owner = state.players[this.host.humanPlayer];
    const housingBlocked = !!front && front.techId === undefined && !front.started
      && !!owner && owner.pop + (gameData.units[front.defId]?.pop ?? 1) > owner.popCap;
    // reserve the FULL queue block whenever this building can queue at all, so
    // chips appearing (or completing) never displace the buttons above them
    const hasProduction = (def?.trains?.length ?? 0) > 0 || (def?.researches?.length ?? 0) > 0;
    if (hasProduction) {
      this.queueRow.style.minHeight = QUEUE_BLOCK_PX;
      const count = b.trainQueue?.length ?? 0;
      this.queueTitle.textContent = housingBlocked
        ? '⚠ Production stopped — build a House'
        : `Production queue · ${count > 0 ? `${count}/${TRAIN_QUEUE_CAP}` : 'empty'}`;
      this.queueTitle.classList.add('show');
      this.queueTitle.classList.toggle('stalled', housingBlocked);
    }

    // ---- train buttons (housed renders as a non-blocking badge — queueing
    // while housed is AoE2-correct, the sim stalls the item at the front)
    const trainBtns = trainMenuButtons(view, b.defId);
    if (trainBtns.length > 0) this.addCardSection('Train units');
    for (const tb of trainBtns) {
      const baseTip = `${tb.name}\n${costText(tb.cost ?? {})} • ${tb.timeSeconds}s${tb.badge ? `\n${tb.badge.note}` : ''}`
        + '\nShift-click: queue 5';
      this.addButton(
        tb.icon,
        extendedTooltip(baseTip, unitExtendedTip(gameData.units[tb.id]), getSettings().extendedTooltips),
        tb.enabled, false,
        () => this.host.trainUnit(b.id, tb.id),
        tb.reason,
        tb.badge?.glyph,
        undefined,
        5,
      );
      shown = true;
    }

    // ---- research buttons (blacksmith/university/monastery/castle uniques
    // and unit-line upgrades at their production building)
    const busy = !!b.research;
    // player-wide queued techs (the sim's alreadyQueued gate spans ALL buildings)
    const queuedTechs = this.queuedTechIds(state);
    const researchBtns = researchMenuButtons(view, b.defId, busy, queuedTechs);
    const up = b.defId === 'townCenter'
      ? ageUpButton(view, this.completedBuildingDefIds(state), busy, queuedTechs)
      : null;
    if (researchBtns.length > 0 || up) this.addCardSection('Research upgrades');
    for (const rb of researchBtns) {
      const baseTip = `${rb.name}\n${costText(rb.cost ?? {})} • ${rb.timeSeconds}s`;
      this.addButton(
        rb.icon,
        extendedTooltip(baseTip, techExtendedTip(gameData.techs[rb.id]), getSettings().extendedTooltips),
        rb.enabled, false,
        () => this.host.researchTech(b.id, rb.id),
        rb.reason,
      );
      shown = true;
    }
    if (up) {
      const baseTip = `Advance to ${up.name}\n${costText(up.cost ?? {})} • ${up.timeSeconds}s`;
      this.addButton(
        up.icon,
        extendedTooltip(baseTip, techExtendedTip(gameData.techs[up.techId]), getSettings().extendedTooltips),
        up.enabled, false,
        () => this.host.researchTech(b.id, up.techId),
        up.reason,
      );
      if (!up.requirementMet) this.noteRow.textContent = up.requirementText;
      shown = true;
    }

    // ---- age-up on the TC, with requirement feedback ('2 Feudal Age buildings needed')
    if (b.defId === 'townCenter') {
      this.addCardSection('Town Center actions');
      const occupants = b.garrison ?? [];
      const sheltered = occupants.filter((id) => state.entities.get(id)?.sheltering === true).length;
      const seeking = [...state.entities.values()].filter((e) =>
        isTownBellSeeking(e, this.host.humanPlayer, b.id)).length;
      const outsideVillagers = [...state.entities.values()].filter((e) => e.kind === 'unit'
        && e.player === this.host.humanPlayer && e.hp > 0 && e.garrisonedIn === undefined
        && !!gameData.units[e.defId]?.gather).length;
      const room = Math.max(0, (def?.garrisonCapacity ?? 0) - occupants.length);
      const active = sheltered + seeking > 0;
      const enabled = active || (outsideVillagers > 0 && room > 0);
      const tip = active
        ? `↑ Send villagers OUT\nReturn sheltered villagers to their previous jobs`
        : `↓ Call villagers IN\nShelter the nearest villagers\nEach villager adds an arrow to the Town Center volley`;
      const reason = outsideVillagers === 0 ? 'no villagers outside' : 'Town Center is full';
      this.addButton(
        'icon/cmd/townBell', tip, enabled, active,
        () => this.host.townBell(b.id), reason, undefined, active ? 'out' : 'in',
      );
      shown = true;
    }

    if ((def?.trains?.length ?? 0) > 0) {
      this.addButton(
        'icon/cmd/rally',
        'Set rally point\nNext tap chooses where newly trained units will travel',
        true,
        this.host.getArmedVerb() === 'rally',
        () => this.host.armVerb('rally'),
      );
      this.addCardSection('Rally flag · arm the button, then choose a destination', true);
      shown = true;
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
      const qualifying = (b.garrison ?? []).filter((id) => {
        const u = state.entities.get(id);
        const ud = u ? gameData.units[u.defId] : undefined;
        return !!ud && (!!ud.gather || ud.classes.includes('archer'));
      }).length;
      const volley = def?.arrowsBase !== undefined
        ? Math.min(def.arrowsMax ?? Infinity, def.arrowsBase + qualifying * (def.arrowsPerGarrison ?? 0))
        : undefined;
      this.rebuildGarrisonPanel(
        b.id, gp.occupants, gp.count, gp.capacity, gp.ungarrisonEnabled, gp.reason,
        volley, def?.garrisonHealRate,
      );
      shown = true;
    }

    // ---- shared production queue chips. Consecutive identical entries collapse
    // into one stack (×2, ×3...) while preserving the actual 15-slot order.
    for (const stack of queueStacks(b.trainQueue ?? [])) {
      const model = queueChipModel(stack.item, view.civ);
      const chip = document.createElement('div');
      chip.className = 'bf-qitem';
      const blockedStack = housingBlocked && stack.startIndex === 0;
      if (blockedStack) chip.classList.add('blocked');
      const baseQueueTip = model.isTech
        ? `Researching ${model.name}${stack.count > 1 ? ` ×${stack.count}` : ''} (tap to cancel one)`
        : `${model.name}${stack.count > 1 ? ` ×${stack.count}` : ''} (tap to cancel one)`;
      const queueTip = blockedStack
        ? `Blocked by housing — build a House\n${baseQueueTip}`
        : baseQueueTip;
      const queueDetail = model.isTech
        ? techExtendedTip(gameData.techs[stack.item.techId ?? ''])
        : unitExtendedTip(gameData.units[stack.item.defId]);
      setGameTooltip(chip, extendedTooltip(queueTip, queueDetail, getSettings().extendedTooltips));
      chip.appendChild(this.host.assets.getIconCanvas(model.icon));
      if (stack.count > 1) {
        const count = document.createElement('span');
        count.className = 'bf-qcount';
        count.textContent = `×${stack.count}`;
        chip.appendChild(count);
      }
      if (blockedStack) {
        const blocked = document.createElement('span');
        blocked.className = 'bf-qblocked';
        blocked.textContent = '⌂ !';
        chip.appendChild(blocked);
      }
      const prog = document.createElement('div');
      prog.className = 'bf-qprog';
      chip.appendChild(prog);
      // Remove the last item in the visible stack; the front item's live
      // progress is never accidentally discarded when later copies exist.
      chip.addEventListener('click', () => this.host.cancelTrain(b.id, stack.endIndex));
      this.queueRow.appendChild(chip);
      this.queueProgressEls.push({ el: prog, buildingId: b.id, index: stack.startIndex });
      shown = true;
    }

    // ---- housed queue-stall feedback (sim production.ts: a unit item at the
    // front waits, unstarted, until pop room opens)
    if (housingBlocked) {
      const stall = 'Housing full — training resumes when a House completes';
      this.noteRow.textContent = this.noteRow.textContent
        ? `${this.noteRow.textContent} · ${stall}` : stall;
    }

    // ---- rally flag control (GDD: "tap the flag control to clear")
    if (hasActiveRally(b)) {
      const btn = document.createElement('button');
      btn.className = 'bf-btn';
      btn.style.cssText = 'margin-top:6px;margin-right:6px;';
      btn.textContent = 'Clear rally';
      setGameTooltip(btn, 'Remove the rally flag — new units step out beside the building again');
      btn.addEventListener('click', () => this.host.clearRally(b.id));
      this.utilRow.appendChild(btn);
      shown = true;
    }

    this.addDeleteButton(b);
    // Even passive buildings (House, wall segments, etc.) need a visible details
    // card so their owner can inspect and delete them.
    return true;
  }

  /**
   * Delete for own buildings (foundations included): the sim's deleteEntity
   * refunds the queue and the unbuilt foundation fraction. Destructive, so it
   * takes two taps to confirm (same pattern as Resign).
   */
  private addDeleteButton(b: Entity): void {
    if (b.player !== this.host.humanPlayer) return;
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
    this.noteRow.textContent = 'Trade fee: 30%';
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
        else this.showTip(`Sell ${TRADE_LOT} ${row.res}\n(${row.sellReason ?? ''})`, sell);
      });
      setGameTooltip(sell, `Sell ${TRADE_LOT} ${row.res}\nReceive ${row.sellGold} gold`);
      const buy = document.createElement('button');
      buy.className = 'bf-mbtn' + (row.buyEnabled ? '' : ' disabled');
      buy.textContent = `Buy ${TRADE_LOT} → −${row.buyGold}g`;
      buy.addEventListener('click', () => {
        if (row.buyEnabled) this.host.marketTrade('gold', row.res, TRADE_LOT);
        else this.showTip(`Buy ${TRADE_LOT} ${row.res}\n(${row.buyReason ?? ''})`, buy);
      });
      setGameTooltip(buy, `Buy ${TRADE_LOT} ${row.res}\nCosts ${row.buyGold} gold`);
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
    volleyArrows?: number,
    healRate?: number,
  ): void {
    this.garrisonBox.classList.add('show');
    const label = document.createElement('div');
    label.className = 'bf-note bf-num';
    label.textContent = `Garrisoned ${formatRatio(count, capacity)}`
      + (volleyArrows !== undefined ? ` · Volley ${volleyArrows} arrow${volleyArrows === 1 ? '' : 's'}` : '')
      + (healRate ? ` · Healing ${formatStat(healRate)} HP/s` : '');
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
      else this.showTip(`Ungarrison\n(${reason ?? 'unavailable'})`, btn);
    });
    setGameTooltip(btn, `Ungarrison all\nSend every occupant back outside`);
    this.garrisonBox.appendChild(label);
    this.garrisonBox.appendChild(row);
    this.garrisonBox.appendChild(btn);
  }

  /**
   * `icon` is the FINAL frame to render — cardModel already picked the colored
   * icon or its `/gray` companion, so gray can only mean genuinely unavailable.
   * `badge` is a non-blocking warning glyph (housed) over a still-live button.
   */
  private addButton(
    icon: string,
    tooltip: string,
    enabled: boolean,
    active: boolean,
    onClick: () => void,
    disabledReason?: string,
    badge?: string,
    direction?: 'in' | 'out',
    shiftRepeat = 1,
  ): void {
    const btn = document.createElement('button');
    let lastPointerType: string | null = null;
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
    if (direction) {
      const span = document.createElement('span');
      span.className = `bf-cmddir ${direction}`;
      span.textContent = direction === 'in' ? '↓ IN' : '↑ OUT';
      btn.appendChild(span);
    }
    const hotkey = this.registerCommandHotkey(btn);
    if (hotkey) {
      const key = document.createElement('span');
      key.className = 'bf-cmdkey';
      key.textContent = hotkey.toUpperCase();
      btn.appendChild(key);
    }
    const fullTip = enabled ? tooltip : `${tooltip}\n(${disabledReason ?? 'not enough resources'})`;
    const displayedTip = hotkey ? `[${hotkey.toUpperCase()}] ${fullTip}` : fullTip;
    setGameTooltip(btn, displayedTip);
    btn.addEventListener('pointerdown', (event) => {
      lastPointerType = event.pointerType;
    });
    btn.addEventListener('click', (event) => {
      if (enabled) {
        const repeats = commandRepeatCount(event.shiftKey, shiftRepeat);
        for (let i = 0; i < repeats; i++) onClick();

        // Touch has no persistent hover. Arming Rally/Garrison also rebuilds
        // the command card, which used to erase the pointer tooltip instantly.
        // Wait for that rebuild, then explain the action beside the fresh card.
        if (lastPointerType !== null && lastPointerType !== 'mouse') {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (!this.card.classList.contains('show')) return;
            this.showTip(displayedTip, btn.isConnected ? btn : this.card);
          }));
        }
      }
      else this.showTip(displayedTip, btn);
      lastPointerType = null;
    });
    this.cardGrid.appendChild(btn);
  }

  private addCardSection(label: string, hint = false): void {
    const section = document.createElement('div');
    section.className = `bf-cardsection${hint ? ' hint' : ''}`;
    section.textContent = label;
    this.cardGrid.appendChild(section);
  }

  private registerCommandHotkey(btn: HTMLButtonElement): string | null {
    const key = COMMAND_HOTKEYS[this.nextCommandHotkey++];
    if (!key) return null;
    this.commandHotkeys.set(key, btn);
    return key;
  }

  private addFormationButton(formation: Formation, active: boolean): void {
    const names: Record<Formation, string> = {
      line: 'Line formation', rectangle: 'Rectangle formation', wedge: 'Wedge formation',
    };
    const points: Record<Formation, Array<[number, number]>> = {
      line: [[8, 20], [16, 20], [24, 20], [32, 20]],
      rectangle: [[13, 13], [27, 13], [13, 27], [27, 27]],
      wedge: [[20, 8], [13, 17], [27, 17], [7, 28], [33, 28]],
    };
    const btn = document.createElement('button');
    btn.className = `bf-cmdbtn${active ? ' active' : ''}`;
    btn.setAttribute('aria-pressed', String(active));
    const icon = document.createElement('span');
    icon.className = 'bf-formationicon';
    for (const [left, top] of points[formation]) {
      const dot = document.createElement('span');
      dot.className = 'bf-formationdot';
      dot.style.left = `${left}px`;
      dot.style.top = `${top}px`;
      icon.appendChild(dot);
    }
    btn.appendChild(icon);
    const hotkey = this.registerCommandHotkey(btn);
    if (hotkey) {
      const key = document.createElement('span');
      key.className = 'bf-cmdkey';
      key.textContent = hotkey.toUpperCase();
      btn.appendChild(key);
    }
    setGameTooltip(btn, `${hotkey ? `[${hotkey.toUpperCase()}] ` : ''}${names[formation]}\nArrange the selected troops now and keep this layout for their next move`);
    btn.addEventListener('click', () => this.host.setFormation(formation));
    this.cardGrid.appendChild(btn);
  }

  private setBuildingCardTitle(icon: string, text: string): void {
    const label = document.createElement('div');
    label.className = 'bf-buildingtitle bf-num';
    label.textContent = text;
    this.cardTitle.replaceChildren(this.host.assets.getIconCanvas(icon), label);
    this.cardTitle.classList.add('with-icon');
  }

  private showTip(text: string, anchor: HTMLElement = this.card): void {
    showGameTooltip(text, anchor);
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
