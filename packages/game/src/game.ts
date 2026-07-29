// Game screen orchestrator: Pixi app + layers (terrain/world/fog) + camera +
// fixed-timestep sim loop + input + DOM HUD + minimap + building placement mode.

import { Application, Container, Graphics, Sprite } from 'pixi.js';
import {
  FP, fp,
  type Command, type Entity, type EntityId, type GameState, type PlayerId,
} from '@bf/sim/types';
import { gameData } from '@bf/data';
import { loadAssets, type GameAssets } from './assets';
import { Camera, tileToWorld, worldToTile } from './camera';
import { TerrainLayer } from './terrain';
import { WorldLayer } from './world';
import { FogLayer } from './fog';
import { SimLoop } from './simloop';
import { InputController, type InputHost } from './input';
import { Hud, type HudHost } from './hud/hud';
import { Minimap } from './hud/minimap';
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
  const fog = new FogLayer(game.state.map);
  const ghostLayer = new Container();
  const ghostFoot = new Graphics();
  const ghostSprite = new Sprite();
  ghostSprite.alpha = 0.6;
  ghostLayer.addChild(ghostFoot, ghostSprite);
  ghostLayer.visible = false;
  worldRoot.addChild(terrain.container, world.container, ghostLayer, fog.sprite);
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
  let attackMoveArmed = false;
  let placement: { defId: string; tileX: number; tileY: number } | null = null;

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
    attackMoveArmed = false;
  };
  const deselect = (): void => setSelection([]);

  // --------------------------------------------------------------- sim loop
  const loop = new SimLoop(game, {
    onTick: (events) => {
      world.onTick(getState());
      world.onSimEvents(events, getState().tick);
      fog.update(getState().players[humanPlayer]?.visibility ?? new Uint8Array(0));
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
    const frame =
      assets.tryResolve(`bld/${placement.defId}/${getState().players[humanPlayer]?.age ?? 'dark'}/done`) ??
      assets.resolveFrame(`bld/${placement.defId}/done`);
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
    if (!game.canPlace(humanPlayer, placement.defId, placement.tileX, placement.tileY) || !canAfford(placement.defId)) return;
    const villagers = liveSelection().filter((e) => e.defId === 'villager').map((e) => e.id);
    if (villagers.length === 0) {
      hud.showUndoToast('Select a villager to build', null);
      return;
    }
    issue({ kind: 'build', player: humanPlayer, units: villagers, defId: placement.defId, tileX: placement.tileX, tileY: placement.tileY });
    hud.showUndoToast(`Building ${gameData.buildings[placement.defId]?.name ?? placement.defId}`, null);
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
    toggleAttackMove: () => { attackMoveArmed = !attackMoveArmed; },
    isAttackMoveArmed: () => attackMoveArmed,
    togglePause: () => loop.togglePause(),
    isPaused: () => loop.paused,
    resumeGame: () => loop.resume(),
  };
  const hud = new Hud(root, hudHost);

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
    isAttackMoveArmed: () => attackMoveArmed,
    setAttackMoveArmed: (v) => { attackMoveArmed = v; },
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
    if (placement) refreshGhost();
    hud.update();
    minimap.update(now);
  });
}
