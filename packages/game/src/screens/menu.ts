// Menu shell (DOM): title -> play -> practice setup / campaign -> scenario
// list -> briefing -> game, plus the settings screen. Navigation state lives
// in the pure flow reducer (screens/flow.ts); this module only renders the top
// of the stack and dispatches events. ART_BIBLE §8 styling: dark wood panels,
// parchment buttons, Jacquard display face, gold accents.

import { gameData } from '@bf/data';
import { campaigns, scenariosById, type CampaignDef } from '@bf/scenarios';
import { BOT_DIFFICULTIES, type BotDifficulty } from '@bf/ai';
import { FALLBACK_PLAYER_COLOR_NAMES, FALLBACK_PLAYER_RAMPS } from '../recolor';
import {
  DEFAULT_PRACTICE_SETUP, MAP_SIZE_TILES,
  type PracticeMapSize, type PracticeSetup,
} from '../simBridge';
import { loadProgress, nextScenarioId, scenarioStatuses } from '../campaign/progress';
import {
  campaignSlot, mostRecentSave, PRACTICE_SLOT, savedMatchLabel, saveForCampaign,
  type SaveEntry, type SaveSlot,
} from '../persist';
import { buildSettingsControls } from '../settingsUi';
import { setGameTooltip } from '../tooltip';
import { AudioEngine } from '../audio/engine';
import { menuScreenEvent } from '../analytics/events';
import { noopAnalytics, type AnalyticsSink } from '../analytics/sink';
import {
  currentScreen, flowReducer, initialFlow,
  type FlowEvent, type FlowState, type MenuScreen,
} from './flow';
import { flowFromHash, flowHash } from './route';

/** What the menu resolved to — the app shell starts this game. */
export type GameRequest =
  | { mode: 'practice'; setup: PracticeSetup }
  | { mode: 'scenario'; scenarioId: string }
  /** `scenarioId` only addresses the match in the URL; the slot does the work. */
  | { mode: 'resume'; slot: SaveSlot; scenarioId?: string };

