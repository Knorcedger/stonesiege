// Game screen orchestrator: Pixi app + layers (terrain/world/fog) + camera +
// fixed-timestep sim loop + input + DOM HUD + minimap + building placement mode.
// Runs both match kinds: practice skirmishes (1-3 bots, per-opponent
// difficulty) and campaign scenarios (TriggerRuntime + objectives panel +
// dialogue banners + camera pans + campaign victory/defeat flow).

import { Application, Container, Graphics, Sprite } from 'pixi.js';
import {
  FP, TICKS_PER_SECOND, fp,
  type Command, type Entity, type EntityId, type Formation, type GameConfig, type GameState,
  type PlayerId, type ProductionSpeed, type SimEvent,
} from '@bf/sim/types';
import { gameData } from '@bf/data';
import { PENDING_COMMAND_KINDS } from '@bf/sim/commands';
import {
  deriveObjectiveGuides, evaluateObjectiveGuide, scenariosById, TriggerRuntime,
  type AiProfile, type Rect, type ScenarioMeta,
} from '@bf/scenarios';
import { applyAiProfile, attackNow, createBot, type Bot } from '@bf/ai';
import { loadAssets } from './assets';
import {
  centroidTile, idleUnits, isTownBellSeeking, liveGroupIds, nextOwnedCompletedBuilding,
  sameIdSet, type IdleCategory,
} from './selectionTools';
import { placementGhostFrames } from './frames';
import { placementStatus, type PlacementStatus } from './placement';
import { Camera, tileToWorld, worldToTile } from './camera';
import { TerrainLayer } from './terrain';
import { WorldLayer } from './world';
import { FxLayer } from './fx';
import { FogLayer } from './fog';
import { SimLoop, TICK_MS } from './simloop';
import { CommandAdmission } from './admission';
import { AudioEngine } from './audio/engine';
import { Narrator, createBrowserSpeech, primeSpeechOnGesture } from './audio/narration';
import { GameAudio } from './audio/events';
import { InputController, type InputHost } from './input';
import { Hud, type HudHost } from './hud/hud';
import { buildingRemovalPresentation } from './hud/buildingRemoval';
import { AGE_LABEL, type ArmedVerb } from './hud/cardModel';
import { Minimap } from './hud/minimap';
import { Overlays } from './hud/overlays';
import { MessageBanner } from './hud/messages';
import { objectiveProgressDue, ObjectivesPanel } from './hud/objectives';
import {
  copyTallies, deriveMatchSummary, emptyTallies, formatMatchTime,
  recordMatchEvent, recordPopulation,
} from './hud/summary';
import { HUD_SAFE_AREA_ROOT_STYLE } from './hud/layout';
import {
  createGame, gameFromSerialized, practiceConfig, scenarioConfig, unitDisplayStats,
  DEFAULT_PRACTICE_SETUP, type PracticeSetup,
} from './simBridge';
import { makeScenarioOps, type ScenarioUiHooks } from './scenario/runtime';
import {
  campaignChapterCompleteEvent, matchEndEvent, matchResumeEvent, matchStartEvent,
  type MatchContext,
} from './analytics/events';
import { noopAnalytics, type AnalyticsSink } from './analytics/sink';
import { completeScenario, loadProgress, saveProgress } from './campaign/progress';
import { setNavHint } from './screens/nav';
import { getSettings } from './settings';
import { activeArtworkMode } from './developerTools';
import { NATIVE_BACK_EVENT, NATIVE_PAUSE_EVENT } from './nativeEvents';
import {
  campaignSlot, clearSnapshot, hasSnapshot, loadSnapshot, PRACTICE_SLOT,
  replaySnapshotIncrementally, saveSnapshot, scenarioFingerprint, type SaveSlot,
  SNAPSHOT_VERSION, trySerialize, type CommandLog, type MatchSnapshot,
} from './persist';
import { artworkLoadingStage, MatchLoadingScreen, withTimeout } from './loadingScreen';
import { campaignLoadingArtwork } from './loadingContext';
import { PlayerResourceMemory } from './resourceMemory';

const PLACE_GREEN = 0x3e8c34;
const PLACE_RED = 0xb3261e;
const PLACE_NEEDS_VISIBILITY = 0xc29422;
/** Autosave cadence while playing (ticks): 15 s — cheap next to hide/pagehide saves. */
const AUTOSAVE_TICKS = 300;
/** Trigger-driven camera pan duration (ms). */
const PAN_MS = 750;
const SHOWCASE_SCENARIO_ID = 'showcase-citadel';

/** Put every staged farmer to work before the first rendered frame. */
export function stageShowcaseEconomy(game: { state: GameState; advance(commands: Command[]): SimEvent[] }): void {
  const commands: Command[] = [];
  for (let index = 0; index < 10; index++) {
    const villager = game.state.refs.get(`showcase_farmer_${index}`);
    const farm = game.state.refs.get(`showcase_farm_${index}`);
    if (villager === undefined || farm === undefined) continue;
    commands.push({ kind: 'gather', player: 1, units: [villager], targetId: farm });
  }
  if (commands.length > 0) game.advance(commands);
}

export type RunGameOptions =
  | { mode: 'resume'; slot: SaveSlot }
  | { mode: 'practice'; setup: PracticeSetup }
  | { mode: 'scenario'; scenarioId: string };

/** Everything a match needs to boot (fresh or resumed). */
interface MatchPlan {
  mode: 'practice' | 'scenario';
  config: GameConfig;
  /** practice only */
  setup: PracticeSetup | null;
  /** scenario only */
  meta: ScenarioMeta | null;
  snapshot: MatchSnapshot | null;
  /** Save slot this match reads from and writes to for its whole life. */
  slot: SaveSlot;
}

/**
 * New scenario logs seed their initial production speed at tick 0. A log without
 * that marker predates the setting and therefore ran at the legacy 1× rate.
 */
function initialScenarioProductionSpeed(log: CommandLog): ProductionSpeed {
  for (const [tick, commands] of log) {
    if (tick !== 0) continue;
    const command = commands.find((candidate) => candidate.kind === 'setProductionSpeed');
    if (command?.kind === 'setProductionSpeed') return command.multiplier;
  }
  return 1;
}

/** Null = a resume was requested but the stored snapshot is not safe to replay. */
function resolvePlan(options: RunGameOptions): MatchPlan | null {
  if (options.mode === 'resume') {
    const snapshot = loadSnapshot(options.slot);
    if (snapshot?.mode === 'scenario') {
      try {
        const { config, meta } = scenarioConfig(snapshot.scenarioId, snapshot.seed);
        config.productionSpeed = initialScenarioProductionSpeed(snapshot.log);
        return { mode: 'scenario', config, setup: null, meta, snapshot, slot: options.slot };
      } catch {
        // the authored scenario set changed under the save
        return null;
      }
    }
    if (snapshot?.mode === 'practice') {
      const config = {
        ...snapshot.config,
        productionSpeed: snapshot.config.productionSpeed ?? 1,
      };
      return {
        mode: 'practice', config, setup: snapshot.setup, meta: null, snapshot, slot: options.slot,
      };
    }
    // nothing (valid) to resume — never boot a match the player did not ask for
    return null;
  }
  if (options.mode === 'scenario') {
    const { config, meta } = scenarioConfig(options.scenarioId);
    return {
      mode: 'scenario', config, setup: null, meta, snapshot: null,
      slot: campaignSlot(scenariosById[options.scenarioId]?.campaign ?? 'unknown'),
    };
  }
  const setup = options.mode === 'practice' ? options.setup : DEFAULT_PRACTICE_SETUP;
  return {
    mode: 'practice', config: practiceConfig(setup), setup, meta: null, snapshot: null,
    slot: PRACTICE_SLOT,
  };
}

