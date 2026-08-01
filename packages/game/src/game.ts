// Game screen orchestrator: Pixi app + layers (terrain/world/fog) + camera +
// fixed-timestep sim loop + input + DOM HUD + minimap + building placement mode.

import { Application, Container, Graphics, Sprite } from 'pixi.js';
import {
  FP, fp, TICKS_PER_SECOND,
  type Command, type Entity, type EntityId, type GameState, type PlayerId, type SimEvent,
} from '@bf/sim/types';
import { gameData } from '@bf/data';
import { PENDING_COMMAND_KINDS } from '@bf/sim/commands';
import { loadAssets, type GameAssets } from './assets';
import { centroidTile, idleUnits, liveGroupIds, sameIdSet, type IdleCategory } from './selectionTools';
import { placementGhostFrames } from './frames';
import { Camera, tileToWorld, worldToTile } from './camera';
import { TerrainLayer } from './terrain';
import { WorldLayer } from './world';
import { FxLayer } from './fx';
import { FogLayer } from './fog';
import { SimLoop, TICK_MS } from './simloop';
import { playHornSting } from './audio';
import { InputController, type InputHost } from './input';
import { Hud, type HudHost } from './hud/hud';
import { AGE_LABEL, type ArmedVerb } from './hud/cardModel';
import { Minimap } from './hud/minimap';
import { Overlays } from './hud/overlays';
import { deriveMatchSummary, emptyTallies, formatMatchTime, recordDeath } from './hud/summary';
import { createGame, practiceConfig } from './simBridge';
import { createBot, type Bot, type BotDifficulty } from '@bf/ai';
import {
  clearSnapshot, loadSnapshot, replaySnapshot, saveSnapshot, SNAPSHOT_VERSION,
  type CommandLog,
} from './persist';

const PLACE_GREEN = 0x3e8c34;
const PLACE_RED = 0xb3261e;
/** Autosave cadence while playing (ticks): 15 s — cheap next to hide/pagehide saves. */
const AUTOSAVE_TICKS = 300;

export interface RunGameOptions {
  /** Restore the persisted match snapshot instead of starting fresh. */
  resume?: boolean;
  /** Bot difficulty for a fresh practice match (GDD: Easy / Standard / Hard). */
  difficulty?: BotDifficulty;
}