const MENU_CSS = `
.bf-menu { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  overflow-y:auto; background:
    radial-gradient(ellipse at 50% 30%, rgba(230,192,74,0.08), transparent 60%),
    repeating-linear-gradient(90deg, #2C1F12 0 46px, #33241511 46px 48px),
    linear-gradient(#241809, #16100a);
  font-family:"Alegreya Sans","Trebuchet MS",sans-serif; color:#F2E6CB; }
.bf-menu-panel { width:min(460px, 92vw); max-height:92vh; overflow-y:auto; margin:12px 0;
  padding:26px 26px 22px; text-align:center;
  background:linear-gradient(#3a2a18,#2C1F12); border:2px solid #1A1208; border-radius:6px;
  box-shadow:0 0 0 1px #8A6414 inset, 0 0 0 3px #64492B inset, 0 12px 40px rgba(0,0,0,0.6); }
.bf-menu-panel.wide { width:min(720px, 94vw); }
.bf-menu-name { font-family:"Cinzel","Georgia",serif; font-size:48px; font-weight:700; line-height:1;
  color:#E9C76A; text-shadow:0 2px 3px #0b0703; margin:0 0 6px; letter-spacing:3px; }
.bf-menu-h { font-family:"Cinzel","Georgia",serif; font-size:30px; font-weight:600; line-height:1.05;
  color:#E9C76A; text-shadow:0 2px 3px #0b0703; margin:0 0 12px; letter-spacing:1.5px; }
.bf-menu-sub { font-size:14px; color:#B99A6B; margin:0 0 22px; letter-spacing:1px; }
.bf-menu-btn { display:block; width:100%; margin:10px 0; padding:12px 0; font-family:inherit; font-size:19px;
  color:#1A1208; background:linear-gradient(#EFDDB5,#DABE8D); border:1px solid #B99A6B; border-radius:4px;
  box-shadow:0 2px 0 #8A6414; cursor:pointer; letter-spacing:1px; }
.bf-menu-btn:hover:not(:disabled) { background:linear-gradient(#F7EBCB,#E4CBA0); }
.bf-menu-btn:active:not(:disabled) { transform:translateY(1px); box-shadow:0 1px 0 #8A6414; }
.bf-menu-btn:disabled { color:#7a7266; background:#4a3a26; border-color:#3a2d1c; box-shadow:none; cursor:default; }
.bf-menu-btn.ghost { background:none; color:#DABE8D; border-color:#64492B; box-shadow:none; }
.bf-menu-btn.primary { font-size:22px; }
.bf-menu :where(.bf-menu-btn,.bf-seg button,.bf-set-seg button,.bf-civ-card,.bf-camp-card,.bf-scn,.bf-color):focus-visible {
  outline:3px solid #FFE98A; outline-offset:2px; box-shadow:0 0 0 2px #16100a;
}
.bf-menu input[type=range]:focus-visible { outline:3px solid #FFE98A; outline-offset:3px; }
.bf-menu-note { font-size:12px; color:#B99A6B; display:block; margin-top:2px; }
.bf-menu-label { text-align:left; font-size:13px; color:#B99A6B; letter-spacing:1px; margin:14px 0 5px; }
.bf-setup-box { margin:0 0 16px; padding:12px 14px 14px; text-align:left; background:#241809; border:1px solid #8A6414; border-radius:5px; box-shadow:0 0 0 1px #1A1208 inset; }
.bf-setup-box .bf-menu-label:first-child { margin-top:0; color:#E6C04A; font-size:15px; }
.bf-setup-help { margin:3px 0 8px; color:#B99A6B; font-size:12px; line-height:1.35; }
.bf-seg { display:flex; gap:6px; }
.bf-seg button { flex:1; padding:8px 0; font-family:inherit; font-size:14px; cursor:pointer;
  color:#DABE8D; background:#241809; border:1px solid #64492B; border-radius:4px; }
.bf-seg button.on { color:#1A1208; background:linear-gradient(#EFDDB5,#DABE8D); border-color:#B99A6B;
  box-shadow:0 1px 0 #8A6414; }
.bf-difficulty { padding:9px 10px 8px; background:#1d1409; border:1px solid #50391f; border-radius:4px; }
.bf-diff-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
.bf-diff-name { color:#E6C04A; font-size:17px; font-weight:600; letter-spacing:.6px; }
.bf-diff-level { color:#8f7958; font-size:11px; letter-spacing:.7px; }
.bf-difficulty input[type=range] { display:block; width:100%; margin:8px 0 5px; accent-color:#E6C04A; }
.bf-diff-scale { display:flex; justify-content:space-between; color:#806b4d; font-size:10px; letter-spacing:.5px; }
.bf-diff-desc { min-height:31px; margin-top:6px; color:#B99A6B; font-size:11.5px; line-height:1.3; }
.bf-civ { display:flex; flex-direction:column; gap:6px; }
.bf-civ-card { text-align:left; padding:9px 12px; cursor:pointer; border:1px solid #64492B; border-radius:4px;
  background:#241809; color:#DABE8D; font-family:inherit; }
.bf-civ-card.on { border-color:#E6C04A; box-shadow:0 0 0 1px #8A6414; background:#2e2010; }
.bf-civ-card .bf-civ-name { font-size:17px; color:#EFDDB5; letter-spacing:1px; }
.bf-civ-card.on .bf-civ-name { color:#E6C04A; }
.bf-civ-card .bf-civ-desc { font-size:12px; line-height:1.35; color:#B99A6B; margin-top:3px; }
.bf-colors { display:flex; gap:8px; justify-content:flex-start; }
.bf-color { width:34px; height:34px; border-radius:4px; cursor:pointer; border:2px solid #1A1208;
  box-shadow:0 0 0 1px #64492B; }
.bf-color.on { border-color:#E6C04A; box-shadow:0 0 0 2px #8A6414; }
/* Campaign cards: the cover art is the card. Text-only campaign lists sold the
   twelve-chapter stories as a settings menu; the art carries the invitation and
   the copy underneath carries the progress. */
.bf-camp-card { display:block; width:100%; overflow:hidden; text-align:left; padding:0; cursor:pointer;
  margin:12px 0; background:#241809; border:1px solid #64492B; border-radius:6px; color:#DABE8D;
  font-family:inherit; box-shadow:0 6px 18px rgba(0,0,0,.35); transition:border-color .12s, transform .12s; }
.bf-camp-card:hover { border-color:#E6C04A; transform:translateY(-2px); }
.bf-camp-card:active { transform:none; }
.bf-camp-art { position:relative; display:block; aspect-ratio:16/9; background:#16100a; }
.bf-camp-art img { display:block; width:100%; height:100%; object-fit:cover; object-position:center 42%; }
/* Scrim: keeps the display type legible over any cover without dulling the art. */
.bf-camp-art::after { content:""; position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(rgba(16,10,5,0) 38%, rgba(16,10,5,.72) 78%, rgba(16,10,5,.94)); }
.bf-camp-art-copy { position:absolute; left:16px; right:16px; bottom:11px; z-index:1; display:block; }
.bf-camp-title { display:block; margin:0; font-family:"Cinzel","Georgia",serif; font-size:24px; font-weight:700;
  line-height:1.1; color:#F3DE9C; letter-spacing:1.2px; text-shadow:0 2px 6px #0b0703, 0 0 18px rgba(0,0,0,.7); }
.bf-camp-sub { display:block; margin-top:2px; font-size:13px; letter-spacing:1.4px; text-transform:uppercase;
  color:#E6C04A; text-shadow:0 1px 4px #0b0703; }
.bf-camp-ribbon { position:absolute; top:10px; right:10px; z-index:1; padding:3px 9px; border-radius:3px;
  font-size:10.5px; letter-spacing:1.4px; color:#1A1208; background:linear-gradient(#F2D45C,#D4A82A);
  box-shadow:0 0 0 1px #8E6E14, 0 2px 6px rgba(0,0,0,.5); }
/* A campaign with a match in its own slot — parchment, not the gold of a
   finished campaign, so "waiting for you" never reads as "done". */
.bf-camp-ribbon.saved { color:#1A1208; background:linear-gradient(#EFDDB5,#DABE8D);
  box-shadow:0 0 0 1px #8A6414, 0 2px 6px rgba(0,0,0,.5); }
.bf-camp-body { display:block; padding:12px 16px 14px; }
.bf-camp-desc { display:block; font-size:12.5px; line-height:1.45; color:#B99A6B; }
.bf-camp-progress { display:flex; align-items:baseline; justify-content:space-between; gap:10px;
  margin-top:9px; font-size:12px; color:#DABE8D; }
.bf-camp-next { color:#8f7958; font-size:11.5px; min-width:0; overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap; }
.bf-bar { display:block; height:5px; margin-top:7px; border-radius:3px; background:#1d1409;
  box-shadow:0 0 0 1px #50391f inset; overflow:hidden; }
.bf-bar > span { display:block; height:100%; border-radius:3px;
  background:linear-gradient(90deg,#8E6E14,#F2D45C); }
/* Scenario-list hero: the campaign's cover again, so the chapter list reads as
   part of the same story rather than a bare index. */
.bf-camp-hero { position:relative; display:block; overflow:hidden; margin:-26px -26px 4px;
  aspect-ratio:16/7; background:#16100a; border-bottom:1px solid #8A6414; }
.bf-camp-hero img { display:block; width:100%; height:100%; object-fit:cover; object-position:center 40%; }
.bf-camp-hero::after { content:""; position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(rgba(16,10,5,.1) 30%, rgba(16,10,5,.78) 76%, #2C1F12); }
.bf-camp-hero-copy { position:absolute; left:26px; right:26px; bottom:12px; z-index:1; text-align:left; }
.bf-camp-hero-copy .bf-camp-title { font-size:27px; }
.bf-scn { display:flex; align-items:center; gap:12px; width:100%; text-align:left; padding:8px 12px 8px 8px;
  margin:6px 0; background:#241809; border:1px solid #64492B; border-radius:5px; color:#EFDDB5;
  font-family:inherit; font-size:15px; cursor:pointer; }
.bf-scn:disabled { cursor:default; color:#6e6252; background:#1d1409; }
.bf-scn:not(:disabled):hover { border-color:#B99A6B; }
.bf-scn-thumb { position:relative; flex:0 0 62px; width:62px; height:44px; overflow:hidden;
  border-radius:4px; background:#16100a; box-shadow:0 0 0 1px #1A1208; }
.bf-scn-thumb img { display:block; width:100%; height:100%; object-fit:cover; }
/* Locked chapters keep their art but lose their color: the story ahead is
   visible and plainly out of reach. */
.bf-scn-thumb.locked img { filter:grayscale(1) brightness(.42); }
.bf-scn-thumb .bf-medal { position:absolute; left:2px; bottom:2px; flex:none; width:19px; height:19px;
  font-size:10px; border-width:1px; }
.bf-scn:not(:disabled):hover .bf-scn-thumb { box-shadow:0 0 0 1px #B99A6B; }
.bf-act { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin:19px 2px 7px;
  padding-bottom:6px; border-bottom:1px solid #64492B; text-align:left; }
.bf-act:first-of-type { margin-top:8px; }
.bf-act-title { color:#E6C04A; font-family:"Cinzel","Georgia",serif; font-size:15px; letter-spacing:.8px; }
.bf-act-years { color:#8f7958; font-size:11px; letter-spacing:1px; }
.bf-medal { flex:0 0 34px; width:34px; height:34px; border-radius:50%; display:flex; align-items:center;
  justify-content:center; font-size:15px; border:2px solid #1A1208; }
.bf-medal.completed { background:radial-gradient(circle at 35% 30%, #F2D45C, #D4A82A 60%, #8E6E14);
  color:#1A1208; box-shadow:0 0 0 1px #E6C04A, 0 0 8px rgba(230,192,74,0.5); }
.bf-medal.unlocked { background:radial-gradient(circle at 35% 30%, #EFDDB5, #DABE8D 60%, #8A6414);
  color:#1A1208; box-shadow:0 0 0 1px #B99A6B; }
.bf-medal.locked { background:radial-gradient(circle at 35% 30%, #4a3a26, #2C1F12); color:#7a7266;
  box-shadow:0 0 0 1px #3a2d1c; }
.bf-scn-copy { min-width:0; display:flex; flex-direction:column; gap:2px; }
.bf-scn-title { line-height:1.15; }
.bf-scn-meta { color:#8f7958; font-size:11px; letter-spacing:.35px; }
.bf-scn .bf-scn-state { margin-left:auto; font-size:11px; color:#B99A6B; letter-spacing:1px; }
.bf-scn .bf-scn-state.saved { color:#E6C04A; }
/* Restarting a saved chapter throws the save away, so it sits apart from the
   footer's RESUME rather than beside it. */
.bf-brief-restart { width:100%; margin:14px 0 0; font-size:15px; }
.bf-brief { text-align:left; }
.bf-chapter-kicker { display:block; color:#E6C04A; font-size:11px; letter-spacing:1.3px;
  text-transform:uppercase; text-shadow:0 1px 4px #0b0703; }
.bf-chapter-kicker.muted { color:#C9AE7E; letter-spacing:.9px; text-transform:none; font-size:11.5px; }
/* Briefing hero: chapter art bled to the panel edges with the title set over
   it, so the chapter opens like a title card instead of a form. */
.bf-chapter-art { position:relative; overflow:hidden; margin:-26px -26px 16px; background:#16100a;
  border-bottom:1px solid #8A6414; aspect-ratio:16/9; }
.bf-chapter-art img { display:block; width:100%; height:100%; object-fit:cover; object-position:center 42%; }
.bf-chapter-art::after { content:""; position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(rgba(16,10,5,0) 34%, rgba(16,10,5,.76) 74%, #2C1F12); }
.bf-chapter-art-copy { position:absolute; left:26px; right:26px; bottom:12px; z-index:1; }
.bf-chapter-art-copy .bf-menu-h { margin:2px 0 3px; font-size:27px;
  text-shadow:0 2px 6px #0b0703, 0 0 18px rgba(0,0,0,.7); }
.bf-brief-hist { font-size:14px; line-height:1.5; color:#EFDDB5; }
.bf-brief-hist p { margin:0 0 10px; }
.bf-brief-list { margin:4px 0 0; padding-left:18px; font-size:13.5px; line-height:1.45; color:#DABE8D; }
.bf-brief-list li { margin:2px 0; }
/* Sticky action row: START must be visible without scrolling the whole
   briefing (it sat 200-344px below the fold on desktop/phone alike). The
   history/objectives/hints scroll behind the top fade. bottom/margin-bottom
   are -22px (the panel's bottom padding): the sticky rect is inset by the
   scroll container's padding, and without the offsets scrolled text would
   peek through a 22px strip under the row. */
.bf-brief-actions { position:sticky; bottom:-22px; display:flex; gap:10px; margin:16px 0 -22px;
  padding:12px 0 14px; background:linear-gradient(rgba(44,31,18,0), #2C1F12 24%); }
.bf-brief-actions .bf-menu-btn { width:auto; margin:0; }
.bf-brief-actions .bf-menu-btn.primary { flex:2; }
.bf-brief-actions .bf-menu-btn.ghost { flex:1; }
@media (max-width:520px) {
  .bf-menu-panel.wide { width:96vw; padding:22px 16px 20px; }
  .bf-scn { gap:9px; padding:7px 9px 7px 7px; }
  .bf-scn .bf-scn-state { display:none; }
  .bf-scn-meta { font-size:10px; }
  .bf-scn-thumb { flex-basis:52px; width:52px; height:38px; }
  .bf-act-title { font-size:14px; }
  .bf-act-years { flex:none; white-space:nowrap; }
  .bf-chapter-kicker { font-size:10px; letter-spacing:.7px; }
  /* The bled hero art follows the panel's smaller padding. */
  .bf-camp-hero, .bf-chapter-art { margin-left:-16px; margin-right:-16px; }
  .bf-camp-hero, .bf-chapter-art { margin-top:-22px; }
  .bf-camp-hero-copy, .bf-chapter-art-copy { left:16px; right:16px; }
  .bf-camp-title { font-size:20px; }
  .bf-camp-hero-copy .bf-camp-title, .bf-chapter-art-copy .bf-menu-h { font-size:22px; }
  .bf-camp-sub { font-size:11.5px; letter-spacing:1px; }
  /* Card footers lose the "Next: <chapter>" hint to the chapter count; the
     scenario-list hero keeps its own count line. */
  .bf-camp-progress .bf-camp-next { display:none; }
}
@media (prefers-reduced-motion:reduce) {
  .bf-camp-card { transition:none; }
  .bf-camp-card:hover { transform:none; }
}
`;