/** What this match is, for anonymous reporting. Practice and campaign fields are disjoint. */
function analyticsContext(plan: MatchPlan): MatchContext {
  if (plan.mode === 'scenario') {
    return {
      mode: 'scenario',
      ...(plan.meta ? {
        scenarioId: plan.meta.id,
        storyCampaignId: plan.meta.campaign,
        chapterIndex: plan.meta.index,
      } : {}),
    };
  }
  return {
    mode: 'practice',
    ...(plan.setup ? {
      civ: plan.setup.civ,
      mapSize: plan.setup.mapSize,
      opponentCount: plan.setup.opponents.length,
      ...(plan.setup.opponents[0] !== undefined ? { difficulty: plan.setup.opponents[0] } : {}),
    } : {}),
  };
}

export async function runGame(
  root: HTMLElement,
  options: RunGameOptions,
  analytics: AnalyticsSink = noopAnalytics,
): Promise<void> {
  const resuming = options.mode === 'resume';
  const loading = new MatchLoadingScreen(root, {
    title: resuming ? 'Restoring saved match' : 'Mustering the banners',
    status: resuming ? 'Checking saved match…' : 'Preparing the battlefield…',
    detail: resuming ? 'Reading the match stored on this device.' : 'Getting the armies ready.',
    progress: null,
  }, options.mode === 'scenario' ? campaignLoadingArtwork(options.scenarioId) : null);

  try {
    await bootGame(root, options, loading, analytics);
  } catch (error) {
    if (!resuming) {
      console.error('[game] Match startup failed', error);
      const knownMessage = error instanceof Error && (
        error.message.startsWith('Loading battlefield')
        || error.message.startsWith('Drawing the battlefield')
      )
        ? error.message
        : 'StoneSiege hit an unexpected problem while preparing this match.';
      loading.failFresh(`${knownMessage} Try again, or return to the title without losing saved progress.`, {
        onRetry: () => {
          if (options.mode === 'scenario') {
            setNavHint({ kind: 'startScenario', scenarioId: options.scenarioId });
          } else if (options.mode === 'practice') {
            setNavHint({ kind: 'startPractice', setup: options.setup });
          }
          // Always rebuild from a clean document. A failed Pixi init may have
          // already installed audio contexts, DOM listeners, or a partial canvas.
          window.location.reload();
        },
        onReturn: () => window.location.reload(),
      });
      return;
    }
    const isKnownResumeError = error instanceof Error && (
      error.message.startsWith('No saved match')
      || error.message.startsWith('This saved match')
      || error.message.startsWith('The saved match')
      || error.message.startsWith('The saved battle')
      || error.message.startsWith('Restoring this saved match')
      || error.message.startsWith('Loading battlefield')
      || error.message.startsWith('Drawing the battlefield')
    );
    const knownMessage = isKnownResumeError
      ? error.message
      : 'StoneSiege hit an unexpected problem while rebuilding this match.';
    if (isKnownResumeError) console.warn(`[game] Resume unavailable: ${knownMessage}`);
    else console.error('[game] Resume failed unexpectedly', error);
    // Only a resume reaches here, so the failing save is the one it named.
    const slot = options.mode === 'resume' ? options.slot : null;
    const canDiscard = slot !== null && hasSnapshot(slot);
    const nextStep = canDiscard
      ? 'You can return safely and try again, or discard only this save.'
      : 'Return to the title and start a new match.';
    loading.fail(`${knownMessage} ${nextStep}`, {
      canDiscard,
      onReturn: () => window.location.reload(),
      onDiscard: () => {
        if (slot !== null) clearSnapshot(slot);
        window.location.reload();
      },
    });
  }
}

