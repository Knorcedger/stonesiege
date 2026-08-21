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
import { loadProgress, scenarioStatuses } from '../campaign/progress';
import { savedMatchLabel } from '../persist';
import { buildSettingsControls } from '../settingsUi';
import { buildDeveloperTools, developerToolsEnabled } from '../developerTools';
import { setGameTooltip } from '../tooltip';
import { AudioEngine } from '../audio/engine';
import {
  currentScreen, flowReducer, initialFlow,
  type FlowEvent, type FlowState, type MenuScreen,
} from './flow';

/** What the menu resolved to — the app shell starts this game. */
export type GameRequest =
  | { mode: 'practice'; setup: PracticeSetup }
  | { mode: 'scenario'; scenarioId: string }
  | { mode: 'resume' };

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
.bf-camp-card { display:block; width:100%; text-align:left; padding:14px 16px; cursor:pointer; margin:8px 0;
  background:#241809; border:1px solid #64492B; border-radius:5px; color:#DABE8D; font-family:inherit; }
.bf-camp-card:hover { border-color:#B99A6B; }
.bf-camp-card .bf-camp-title { font-family:"Cinzel","Georgia",serif; font-size:21px; font-weight:600;
  color:#E6C04A; letter-spacing:1px; }
.bf-camp-card .bf-camp-desc { font-size:12px; line-height:1.4; color:#B99A6B; margin-top:5px; }
.bf-camp-card .bf-camp-progress { font-size:12px; color:#DABE8D; margin-top:7px; }
.bf-scn { display:flex; align-items:center; gap:12px; width:100%; text-align:left; padding:9px 12px;
  margin:6px 0; background:#241809; border:1px solid #64492B; border-radius:5px; color:#EFDDB5;
  font-family:inherit; font-size:15px; cursor:pointer; }
.bf-scn:disabled { cursor:default; color:#6e6252; background:#1d1409; }
.bf-scn:not(:disabled):hover { border-color:#B99A6B; }
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
.bf-brief { text-align:left; }
.bf-chapter-kicker { margin:-3px 0 10px; color:#B99A6B; font-size:11px; letter-spacing:1.1px; text-align:center; text-transform:uppercase; }
.bf-chapter-art { position:relative; overflow:hidden; margin:0 0 15px; border:1px solid #8A6414;
  border-radius:4px; background:#16100a; box-shadow:0 4px 16px rgba(0,0,0,.45); aspect-ratio:16/9; }
.bf-chapter-art img { display:block; width:100%; height:100%; object-fit:cover; }
.bf-chapter-art::after { content:""; position:absolute; inset:auto 0 0; height:28%;
  background:linear-gradient(transparent,rgba(16,10,5,.7)); pointer-events:none; }
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
  .bf-scn { gap:9px; padding:9px; }
  .bf-scn .bf-scn-state { display:none; }
  .bf-scn-meta { font-size:10px; }
  .bf-act-title { font-size:14px; }
  .bf-act-years { flex:none; white-space:nowrap; }
  .bf-chapter-kicker { font-size:10px; letter-spacing:.7px; }
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
 * Show the menu flow; resolves when the player starts a game. `flow` seeds
 * navigation (post-reload deep links, e.g. straight back to a scenario list).
 */
export function showMenu(
  root: HTMLElement,
  opts: { canResume?: boolean; flow?: FlowState } = {},
): Promise<GameRequest> {
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

    const done = (request: GameRequest): void => {
      previewAudio.dispose();
      screen.remove();
      resolve(request);
    };
    const dispatch = (ev: FlowEvent): void => {
      const next = flowReducer(flow, ev);
      if (next !== flow) {
        flow = next;
        render();
      }
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
     * Primary button that starts a NEW match. Starting fresh destroys any
     * saved resumable match (game.ts clears the snapshot on boot), so when one
     * exists the first tap arms a warning naming the save and the second tap
     * confirms — the same two-tap pattern as Resign. Any re-render (changing a
     * setup option, navigating) rebuilds the button and disarms it.
     */
    const startMatchButton = (label: string, start: () => void): HTMLButtonElement => {
      const b = el('button', 'bf-menu-btn primary');
      b.appendChild(document.createTextNode(label));
      let armed = false;
      b.addEventListener('click', () => {
        const saved = armed ? null : savedMatchLabel();
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

    // ---------------------------------------------------------------- views
    const renderTitle = (): void => {
      panel.append(
        el('h1', 'bf-menu-name', 'StoneSiege'),
        el('p', 'bf-menu-sub', 'Raise your banner. Advance the ages.'),
      );
      if (opts.canResume) {
        panel.appendChild(button('Resume match', 'primary', () => done({ mode: 'resume' }), 'pick up where you left off'));
      }
      panel.appendChild(button('Play', opts.canResume ? '' : 'primary', () => dispatch({ kind: 'openPlay' })));
      panel.appendChild(button('Settings', 'ghost', () => dispatch({ kind: 'openSettings' })));
    };

    const renderPlay = (): void => {
      panel.append(
        el('h1', 'bf-menu-h', 'Play'),
        button('Practice', '', () => dispatch({ kind: 'openPractice' }), 'skirmish vs bots on a random map'),
        button('Campaign', '', () => dispatch({ kind: 'openCampaigns' }), 'the story of William Wallace'),
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
        startMatchButton('Start match', () => done({
          mode: 'practice',
          setup: { ...practice, opponents: [...practice.opponents] },
        })),
        backButton(),
      );
    };

    const renderCampaigns = (): void => {
      panel.appendChild(el('h1', 'bf-menu-h', 'Campaigns'));
      const progress = loadProgress();
      for (const campaign of Object.values(campaigns)) {
        const doneCount = campaign.scenarioIds.filter((id) => progress.completed.includes(id)).length;
        const card = el('button', 'bf-camp-card');
        card.append(
          el('div', 'bf-camp-title', campaign.title),
          el('div', 'bf-camp-desc', campaign.description),
          el('div', 'bf-camp-progress', `${doneCount} / ${campaign.scenarioIds.length} chapters complete`),
        );
        card.addEventListener('click', () => dispatch({ kind: 'openScenarios', campaignId: campaign.id }));
        panel.appendChild(card);
      }
      panel.appendChild(backButton());
    };

    const renderScenarioList = (campaign: CampaignDef): void => {
      panel.appendChild(el('h1', 'bf-menu-h', campaign.title));
      const progress = loadProgress();
      const statuses = scenarioStatuses(campaign, progress);
      const actsAt = new Map(campaign.acts?.map((act) => [act.scenarioIds[0], act]) ?? []);
      campaign.scenarioIds.forEach((scenarioId, i) => {
        const act = actsAt.get(scenarioId);
        if (act) {
          const heading = el('div', 'bf-act');
          heading.append(
            el('span', 'bf-act-title', act.title),
            el('span', 'bf-act-years', act.years),
          );
          panel.appendChild(heading);
        }
        const status = statuses[i];
        const def = scenariosById[scenarioId];
        const authored = def !== undefined;
        const row = el('button', 'bf-scn');
        const medal = el('div', `bf-medal ${status}`);
        medal.textContent = status === 'completed' ? '✔' : status === 'locked' ? '🔒' : String(i + 1);
        const copy = el('span', 'bf-scn-copy');
        copy.appendChild(el('span', 'bf-scn-title', authored ? def.title : `Scenario ${i + 1}`));
        if (def?.chapter) {
          copy.appendChild(el(
            'span', 'bf-scn-meta',
            `${def.chapter.location} · ${def.chapter.date} · ${def.chapter.estimatedMinutes}`,
          ));
        }
        const state = el('span', 'bf-scn-state',
          status === 'completed' ? 'COMPLETED'
            : status === 'locked' ? 'LOCKED'
              : authored ? 'READY' : 'COMING SOON');
        row.append(medal, copy, state);
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
      panel.appendChild(el('h1', 'bf-menu-h', def.title));
      const brief = el('div', 'bf-brief');
      if (def.chapter) {
        brief.appendChild(el(
          'div', 'bf-chapter-kicker',
          `${def.chapter.act} · ${def.chapter.location} · ${def.chapter.date} · ${def.chapter.estimatedMinutes}`,
        ));
        const art = el('figure', 'bf-chapter-art');
        const image = document.createElement('img');
        image.src = def.chapter.image;
        image.alt = def.chapter.imageAlt;
        image.decoding = 'async';
        art.appendChild(image);
        brief.appendChild(art);
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
      actions.append(
        backButton(),
        startMatchButton('START', () => done({ mode: 'scenario', scenarioId })),
      );
      panel.append(brief, actions);
    };

    const renderSettings = (): void => {
      panel.appendChild(el('h1', 'bf-menu-h', 'Settings'));
      // shared builder (settingsUi.ts) — the same controls appear on the
      // in-match pause overlay. uiTap on slider release: audible preview of
      // the level the player just set (the menu runs no game audio otherwise).
      buildSettingsControls(panel, { onSliderRelease: () => previewAudio.play('uiTap') });
      if (developerToolsEnabled()) buildDeveloperTools(panel);
      panel.appendChild(backButton());
    };

    // -------------------------------------------------------------- dispatch
    const render = (preserveScroll = false): void => {
      const previousScrollTop = panel.scrollTop;
      panel.replaceChildren();
      const top: MenuScreen = currentScreen(flow);
      panel.classList.toggle('wide', top.id === 'scenarioList' || top.id === 'briefing');
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
  });
}