const DIFFICULTY_DETAILS: Record<BotDifficulty, { label: string; description: string }> = {
  beginner: { label: 'Beginner', description: 'Slow decisions, a small army, and forgiving economic pressure.' },
  easy: { label: 'Easy', description: 'A relaxed opponent with limited expansion and simple armies.' },
  standard: { label: 'Standard', description: 'Balanced economy, defenses, research, and organized attacks.' },
  medium: { label: 'Medium', description: 'The former Hard AI: fast age-ups, counters, siege, and steady pressure.' },
  hard: { label: 'Hard', description: 'Earlier attacks, a larger economy, rapid reinforcement, and flanking.' },
  expert: { label: 'Expert', description: 'Sharp reactions, heavy production, adaptive counters, and relentless waves.' },
  hardcore: { label: 'Hardcore', description: 'Maximum AI tempo: near-continuous pressure, expansion, siege, monks, and multi-front control.' },
};

const MAP_SIZES: Array<{ id: PracticeMapSize; label: string }> = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];

/**
 * In-place Practice setup changes rebuild the panel, but should not throw a
 * phone user back to the top of the civilization list. Real screen
 * navigation still starts at the top.
 */
export function menuScrollTopAfterRender(previous: number, preserve: boolean): number {
  return preserve ? Math.max(0, previous) : 0;
}

