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
import { Camera, tileToWorld, worldToTile } from './camera';
import { TerrainLayer } from './terrain';
import { WorldLayer } from './world';
import { FxLayer } from './fx';
import { FogLayer } from './fog';
import { SimLoop } from './simloop';
import { playHornSting } from './audio';
import { InputController, type InputHost } from './input';
import { Hud, type HudHost } from './hud/hud';
import { AGE_LABEL, type ArmedVerb } from './hud/cardModel';
import { Minimap } from './hud/minimap';
import { Overlays } from './hud/overlays';
import { deriveMatchSummary, emptyTallies, formatMatchTime, recordDeath } from './hud/summary';
import { createGame, practiceConfig } from './simBridge';

const PLACE_GREEN = 0x3e8c34;
const PLACE_RED = 0xb3261e;

export async function runGame(root: HTMLElement): Promise<void> {
  const loading = document.createElement('div');
  loading.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#DABE8D;font:18px "Pixelify Sans",monospace;background:#16100a;';
  loading.textContent = 'Mustering the banners…';
  root.appendChild(loading);

  const assets = await loadAssets();
  const config = practiceConfig();
  assets.prepareMatchColors(config.players.map((p) => p.color));
  const game = createGame(config);
  const humanPlayer: PlayerId = (config.players.findIndex((p) => p.isHuman) + 1) as PlayerId;

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

  // center on the human TC
  for (const e of game.state.entities.values()) {
    if (e.player === humanPlayer && e.defId === 'townCenter') {
      camera.centerOnTile(e.x / FP, e.y / FP);
      break;
    }
  }
  world.onTick(game.state); // initial position snapshot

  // --------------------------------------------------------------- state
  let selection: EntityId[] = [];
  let armedVerb: ArmedVerb | null = null;
  let placement: { defId: string; tileX: number; tileY: number } | null = null;
  const tallies = emptyTallies();
  let housed = false;
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
  const loop = new SimLoop(game, {
    onTick: (events) => {
      const st = getState();
      world.onTick(st);
      world.onSimEvents(events, st.tick);
      fx.onSimEvents(st, events, st.tick);
      handleSimEvents(events);
      fog.update(st.players[humanPlayer]?.visibility ?? new Uint8Array(0));
    },
  });
  loop.attachAutoPause();

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
    const colorIdx = getState().players[humanPlayer]?.setup.color;
    const frame =
      assets.tryResolve(`bld/${placement.defId}/${getState().players[humanPlayer]?.age ?? 'dark'}/done`, colorIdx) ??
      assets.resolveFrame(`bld/${placement.defId}/done`, colorIdx);
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
    issue({ kind: 'build', player: humanPlayer, units: villagers, defId: placement.defId, tileX: placement.tileX, tileY: placement.tileY });
    if (def?.wall) {
      // v1 wall flow: single-tile walls placed repeatedly — placement mode stays
      // armed so a run of wall goes tap-confirm, tap-confirm (drag-placement is
      // a wave-3 nicety; see GDD walls note).
      hud.showUndoToast('Wall placed — keep tapping to extend, Cancel to stop', null);
      refreshGhost();
      return;
    }
    hud.showUndoToast(`Building ${def?.name ?? placement.defId}`, null);
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
  });
}