async function bootGame(
  root: HTMLElement,
  options: RunGameOptions,
  loading: MatchLoadingScreen,
  analytics: AnalyticsSink,
): Promise<void> {

  const plan = resolvePlan(options);
  if (!plan) {
    // Keep the raw record intact: it may be from another build or damaged, and
    // only the recovery screen's confirmed discard action is allowed to erase it.
    throw new Error(options.mode === 'resume' && hasSnapshot(options.slot)
      ? 'This saved match is damaged or belongs to an incompatible version of StoneSiege.'
      : 'No saved match was found on this device.');
  }
  if (options.mode === 'resume' && plan.meta) {
    loading.setArtwork(campaignLoadingArtwork(plan.meta.id));
  }
  loading.update({
    title: options.mode === 'resume' ? 'Restoring saved match' : 'Mustering the banners',
    status: 'Loading battlefield artwork…',
    detail: 'This stage is usually quickest after the first visit.',
    progress: null,
  });
  const assets = await loadAssets({
    artworkMode: activeArtworkMode(),
    onProgress: (progress) => loading.update(artworkLoadingStage(progress, options.mode === 'resume')),
  });
  const { config, snapshot } = plan;
  // Fresh matches inherit the persisted preference. Resumes retain the speed
  // encoded in their deterministic state/config until the player changes it.
  if (!snapshot) config.productionSpeed = getSettings().productionSpeed;
  // Starting fresh abandons the stale match in THIS slot only: a new Joan
  // chapter must leave a Wallace campaign in progress exactly where it was.
  if (!snapshot) clearSnapshot(plan.slot);
  assets.prepareMatchColors(config.players.map((p) => p.color));
  // A controller-free practice match may rebuild straight from the sim's
  // serialized snapshot. Matches with bots log-replay so their deterministic
  // observation and manager state is reconstructed alongside the sim. Scenarios
  // also replay because TriggerRuntime state reconstructs from the event stream.
  const humanPlayer: PlayerId = (config.players.findIndex((p) => p.isHuman) + 1) as PlayerId;
  // New snapshots carry renderer-owned match statistics. Legacy snapshots do
  // not, so deliberately log-replay those instead of taking the serialized
  // fast path; replay reconstructs their history without inventing totals.
  const tallies = snapshot?.tallies ? copyTallies(snapshot.tallies) : emptyTallies();
  const rebuildTalliesFromReplay = !!snapshot && !snapshot.tallies;
  const hasComputerPlayers = config.players.some((player) => !player.isHuman);
  const restored = snapshot && snapshot.tallies && plan.mode === 'practice'
    && !hasComputerPlayers
    ? gameFromSerialized(snapshot.serialized)
    : null;
  const game = restored ?? createGame(config);
  if (!snapshot && plan.meta?.id === SHOWCASE_SCENARIO_ID) stageShowcaseEconomy(game);
  recordPopulation(tallies, game.state.players[humanPlayer]?.pop ?? 0);
  const meta = plan.meta;
  const scenarioDef = meta ? scenariosById[meta.id] : null;

  // A resumed snapshot is the player returning to a match already counted at
  // its start, so it reports match_resume instead of inflating match_start.
  const matchContext = analyticsContext(plan);
  analytics.track(snapshot === null ? matchStartEvent(matchContext) : matchResumeEvent(matchContext));

  // ------------------------------------------------------------------ audio
  const audioEngine = new AudioEngine();
  audioEngine.ambientOn();
  // Campaign dialogue is read aloud through the platform speech synthesizer.
  // iOS wants a gesture before the first utterance, so one is spent silently on
  // the first press rather than on the opening narrator line.
  const speech = createBrowserSpeech();
  const narrator = new Narrator(speech);
  primeSpeechOnGesture(speech);
  // every button press anywhere in the match UI clicks (capture: HUD buttons
  // stopPropagation freely)
  root.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement | null)?.closest?.('button')) audioEngine.play('uiTap');
  }, { capture: true });

  // ------------------------------------------------- bots (practice + scenario)
  // Every non-human seat gets a controller that reads sim state and issues
  // Commands through the same queue a human would. Practice: per-opponent
  // difficulty from the setup. Scenario: each seat runs its authored aiProfile
  // ('passive' garrisons stand down until a trigger changes the profile).
  // Bot RNG seeds derive from config.seed, which the snapshot persists — a
  // resumed match's bots roll the same internal dice.
  const bots = new Map<PlayerId, Bot>();
  if (plan.mode === 'practice' && plan.setup) {
    let botIdx = 0;
    config.players.forEach((p, i) => {
      if (p.isHuman) return;
      const difficulty = plan.setup!.opponents[botIdx++] ?? 'standard';
      bots.set((i + 1) as PlayerId, createBot(game, (i + 1) as PlayerId, { difficulty, seed: config.seed }));
    });
  } else if (meta) {
    meta.players.forEach((p, i) => {
      if (p.isHuman) return;
      bots.set((i + 1) as PlayerId, createBot(game, (i + 1) as PlayerId, {
        profile: p.aiProfile ?? 'passive',
        difficulty: 'standard',
        seed: config.seed,
      }));
    });
  }

  // ---------------------------------------------- scenario trigger runtime
  // UI targets are created after Pixi boots; during a resume-replay the
  // runtime re-fires historical effects, so messages/pans/stings are muted
  // and objective changes are buffered until the panel exists.
  let replaying = false;
  let objectivesPanel: ObjectivesPanel | null = null;
  let messageBanner: MessageBanner | null = null;
  const pendingObjectiveOps: Array<(panel: ObjectivesPanel) => void> = [];
  const objectiveOp = (f: (panel: ObjectivesPanel) => void): void => {
    if (objectivesPanel) f(objectivesPanel);
    else pendingObjectiveOps.push(f);
  };
  let startCameraPan: (tileX: number, tileY: number) => void = () => undefined;

  // Trigger effects `aiProfile` / `aiAttackNow` go straight to the bot. Both
  // ALSO apply during resume-replay so the bot ends up in the profile the
  // triggers last set (its historical commands come from the log; only its
  // future behavior needs the right profile).
  const setAiProfile = (player: number, profile: AiProfile): void => {
    const bot = bots.get(player as PlayerId);
    if (bot) applyAiProfile(bot, profile);
  };
  const aiAttackNow = (player: number, targetArea?: Rect): void => {
    const bot = bots.get(player as PlayerId);
    if (bot) attackNow(bot, targetArea);
  };

  const scenarioHooks: ScenarioUiHooks = {
    message: (m) => {
      if (!replaying) messageBanner?.push({ text: m.text, ...(m.speaker !== undefined ? { speaker: m.speaker } : {}) });
    },
    panCamera: (x, y) => {
      if (!replaying) startCameraPan(x, y);
    },
    objectiveAdded: (id, text) => objectiveOp((panel) => panel.add(id, text)),
    objectiveCompleted: (id) => objectiveOp((panel) => panel.complete(id)),
    objectiveFailed: (id) => objectiveOp((panel) => panel.fail(id)),
    playSting: (sting) => {
      if (replaying) return;
      audioEngine.play(sting === 'victory' ? 'hornVictory'
        : sting === 'defeat' ? 'hornDefeat'
          : sting === 'alert' ? 'hornAlert' : 'hornAge');
    },
    victory: () => {
      if (!replaying) showEnd(true);
    },
    defeat: () => {
      if (!replaying) showEnd(false);
    },
    setAiProfile,
    aiAttackNow,
  };
  const scenarioOps = scenarioDef ? makeScenarioOps(game, scenarioHooks) : null;
  const triggers = scenarioDef && scenarioOps ? new TriggerRuntime(scenarioDef, scenarioOps) : null;
  const objectiveGuides = scenarioDef ? deriveObjectiveGuides(scenarioDef) : [];
  const objectiveGuidesById = new Map(objectiveGuides.map((guide) => [guide.id, guide]));

  // ------------------------------------------------------------------ resume
  // Restore the snapshotted state on the fresh engine. Fast path: the sim's
  // serialize()/deserialize() API (landing in @bf/sim; no-op while absent).
  // Otherwise: replay the recorded command log — the deterministic sim (and,
  // for scenarios, the deterministic trigger runtime fed the same events)
  // rebuilds the exact snapshotted state (GDD suspend/resume).
  const commandLog: CommandLog = snapshot?.log ?? [[0, [{
    kind: 'setProductionSpeed', player: humanPlayer, multiplier: config.productionSpeed ?? 2,
  }]]];
  let replayedPendingBotCommands: Command[] = [];
  if (snapshot && !restored) {
    const restoreTitle = 'Restoring saved match';
    let displayedRestorePercent = -1;
    loading.update({
      title: restoreTitle,
      status: 'Replaying battle history…',
      detail: `0:00 of ${formatMatchTime(snapshot.tick)} restored`,
      progress: 0,
    });
    replaying = true;
    await replaySnapshotIncrementally(game, snapshot, {
      onEvents: (events) => {
        // Re-run controller decisions while the recorded commands rebuild the
        // sim. Their output is already in the log except for the final tick;
        // running them here restores deterministic fog memory and manager state.
        replayedPendingBotCommands = [];
        for (const bot of bots.values()) replayedPendingBotCommands.push(...bot.tick(events));
        if (rebuildTalliesFromReplay) {
          for (const ev of events) recordMatchEvent(tallies, ev, humanPlayer);
          recordPopulation(tallies, game.state.players[humanPlayer]?.pop ?? 0);
        }
        triggers?.tick(events);
      },
      onProgress: (completedTick, targetTick) => {
        const fraction = targetTick === 0 ? 1 : completedTick / targetTick;
        const percent = Math.round(fraction * 100);
        if (percent === displayedRestorePercent && completedTick !== targetTick) return;
        displayedRestorePercent = percent;
        loading.update({
          title: restoreTitle,
          status: 'Replaying battle history…',
          detail: `${formatMatchTime(completedTick)} of ${formatMatchTime(targetTick)} restored`,
          progress: fraction,
        });
      },
    });
    replaying = false;
  }

  const resourceMemory = new PlayerResourceMemory(humanPlayer);
  if (!snapshot?.resourceMemory || !resourceMemory.restore(snapshot.resourceMemory, game.state)) {
    // A legacy save has no client observation record. Observe only current LOS;
    // never seed explored fog from the authoritative resource collection.
    resourceMemory.refresh(game.state);
  }

  loading.update({
    title: snapshot ? 'Restoring saved match' : 'Mustering the banners',
    status: 'Drawing the battlefield…',
    detail: 'Preparing the map, units, and controls.',
    progress: null,
  });
  const app = new Application();
  await withTimeout(app.init({
    background: 0x0d0b08,
    resizeTo: root,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    roundPixels: false,
  }), 45_000, 'Drawing the battlefield took too long.');
  loading.remove();
  // Pixi's 2x backing store must still occupy one CSS viewport. Setting
  // cssText after init otherwise discards autoDensity's explicit CSS size and
  // makes the canvas itself twice as large on Retina displays.
  app.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none;';
  root.appendChild(app.canvas);

  // --------------------------------------------------------------- layers
  const camera = new Camera();
  camera.setMapBounds(game.state.map.width, game.state.map.height);
  camera.setViewport(app.screen.width, app.screen.height);
  if (meta?.id === SHOWCASE_SCENARIO_ID) camera.zoom = 0.5;

  const worldRoot = new Container();
  const terrain = new TerrainLayer(app.renderer, assets, game.state.map);
  const world = new WorldLayer(
    assets,
    humanPlayer,
    (defId) => unitDisplayStats(game, humanPlayer, defId)?.los ?? gameData.units[defId]?.los ?? 0,
    resourceMemory,
  );
  const fx = new FxLayer(assets, humanPlayer);
  const fog = new FogLayer(game.state.map);
  const ghostLayer = new Container();
  const ghostFoot = new Graphics();
  const ghostSprite = new Sprite();
  ghostSprite.alpha = 0.6;
  ghostLayer.addChild(ghostFoot, ghostSprite);
  ghostLayer.visible = false;
  // Destination arrows sit above fog so an order into unexplored terrain is
  // visibly acknowledged. The overlay contains no world information, so this
  // does not leak anything hidden by fog-of-war.
  worldRoot.addChild(
    terrain.container, fx.ground, world.container, fx.air, ghostLayer, fog.sprite,
    world.rallyOverlay, fx.overlay,
  );
  app.stage.addChild(worldRoot);
  const bandOverlay = new Graphics();
  app.stage.addChild(bandOverlay);

  // start camera: scenario = authored tile; practice = human TC (resumed
  // matches may have lost it — any own entity then)
  let centered = false;
  if (meta && !snapshot) {
    camera.centerOnTile(meta.startCamera.x, meta.startCamera.y);
    centered = true;
  }
  if (!centered) {
    for (const e of game.state.entities.values()) {
      if (e.player === humanPlayer && e.defId === 'townCenter') {
        camera.centerOnTile(e.x / FP, e.y / FP);
        centered = true;
        break;
      }
    }
  }
  if (!centered) {
    for (const e of game.state.entities.values()) {
      if (e.player === humanPlayer && e.hp > 0) {
        camera.centerOnTile(e.x / FP, e.y / FP);
        break;
      }
    }
  }
  world.onTick(game.state); // initial position snapshot

  const gameAudio = new GameAudio(audioEngine, camera, humanPlayer);

  // ------------------------------------------- trigger-driven camera pans
  // Eased tile-space glide to an authored point; any manual touch on the
  // canvas cancels it (the player always wins the camera).
  let panFx: { fx: number; fy: number; tx: number; ty: number; elapsed: number } | null = null;
  startCameraPan = (tileX, tileY) => {
    const from = worldToTile(camera.x, camera.y);
    panFx = { fx: from.x, fy: from.y, tx: tileX, ty: tileY, elapsed: 0 };
  };
  app.canvas.addEventListener('pointerdown', () => {
    panFx = null;
  });

  // --------------------------------------------------------------- state
  let selection: EntityId[] = [];
  let armedVerb: ArmedVerb | null = null;
  let formation: Formation = 'rectangle';
  let placement: { defId: string; tileX: number; tileY: number } | null = null;
  let placementHeldByShift = false;
  let housed = false;
  let wonderOwner: PlayerId | null = null; // whose countdown the banner tracks
  let endShown = false;

  const getState = (): GameState => game.state;
  const liveSelection = (): Entity[] => {
    const st = getState();
    const out: Entity[] = [];
    for (const id of selection) {
      const e = st.entities.get(id);
      if (!e || e.activity === 'dying') continue;
      const visible = resourceMemory.entityFor(st, e);
      if (visible) out.push(visible);
    }
    return out;
  };
  const setSelection = (ids: EntityId[]): void => {
    selection = ids;
    world.selection = new Set(ids);
    armedVerb = null;
  };
  const deselect = (): void => setSelection([]);

  // Idle-unit cycling (GDD: top-bar idle-villager/-military badges = touch `.` hotkey).
  const idleCursor: Record<IdleCategory, number> = { villager: 0, military: 0 };
  // Both idle scans walk every entity on the map, and the HUD asks for them on
  // every frame while the answer can only change when the sim advances.
  let idleCountsTick = -1;
  let idleCountsCache: Record<IdleCategory, number> = { villager: 0, military: 0 };
  const getIdleCounts = (): Record<IdleCategory, number> => {
    const st = getState();
    if (st.tick !== idleCountsTick) {
      idleCountsTick = st.tick;
      idleCountsCache = {
        villager: idleUnits(st, humanPlayer, 'villager').length,
        military: idleUnits(st, humanPlayer, 'military').length,
      };
    }
    return idleCountsCache;
  };
  const cycleIdle = (cat: IdleCategory): void => {
    const list = idleUnits(getState(), humanPlayer, cat);
    if (list.length === 0) return;
    const e = list[idleCursor[cat] % list.length];
    idleCursor[cat] = (idleCursor[cat] + 1) % list.length;
    setSelection([e.id]);
    camera.centerOnTile(e.x / FP, e.y / FP);
  };
  const focusBuilding = (defId: string): boolean => {
    const current = liveSelection().length === 1 ? liveSelection()[0] : undefined;
    const next = nextOwnedCompletedBuilding(
      getState(), humanPlayer, defId,
      current?.kind === 'building' && current.defId === defId ? current.id : undefined,
    );
    if (!next) return false;
    setSelection([next.id]);
    camera.centerOnTile(next.x / FP, next.y / FP);
    return true;
  };

  // Control groups (GDD: saved-selection chips — long-press saves, tap reselects,
  // tap again centers the camera on the group).
  const GROUP_COUNT = 4;
  const groups: EntityId[][] = Array.from({ length: GROUP_COUNT }, () => []);
  const getGroupCounts = (): number[] => groups.map((g) => liveGroupIds(getState(), g).length);
  const saveGroup = (index: number): boolean => {
    const ids = liveSelection().filter((e) => e.player === humanPlayer).map((e) => e.id);
    if (ids.length === 0 || index < 0 || index >= GROUP_COUNT) return false;
    groups[index] = ids;
    return true;
  };
  const selectGroup = (index: number): void => {
    if (index < 0 || index >= GROUP_COUNT) return;
    const ids = liveGroupIds(getState(), groups[index]);
    if (ids.length === 0) return;
    if (sameIdSet(ids, selection)) {
      // second tap on the active group: center the camera on it
      const members = ids
        .map((id) => getState().entities.get(id))
        .filter((e): e is Entity => !!e);
      const c = centroidTile(members, FP);
      if (c) camera.centerOnTile(c.x, c.y);
      return;
    }
    setSelection(ids);
  };

  // --------------------------------------------------------------- sim events
  const reloadTo = (hint: Parameters<typeof setNavHint>[0] | null): void => {
    if (hint) setNavHint(hint);
    window.location.reload();
  };

  const showEnd = (victory: boolean): void => {
    if (endShown) return;
    endShown = true;
    clearSnapshot(plan.slot); // a finished match must never be offered for resume
    deselect();
    // Latched, not a one-shot cancel: scenarios queue their closing lines in
    // the same effect batch as the victory, and the end screen covers the
    // banner — so nothing more is read once the match is over.
    narrator.silence();
    audioEngine.play(victory ? 'hornVictory' : 'hornDefeat');
    const summary = deriveMatchSummary(getState(), humanPlayer, tallies);
    // One fire per match: the endShown guard above already guarantees it, and a
    // resignation arrives here through the sim's playerDefeated -> showEnd(false).
    // Killing the app mid-match never reaches this, so match_start minus
    // match_end IS the abandonment rate.
    analytics.track(matchEndEvent(matchContext, {
      outcome: victory ? 'victory' : 'defeat',
      durationSeconds: summary.durationSeconds,
      ageReached: summary.age,
      unitsKilled: summary.tallies.unitsKilled,
      unitsLost: summary.tallies.unitsLost,
      peakPopulation: summary.tallies.peakPopulation,
    }));
    if (meta) {
      // campaign flow: victory unlocks the next scenario; defeat offers retry
      const scenarioId = meta.id;
      const campaignId = meta.campaign;
      if (victory) {
        saveProgress(completeScenario(loadProgress(), scenarioId));
        analytics.track(campaignChapterCompleteEvent(matchContext, summary.durationSeconds));
      }
      overlays.showEndScreen(victory, summary, {
        sub: victory ? `${meta.title} — complete` : meta.title,
        buttons: victory
          ? [
            { label: 'Continue', onClick: () => reloadTo({ kind: 'scenarioList', campaignId }) },
            { label: 'Replay scenario', ghost: true, onClick: () => reloadTo({ kind: 'startScenario', scenarioId }) },
            { label: 'Continue watching', ghost: true, dismiss: true },
          ]
          : [
            { label: 'Retry', onClick: () => reloadTo({ kind: 'startScenario', scenarioId }) },
            { label: 'Return to scenarios', ghost: true, onClick: () => reloadTo({ kind: 'scenarioList', campaignId }) },
            { label: 'Continue watching', ghost: true, dismiss: true },
          ],
      });
    } else {
      overlays.showEndScreen(victory, summary, {
        buttons: [
          { label: 'Return to Title', onClick: () => reloadTo(null) },
          { label: 'Continue watching', ghost: true, dismiss: true },
        ],
      });
    }
  };

  const handleSimEvents = (events: SimEvent[]): void => {
    const st = getState();
    // Fold the whole tick before handling victory so the final report includes
    // every resource delivery, completion, kill, and population peak from it.
    recordPopulation(tallies, st.players[humanPlayer]?.pop ?? 0);
    for (const ev of events) recordMatchEvent(tallies, ev, humanPlayer);
    for (const ev of events) {
      switch (ev.kind) {
        case 'ageAdvanced':
          if (ev.player === humanPlayer) {
            overlays.showAgeBanner(AGE_LABEL[ev.age]); // audio: GameAudio horn
          }
          break;
        case 'underAttack':
          if (ev.player === humanPlayer) {
            overlays.pulseUnderAttack();
            minimap.ping(ev.x / FP, ev.y / FP); // audio: GameAudio horn
          }
          break;
        case 'researchComplete':
          if (ev.player === humanPlayer) {
            hud.showUndoToast(`${gameData.techs[ev.techId]?.name ?? ev.techId} complete`, null);
          }
          break;
        case 'conversionComplete':
          if (ev.fromPlayer === humanPlayer) hud.showUndoToast('A unit was converted away!', null);
          else if (ev.toPlayer === humanPlayer) hud.showUndoToast('Enemy unit converted!', null);
          break;
        case 'playerDefeated':
          if (ev.player === humanPlayer) showEnd(false);
          break;
        case 'victory':
          showEnd(ev.winners.includes(humanPlayer));
          break;
        // wonder countdown stream (sim: started / once-per-second / cancelled)
        case 'wonderStarted':
        case 'wonderCountdown':
          if (meta?.id === SHOWCASE_SCENARIO_ID) break;
          if (ev.kind === 'wonderStarted' && ev.player !== humanPlayer) audioEngine.play('hornAlert');
          wonderOwner = ev.player;
          overlays.setWonderBanner({
            owner: st.players[ev.player]?.setup.name ?? 'Enemy',
            timeText: formatMatchTime(ev.secondsLeft * TICKS_PER_SECOND),
          });
          break;
        case 'wonderDestroyed':
          if (ev.player === wonderOwner) {
            wonderOwner = null;
            overlays.setWonderBanner(null);
          }
          break;
        default:
          break;
      }
    }

    // housed warning: production stalls until more houses go up (GDD tension)
    const p = st.players[humanPlayer];
    if (p) {
      const isHoused = p.pop >= p.popCap;
      if (isHoused && !housed) {
        hud.showUndoToast(p.popCap >= config.popCap ? 'Population limit reached' : 'Housed — build more houses!', null);
      }
      housed = isHoused;
    }

  };

  // --------------------------------------------------------------- sim loop
  const loop = new SimLoop(game, {
    // The render ticker keeps advancing the banner behind the pause overlay,
    // so narration has to be told to stop with the match.
    onPauseChanged: (paused) => narrator.setMuted(paused),
    onTick: (events) => {
      const st = getState();
      for (const bot of bots.values()) {
        for (const cmd of bot.tick(events)) loop.issue(cmd);
      }
      world.onTick(st);
      world.onSimEvents(events, st.tick);
      fx.onSimEvents(st, events, st.tick);
      handleSimEvents(events);
      gameAudio.onSimEvents(events, st);
      triggers?.tick(events); // scenario triggers run right after the sim tick
      fog.update(st.players[humanPlayer]?.visibility ?? new Uint8Array(0));
    },
    // match-snapshot command log: every applied batch (human AND bots) is
    // recorded so a resume replays the identical game
    onAdvance: (tick, commands) => {
      commandLog.push([tick, commands]);
    },
  });
  for (const command of replayedPendingBotCommands) loop.issue(command);
  loop.attachAutoPause();

  // ------------------------------------------------------------- persistence
  // GDD: backgrounding auto-snapshots the match; periodic saves cover OS kills
  // and dev-server reloads. Cleared the moment the match ends. When @bf/sim's
  // serialize() exists the blob rides along as a fast practice-resume path.
  let lastSavedTick = game.state.tick;
  // Wall-clock stamp of the last save that reached storage — presentation only
  // (the pause overlay's autosave line); never read by the sim.
  let lastSavedAt: number | null = null;
  let wasPausedLastFrame = false;
  const saveMatch = (): void => {
    const st = getState();
    if (endShown || st.finished) return;
    // Every pause path asks for a save, and a paused sim cannot change: one
    // stored snapshot per tick is all any of them can produce.
    if (lastSavedAt !== null && st.tick === lastSavedTick) return;
    const serialized = trySerialize(game);
    const withBlob = serialized !== undefined ? { serialized } : {};
    let stored = false;
    if (plan.mode === 'scenario' && meta) {
      stored = saveSnapshot({
        version: SNAPSHOT_VERSION, mode: 'scenario', scenarioId: meta.id,
        // content stamp: the resume is only valid against identical authored
        // def + game data ('' can never match, degrading to "no resume")
        fingerprint: scenarioFingerprint(meta.id) ?? '',
        seed: config.seed, tick: st.tick, log: commandLog,
        tallies: copyTallies(tallies), resourceMemory: resourceMemory.snapshot(), ...withBlob,
      });
    } else if (plan.setup) {
      stored = saveSnapshot({
        version: SNAPSHOT_VERSION, mode: 'practice', config, setup: plan.setup,
        tick: st.tick, log: commandLog, tallies: copyTallies(tallies),
        resourceMemory: resourceMemory.snapshot(), ...withBlob,
      });
    }
    lastSavedTick = st.tick;
    if (stored) lastSavedAt = Date.now();
  };
  const onVisibility = (): void => {
    if (document.hidden) saveMatch();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', saveMatch);
  // Native lifecycle delivery is more reliable than waiting for WebView
  // visibility alone. Back pauses instead of exiting or abandoning a match.
  const onNativePause = (): void => {
    loop.pause(true);
    saveMatch();
  };
  const onNativeBack = (event: Event): void => {
    event.preventDefault();
    loop.pause(false);
    saveMatch();
  };
  window.addEventListener(NATIVE_PAUSE_EVENT, onNativePause);
  window.addEventListener(NATIVE_BACK_EVENT, onNativeBack);

  const admission = new CommandAdmission(
    game,
    loop,
    (label, undo) => hud.showUndoToast(label, undo),
  );
  const issue = (cmd: Command): boolean => admission.issue(cmd);
  // A setting changed from the title screen should also apply when resuming a
  // saved match. Queue it through the normal command path so the resumed log
  // remains deterministic; this also upgrades legacy 1× saves to the new 2× default.
  const preferredProductionSpeed = getSettings().productionSpeed;
  if (snapshot && game.state.productionSpeed !== preferredProductionSpeed) {
    issue({
      kind: 'setProductionSpeed', player: humanPlayer, multiplier: preferredProductionSpeed,
    });
  }
  /**
   * World-space confirmation for an accepted player order: ground orders drop a
   * destination arrow, target-aimed ones pulse the target itself. Without this
   * a build/gather/attack order only ever showed up in the corner toast, which
   * reads as a dropped command while the unit is still walking over.
   */
  const showOrderFeedback = (cmd: Command): void => {
    const st = getState();
    if (cmd.kind === 'move') {
      fx.showMoveMarker(cmd.x, cmd.y, st.tick);
      return;
    }
    if (cmd.kind === 'attack' || cmd.kind === 'gather' || cmd.kind === 'repair'
      || cmd.kind === 'garrison' || cmd.kind === 'convert' || cmd.kind === 'heal') {
      const target = st.entities.get(cmd.targetId);
      if (target) fx.showTargetPing(target, st.tick, cmd.kind === 'attack' ? 'attack' : 'work');
    }
  };
  const issueWithUndo = (
    cmd: Command,
    label: string,
    undo: (() => void) | null,
  ): boolean => {
    const accepted = admission.issueWithUndo(cmd, label, undo);
    if (accepted) showOrderFeedback(cmd);
    return accepted;
  };

  // --------------------------------------------------------------- placement
  const canAfford = (defId: string): boolean => {
    const cost = gameData.buildings[defId]?.cost ?? {};
    const p = getState().players[humanPlayer];
    if (!p) return false;
    return Object.entries(cost).every(([r, v]) => (p.stockpile[r as keyof typeof p.stockpile] ?? 0) >= (v ?? 0));
  };

  const refreshGhost = (): void => {
    if (!placement) {
      ghostLayer.visible = false;
      return;
    }
    const def = gameData.buildings[placement.defId];
    const size = def?.size ?? 1;
    const status = placementStatus(
      getState(), humanPlayer, placement.tileX, placement.tileY, size,
      () => game.canPlace(humanPlayer, placement!.defId, placement!.tileX, placement!.tileY),
    );
    const center = tileToWorld(placement.tileX + size / 2, placement.tileY + size / 2);
    ghostLayer.position.set(center.x, center.y);
    ghostLayer.visible = true;
    const hw = size * 32;
    const hh = size * 16;
    const color = status === 'valid' ? PLACE_GREEN
      : status === 'needs-visibility' ? PLACE_NEEDS_VISIBILITY : PLACE_RED;
    ghostFoot.clear();
    ghostFoot
      .moveTo(0, -hh).lineTo(hw, 0).lineTo(0, hh).lineTo(-hw, 0).closePath()
      .fill({ color, alpha: 0.45 })
      .stroke({ width: 2, color, alpha: 1 });
    // Resolve the local player's color variant (baked @p<idx> or runtime-swapped) —
    // NEVER the neutral mask frame, whose raw magenta placeholder pixels would show.
    // placementGhostFrames handles the farm exception (obj/farm/2, no bld/ frames).
    const colorIdx = getState().players[humanPlayer]?.setup.color;
    const candidates = placementGhostFrames(placement.defId, getState().players[humanPlayer]?.age ?? 'dark');
    let frame = null;
    for (let i = 0; i < candidates.length - 1 && !frame; i++) {
      frame = assets.tryResolve(candidates[i], colorIdx);
    }
    frame ??= assets.resolveFrame(candidates[candidates.length - 1], colorIdx);
    ghostSprite.texture = frame.texture;
    ghostSprite.anchor.set(frame.anchorX, frame.anchorY);
    ghostSprite.scale.set(frame.renderScale);
  };

  const startPlacement = (defId: string): void => {
    const size = gameData.buildings[defId]?.size ?? 1;
    const t = worldToTile(camera.x, camera.y);
    placement = {
      defId,
      tileX: Math.round(t.x - size / 2),
      tileY: Math.round(t.y - size / 2),
    };
    placementHeldByShift = false;
    refreshGhost();
  };
  const cancelPlacement = (): void => {
    placement = null;
    placementHeldByShift = false;
    refreshGhost();
  };
  const confirmPlacement = (keepActive = false): void => {
    if (!placement) return;
    if (PENDING_COMMAND_KINDS.has('build')) {
      // sim would silently drop the build command — never confirm a no-op
      hud.showUndoToast('Construction arrives in wave 2', null);
      return;
    }
    const size = gameData.buildings[placement.defId]?.size ?? 1;
    const status = placementStatus(
      getState(), humanPlayer, placement.tileX, placement.tileY, size,
      () => game.canPlace(humanPlayer, placement!.defId, placement!.tileX, placement!.tileY),
    );
    if (status !== 'valid' || !canAfford(placement.defId)) return;
    const villagers = liveSelection().filter((e) => e.defId === 'villager').map((e) => e.id);
    if (villagers.length === 0) {
      hud.showUndoToast('Select a villager to build', null);
      return;
    }
    const def = gameData.buildings[placement.defId];
    const { defId, tileX, tileY } = placement;
    const label = def?.wall
      ? 'Wall placed — keep tapping to extend, Cancel to stop'
      : keepActive
        ? `${def?.name ?? defId} placed — Shift-click to keep building, Esc to stop`
        : `Building ${def?.name ?? defId}`;
    const accepted = issueWithUndo({
      kind: 'build', player: humanPlayer, units: villagers, defId, tileX, tileY,
      ...(keepActive ? { queue: true } : {}),
    }, label, null);
    if (!accepted) return;
    if (def?.wall || keepActive) {
      // v1 wall flow: single-tile walls placed repeatedly — placement mode stays
      // armed so a run of wall goes tap-confirm, tap-confirm. Holding Shift gives
      // every other building the same repeat-placement flow.
      placementHeldByShift = keepActive && !def?.wall;
      refreshGhost();
      return;
    }
    placement = null;
    placementHeldByShift = false;
    refreshGhost();
  };

  // --------------------------------------------------------------- HUD
  const hudHost: HudHost = {
    assets,
    humanPlayer,
    getState,
    getSelection: liveSelection,
    getUnitStats: (player, defId) => unitDisplayStats(game, player, defId),
    deselect,
    trainUnit: (buildingId, defId) => {
      issueWithUndo(
        { kind: 'train', player: humanPlayer, buildingId, defId },
        `Training ${gameData.units[defId]?.name ?? defId}`,
        null,
      );
    },
    cancelTrain: (buildingId, index) => issue({ kind: 'cancelTrain', player: humanPlayer, buildingId, index }),
    researchTech: (buildingId, techId) => {
      issueWithUndo(
        { kind: 'research', player: humanPlayer, buildingId, techId },
        `Researching ${gameData.techs[techId]?.name ?? techId}`,
        null,
      );
    },
    cancelResearch: (buildingId) => issue({ kind: 'cancelResearch', player: humanPlayer, buildingId }),
    ungarrisonAll: (buildingId) => {
      issue({ kind: 'ungarrison', player: humanPlayer, buildingId });
      hud.showUndoToast('Ungarrisoning', null);
    },
    townBell: (buildingId) => {
      const b = getState().entities.get(buildingId);
      const state = getState();
      const releasing = (b?.garrison ?? []).some((id) => state.entities.get(id)?.sheltering === true)
        || [...state.entities.values()].some((e) => isTownBellSeeking(e, humanPlayer, buildingId));
      audioEngine.play(releasing ? 'townBellOut' : 'townBellIn');
      issue({ kind: 'townBell', player: humanPlayer, buildingId });
      hud.showUndoToast(releasing ? 'Villagers returning to work' : 'Town Bell — villagers seeking shelter', null);
    },
    // GDD: "tap the flag control to clear". The sim has no unset command, so
    // clearing rallies back onto the building's own center (no targetId) — the
    // sim remaps the blocked center to the nearest walkable tile, i.e. the
    // default spawn side (same convention as the rally-undo path in input.ts).
    clearRally: (buildingId) => {
      const b = getState().entities.get(buildingId);
      if (!b) return;
      const prev = b.rally ? { ...b.rally } : null;
      issue({ kind: 'setRally', player: humanPlayer, buildingId, x: b.x, y: b.y });
      hud.showUndoToast('Rally cleared', prev ? () => {
        issue({ kind: 'setRally', player: humanPlayer, buildingId, x: prev.x, y: prev.y, targetId: prev.targetId });
      } : null);
    },
    destroyBuilding: (buildingId) => {
      const b = getState().entities.get(buildingId);
      issue({ kind: 'deleteEntity', player: humanPlayer, entityId: buildingId });
      deselect(); // the card was showing an entity that no longer exists
      hud.showUndoToast(buildingRemovalPresentation(b?.buildProgress).feedback, null);
    },
    marketTrade: (sell, buy, amount) => {
      issue({ kind: 'marketTrade', player: humanPlayer, sell, buy, amount });
      hud.showUndoToast(sell === 'gold' ? `Bought ${amount} ${buy}` : `Sold ${amount} ${sell}`, null);
    },
    reseedFarm: (farmId) => {
      issue({ kind: 'reseedFarm', player: humanPlayer, farmId });
      hud.showUndoToast('Reseeding farm', null);
    },
    setAutoReseed: (enabled) => {
      issue({ kind: 'queueReseed', player: humanPlayer, enabled });
      hud.showUndoToast(enabled ? 'Auto-reseed ON' : 'Auto-reseed OFF', null);
    },
    startPlacement,
    confirmPlacement,
    cancelPlacement,
    getPlacement: () => {
      if (!placement) return null;
      const size = gameData.buildings[placement.defId]?.size ?? 1;
      const status: PlacementStatus = placementStatus(
        getState(), humanPlayer, placement.tileX, placement.tileY, size,
        () => game.canPlace(humanPlayer, placement!.defId, placement!.tileX, placement!.tileY),
      );
      return {
        defId: placement.defId,
        valid: status === 'valid',
        needsVisibility: status === 'needs-visibility',
        affordable: canAfford(placement.defId),
      };
    },
    stopSelection: () => {
      const units = liveSelection().filter((e) => e.kind === 'unit').map((e) => e.id);
      if (units.length > 0) issue({ kind: 'stop', player: humanPlayer, units });
    },
    packSelection: (pack) => {
      const units = liveSelection()
        .filter((e) => e.kind === 'unit' && !!gameData.units[e.defId]?.pack)
        .map((e) => e.id);
      if (units.length === 0) return;
      issue({ kind: pack ? 'pack' : 'unpack', player: humanPlayer, units });
      hud.showUndoToast(pack ? 'Packing up' : 'Unpacking to fire', null);
    },
    armVerb: (verb) => { armedVerb = armedVerb === verb ? null : verb; },
    getArmedVerb: () => armedVerb,
    setFormation: (next) => {
      formation = next;
      const soldiers = liveSelection().filter((e) => {
        const def = e.kind === 'unit' ? gameData.units[e.defId] : undefined;
        return e.kind === 'unit' && e.player === humanPlayer && e.defId !== 'villager'
          && !!def && !def.herdable && !def.huntable && def.attacks.length > 0;
      });
      if (soldiers.length < 3) return;
      const x = Math.round(soldiers.reduce((sum, e) => sum + e.x, 0) / soldiers.length);
      const y = Math.round(soldiers.reduce((sum, e) => sum + e.y, 0) / soldiers.length);
      issue({
        kind: 'move', player: humanPlayer, units: soldiers.map((e) => e.id), x, y, formation: next,
      });
      hud.showUndoToast(`${next[0].toUpperCase()}${next.slice(1)} formation`, null);
    },
    getFormation: () => formation,
    togglePause: () => {
      loop.togglePause();
      if (loop.paused) saveMatch();
    },
    isPaused: () => loop.paused,
    resumeGame: () => loop.resume(),
    setProductionSpeed: (multiplier) => {
      issue({ kind: 'setProductionSpeed', player: humanPlayer, multiplier });
    },
    // pause-overlay slider release: the player hears the level they just set
    playUiSound: () => audioEngine.play('uiTap'),
    resign: () => {
      issue({ kind: 'resign', player: humanPlayer });
      loop.resume(); // the resign must actually process (defeat -> end screen)
    },
    // pause-overlay exit while spectating a finished match (the sim drops all
    // commands post-finish, so Resign is swapped for this) — same full reboot
    // the end screen's Return to Title performs
    returnToTitle: () => reloadTo(meta ? { kind: 'scenarioList', campaignId: meta.campaign } : null),
    getLastSaveTime: () => lastSavedAt,
    getIdleCounts,
    cycleIdle,
    focusBuilding,
    getGroupCounts,
    saveGroup,
    selectGroup,
  };
  // Keep the battlefield full-bleed while every DOM control shares one safe
  // containing block. This parent stays unscaled, so the HUD size preference
  // cannot multiply or shrink the physical notch/system-gesture insets.
  const hudRoot = document.createElement('div');
  hudRoot.className = 'bf-hud-safe-root';
  hudRoot.style.cssText = HUD_SAFE_AREA_ROOT_STYLE;
  root.appendChild(hudRoot);

  const hud = new Hud(hudRoot, hudHost);
  const overlays = new Overlays(hudRoot);
  if (meta && meta.id !== SHOWCASE_SCENARIO_ID) {
    objectivesPanel = new ObjectivesPanel(
      hudRoot,
      (target) => startCameraPan(target.x, target.y),
      objectiveGuides.map((guide) => guide.id),
    );
    messageBanner = new MessageBanner(hudRoot, narrator);
    for (const op of pendingObjectiveOps) op(objectivesPanel); // resume-replayed state
    pendingObjectiveOps.length = 0;
  }

  const minimap = new Minimap(
    hud.minimapSlot,
    assets,
    getState,
    camera,
    humanPlayer,
    fog.fogCanvas,
    (tx, ty) => camera.centerOnTile(tx, ty),
    (tx, ty) => {
      const units = liveSelection()
        .filter((e) => e.kind === 'unit' && e.player === humanPlayer)
        .map((e) => e.id);
      if (units.length === 0) return false;
      const undo = (): void => { issue({ kind: 'stop', player: humanPlayer, units }); };
      issueWithUndo(
        { kind: 'move', player: humanPlayer, units, x: fp(tx), y: fp(ty) },
        'Move',
        undo,
      );
      return true;
    },
    resourceMemory,
  );

  let lastObjectiveProgressTick = -1;
  let objectiveProgressEvaluations = 0;
  let objectiveViewportWidth = app.screen.width;
  let objectiveViewportHeight = app.screen.height;
  let objectiveSafeRect = hudRoot.getBoundingClientRect();
  const refreshObjectiveProgress = (tick: number): void => {
    if (!objectivesPanel || !scenarioOps || !triggers) return;
    const objectives = objectivesPanel.model.items();
    const needsInitialReadout = objectives.some((objective) =>
      objective.readout === undefined && objectiveGuidesById.has(objective.id)
    );
    if (!needsInitialReadout && !objectiveProgressDue(tick, lastObjectiveProgressTick)) return;
    const readouts = objectives.flatMap((objective) => {
      if (objective.state !== 'open' && objective.readout) return [];
      const guide = objectiveGuidesById.get(objective.id);
      return guide ? [evaluateObjectiveGuide(guide, scenarioOps, triggers)] : [];
    });
    objectivesPanel.setReadouts(readouts);
    lastObjectiveProgressTick = tick;
    objectiveProgressEvaluations++;
  };

  // --------------------------------------------------------------- input
  const inputHost: InputHost = {
    camera,
    world,
    humanPlayer,
    getState,
    getSelection: liveSelection,
    setSelection,
    deselect,
    issue,
    issueWithUndo,
    isPlacing: () => placement !== null,
    setPlacementTile: (tileX, tileY) => {
      if (!placement) return;
      const size = gameData.buildings[placement.defId]?.size ?? 1;
      placement.tileX = Math.round(tileX - size / 2);
      placement.tileY = Math.round(tileY - size / 2);
      refreshGhost();
    },
    confirmPlacement,
    placementHitTest: (wx, wy) => {
      if (!placement) return false;
      const size = gameData.buildings[placement.defId]?.size ?? 1;
      const t = worldToTile(wx, wy);
      const cx = placement.tileX + size / 2;
      const cy = placement.tileY + size / 2;
      return Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy)) <= size / 2 + 1;
    },
    cancelPlacement,
    releasePlacementModifier: () => {
      if (placementHeldByShift) cancelPlacement();
    },
    isAttackMoveArmed: () => armedVerb === 'attackMove',
    setAttackMoveArmed: (v) => { armedVerb = v ? 'attackMove' : null; },
    getArmedVerb: () => armedVerb,
    clearArmedVerb: () => { armedVerb = null; },
    getFormation: () => formation,
    togglePause: () => loop.togglePause(),
    showToast: (label) => hud.showUndoToast(label, null),
  };
  const input = new InputController(app.canvas, bandOverlay, inputHost);

  // --------------------------------------------------------- dev speed toggle
  // ?dev=1: 1x/4x/16x sim speed for fast scenario playtesting. Extra speed =
  // extra loop.update() calls per frame — more advance() steps through the
  // SAME deterministic path; the command log and determinism are unaffected.
  let simSpeed = 1;
  if (new URLSearchParams(window.location.search).get('dev') === '1') {
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:8px;top:40px;z-index:60;display:flex;gap:4px;pointer-events:auto;';
    const btns: HTMLButtonElement[] = [];
    for (const s of [1, 4, 16]) {
      const b = document.createElement('button');
      b.textContent = `${s}×`;
      b.style.cssText = 'font:12px "Alegreya Sans","Trebuchet MS",sans-serif;padding:3px 8px;cursor:pointer;border-radius:3px;border:1px solid #64492B;background:#241809;color:#DABE8D;';
      b.addEventListener('click', () => {
        simSpeed = s;
        for (const x of btns) {
          x.style.background = '#241809';
          x.style.color = '#DABE8D';
        }
        b.style.background = '#DABE8D';
        b.style.color = '#1A1208';
      });
      btns.push(b);
      bar.appendChild(b);
    }
    btns[0].style.background = '#DABE8D';
    btns[0].style.color = '#1A1208';
    hudRoot.appendChild(bar);
  }

  // Dev-only QA handle: lets automated browser sessions locate entities on screen and
  // read sim state without poking at Pixi internals. Never present in production builds.
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    const entScreen = (e: Entity): { x: number; y: number } => {
      const w = tileToWorld(e.x / FP, e.y / FP);
      return camera.worldToScreen(w.x, w.y);
    };
    (window as unknown as Record<string, unknown>).__bfQa = {
      state: getState,
      find: (defId?: string, playerId?: number): Array<Record<string, unknown>> => {
        const out: Array<Record<string, unknown>> = [];
        for (const e of getState().entities.values()) {
          if (defId !== undefined && e.defId !== defId) continue;
          if (playerId !== undefined && e.player !== playerId) continue;
          out.push({
            id: e.id, defId: e.defId, player: e.player, kind: e.kind,
            tileX: e.tileX, tileY: e.tileY, hp: e.hp, activity: e.activity,
            carrying: e.carrying, amountLeft: e.amountLeft,
            buildProgress: e.buildProgress, garrison: e.garrison?.length,
            screen: entScreen(e),
          });
        }
        return out;
      },
      screenOf: (id: EntityId): { x: number; y: number } | null => {
        const e = getState().entities.get(id);
        return e ? entScreen(e) : null;
      },
      centerOnTile: (tx: number, ty: number): void => camera.centerOnTile(tx, ty),
      selection: () => selection.slice(),
      humanPlayer,
      /** Fast-forward N ticks through the normal SimLoop path (QA sessions only). */
      step: (ticks: number): void => {
        for (let i = 0; i < ticks; i += 5) loop.update(TICK_MS * Math.min(5, ticks - i));
      },
      /** Queue a raw command like the HUD would (QA bulk re-tasking only). */
      issue: (cmd: Command): void => { issue(cmd); },
      setSpeed: (s: number): void => { simSpeed = Math.max(1, Math.min(64, Math.round(s))); },
      objectives: () => objectivesPanel?.model.items() ?? [],
      objectiveGuidance: () => ({
        evaluationPasses: objectiveProgressEvaluations,
        lastEvaluationTick: lastObjectiveProgressTick,
        currentTarget: objectivesPanel?.currentTarget ?? null,
      }),
    };
  }

  // initial fog
  fog.update(getState().players[humanPlayer]?.visibility ?? new Uint8Array(0));

  // --------------------------------------------------------------- main loop
  app.ticker.add(() => {
    const dt = app.ticker.deltaMS;
    const now = performance.now();
    camera.setViewport(app.screen.width, app.screen.height);

    // dev speed: each extra pass is a normal accumulator update — the catchup
    // clamp inside SimLoop still bounds each call to 5 ticks
    for (let i = 0; i < simSpeed; i++) loop.update(dt);
    // Snapshot on every entry into pause, whatever caused it: the pause button,
    // the P hotkey, or attachAutoPause on a hidden tab. A paused sim stops
    // reaching the periodic save below, so this is the last chance to store the
    // match — and it is what the pause overlay reports as the last autosave.
    if (loop.paused !== wasPausedLastFrame) {
      wasPausedLastFrame = loop.paused;
      if (loop.paused) saveMatch();
    }
    input.update(dt, now);
    camera.update(dt);

    // trigger-driven camera pan (after input so a drag this frame cancels first)
    if (panFx) {
      panFx.elapsed += dt;
      const t = Math.min(1, panFx.elapsed / PAN_MS);
      const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      camera.centerOnTile(
        panFx.fx + (panFx.tx - panFx.fx) * ease,
        panFx.fy + (panFx.ty - panFx.fy) * ease,
      );
      if (t >= 1) panFx = null;
    }

    const t = camera.getTransform();
    worldRoot.scale.set(t.zoom);
    worldRoot.position.set(t.x, t.y);

    const st = getState();
    const alpha = loop.alpha;
    const worldView = camera.getWorldView();
    terrain.update(worldView);
    world.update(st, alpha, st.tick + alpha, worldView);
    fx.update(st, st.tick + alpha);
    if (placement) refreshGhost();
    hud.update();
    refreshObjectiveProgress(st.tick);
    objectivesPanel?.update();
    const objectiveTarget = objectivesPanel?.currentTarget ?? null;
    minimap.setObjectiveTarget(objectiveTarget);
    minimap.update(now);
    if (objectivesPanel) {
      if (app.screen.width !== objectiveViewportWidth || app.screen.height !== objectiveViewportHeight) {
        objectiveViewportWidth = app.screen.width;
        objectiveViewportHeight = app.screen.height;
        objectiveSafeRect = hudRoot.getBoundingClientRect();
      }
      const targetWorld = objectiveTarget ? tileToWorld(objectiveTarget.x, objectiveTarget.y) : null;
      const targetScreen = targetWorld ? camera.worldToScreen(targetWorld.x, targetWorld.y) : null;
      objectivesPanel.updateMarker(
        targetScreen ? {
          x: targetScreen.x - objectiveSafeRect.left,
          y: targetScreen.y - objectiveSafeRect.top,
        } : null,
        objectiveSafeRect.width,
        objectiveSafeRect.height,
      );
    }
    gameAudio.update(st, now);
    messageBanner?.update(now);
    if (st.tick - lastSavedTick >= AUTOSAVE_TICKS) saveMatch();
  });
}