/**
 * Campaign titles are authored as "Protagonist — Subtitle". The cards set the
 * protagonist as the display line and the subtitle as a kicker beneath it; a
 * title without the separator keeps the whole string as the name.
 */
export function splitCampaignTitle(title: string): { name: string; subtitle: string } {
  const at = title.indexOf(' — ');
  return at < 0
    ? { name: title, subtitle: '' }
    : { name: title.slice(0, at), subtitle: title.slice(at + 3) };
}

/**
 * Horizontal crop for a chapter thumbnail. Chapters share one act (Wallace) or
 * one campaign cover (the legendary six) image, so the thumbnails pan across
 * the source frame instead of repeating the identical crop down the list.
 */
export function thumbnailFocus(index: number): string {
  return `${(index * 17) % 101}% 50%`;
}

/** Play-menu note for Campaign, counted from the data so it cannot go stale. */
export function campaignSubtitle(defs: CampaignDef[] = Object.values(campaigns)): string {
  const chapters = defs.reduce((n, campaign) => n + campaign.scenarioIds.length, 0);
  return `${defs.length} historical campaigns · ${chapters} chapters`;
}

/**
 * Show the menu flow; resolves when the player starts a game. `flow` seeds
 * navigation (post-reload deep links, e.g. straight back to a scenario list).
 * What can be resumed is read from the save slots, not passed in — several
 * campaigns can be in progress and each screen asks about the one it shows.
 */