export async function runGame(root: HTMLElement, options: RunGameOptions = {}): Promise<void> {
  const loading = document.createElement('div');
  loading.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#DABE8D;font:18px "Pixelify Sans",monospace;background:#16100a;';
  loading.textContent = 'Mustering the banners…';
  root.appendChild(loading);

  const assets = await loadAssets();
  const snapshot = options.resume ? loadSnapshot() : null;
  if (!snapshot) clearSnapshot(); // starting fresh abandons any stale match
  const difficulty: BotDifficulty = snapshot?.difficulty ?? options.difficulty ?? 'standard';
  const config = snapshot?.config ?? practiceConfig();
  assets.prepareMatchColors(config.players.map((p) => p.color));
  const game = createGame(config);
  const humanPlayer: PlayerId = (config.players.findIndex((p) => p.isHuman) + 1) as PlayerId;

  // Resume: replay the recorded command log through the fresh engine — the
  // deterministic sim rebuilds the exact snapshotted state (GDD suspend/resume).
  const commandLog: CommandLog = snapshot?.log ?? [];
  const replayedDeaths: Array<Extract<SimEvent, { kind: 'entityDied' }>> = [];
  if (snapshot) {
    loading.textContent = 'Restoring match…';
    await new Promise((r) => requestAnimationFrame(() => r(null))); // let the text paint
    replaySnapshot(game, snapshot, (events) => {
      for (const ev of events) {
        if (ev.kind === 'entityDied') replayedDeaths.push(ev);
      }
    });
  }

  const app = new Application();
  await app.init({
    background: 0x0d0b08,
    resizeTo: root,
    antialias: false,
    resolution: 1,
    roundPixels: true,
  });
  loading.remove();
  app.canvas.style.cssText = 'position:absolute;inset:0;touch-action:none;';
  root.appendChild(app.canvas);

  // --------------------------------------------------------------- layers
  const camera = new Camera();
  camera.setMapBounds(game.state.map.width, game.state.map.height);
  camera.setViewport(app.screen.width, app.screen.height);

  const worldRoot = new Container();
  const terrain = new TerrainLayer(app.renderer, assets, game.state.map);
  const world = new WorldLayer(assets, humanPlayer);
  const fx = new FxLayer(assets);
  const fog = new FogLayer(game.state.map);
  const ghostLayer = new Container();
  const ghostFoot = new Graphics();
  const ghostSprite = new Sprite();
  ghostSprite.alpha = 0.6;
  ghostLayer.addChild(ghostFoot, ghostSprite);
  ghostLayer.visible = false;
  // fx.ground (corpses/rubble) under entities; fx.air (projectiles/beams) above
  worldRoot.addChild(terrain.container, fx.ground, world.container, fx.air, ghostLayer, fog.sprite);
  app.stage.addChild(worldRoot);
  const bandOverlay = new Graphics();
  app.stage.addChild(bandOverlay);

  // center on the human TC (resumed matches may have lost it — any own entity then)
  let centered = false;
  for (const e of game.state.entities.values()) {
    if (e.player === humanPlayer && e.defId === 'townCenter') {
      camera.centerOnTile(e.x / FP, e.y / FP);
      centered = true;
      break;
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

  // --------------------------------------------------------------- state
  let selection: EntityId[] = [];
  let armedVerb: ArmedVerb | null = null;
  let placement: { defId: string; tileX: number; tileY: number } | null = null;
  const tallies = emptyTallies();
  let housed = false;
  for (const ev of replayedDeaths) recordDeath(tallies, ev, humanPlayer); // summary survives resume
  let wonderOwner: PlayerId | null = null; // whose countdown the banner tracks
  let endShown = false;

  const getState = (): GameState => game.state;
  const liveSelection = (): Entity[] => {
    const st = getState();
    const out: Entity[] = [];
    for (const id of selection) {
      const e = st.entities.get(id);
      if (e && e.activity !== 'dying') out.push(e);
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
  const getIdleCounts = (): Record<IdleCategory, number> => ({
    villager: idleUnits(getState(), humanPlayer, 'villager').length,
    military: idleUnits(getState(), humanPlayer, 'military').length,
  });
  const cycleIdle = (cat: IdleCategory): void => {
    const list = idleUnits(getState(), humanPlayer, cat);
    if (list.length === 0) return;
    const e = list[idleCursor[cat] % list.length];
    idleCursor[cat] = (idleCursor[cat] + 1) % list.length;
    setSelection([e.id]);
    camera.centerOnTile(e.x / FP, e.y / FP);
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
  const showEnd = (victory: boolean): void => {
    if (endShown) return;
    endShown = true;
    clearSnapshot(); // a finished match must never be offered for resume
    deselect();
    overlays.showEndScreen(
      victory,
      deriveMatchSummary(getState(), humanPlayer, tallies),
      () => window.location.reload(), // full reboot back to the title screen
    );
  };

  const handleSimEvents = (events: SimEvent[]): void => {
    const st = getState();
    for (const ev of events) {
      switch (ev.kind) {
        case 'entityDied':
          recordDeath(tallies, ev, humanPlayer);
          break;
        case 'ageAdvanced':
          if (ev.player === humanPlayer) {
            overlays.showAgeBanner(AGE_LABEL[ev.age]);
            playHornSting(); // GDD audio: horn sting on age-up
          }
          break;
        case 'underAttack':
          if (ev.player === humanPlayer) {
            overlays.pulseUnderAttack();
            minimap.ping(ev.x / FP, ev.y / FP);
            playHornSting(); // GDD audio: horn sting on attack warning
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
          if (ev.kind === 'wonderStarted' && ev.player !== humanPlayer) playHornSting();
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
  // Bot opponents (GDD Practice): every non-human player gets a controller that
  // reads sim state and issues Commands through the same queue a human would.
  // During a resume their historical commands came from the log; from here on
  // they play live again.
  const bots: Bot[] = config.players
    .map((p, i) => ({ setup: p, id: (i + 1) as PlayerId }))
    .filter(({ setup }) => !setup.isHuman)
    .map(({ id }) => createBot(game, id, difficulty));

  const loop = new SimLoop(game, {
    onTick: (events) => {
      const st = getState();
      for (const bot of bots) {
        for (const cmd of bot.tick()) loop.issue(cmd);
      }
      world.onTick(st);
      world.onSimEvents(events, st.tick);
      fx.onSimEvents(st, events, st.tick);
      handleSimEvents(events);
      fog.update(st.players[humanPlayer]?.visibility ?? new Uint8Array(0));
    },
    // match-snapshot command log: every applied batch (human AND bots) is
    // recorded so a resume replays the identical game
    onAdvance: (tick, commands) => {
      commandLog.push([tick, commands]);
    },
  });
  loop.attachAutoPause();

  // ------------------------------------------------------------- persistence
  // GDD: backgrounding auto-snapshots the match; periodic saves cover OS kills
  // and dev-server reloads. Cleared the moment the match ends.
  let lastSavedTick = game.state.tick;
  const saveMatch = (): void => {
    const st = getState();
    if (endShown || st.finished) return;
    saveSnapshot({ version: SNAPSHOT_VERSION, config, difficulty, tick: st.tick, log: commandLog });
    lastSavedTick = st.tick;
  };
  const onVisibility = (): void => {
    if (document.hidden) saveMatch();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', saveMatch);

  const issue = (cmd: Command): void => loop.issue(cmd);
  const issueWithUndo = (cmd: Command, label: string, undo: (() => void) | null): void => {
    loop.issue(cmd);
    hud.showUndoToast(label, undo);
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
    const valid = game.canPlace(humanPlayer, placement.defId, placement.tileX, placement.tileY);
    const center = tileToWorld(placement.tileX + size / 2, placement.tileY + size / 2);
    ghostLayer.position.set(center.x, center.y);
    ghostLayer.visible = true;
    const hw = size * 32;
    const hh = size * 16;
    const color = valid ? PLACE_GREEN : PLACE_RED;
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
  };

  const startPlacement = (defId: string): void => {
    const size = gameData.buildings[defId]?.size ?? 1;
    const t = worldToTile(camera.x, camera.y);
    placement = {
      defId,
      tileX: Math.round(t.x - size / 2),
      tileY: Math.round(t.y - size / 2),
    };
    refreshGhost();
  };
  const cancelPlacement = (): void => {
    placement = null;
    refreshGhost();
  };
  const confirmPlacement = (): void => {
    if (!placement) return;
    if (PENDING_COMMAND_KINDS.has('build')) {
      // sim would silently drop the build command — never confirm a no-op
      hud.showUndoToast('Construction arrives in wave 2', null);
      return;
    }
    if (!game.canPlace(humanPlayer, placement.defId, placement.tileX, placement.tileY) || !canAfford(placement.defId)) return;
    const villagers = liveSelection().filter((e) => e.defId === 'villager').map((e) => e.id);
    if (villagers.length === 0) {
      hud.showUndoToast('Select a villager to build', null);
      return;
    }
    const def = gameData.buildings[placement.defId];
    const { defId, tileX, tileY } = placement;
    issue({ kind: 'build', player: humanPlayer, units: villagers, defId, tileX, tileY });
    // Real undo: delete the foundation this confirm created (the sim spawns it at
    // the next tick boundary, so the closure looks it up by footprint when tapped;
    // deleteEntity refunds the unbuilt fraction via refundFoundation).
    const undoBuild = (): void => {
      for (const e of getState().entities.values()) {
        if (e.kind === 'building' && e.player === humanPlayer && e.defId === defId
          && e.tileX === tileX && e.tileY === tileY && (e.buildProgress ?? 1000) < 1000) {
          issue({ kind: 'deleteEntity', player: humanPlayer, entityId: e.id });
          return;
        }
      }
    };
    if (def?.wall) {
      // v1 wall flow: single-tile walls placed repeatedly — placement mode stays
      // armed so a run of wall goes tap-confirm, tap-confirm (drag-placement is
      // a wave-3 nicety; see GDD walls note). Undo removes the LAST segment.
      hud.showUndoToast('Wall placed — keep tapping to extend, Cancel to stop', undoBuild);
      refreshGhost();
      return;
    }
    hud.showUndoToast(`Building ${def?.name ?? defId}`, undoBuild);
    placement = null;
    refreshGhost();
  };

  // --------------------------------------------------------------- HUD
  const hudHost: HudHost = {
    assets,
    humanPlayer,
    getState,
    getSelection: liveSelection,
    deselect,
    trainUnit: (buildingId, defId) => {
      issue({ kind: 'train', player: humanPlayer, buildingId, defId });
      hud.showUndoToast(`Training ${gameData.units[defId]?.name ?? defId}`, () => {
        const b = getState().entities.get(buildingId);
        const idx = (b?.trainQueue?.length ?? 0) - 1;
        if (idx >= 0) issue({ kind: 'cancelTrain', player: humanPlayer, buildingId, index: idx });
      });
    },
    cancelTrain: (buildingId, index) => issue({ kind: 'cancelTrain', player: humanPlayer, buildingId, index }),
    researchTech: (buildingId, techId) => {
      issue({ kind: 'research', player: humanPlayer, buildingId, techId });
      hud.showUndoToast(`Researching ${gameData.techs[techId]?.name ?? techId}`, () => {
        issue({ kind: 'cancelResearch', player: humanPlayer, buildingId });
      });
    },
    cancelResearch: (buildingId) => issue({ kind: 'cancelResearch', player: humanPlayer, buildingId }),
    ungarrisonAll: (buildingId) => {
      issue({ kind: 'ungarrison', player: humanPlayer, buildingId });
      hud.showUndoToast('Ungarrisoning', null);
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
    deleteBuilding: (buildingId) => {
      const b = getState().entities.get(buildingId);
      issue({ kind: 'deleteEntity', player: humanPlayer, entityId: buildingId });
      deselect(); // the card was showing an entity that no longer exists
      const wasFoundation = (b?.buildProgress ?? 1000) < 1000;
      hud.showUndoToast(wasFoundation ? 'Construction cancelled — cost refunded' : 'Building deleted', null);
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
    getPlacement: () => (placement ? {
      defId: placement.defId,
      valid: game.canPlace(humanPlayer, placement.defId, placement.tileX, placement.tileY),
      affordable: canAfford(placement.defId),
    } : null),
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
    togglePause: () => loop.togglePause(),
    isPaused: () => loop.paused,
    resumeGame: () => loop.resume(),
    resign: () => {
      issue({ kind: 'resign', player: humanPlayer });
      loop.resume(); // the resign must actually process (defeat -> end screen)
    },
    // pause-overlay exit while spectating a finished match (the sim drops all
    // commands post-finish, so Resign is swapped for this) — same full reboot
    // the end screen's Return to Title performs
    returnToTitle: () => window.location.reload(),
    getIdleCounts,
    cycleIdle,
    getGroupCounts,
    saveGroup,
    selectGroup,
  };
  const hud = new Hud(root, hudHost);
  const overlays = new Overlays(root);

  const minimap = new Minimap(
    hud.minimapSlot,
    assets,
    getState,
    camera,
    humanPlayer,
    fog.fogCanvas,
    (tx, ty) => camera.centerOnTile(tx, ty),
  );

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
    placementHitTest: (wx, wy) => {
      if (!placement) return false;
      const size = gameData.buildings[placement.defId]?.size ?? 1;
      const t = worldToTile(wx, wy);
      const cx = placement.tileX + size / 2;
      const cy = placement.tileY + size / 2;
      return Math.max(Math.abs(t.x - cx), Math.abs(t.y - cy)) <= size / 2 + 1;
    },
    cancelPlacement,
    isAttackMoveArmed: () => armedVerb === 'attackMove',
    setAttackMoveArmed: (v) => { armedVerb = v ? 'attackMove' : null; },
    getArmedVerb: () => armedVerb,
    clearArmedVerb: () => { armedVerb = null; },
    togglePause: () => loop.togglePause(),
    showToast: (label) => hud.showUndoToast(label, null),
  };
  const input = new InputController(app.canvas, bandOverlay, inputHost);

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
      issue: (cmd: Command): void => issue(cmd),
    };
  }

  // initial fog
  fog.update(getState().players[humanPlayer]?.visibility ?? new Uint8Array(0));

  // --------------------------------------------------------------- main loop
  app.ticker.add(() => {
    const dt = app.ticker.deltaMS;
    const now = performance.now();
    camera.setViewport(app.screen.width, app.screen.height);

    loop.update(dt);
    input.update(dt, now);
    camera.update(dt);

    const t = camera.getTransform();
    worldRoot.scale.set(t.zoom);
    worldRoot.position.set(t.x, t.y);

    const st = getState();
    const alpha = loop.alpha;
    terrain.update(camera.getWorldView());
    world.update(st, alpha, st.tick + alpha);
    fx.update(st, st.tick + alpha);
    if (placement) refreshGhost();
    hud.update();
    minimap.update(now);
    if (st.tick - lastSavedTick >= AUTOSAVE_TICKS) saveMatch();
  });
}