export function showMenu(
  root: HTMLElement,
  opts: { flow?: FlowState; analytics?: AnalyticsSink } = {},
): Promise<GameRequest> {
  const analytics = opts.analytics ?? noopAnalytics;
  if (!document.getElementById('bf-menu-style')) {
    const style = document.createElement('style');
    style.id = 'bf-menu-style';
    style.textContent = MENU_CSS;
    document.head.appendChild(style);
  }

  return new Promise((resolve) => {
    let flow = opts.flow ?? initialFlow();
    const practice: PracticeSetup = {
      ...DEFAULT_PRACTICE_SETUP,
      opponents: [...DEFAULT_PRACTICE_SETUP.opponents],
    };

    const screen = document.createElement('div');
    screen.className = 'bf-menu';
    const panel = document.createElement('div');
    panel.className = 'bf-menu-panel';
    screen.appendChild(panel);
    root.appendChild(screen);

    // Menu-scoped SFX engine: exists so the settings sliders give an audible
    // preview instead of tuning blind (the match creates its own engine).
    // Lazy AudioContext — the slider drag itself is the unlocking gesture.
    const previewAudio = new AudioEngine();

    // ------------------------------------------------------------ URL routing
    // Each screen has an address (screens/route.ts), so the location bar names
    // where you are and browser/Android back walks the menu. History depth is
    // carried in history.state instead of a counter: after a forward/back jump
    // the entry itself still knows whether there is anything behind it, which
    // a local counter would have lost.
    const historyDepth = (): number => {
      const state = window.history.state as { bfMenuDepth?: unknown } | null;
      return typeof state?.bfMenuDepth === 'number' ? state.bfMenuDepth : 0;
    };
    const replaceUrl = (depth = historyDepth()): void => {
      window.history.replaceState({ bfMenuDepth: depth }, '', flowHash(flow));
    };
    const onAddressChanged = (): void => {
      // Back/forward or a hand-edited address: the URL is now the truth, and
      // an address this build cannot serve falls back to the title.
      const next = flowFromHash(window.location.hash) ?? initialFlow();
      const changed = flowHash(next) !== flowHash(flow);
      flow = next;
      // Rewrite an address that resolved to something else (an unknown path,
      // a campaign this build does not have) to the screen actually shown.
      if (window.location.hash !== flowHash(flow)) replaceUrl();
      // Browser back/forward is menu navigation too, so the drop-off funnel
      // has to see it; dispatch reports the taps, this reports the rest.
      if (changed) {
        render(); // back/forward raise popstate AND hashchange
        trackScreen();
      }
    };
    window.addEventListener('popstate', onAddressChanged);
    window.addEventListener('hashchange', onAddressChanged);
    replaceUrl(0);

    const done = (request: GameRequest): void => {
      window.removeEventListener('popstate', onAddressChanged);
      window.removeEventListener('hashchange', onAddressChanged);
      previewAudio.dispose();
      screen.remove();
      resolve(request);
    };
    // Where players drop off before ever starting a match. Reported from
    // dispatch rather than render() because render also re-runs for in-place
    // setup edits (picking a civ, adding an opponent), which are not
    // navigation. The reducer returns the same state for a rejected event, so
    // an accepted transition always means the top screen changed.
    const trackScreen = (): void => analytics.track(menuScreenEvent(currentScreen(flow).id));
    const dispatch = (ev: FlowEvent): void => {
      const next = flowReducer(flow, ev);
      if (next === flow) return;
      // In-app Back and browser Back must be the same motion, so when this
      // menu owns a history entry it steps out through history and lets
      // popstate re-render. Deep links start with nothing behind them, so
      // there Back rewrites the current entry instead of leaving the app.
      if (ev.kind === 'back' && historyDepth() > 0) {
        window.history.back();
        return;
      }
      const depth = historyDepth();
      flow = next;
      if (ev.kind === 'back') replaceUrl(0);
      else window.history.pushState({ bfMenuDepth: depth + 1 }, '', flowHash(flow));
      render();
      trackScreen();
    };

    // ---------------------------------------------------------- small helpers
    const el = <K extends keyof HTMLElementTagNameMap>(
      tag: K, className: string, text?: string,
    ): HTMLElementTagNameMap[K] => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const button = (label: string, cls: string, onClick: () => void, sub?: string): HTMLButtonElement => {
      const b = el('button', `bf-menu-btn${cls ? ` ${cls}` : ''}`);
      b.appendChild(document.createTextNode(label));
      if (sub) b.appendChild(el('span', 'bf-menu-note', sub));
      b.addEventListener('click', onClick);
      return b;
    };
    const backButton = (): HTMLButtonElement => button('Back', 'ghost', () => dispatch({ kind: 'back' }));
    /**
     * Campaign/chapter artwork. Lazy + async: the campaign list holds seven
     * full-width covers and only the first two are ever on screen, so the rest
     * must not compete with the atlas download on a phone connection.
     */
    const coverImage = (src: string, alt: string, focus?: string): HTMLImageElement => {
      const image = document.createElement('img');
      image.src = src;
      image.alt = alt;
      image.loading = 'lazy';
      image.decoding = 'async';
      if (focus) image.style.objectPosition = focus;
      return image;
    };
    const progressBar = (completed: number, total: number): HTMLSpanElement => {
      const bar = el('span', 'bf-bar');
      const fill = el('span', '');
      fill.style.width = `${total > 0 ? Math.round((completed / total) * 100) : 0}%`;
      bar.appendChild(fill);
      return bar;
    };
    /**
     * Primary button that starts a NEW match in `slot`. Starting fresh destroys
     * whatever that slot holds (game.ts clears it on boot), so when it is
     * occupied the first tap arms a warning naming the save and the second tap
     * confirms — the same two-tap pattern as Resign. Any re-render (changing a
     * setup option, navigating) rebuilds the button and disarms it.
     *
     * Only this slot is at risk: a save in another campaign is untouched, so
     * starting a Joan chapter never warns about a Wallace one.
     */
    const startMatchButton = (
      label: string, slot: SaveSlot, start: () => void, cls = 'primary',
    ): HTMLButtonElement => {
      const b = el('button', `bf-menu-btn ${cls}`);
      b.appendChild(document.createTextNode(label));
      let armed = false;
      b.addEventListener('click', () => {
        const saved = armed ? null : savedMatchLabel(slot);
        if (saved) {
          armed = true;
          b.replaceChildren(
            document.createTextNode('Tap again to start'),
            el('span', 'bf-menu-note', `abandons your saved match — ${saved}`),
          );
          b.style.color = '#8F2B1E';
          return;
        }
        start();
      });
      return b;
    };
    const segmented = <T extends string>(
      items: Array<{ id: T; label: string }>, active: T, pick: (id: T) => void,
    ): HTMLDivElement => {
      const row = el('div', 'bf-seg');
      for (const item of items) {
        const b = el('button', item.id === active ? 'on' : '', item.label);
        b.addEventListener('click', () => pick(item.id));
        row.appendChild(b);
      }
      return row;
    };
    const difficultySlider = (
      opponent: number, active: BotDifficulty, pick: (id: BotDifficulty) => void,
    ): HTMLDivElement => {
      const box = el('div', 'bf-difficulty');
      const name = el('span', 'bf-diff-name', DIFFICULTY_DETAILS[active].label);
      const level = el('span', 'bf-diff-level', `LEVEL ${BOT_DIFFICULTIES.indexOf(active) + 1} / ${BOT_DIFFICULTIES.length}`);
      const head = el('div', 'bf-diff-head');
      head.append(name, level);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = String(BOT_DIFFICULTIES.length - 1);
      input.step = '1';
      input.value = String(BOT_DIFFICULTIES.indexOf(active));
      input.setAttribute('aria-label', `Opponent ${opponent} difficulty`);
      const scale = el('div', 'bf-diff-scale');
      scale.append(el('span', '', 'Beginner'), el('span', '', 'Hardcore'));
      const description = el('div', 'bf-diff-desc', DIFFICULTY_DETAILS[active].description);
      input.addEventListener('input', () => {
        const next = BOT_DIFFICULTIES[Number(input.value)] ?? 'standard';
        pick(next);
        name.textContent = DIFFICULTY_DETAILS[next].label;
        level.textContent = `LEVEL ${Number(input.value) + 1} / ${BOT_DIFFICULTIES.length}`;
        description.textContent = DIFFICULTY_DETAILS[next].description;
      });
      box.append(head, input, scale, description);
      return box;
    };

    const resumeRequest = (save: SaveEntry): GameRequest => ({
      mode: 'resume',
      slot: save.slot,
      ...(save.scenarioId !== undefined ? { scenarioId: save.scenarioId } : {}),
    });

    // ---------------------------------------------------------------- views
    const renderTitle = (): void => {
      panel.append(
        el('h1', 'bf-menu-name', 'StoneSiege'),
        el('p', 'bf-menu-sub', 'Raise your banner. Advance the ages.'),
      );
      // Continue resumes the most recently saved slot and names it, so with
      // several campaigns in progress it is obvious which one this picks up.
      const recent = mostRecentSave();
      if (recent) {
        panel.appendChild(button(
          'Continue', 'primary',
          () => done(resumeRequest(recent)),
          recent.label,
        ));
      }
      panel.appendChild(button('Play', recent ? '' : 'primary', () => dispatch({ kind: 'openPlay' })));
      panel.appendChild(button('Settings', 'ghost', () => dispatch({ kind: 'openSettings' })));
    };

    const renderPlay = (): void => {
      panel.append(
        el('h1', 'bf-menu-h', 'Play'),
        button('Practice', '', () => dispatch({ kind: 'openPractice' }), 'skirmish vs bots on a random map'),
        button('Campaign', '', () => dispatch({ kind: 'openCampaigns' }), campaignSubtitle()),
        backButton(),
      );
    };

    const renderPracticeSetup = (): void => {
      panel.appendChild(el('h1', 'bf-menu-h', 'Practice'));

      const settings = el('div', 'bf-setup-box');
      settings.append(
        el('div', 'bf-menu-label', 'MATCH SETTINGS'),
        el('div', 'bf-setup-help', 'Choose 1–3 computer opponents. Each opponent can use a different difficulty.'),
        el('div', 'bf-menu-label', 'MAP SIZE'),
      );
      settings.appendChild(segmented(
        MAP_SIZES.map((m) => ({ id: m.id, label: `${m.label} ${MAP_SIZE_TILES[m.id]}²` })),
        practice.mapSize,
        (id) => { practice.mapSize = id; render(true); },
      ));

      settings.appendChild(el('div', 'bf-menu-label', 'NUMBER OF OPPONENTS'));
      settings.appendChild(segmented(
        [{ id: '1', label: '1' }, { id: '2', label: '2' }, { id: '3', label: '3' }],
        String(practice.opponents.length) as '1' | '2' | '3',
        (id) => {
          const n = Number(id);
          while (practice.opponents.length < n) practice.opponents.push('standard');
          practice.opponents.length = n;
          render(true);
        },
      ));
      practice.opponents.forEach((diff, i) => {
        settings.appendChild(el('div', 'bf-menu-label', `OPPONENT ${i + 1} DIFFICULTY`));
        settings.appendChild(difficultySlider(i + 1, diff, (id) => {
          practice.opponents[i] = id;
        }));
      });
      panel.appendChild(settings);

      panel.appendChild(el('div', 'bf-menu-label', 'YOUR CIVILIZATION'));
      const civBox = el('div', 'bf-civ');
      for (const civ of Object.values(gameData.civs)) {
        const card = el('button', `bf-civ-card${civ.id === practice.civ ? ' on' : ''}`);
        card.append(
          el('div', 'bf-civ-name', civ.name),
          el('div', 'bf-civ-desc', civ.description),
        );
        card.addEventListener('click', () => { practice.civ = civ.id; render(true); });
        civBox.appendChild(card);
      }
      panel.appendChild(civBox);

      panel.appendChild(el('div', 'bf-menu-label', 'BANNER COLOR'));
      const colors = el('div', 'bf-colors');
      FALLBACK_PLAYER_RAMPS.forEach((ramp, i) => {
        const sw = el('button', `bf-color${i === practice.color ? ' on' : ''}`);
        sw.style.background = `linear-gradient(160deg, ${ramp[0]}, ${ramp[1]} 55%, ${ramp[2]})`;
        sw.setAttribute('aria-pressed', String(i === practice.color));
        setGameTooltip(sw, `${FALLBACK_PLAYER_COLOR_NAMES[i] ?? `Color ${i + 1}`} banner`);
        sw.addEventListener('click', () => { practice.color = i; render(true); });
        colors.appendChild(sw);
      });
      panel.appendChild(colors);

      panel.append(
        startMatchButton('Start match', PRACTICE_SLOT, () => done({
          mode: 'practice',
          setup: { ...practice, opponents: [...practice.opponents] },
        })),
        backButton(),
      );
    };

    const renderCampaigns = (): void => {
      const list = Object.values(campaigns);
      panel.append(
        el('h1', 'bf-menu-h', 'Campaigns'),
        el('p', 'bf-menu-sub', campaignSubtitle(list)),
      );
      const progress = loadProgress();
      for (const campaign of list) {
        const total = campaign.scenarioIds.length;
        const doneCount = campaign.scenarioIds.filter((id) => progress.completed.includes(id)).length;
        const { name, subtitle } = splitCampaignTitle(campaign.title);
        const card = el('button', 'bf-camp-card');

        const art = el('span', 'bf-camp-art');
        art.appendChild(coverImage(campaign.cover, campaign.coverAlt));
        const copy = el('span', 'bf-camp-art-copy');
        copy.appendChild(el('span', 'bf-camp-title', name));
        if (subtitle) copy.appendChild(el('span', 'bf-camp-sub', subtitle));
        art.appendChild(copy);
        // Each campaign keeps its own save, so a match in progress here is a
        // property of the campaign, not of the app.
        const save = saveForCampaign(campaign.id);
        if (save) art.appendChild(el('span', 'bf-camp-ribbon saved', 'IN PROGRESS'));
        else if (doneCount === total) art.appendChild(el('span', 'bf-camp-ribbon', 'COMPLETE'));

        const body = el('span', 'bf-camp-body');
        body.appendChild(el('span', 'bf-camp-desc', campaign.description));
        body.appendChild(progressBar(doneCount, total));
        const nextId = nextScenarioId(campaign, progress);
        const nextTitle = nextId ? scenariosById[nextId]?.title : undefined;
        const line = el('span', 'bf-camp-progress');
        line.appendChild(el('span', '', `${doneCount} / ${total} chapters`));
        line.appendChild(el(
          'span', 'bf-camp-next',
          save ? `Saved: ${save.label}`
            : nextTitle ? `${doneCount > 0 ? 'Next' : 'Begin'}: ${nextTitle}` : 'Campaign complete',
        ));
        body.appendChild(line);

        card.append(art, body);
        card.addEventListener('click', () => dispatch({ kind: 'openScenarios', campaignId: campaign.id }));
        panel.appendChild(card);
      }
      panel.appendChild(backButton());
    };

    const renderScenarioList = (campaign: CampaignDef): void => {
      const progress = loadProgress();
      const statuses = scenarioStatuses(campaign, progress);
      const total = campaign.scenarioIds.length;
      const doneCount = statuses.filter((status) => status === 'completed').length;
      const { name, subtitle } = splitCampaignTitle(campaign.title);
      const save = saveForCampaign(campaign.id);

      const hero = el('header', 'bf-camp-hero');
      // The hero is decorative here: the same art and alt text were just read
      // aloud on the campaign card that led to this screen.
      hero.appendChild(coverImage(campaign.cover, ''));
      const heroCopy = el('div', 'bf-camp-hero-copy');
      const heading = el('h1', 'bf-camp-title', name);
      heroCopy.appendChild(heading);
      if (subtitle) heroCopy.appendChild(el('span', 'bf-camp-sub', subtitle));
      heroCopy.appendChild(progressBar(doneCount, total));
      heroCopy.appendChild(el('span', 'bf-camp-next', `${doneCount} / ${total} chapters complete`));
      hero.appendChild(heroCopy);
      panel.appendChild(hero);

      const actsAt = new Map(campaign.acts?.map((act) => [act.scenarioIds[0], act]) ?? []);
      campaign.scenarioIds.forEach((scenarioId, i) => {
        const act = actsAt.get(scenarioId);
        if (act) {
          const actHeading = el('div', 'bf-act');
          actHeading.append(
            el('span', 'bf-act-title', act.title),
            el('span', 'bf-act-years', act.years),
          );
          panel.appendChild(actHeading);
        }
        const status = statuses[i];
        const def = scenariosById[scenarioId];
        const authored = def !== undefined;
        const row = el('button', 'bf-scn');
        const medal = el('div', `bf-medal ${status}`);
        medal.textContent = status === 'completed' ? '✔' : status === 'locked' ? '🔒' : String(i + 1);
        const thumb = el('span', `bf-scn-thumb${status === 'locked' ? ' locked' : ''}`);
        thumb.appendChild(coverImage(def?.chapter?.image ?? campaign.cover, '', thumbnailFocus(i)));
        thumb.appendChild(medal);
        const copy = el('span', 'bf-scn-copy');
        copy.appendChild(el('span', 'bf-scn-title', authored ? def.title : `Scenario ${i + 1}`));
        if (def?.chapter) {
          copy.appendChild(el(
            'span', 'bf-scn-meta',
            `${def.chapter.location} · ${def.chapter.date} · ${def.chapter.estimatedMinutes}`,
          ));
        }
        const savedHere = save?.scenarioId === scenarioId;
        const state = el('span', `bf-scn-state${savedHere ? ' saved' : ''}`,
          savedHere ? 'IN PROGRESS'
            : status === 'completed' ? 'COMPLETED'
              : status === 'locked' ? 'LOCKED'
                : authored ? 'READY' : 'COMING SOON');
        row.append(thumb, copy, state);
        row.disabled = status === 'locked' || !authored;
        if (!row.disabled) {
          row.addEventListener('click', () => dispatch({ kind: 'openBriefing', campaignId: campaign.id, scenarioId }));
        }
        panel.appendChild(row);
      });
      panel.appendChild(backButton());
    };

    const renderBriefing = (scenarioId: string): void => {
      const def = scenariosById[scenarioId];
      if (!def) {
        dispatch({ kind: 'back' });
        return;
      }
      const brief = el('div', 'bf-brief');
      if (def.chapter) {
        // Title card: the chapter art fills the head of the panel with the
        // chapter name and its place/date set over the bottom of the frame.
        const art = el('figure', 'bf-chapter-art');
        const image = document.createElement('img');
        image.src = def.chapter.image;
        image.alt = def.chapter.imageAlt;
        image.decoding = 'async';
        art.appendChild(image);
        const copy = el('div', 'bf-chapter-art-copy');
        copy.append(
          el('div', 'bf-chapter-kicker',
            `Chapter ${def.chapter.number} · ${def.chapter.act}`),
          el('h1', 'bf-menu-h', def.title),
          el('div', 'bf-chapter-kicker muted',
            `${def.chapter.location} · ${def.chapter.date} · ${def.chapter.estimatedMinutes}`),
        );
        art.appendChild(copy);
        brief.appendChild(art);
      } else {
        brief.appendChild(el('h1', 'bf-menu-h', def.title));
      }
      const hist = el('div', 'bf-brief-hist');
      for (const para of def.briefing.history.split('\n\n')) {
        hist.appendChild(el('p', '', para));
      }
      brief.appendChild(hist);
      brief.appendChild(el('div', 'bf-menu-label', 'OBJECTIVES'));
      const objList = el('ul', 'bf-brief-list');
      for (const o of def.briefing.objectives) objList.appendChild(el('li', '', o));
      brief.appendChild(objList);
      brief.appendChild(el('div', 'bf-menu-label', 'HINTS'));
      const hintList = el('ul', 'bf-brief-list');
      for (const h of def.briefing.hints) hintList.appendChild(el('li', '', h));
      brief.appendChild(hintList);
      // sticky footer: the primary CTA stays on screen while the text scrolls
      const actions = el('div', 'bf-brief-actions');
      const slot = campaignSlot(def.campaign);
      const save = saveForCampaign(def.campaign);
      const resumable = save?.scenarioId === scenarioId ? save : null;
      if (resumable) {
        // Resuming is the expected action, so it owns the footer. Starting over
        // is the one that costs the save, and it keeps the two-tap confirm on
        // its own full-width line rather than crowding the footer to three.
        brief.appendChild(startMatchButton(
          'Restart this chapter', slot,
          () => done({ mode: 'scenario', scenarioId }),
          'ghost bf-brief-restart',
        ));
      }
      actions.append(
        backButton(),
        resumable
          ? button('RESUME', 'primary', () => done(resumeRequest(resumable)), resumable.label)
          : startMatchButton('START', slot, () => done({ mode: 'scenario', scenarioId })),
      );
      panel.append(brief, actions);
    };

    const renderSettings = (): void => {
      panel.appendChild(el('h1', 'bf-menu-h', 'Settings'));
      // shared builder (settingsUi.ts) — the same controls appear on the
      // in-match pause overlay. uiTap on slider release: audible preview of
      // the level the player just set (the menu runs no game audio otherwise).
      buildSettingsControls(panel, { onSliderRelease: () => previewAudio.play('uiTap') });
      panel.appendChild(backButton());
    };

    // -------------------------------------------------------------- dispatch
    const render = (preserveScroll = false): void => {
      const previousScrollTop = panel.scrollTop;
      panel.replaceChildren();
      const top: MenuScreen = currentScreen(flow);
      panel.classList.toggle(
        'wide',
        top.id === 'campaigns' || top.id === 'scenarioList' || top.id === 'briefing',
      );
      switch (top.id) {
        case 'title': renderTitle(); break;
        case 'play': renderPlay(); break;
        case 'practiceSetup': renderPracticeSetup(); break;
        case 'campaigns': renderCampaigns(); break;
        case 'scenarioList': {
          const campaign = campaigns[top.campaignId];
          if (campaign) renderScenarioList(campaign);
          else renderCampaigns();
          break;
        }
        case 'briefing': renderBriefing(top.scenarioId); break;
        case 'settings': renderSettings(); break;
      }
      panel.scrollTop = menuScrollTopAfterRender(previousScrollTop, preserveScroll);
    };

    render();
    trackScreen(); // the entry screen: 'title', or a deep-linked scenario list
  });
}
