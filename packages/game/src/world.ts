// World layer: y-sorted entity sprites with activity/facing/tick-driven
// animation, interpolation between the last two sim ticks, selection rings,
// health bars, building construct states, fog-based hiding with remembered
// building ghosts, damage-taken blink, villager carry icons, garrison count
// badges, and worksite highlights. Event-driven fx (projectiles, impact
// flashes, corpses, rubble, conversion beams) live in fx.ts.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import {
  FP, GAIA, TICKS_PER_SECOND,
  type Entity, type EntityId, type GameMap, type GameState, type PlayerId, type SimEvent,
} from '@bf/sim/types';
import { gameData, unitAggroRange } from '@bf/data';
import type { GameAssets, ResolvedFrame } from './assets';
import {
  animForActivity, animFrameIndex, buildingFrameChoice, buildingSpriteScale, facingFromDelta,
  unitRig, villagerWorkAnim, type AnimName, type FrameChoice,
} from './frames';
import { hasActiveRally } from './hud/cardModel';
import { GAIA_NEUTRAL_COLOR } from './recolor';
import { HALF_H, HALF_W, tileToWorld, worldToTile } from './camera';
import { getSettings } from './settings';
import { tileVisibility } from './fog';
import { PlayerResourceMemory } from './resourceMemory';

const HIGHLIGHT = 0xf4eedd;
const AMBER_HIGHLIGHT = 0xe6c04a;
const OUTLINE = 0x1a1208;
const HP_GREEN = 0x3e8c34;
const HP_YELLOW = 0xd4a82a;
const HP_RED = 0xb3261e;
const HP_BG = 0x2c1f12;
const RESEARCH_BLUE = 0x5b8fc9;
const GHOST_TINT = 0x9aa4ad;
const GHOST_ALPHA = 0.8;
const AGGRO_COLOR = 0xe9d6a5;
const AGGRO_LINE_ALPHA = 0.24;
const AGGRO_FILL_ALPHA = 0.025;
const OCCLUDER_ALPHA = 0.8;
const GATE_OPEN_RADIUS_FP = 2 * FP;
const GATE_OPEN_TICKS = TICKS_PER_SECOND * 0.45;

/**
 * The wall sheet is authored along the screen's NW→SE isometric axis. Mirror the
 * same art for runs on the perpendicular tile axis so both sides of a circuit join
 * instead of reading as separated horizontal blocks.
 */
export function mirroredWallIds(entities: Iterable<Entity>): Set<EntityId> {
  const connectors = Array.from(entities).filter((e) =>
    e.kind === 'building' && e.hp > 0 && (e.defId === 'stoneWall' || e.defId === 'gate'));
  const at = new Set(connectors.map((e) => `${e.tileX},${e.tileY}`));
  const mirrored = new Set<EntityId>();
  for (const e of connectors) {
    const alongX = at.has(`${e.tileX - 1},${e.tileY}`) || at.has(`${e.tileX + 1},${e.tileY}`);
    const alongY = at.has(`${e.tileX},${e.tileY - 1}`) || at.has(`${e.tileX},${e.tileY + 1}`);
    if (alongY && !alongX) mirrored.add(e.id);
  }
  return mirrored;
}

export interface WallCornerJoin {
  /** Connected neighbour on the tile X axis. */
  xDir: -1 | 1;
  /** Connected neighbour on the tile Y axis. */
  yDir: -1 | 1;
}

/**
 * Ground-level artwork: farms and barely-started foundations. It never conceals
 * a unit and it sorts below every upright sprite. `buildProgress` is null for
 * anything that is not a building.
 */
export function isFlatArtwork(defId: string, buildProgress: number | null): boolean {
  return defId === 'farm' || (buildProgress !== null && buildProgress < 250);
}

/**
 * y-sort depth for an entity rig. Flat artwork sinks far below every upright
 * sprite so units and buildings draw over it; gatehouses lift one row above
 * their immediately adjacent wall caps, or a later-sorted wall hides half the
 * arch and the gate reads as a breach.
 *
 * Shared with the fog-remembered ghost: a scouted foundation must keep sorting
 * like a slab once its tile falls into fog, not pop in front of its neighbours.
 */
export function entitySortDepth(defId: string, worldY: number, buildProgress: number | null): number {
  if (isFlatArtwork(defId, buildProgress)) return worldY - 4000;
  return worldY + (defId === 'gate' ? HALF_H + 1 : 0);
}

/**
 * The four display objects an L-corner join needs: the wall sprite, its mirrored
 * twin, and the half-masks that clip each to one axis. Both the live entity view
 * and the fog-remembered ghost satisfy it, so a remembered corner joins exactly
 * like the live one.
 */
interface CornerJoinTarget {
  sprite: Sprite;
  cornerSprite: Sprite;
  cornerPrimaryMask: Graphics;
  cornerSecondaryMask: Graphics;
}

/** Half-plane clip in root-local pixels, meeting at the shared corner post. */
function drawCornerHalfMask(mask: Graphics, screenSide: -1 | 1): void {
  mask.clear();
  mask.rect(screenSide < 0 ? -256 : -8, -256, 264, 512).fill(0xffffff);
}

/**
 * Clip an exact L-corner into two half-walls meeting at the shared post: the
 * authored sprite covers the tile-X arm, its mirror covers the tile-Y arm.
 * `target.sprite.scale` must already be set — the twin mirrors it.
 *
 * Each half is clipped to the screen side its arm points at (+tileX and -tileY
 * both point right, +tileY and -tileX both point left), so the two corner
 * orientations whose arms share a screen side overlap by design. That is
 * invisible at full opacity; a translucent fog ghost blends the shared band
 * twice and its post reads slightly darker than the rest of the run.
 */
function applyWallCornerJoin(
  target: CornerJoinTarget,
  corner: WallCornerJoin | undefined,
  frame: ResolvedFrame,
): void {
  if (!corner) {
    target.cornerSprite.visible = false;
    target.sprite.mask = null;
    target.cornerSprite.mask = null;
    target.cornerPrimaryMask.clear();
    target.cornerSecondaryMask.clear();
    return;
  }
  target.cornerSprite.texture = frame.texture;
  target.cornerSprite.anchor.set(frame.anchorX, frame.anchorY);
  target.cornerSprite.scale.set(-target.sprite.scale.x, target.sprite.scale.y);
  target.cornerSprite.visible = true;
  // +tileX projects down-right; +tileY projects down-left.
  drawCornerHalfMask(target.cornerPrimaryMask, corner.xDir);
  drawCornerHalfMask(target.cornerSecondaryMask, corner.yDir > 0 ? -1 : 1);
  target.sprite.mask = target.cornerPrimaryMask;
  target.cornerSprite.mask = target.cornerSecondaryMask;
}

/** Exact L-corners. The renderer clips one sprite per axis at the shared post. */
export function wallCornerJoins(entities: Iterable<Entity>): Map<EntityId, WallCornerJoin> {
  const connectors = Array.from(entities).filter((e) =>
    e.kind === 'building' && e.hp > 0 && (e.defId === 'stoneWall' || e.defId === 'gate'));
  const at = new Set(connectors.map((e) => `${e.tileX},${e.tileY}`));
  const corners = new Map<EntityId, WallCornerJoin>();
  for (const e of connectors) {
    const xNeg = at.has(`${e.tileX - 1},${e.tileY}`);
    const xPos = at.has(`${e.tileX + 1},${e.tileY}`);
    const yNeg = at.has(`${e.tileX},${e.tileY - 1}`);
    const yPos = at.has(`${e.tileX},${e.tileY + 1}`);
    if (xNeg === xPos || yNeg === yPos) continue;
    corners.set(e.id, { xDir: xPos ? 1 : -1, yDir: yPos ? 1 : -1 });
  }
  return corners;
}

/** Deterministic gate-leaf tween used for both opening and closing. */
export function advanceGateOpenProgress(current: number, open: boolean, elapsedTicks: number): number {
  const direction = open ? 1 : -1;
  return Math.max(0, Math.min(1, current + direction * Math.max(0, elapsedTicks) / GATE_OPEN_TICKS));
}

/**
 * What a selected villager is working on, for the amber worksite ring.
 *
 * `intent` is the durable record of the order and covers the whole job — the
 * walk over included — so a build or repair site stays ringed from the moment
 * the order lands until the sim clears the intent. Gathering keeps its
 * activity fallback because a laden villager walking to a drop site still
 * belongs to the resource it came from.
 */
export function villagerWorkTarget(e: Entity): EntityId | undefined {
  const intent = e.intent;
  if (intent && (intent.kind === 'gather' || intent.kind === 'build' || intent.kind === 'repair')) {
    return intent.targetId;
  }
  if (e.activity === 'gathering' || e.activity === 'carrying') return e.targetId;
  return undefined;
}

export interface EntityView {
  root: Container;
  ring: Graphics;
  /** Perpendicular half-segment used only for a true L-shaped wall corner. */
  cornerSprite: Sprite;
  cornerPrimaryMask: Graphics;
  cornerSecondaryMask: Graphics;
  sprite: Sprite;
  /** Independent gate leaf/portcullis layer, drawn behind the permanent arch. */
  gateDoor: Sprite;
  gateOpenProgress: number;
  gateLastTickFloat: number;
  hpBar: Graphics;
  lastFrameKey: string;
  lastAnim: AnimName | '';
  animStartTick: number;
  lastHpKey: string;
  lastRingKey: string;
  /** Facing derived from the real movement vector, avoiding NW/NE flicker on near-north paths. */
  renderFacing: number;
  /** Root-local y of the sprite's first opaque row (trimmed visible top). */
  spriteTopPx: number;
  /** Carry icon over laden villagers (entity.carrying). */
  carry: Sprite | null;
  lastCarryKey: string;
  /** Garrison flag + count badge over occupied buildings. */
  badge: Container | null;
  badgeText: Text | null;
  lastBadgeKey: string;
}

export interface WorldRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** True only when a unit that sorts behind an obstacle overlaps its visible artwork. */
export function shouldFadeForUnit(
  occluder: WorldRect,
  occluderDepth: number,
  unit: WorldRect,
  unitDepth: number,
): boolean {
  if (unitDepth >= occluderDepth) return false;
  return unit.right > occluder.left && unit.left < occluder.right
    && unit.bottom > occluder.top && unit.top < occluder.bottom;
}

function writeSpriteWorldRect(view: EntityView, out: WorldRect): WorldRect {
  const sprite = view.sprite;
  const width = sprite.texture.width;
  const height = sprite.texture.height;
  const x0 = (0 - sprite.anchor.x) * width * sprite.scale.x;
  const x1 = (1 - sprite.anchor.x) * width * sprite.scale.x;
  const y0 = (0 - sprite.anchor.y) * height * sprite.scale.y;
  const y1 = (1 - sprite.anchor.y) * height * sprite.scale.y;
  out.left = view.root.position.x + Math.min(x0, x1);
  out.right = view.root.position.x + Math.max(x0, x1);
  // Ignore transparent texture headroom so nearby units do not cause false fades.
  out.top = view.root.position.y + Math.max(Math.min(y0, y1), view.spriteTopPx);
  out.bottom = view.root.position.y + Math.max(y0, y1);
  return out;
}

/** Build progress for a building, null for anything that is not one. */
function buildingProgressOf(e: Entity): number | null {
  return e.kind === 'building' ? e.buildProgress ?? 1000 : null;
}

/** Exported for the differential test that pins the occluder-fade broad phase. */
export function spriteWorldRect(view: EntityView): WorldRect {
  return writeSpriteWorldRect(view, { left: 0, right: 0, top: 0, bottom: 0 });
}

function writeUnitWorldRect(view: EntityView, out: WorldRect): WorldRect {
  writeSpriteWorldRect(view, out);
  // A unit's readable body is centred around its feet. Keeping the horizontal
  // extent bounded prevents transparent cavalry-sheet gutters from fading a
  // building when the horse is merely beside it.
  const halfWidth = Math.min(24, Math.max(7, (out.right - out.left) * 0.4));
  out.left = view.root.position.x - halfWidth;
  out.right = view.root.position.x + halfWidth;
  out.bottom = view.root.position.y + 2;
  return out;
}

/** Exported for the differential test that pins the occluder-fade broad phase. */
export function unitWorldRect(view: EntityView): WorldRect {
  return writeUnitWorldRect(view, { left: 0, right: 0, top: 0, bottom: 0 });
}

/** Screen-space bucket edge (world px) for the occluder-fade broad phase. */
const FADE_CELL = 128;
/** Row stride for packing a (cellX, cellY) pair into one numeric bucket key. */
const FADE_BUCKET_STRIDE = 1 << 16;
/**
 * Margins (world px) around the camera view inside which entities still render.
 * Sprites are anchored at their feet and drawn upward, so the geometry is not
 * symmetric: artwork whose feet sit below the viewport can still reach up into
 * it by its full height, while artwork whose feet sit above the viewport is
 * already entirely off-screen.
 *
 * The tallest frame the atlases can produce measures ~700 world px once its
 * fortification art scale is applied (an HD keep), and the widest ~640 px (a
 * wonder), so these margins clear the real worst case with room for larger art
 * later. Over-padding only means a few extra off-screen updates; under-padding
 * means visible pop-in, so they lean generous.
 */
const CULL_PAD_BELOW = 1024;
const CULL_PAD_ABOVE = 128;
const CULL_PAD_SIDE = 512;

/**
 * Everything needed to redraw a building exactly as the player last saw it,
 * captured while its tile was visible. Kept complete on purpose: the live entity
 * may be gone, upgraded (watchTower -> guardTower -> keep mutates defId in place)
 * or finished building by the time the ghost is drawn.
 */
interface GhostRecord {
  defId: string;
  player: PlayerId;
  tileX: number;
  tileY: number;
  wx: number;
  wy: number;
  age: string;
  /** Construction stage when last seen (1000 = complete). */
  buildProgress: number;
  /** Farms only: distinguishes the mature field from the exhausted plot. */
  amountLeft: number;
  /** Wall runs on the tile-Y axis mirror the authored NW->SE sheet. */
  mirrored: boolean;
  /** L-corner join when last seen; the live neighbours may be gone by now. */
  corner: WallCornerJoin | undefined;
}

interface GhostView extends CornerJoinTarget {
  root: Container;
  /** Frame/scale inputs the sprite was last built from; '' before the first draw. */
  key: string;
}

export interface PickResult {
  entity: Entity;
  dist: number;
}

export class WorldLayer {
  readonly container = new Container();
  /** Player-authored rally destinations render above fog like order arrows. */
  readonly rallyOverlay = new Container();
  selection = new Set<EntityId>();

  /** Faint ground circles for the selected military units' true auto-acquire radius. */
  private aggroLayer = new Container();
  private aggroViews = new Map<EntityId, { graphic: Graphics; range: number }>();
  private views = new Map<EntityId, EntityView>();
  private ghostViews = new Map<EntityId, GhostView>();
  private ghosts = new Map<EntityId, GhostRecord>();
  /** Rally flag markers for selected own production buildings (GDD: rally shown as a flag). */
  private rallyFlags = new Graphics();
  private lastRallyFlagKey = '';
  private prevPos = new Map<EntityId, { x: number; y: number }>();
  private curPos = new Map<EntityId, { x: number; y: number }>();
  private mirroredWalls = new Set<EntityId>();
  private wallCorners = new Map<EntityId, WallCornerJoin>();
  /** Gates with an own/allied unit close enough to trigger the visual opening. */
  private openGates = new Set<EntityId>();
  private frameCounts = new Map<string, number>();
  /** entityId -> tick until which the damage-taken red blink lasts. */
  private damagedUntil = new Map<EntityId, number>();
  /** Resource/target ids highlighted because selected villagers gather them. */
  private workTargets = new Set<EntityId>();
  // Scratch buffers for the occluder-fade broad phase, reused every frame so the
  // pass allocates nothing per entity.
  private fadeUnitRects: WorldRect[] = [];
  private fadeUnitDepths: number[] = [];
  private fadeBuckets = new Map<number, number[]>();
  private fadeTested: number[] = [];
  private fadePass = 0;
  private fadeOccluderRect: WorldRect = { left: 0, right: 0, top: 0, bottom: 0 };
  /** Sim tick the resource memory was last refreshed for (-1 = never). */
  private resourceMemoryTick = -1;
  private readonly seenScratch = new Set<EntityId>();
  /** Views of the units drawn this frame — the fade pass reads nothing else. */
  private readonly visibleUnitsScratch: EntityView[] = [];
  private readonly posScratch = { x: 0, y: 0 };

  constructor(
    private assets: GameAssets,
    private humanPlayer: PlayerId,
    private getUnitLos: (defId: string) => number = (defId) => gameData.units[defId]?.los ?? 0,
    private resourceMemory: PlayerResourceMemory = new PlayerResourceMemory(humanPlayer),
  ) {
    this.container.sortableChildren = true;
    this.aggroLayer.zIndex = -1e9; // below every entity, above terrain
    this.rallyOverlay.addChild(this.rallyFlags);
    this.container.addChild(this.aggroLayer);
  }

  /** Snapshot positions at each tick boundary (for interpolation). */
  onTick(state: GameState): void {
    // Ping-pong the two position maps and refill the recycled one in place.
    // Building a fresh Map plus a point object per entity every tick allocated
    // thousands of short-lived objects a second on a populated map, for values
    // that are simply overwritten.
    const recycled = this.prevPos;
    this.prevPos = this.curPos;
    this.curPos = recycled;
    const cur = this.curPos;
    for (const id of cur.keys()) {
      if (!state.entities.has(id)) cur.delete(id);
    }
    for (const e of state.entities.values()) {
      const point = cur.get(e.id);
      // The maps never share point objects, so overwriting `cur` cannot disturb
      // the previous tick's positions that interpolation reads from `prevPos`.
      if (point) { point.x = e.x; point.y = e.y; } else cur.set(e.id, { x: e.x, y: e.y });
    }
    this.mirroredWalls = mirroredWallIds(state.entities.values());
    this.wallCorners = wallCornerJoins(state.entities.values());
  }

  onSimEvents(events: SimEvent[], tick: number): void {
    for (const ev of events) {
      if (ev.kind === 'attackImpact') {
        // damage-taken red blink (~4 ticks); the impact flash itself is fx.ts
        this.damagedUntil.set(ev.targetId, tick + 4);
      }
    }
  }

  /** Main per-frame update. tickFloat = state.tick + alpha. */
  update(
    state: GameState,
    alpha: number,
    tickFloat: number,
    worldView?: { x0: number; y0: number; x1: number; y1: number },
  ): void {
    this.syncResourceMemory(state);
    const vis = state.players[this.humanPlayer]?.visibility ?? null;
    const seen = this.seenScratch;
    seen.clear();
    this.refreshWorkTargets(state);
    this.refreshOpenGates(state);
    const visibleUnits = this.visibleUnitsScratch;
    visibleUnits.length = 0;

    for (const e of state.entities.values()) {
      seen.add(e.id);
      const tileVis = this.tileVis(vis, state, e.tileX, e.tileY);

      // remembered-building bookkeeping
      if (e.kind === 'building' && tileVis === 2) {
        this.rememberBuilding(state, e);
      }

      const displayed = this.resourceMemory.entityFor(state, e);
      const visible = displayed !== null && (
        displayed.player === this.humanPlayer
        || (displayed.kind === 'resource' ? true : tileVis === 2)
      );

      let view = this.views.get(e.id);
      if (!visible || this.offCamera(displayed, alpha, worldView)) {
        if (view) view.root.visible = false;
        continue;
      }
      if (!view) {
        view = this.createView();
        this.views.set(e.id, view);
      }
      view.root.visible = true;
      this.updateView(state, displayed!, view, alpha, tickFloat);
      if (displayed!.kind === 'unit' && displayed!.hp > 0 && displayed!.activity !== 'dying'
        && displayed!.garrisonedIn === undefined) visibleUnits.push(view);
    }

    for (const remembered of this.resourceMemory.hiddenMissing(state)) {
      seen.add(remembered.id);
      let view = this.views.get(remembered.id);
      if (this.offCamera(remembered, alpha, worldView)) {
        if (view) view.root.visible = false;
        continue;
      }
      if (!view) {
        view = this.createView();
        this.views.set(remembered.id, view);
      }
      view.root.visible = true;
      this.updateView(state, remembered, view, alpha, tickFloat);
    }

    this.fadeUnitOccluders(state, visibleUnits);

    // stale views
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        view.root.destroy({ children: true });
        this.views.delete(id);
        this.selection.delete(id);
      }
    }
    this.prunePositions(seen);
    this.updateAggroRanges(state, alpha);
    this.updateGhosts(state, vis, seen);
    this.updateRallyFlags(state);
  }

  /** Keep class-based aggro indicators attached to selected, auto-acquiring troops. */
  private updateAggroRanges(state: GameState, alpha: number): void {
    const active = new Set<EntityId>();
    for (const id of this.selection) {
      const e = state.entities.get(id);
      if (!e || e.kind !== 'unit' || e.player !== this.humanPlayer || e.hp <= 0
        || e.garrisonedIn !== undefined) continue;
      const def = gameData.units[e.defId];
      if (!def || def.attacks.length === 0 || def.gather || def.heals || def.converts
        || def.garrisonCapacity !== undefined || def.pack !== undefined) continue;

      active.add(id);
      const range = unitAggroRange(def, this.getUnitLos(def.id));
      let view = this.aggroViews.get(id);
      if (!view || view.range !== range) {
        view?.graphic.destroy();
        const graphic = new Graphics();
        // A tile-space circle projects to an axis-aligned ellipse in isometric world space.
        const rx = range * HALF_W * Math.SQRT2;
        const ry = range * HALF_H * Math.SQRT2;
        graphic.ellipse(0, 0, rx, ry)
          .fill({ color: AGGRO_COLOR, alpha: AGGRO_FILL_ALPHA })
          .stroke({ width: 1, color: AGGRO_COLOR, alpha: AGGRO_LINE_ALPHA });
        this.aggroLayer.addChild(graphic);
        view = { graphic, range };
        this.aggroViews.set(id, view);
      }
      const pos = this.entityWorldPos(e, alpha);
      view.graphic.position.set(pos.x, pos.y);
    }

    for (const [id, view] of this.aggroViews) {
      if (active.has(id)) continue;
      view.graphic.destroy();
      this.aggroViews.delete(id);
    }
  }

  /**
   * Rally flag markers for selected own production buildings. Even a building
   * without a custom rally shows its default spawn-side flag, so selecting a
   * Barracks always explains where its next soldier will go. Target rallies
   * (berries, an enemy) track the target's live position.
   */
  private updateRallyFlags(state: GameState): void {
    const spots: Array<{ x: number; y: number }> = [];
    for (const id of this.selection) {
      const e = state.entities.get(id);
      const def = e?.kind === 'building' ? gameData.buildings[e.defId] : undefined;
      if (!e || e.player !== this.humanPlayer || e.kind !== 'building'
        || (e.buildProgress ?? 1000) < 1000 || (def?.trains?.length ?? 0) === 0) continue;
      const p = rallyFlagWorldPoint(state, e);
      if (!p) continue;
      spots.push({ x: Math.round(p.x), y: Math.round(p.y) });
    }
    const key = spots.map((s) => `${s.x},${s.y}`).join('|');
    if (key === this.lastRallyFlagKey) return;
    this.lastRallyFlagKey = key;
    this.rallyFlags.clear();
    for (const s of spots) {
      // A large gold destination marker, deliberately unlike the small
      // player-color ownership banner attached to production buildings.
      this.rallyFlags
        .ellipse(s.x, s.y, 14, 7)
        .fill({ color: AMBER_HIGHLIGHT, alpha: 0.16 })
        .stroke({ width: 2, color: OUTLINE });
      this.rallyFlags.ellipse(s.x, s.y, 11, 5).stroke({ width: 1.5, color: AMBER_HIGHLIGHT });
      this.rallyFlags.moveTo(s.x, s.y).lineTo(s.x, s.y - 32).stroke({ width: 3, color: OUTLINE });
      this.rallyFlags.moveTo(s.x, s.y).lineTo(s.x, s.y - 32).stroke({ width: 1, color: AMBER_HIGHLIGHT });
      this.rallyFlags
        .poly([s.x, s.y - 32, s.x + 22, s.y - 27, s.x, s.y - 20])
        .fill(AMBER_HIGHLIGHT)
        .stroke({ width: 1.5, color: OUTLINE });
    }
  }

  /** Targets of the currently selected villagers (GDD: gather target highlights). */
  private refreshWorkTargets(state: GameState): void {
    this.workTargets.clear();
    for (const id of this.selection) {
      const e = state.entities.get(id);
      if (!e || e.kind !== 'unit' || e.player !== this.humanPlayer || e.defId !== 'villager') continue;
      const target = villagerWorkTarget(e);
      if (target !== undefined) this.workTargets.add(target);
    }
  }

  /** Own/allied proximity drives presentation only; the sim enforces gate access. */
  private refreshOpenGates(state: GameState): void {
    this.openGates.clear();
    const gates = [...state.entities.values()].filter((e) =>
      e.kind === 'building' && e.defId === 'gate' && e.hp > 0
      && (e.buildProgress ?? 1000) >= 1000);
    if (gates.length === 0) return;
    for (const unit of state.entities.values()) {
      if (unit.kind !== 'unit' || unit.hp <= 0 || unit.garrisonedIn !== undefined) continue;
      const unitTeam = state.players[unit.player]?.setup.team ?? 0;
      for (const gate of gates) {
        const gateTeam = state.players[gate.player]?.setup.team ?? 0;
        const friendly = unit.player === gate.player || (unitTeam > 0 && unitTeam === gateTeam);
        if (!friendly) continue;
        if (Math.max(Math.abs(unit.x - gate.x), Math.abs(unit.y - gate.y)) <= GATE_OPEN_RADIUS_FP) {
          this.openGates.add(gate.id);
        }
      }
    }
  }

  /** Interpolated world position of an entity. */
  entityWorldPos(e: Entity, alpha: number): { x: number; y: number } {
    const p = this.readWorldPos(e, alpha);
    return { x: p.x, y: p.y };
  }

  /**
   * entityWorldPos into a shared scratch object. Called for every entity every
   * frame, so the result must NOT be retained across calls — copy what you need.
   *
   * The isometric projection is inlined rather than delegated to tileToWorld
   * because that helper returns a fresh Vec2, which would reintroduce exactly the
   * per-entity allocation the scratch object exists to avoid. It must stay in step
   * with tileToWorld; camera.test.ts pins that projection.
   */
  private readWorldPos(e: Entity, alpha: number): { x: number; y: number } {
    const prev = this.prevPos.get(e.id);
    const cur = this.curPos.get(e.id);
    const curX = cur ? cur.x : e.x;
    const curY = cur ? cur.y : e.y;
    const fx = prev ? prev.x + (curX - prev.x) * alpha : curX;
    const fy = prev ? prev.y + (curY - prev.y) * alpha : curY;
    const tx = fx / FP, ty = fy / FP;
    this.posScratch.x = (tx - ty) * HALF_W;
    this.posScratch.y = (tx + ty) * HALF_H;
    return this.posScratch;
  }

  /**
   * Off-screen entities keep their state but skip the whole per-frame view
   * refresh. A walked-over map holds thousands of trees while only a screenful
   * is ever on camera, and updating the rest cost more than everything the
   * player can actually see. Omitting `worldView` disables culling entirely
   * (tests and any caller without a camera).
   */
  private offCamera(
    e: Entity | null,
    alpha: number,
    worldView?: { x0: number; y0: number; x1: number; y1: number },
  ): boolean {
    if (!worldView || !e) return false;
    const p = this.readWorldPos(e, alpha);
    return p.x < worldView.x0 - CULL_PAD_SIDE || p.x > worldView.x1 + CULL_PAD_SIDE
      || p.y < worldView.y0 - CULL_PAD_ABOVE || p.y > worldView.y1 + CULL_PAD_BELOW;
  }

  /**
   * Hit-test entities near a world point (slop in world px). Returns candidates
   * sorted by distance; the input layer applies GDD snap priority.
   */
  pickAt(state: GameState, wx: number, wy: number, slop: number): PickResult[] {
    this.syncResourceMemory(state);
    const vis = state.players[this.humanPlayer]?.visibility ?? null;
    const results: PickResult[] = [];
    for (const e of state.entities.values()) {
      const tv = this.tileVis(vis, state, e.tileX, e.tileY);
      const displayed = this.resourceMemory.entityFor(state, e);
      const visible = displayed !== null
        && (displayed.player === this.humanPlayer || displayed.kind === 'resource' || tv === 2);
      // Garrisoned units sit at their host building's anchor but are not drawn —
      // they must never steal a tap aimed at the building itself.
      if (!visible || displayed!.activity === 'dying' || displayed!.garrisonedIn !== undefined) continue;
      const d = entityPickDistance(displayed!, wx, wy);
      if (d <= slop) results.push({ entity: displayed!, dist: d });
    }
    for (const remembered of this.resourceMemory.hiddenMissing(state)) {
      const d = entityPickDistance(remembered, wx, wy);
      if (d <= slop) results.push({ entity: remembered, dist: d });
    }
    results.sort((a, b) => a.dist - b.dist);
    return results;
  }

  /** Own live units whose feet fall inside a world-space rect (band select). */
  unitsInWorldRect(state: GameState, x0: number, y0: number, x1: number, y1: number, player: PlayerId): Entity[] {
    const lo = { x: Math.min(x0, x1), y: Math.min(y0, y1) };
    const hi = { x: Math.max(x0, x1), y: Math.max(y0, y1) };
    const out: Entity[] = [];
    for (const e of state.entities.values()) {
      if (e.kind !== 'unit' || e.player !== player || e.activity === 'dying' || e.garrisonedIn !== undefined) continue;
      const p = tileToWorld(e.x / FP, e.y / FP);
      if (p.x >= lo.x && p.x <= hi.x && p.y >= lo.y && p.y <= hi.y) out.push(e);
    }
    return out;
  }

  /** Own units of one type within a world-space rect (double-tap select-all-on-screen). */
  unitsOfTypeInRect(state: GameState, defId: string, x0: number, y0: number, x1: number, y1: number, player: PlayerId): Entity[] {
    return this.unitsInWorldRect(state, x0, y0, x1, y1, player).filter((e) => e.defId === defId);
  }

  /** Own buildings of one type whose center falls in a world-space rect (double-tap expand-to-type). */
  buildingsOfTypeInRect(state: GameState, defId: string, x0: number, y0: number, x1: number, y1: number, player: PlayerId): Entity[] {
    const lo = { x: Math.min(x0, x1), y: Math.min(y0, y1) };
    const hi = { x: Math.max(x0, x1), y: Math.max(y0, y1) };
    const out: Entity[] = [];
    for (const e of state.entities.values()) {
      if (e.kind !== 'building' || e.player !== player || e.defId !== defId || e.activity === 'dying') continue;
      const p = tileToWorld(e.x / FP, e.y / FP);
      if (p.x >= lo.x && p.x <= hi.x && p.y >= lo.y && p.y <= hi.y) out.push(e);
    }
    return out;
  }

  // ------------------------------------------------------------------ internals

  /**
   * Resource memory only ever changes when the sim advances: both of its inputs
   * (the entity table and the player's visibility grid) are written during a tick.
   * Rescanning every entity three times per tick at 60fps — and again on every tap
   * through pickAt — was the single most expensive thing in the frame, so run it
   * once per tick and reuse the result.
   */
  private syncResourceMemory(state: GameState): void {
    if (state.tick === this.resourceMemoryTick) return;
    this.resourceMemoryTick = state.tick;
    this.resourceMemory.refresh(state);
  }

  private tileVis(vis: Uint8Array | null, state: GameState, tx: number, ty: number): number {
    return tileVisibility(vis, state.map, tx, ty);
  }

  private createView(): EntityView {
    const root = new Container();
    const ring = new Graphics();
    const gateDoor = new Sprite();
    const cornerSprite = new Sprite();
    const sprite = new Sprite();
    const cornerPrimaryMask = new Graphics();
    const cornerSecondaryMask = new Graphics();
    const hpBar = new Graphics();
    gateDoor.visible = false;
    cornerSprite.visible = false;
    root.addChild(
      ring, gateDoor, cornerSprite, sprite, hpBar,
      cornerPrimaryMask, cornerSecondaryMask,
    );
    this.container.addChild(root);
    return {
      root, ring, cornerSprite, cornerPrimaryMask, cornerSecondaryMask,
      sprite, gateDoor, gateOpenProgress: 0, gateLastTickFloat: 0, hpBar,
      lastFrameKey: '', lastAnim: '', animStartTick: 0, lastHpKey: '', lastRingKey: '', spriteTopPx: 0,
      renderFacing: 0,
      carry: null, lastCarryKey: '', badge: null, badgeText: null, lastBadgeKey: '',
    };
  }

  /**
   * Keep concealed units readable without making the map permanently ghostly.
   * Only the artwork that actually overlaps a visible, living unit is faded;
   * rings, health bars, carry icons, and ownership badges remain fully opaque.
   */
  private fadeUnitOccluders(
    state: GameState,
    visibleUnits: EntityView[],
  ): void {
    if (visibleUnits.length === 0) return;

    // Broad phase. The naive form tested every occluder against every unit and
    // rebuilt each unit's rect inside that inner loop, so cost grew with
    // occluders x army size (measurably ~3ms/frame at 23 units on a 120x120 map,
    // and still climbing). Each unit rect is now built once and filed into a
    // coarse world-space grid, so an occluder only ever tests the handful of
    // units standing near it. The fade decision itself is unchanged.
    const rects = this.fadeUnitRects;
    const depths = this.fadeUnitDepths;
    const buckets = this.fadeBuckets;
    for (const cell of buckets.values()) cell.length = 0;
    for (let i = 0; i < visibleUnits.length; i++) {
      const unitView = visibleUnits[i];
      const rect = rects[i] ?? (rects[i] = { left: 0, right: 0, top: 0, bottom: 0 });
      writeUnitWorldRect(unitView, rect);
      depths[i] = unitView.root.zIndex;
      const cx0 = Math.floor(rect.left / FADE_CELL), cx1 = Math.floor(rect.right / FADE_CELL);
      const cy0 = Math.floor(rect.top / FADE_CELL), cy1 = Math.floor(rect.bottom / FADE_CELL);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const key = cy * FADE_BUCKET_STRIDE + cx;
          let cell = buckets.get(key);
          if (!cell) { cell = []; buckets.set(key, cell); }
          cell.push(i);
        }
      }
    }

    const occluderBounds = this.fadeOccluderRect;
    const tested = this.fadeTested;
    let pass = this.fadePass;
    for (const e of state.entities.values()) {
      if ((e.kind !== 'building' && e.kind !== 'resource') || e.hp <= 0) continue;
      const view = this.views.get(e.id);
      if (!view?.root.visible || !view.sprite.visible) continue;
      // Flat artwork does not conceal a unit and should not pulse as feet cross it.
      if (isFlatArtwork(e.defId, buildingProgressOf(e))) continue;
      writeSpriteWorldRect(view, occluderBounds);
      const depth = view.root.zIndex;
      pass++;
      let covered = false;
      const cx0 = Math.floor(occluderBounds.left / FADE_CELL);
      const cx1 = Math.floor(occluderBounds.right / FADE_CELL);
      const cy0 = Math.floor(occluderBounds.top / FADE_CELL);
      const cy1 = Math.floor(occluderBounds.bottom / FADE_CELL);
      scan: for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const cell = buckets.get(cy * FADE_BUCKET_STRIDE + cx);
          if (cell === undefined) continue;
          for (let k = 0; k < cell.length; k++) {
            const i = cell[k];
            // A unit spanning several cells appears in each of them; the stamp
            // keeps it to one rect test per occluder.
            if (tested[i] === pass) continue;
            tested[i] = pass;
            if (shouldFadeForUnit(occluderBounds, depth, rects[i], depths[i])) {
              covered = true;
              break scan;
            }
          }
        }
      }
      if (!covered) continue;
      view.sprite.alpha *= OCCLUDER_ALPHA;
      view.cornerSprite.alpha *= OCCLUDER_ALPHA;
      view.gateDoor.alpha *= OCCLUDER_ALPHA;
    }
    this.fadePass = pass;
  }

  private updateView(state: GameState, e: Entity, view: EntityView, alpha: number, tickFloat: number): void {
    const pos = this.readWorldPos(e, alpha);
    view.root.position.set(Math.round(pos.x), Math.round(pos.y));
    view.root.zIndex = entitySortDepth(e.defId, pos.y, buildingProgressOf(e));

    const prev = this.prevPos.get(e.id);
    const cur = this.curPos.get(e.id);
    if ((e.activity === 'moving' || e.activity === 'carrying' || e.activity === 'fleeing') && prev && cur) {
      // On a view's first render prev/cur may be identical (for example when a
      // resumed unit is already walking). Fall back to the sim facing instead
      // of flashing the view's default south-facing pose for one frame.
      const fallback = view.lastFrameKey === '' ? e.facing : view.renderFacing;
      view.renderFacing = facingFromDelta(cur.x - prev.x, cur.y - prev.y, fallback);
    } else {
      view.renderFacing = e.facing;
    }

    // Gaia entities use the neutral swap: some (sheep) carry a real mask band that
    // must never render raw magenta. Atlases without masks serve the plain frame.
    const colorIdx = e.player === GAIA ? GAIA_NEUTRAL_COLOR : state.players[e.player]?.setup.color;
    const frameChoice = this.frameNameFor(state, e, tickFloat, view);
    const gateOperational = e.kind === 'building' && e.defId === 'gate' && e.hp > 0
      && (e.buildProgress ?? 1000) >= 1000;
    const candidates = gateOperational
      ? ['bld/gate/open', ...frameChoice.candidates]
      : frameChoice.candidates;
    const sprAlpha = frameChoice.alpha;
    // Conversions can change ownership without changing the animation frame.
    // Include the player ramp in the cache key so the sprite cannot retain its
    // former owner's palette until its next animation/facing transition.
    const mirrorWall = this.mirroredWalls.has(e.id);
    const corner = e.defId === 'stoneWall' ? this.wallCorners.get(e.id) : undefined;
    const joinKey = corner ? `corner:${corner.xDir},${corner.yDir}|` : mirrorWall ? 'wall-y|' : '';
    const key = `${colorIdx ?? 'none'}|${joinKey}${candidates.join('|')}`;
    if (key !== view.lastFrameKey) {
      const { frame, name: resolvedName } = this.assets.resolveFirst(candidates, colorIdx);
      view.sprite.texture = frame.texture;
      view.sprite.anchor.set(frame.anchorX, frame.anchorY);
      const scale = buildingSpriteScale(e.defId, frame.renderScale, frame.mirrored !== mirrorWall);
      view.sprite.scale.set(scale.x, scale.y);

      applyWallCornerJoin(view, corner, frame);

      const doorFrame = gateOperational && resolvedName === 'bld/gate/open'
        ? this.assets.tryResolve('bld/gate/door', colorIdx)
        : null;
      if (doorFrame) {
        view.gateDoor.texture = doorFrame.texture;
        view.gateDoor.anchor.set(doorFrame.anchorX, doorFrame.anchorY);
        const doorScale = buildingSpriteScale(
          e.defId, doorFrame.renderScale, doorFrame.mirrored !== mirrorWall,
        );
        view.gateDoor.scale.set(doorScale.x, doorScale.y);
        view.gateDoor.visible = true;
      } else {
        view.gateDoor.visible = false;
        view.gateOpenProgress = 0;
        view.gateLastTickFloat = tickFloat;
      }
      // Trimmed visible top (frames carry transparent headroom): overlays like
      // the health bar must anchor to pixels, not the texture rect.
      view.spriteTopPx = Math.round(
        (this.assets.contentTopPx(resolvedName) - frame.anchorY * frame.texture.height) * scale.y,
      );
      view.lastFrameKey = key;
    }
    const gateOpen = e.defId === 'gate' && this.openGates.has(e.id);
    if (view.gateDoor.visible) {
      const elapsed = view.gateLastTickFloat === 0
        ? 0
        : Math.max(0, Math.min(TICKS_PER_SECOND, tickFloat - view.gateLastTickFloat));
      view.gateOpenProgress = advanceGateOpenProgress(view.gateOpenProgress, gateOpen, elapsed);
      view.gateLastTickFloat = tickFloat;
      // Lift the leaf behind the permanent stone arch; the gatehouse itself is
      // never scaled or faded, so the opening remains architectural and legible.
      view.gateDoor.position.y = -view.gateDoor.texture.height
        * Math.abs(view.gateDoor.scale.y) * 0.24 * view.gateOpenProgress;
    }
    view.sprite.alpha = sprAlpha;
    view.cornerSprite.alpha = sprAlpha;
    view.gateDoor.alpha = sprAlpha;
    // damage-taken red blink (attackImpact recorded in onSimEvents)
    const tint = (this.damagedUntil.get(e.id) ?? 0) > tickFloat ? 0xff8070 : 0xffffff;
    view.sprite.tint = tint;
    view.cornerSprite.tint = tint;
    view.gateDoor.tint = tint;

    this.drawRing(e, view);
    this.drawHpBar(e, view);
    this.updateCarryIcon(e, view);
    this.updateGarrisonBadge(e, view);
  }

  /** Small resource icon over a laden villager (entity.carrying). */
  private updateCarryIcon(e: Entity, view: EntityView): void {
    const key = e.kind === 'unit' && e.carrying && e.activity !== 'dying' ? e.carrying.type : '';
    if (key !== view.lastCarryKey) {
      view.lastCarryKey = key;
      if (!key) {
        if (view.carry) view.carry.visible = false;
      } else {
        const frame = this.assets.tryResolve(`icon/res/${key}`);
        if (frame) {
          if (!view.carry) {
            view.carry = new Sprite();
            view.carry.anchor.set(0.5);
            view.root.addChild(view.carry);
          }
          view.carry.texture = frame.texture;
          const h = frame.texture.height || 1;
          view.carry.scale.set(12 / h);
          view.carry.visible = true;
        }
      }
    }
    if (view.carry?.visible) view.carry.position.set(9, Math.min(view.spriteTopPx, -18) - 4);
  }

  /** Garrison flag + occupant-count badge over occupied hosts — buildings AND
   *  rams (unit hosts, sim garrison.ts): a loaded ram must show its contents. */
  private updateGarrisonBadge(e: Entity, view: EntityView): void {
    const count = e.garrison?.length ?? 0;
    const key = count > 0 ? String(count) : '';
    if (key !== view.lastBadgeKey) {
      view.lastBadgeKey = key;
      if (!key) {
        if (view.badge) view.badge.visible = false;
      } else {
        if (!view.badge) {
          const badge = new Container();
          const flag = new Graphics();
          flag.moveTo(0, 0).lineTo(0, -14).stroke({ width: 1.5, color: OUTLINE });
          flag.poly([0, -14, 10, -11, 0, -8]).fill(0xe6c04a).stroke({ width: 1, color: OUTLINE });
          const text = new Text({
            text: '',
            style: {
              fontFamily: 'Alegreya Sans, Trebuchet MS, sans-serif', fontSize: 11,
              fill: 0xefddb5, stroke: { color: 0x1a1208, width: 2 },
            },
          });
          text.anchor.set(0, 0.5);
          text.position.set(2, 3);
          badge.addChild(flag, text);
          view.badge = badge;
          view.badgeText = text;
          view.root.addChild(badge);
        }
        view.badgeText!.text = key;
        view.badge.visible = true;
      }
    }
    if (view.badge?.visible) view.badge.position.set(-4, view.spriteTopPx - 4);
  }

  private frameNameFor(state: GameState, e: Entity, tickFloat: number, view: EntityView): { candidates: string[]; alpha: number } {
    if (e.kind === 'resource') {
      return { candidates: [resourceFrameName(e, state.map)], alpha: 1 };
    }
    if (e.kind === 'building') {
      return buildingFrame(state, e);
    }
    // unit (incl. gaia animals under obj/; heroes render via their `sprite` rig alias)
    const { spriteId, prefix } = unitRig(e.defId);
    const workTargetId = e.intent?.kind === 'gather' ? e.intent.targetId : e.targetId;
    const workTarget = workTargetId === undefined ? undefined : state.entities.get(workTargetId);
    const anim = e.defId === 'villager'
      ? villagerWorkAnim(e.activity, workTarget?.defId)
      : animForActivity(e.activity, false);
    if (anim !== view.lastAnim) {
      view.lastAnim = anim;
      view.animStartTick = tickFloat;
    }
    const countKey = `${prefix}/${spriteId}/${anim}/0`;
    let count = this.frameCounts.get(countKey);
    if (count === undefined) {
      count = this.assets.frameCount(countKey);
      this.frameCounts.set(countKey, count);
    }
    if (count === 0) {
      // fall back to idle, then to a warning placeholder via resolveFrame
      const idleKey = `${prefix}/${spriteId}/idle/0`;
      let idleCount = this.frameCounts.get(idleKey);
      if (idleCount === undefined) {
        idleCount = this.assets.frameCount(idleKey);
        this.frameCounts.set(idleKey, idleCount);
      }
      if (idleCount > 0) {
        return { candidates: [`${prefix}/${spriteId}/idle/${view.renderFacing}/0`], alpha: 1 };
      }
      return { candidates: [`${prefix}/${spriteId}/${anim}/${view.renderFacing}/0`], alpha: 1 };
    }
    const ageSec = (tickFloat - view.animStartTick) / TICKS_PER_SECOND;
    const frame = animFrameIndex(anim, ageSec, count);
    return { candidates: [`${prefix}/${spriteId}/${anim}/${view.renderFacing}/${frame}`], alpha: 1 };
  }

  private drawRing(e: Entity, view: EntityView): void {
    const selected = this.selection.has(e.id);
    // worksite highlight: amber ring on whatever the selected villagers work —
    // a resource being gathered, or a foundation being built or repaired
    const highlighted = !selected && this.workTargets.has(e.id);
    const key = selected ? `1:${e.kind}:${e.defId}` : highlighted ? `h:${e.kind}:${e.defId}` : '';
    if (key === view.lastRingKey) return;
    view.lastRingKey = key;
    view.ring.clear();
    if (!selected && !highlighted) return;
    const color = selected ? HIGHLIGHT : AMBER_HIGHLIGHT;
    if (e.kind === 'building') {
      const size = gameData.buildings[e.defId]?.size ?? 1;
      const hw = size * HALF_W;
      const hh = size * HALF_H;
      view.ring
        .moveTo(0, -hh).lineTo(hw, 0).lineTo(0, hh).lineTo(-hw, 0).closePath()
        .stroke({ width: 1.5, color });
    } else {
      const resourceRadius: readonly [number, number] | undefined = e.kind === 'resource'
        ? e.defId === 'tree'
          ? [14, 7]
          : e.defId === 'berryBush'
            ? [15, 7]
            : e.defId === 'goldMine' || e.defId === 'stoneMine'
              ? [18, 9]
              : [12, 6]
        : undefined;
      const cav = (gameData.units[e.defId]?.speed ?? 0) > 1.1;
      const [rx, ry] = resourceRadius ?? (cav ? [14, 7] : [10, 5]);
      view.ring.ellipse(0, 1, rx, ry + 1).stroke({ width: 1, color: OUTLINE });
      view.ring.ellipse(0, 0, rx, ry).stroke({ width: 1, color });
    }
  }

  private drawHpBar(e: Entity, view: EntityView): void {
    const selected = this.selection.has(e.id);
    const damaged = e.hp < e.maxHp;
    const researchFrac = ownedResearchProgress(e, this.humanPlayer);
    // Active research is strategic owner-only information and must stay visible
    // even when the building is deselected. Keep its HP bar immediately above it
    // so the two values cannot be mistaken for one another.
    const showHp = e.activity !== 'dying' && e.kind !== 'resource'
      && (researchFrac !== null || (getSettings().showHpBars && (selected || damaged)));
    const frac = Math.max(0, Math.min(1, e.hp / Math.max(1, e.maxHp)));
    // Buildings anchor the bar to the sprite's trimmed visible top (roof/flag
    // apex) + a small gap — footprint math floated it over open grass because
    // tall frames carry transparent headroom. Integer px; part of the key so
    // the bar follows construct-stage frame changes.
    const isB = e.kind === 'building';
    const yOff = isB ? buildingHpBarY(view.spriteTopPx) : -34;
    const key = showHp
      ? `${frac.toFixed(2)}:${researchFrac?.toFixed(3) ?? ''}:${e.kind}:${e.defId}:${yOff}`
      : '';
    if (key === view.lastHpKey) return;
    view.lastHpKey = key;
    view.hpBar.clear();
    if (!showHp) return;
    const size = isB ? gameData.buildings[e.defId]?.size ?? 1 : 0;
    const w = isB ? buildingHpBarWidth(size) : 26;
    const color = frac > 0.5 ? HP_GREEN : frac > 0.25 ? HP_YELLOW : HP_RED;
    view.hpBar.rect(-w / 2 - 1, yOff - 1, w + 2, 6).fill(OUTLINE);
    view.hpBar.rect(-w / 2, yOff, w, 4).fill(HP_BG);
    if (frac > 0) view.hpBar.rect(-w / 2, yOff, Math.max(1, Math.round(w * frac)), 4).fill(color);
    if (researchFrac !== null) {
      const researchY = yOff + 7;
      view.hpBar.rect(-w / 2 - 1, researchY - 1, w + 2, 6).fill(OUTLINE);
      view.hpBar.rect(-w / 2, researchY, w, 4).fill(HP_BG);
      if (researchFrac > 0) {
        view.hpBar.rect(
          -w / 2, researchY, Math.max(1, Math.round(w * researchFrac)), 4,
        ).fill(RESEARCH_BLUE);
      }
    }
  }

  private rememberBuilding(state: GameState, e: Entity): void {
    const pos = tileToWorld(e.x / FP, e.y / FP);
    this.ghosts.set(e.id, {
      defId: e.defId,
      player: e.player,
      tileX: e.tileX,
      tileY: e.tileY,
      wx: pos.x,
      wy: pos.y,
      age: state.players[e.player]?.age ?? 'dark',
      buildProgress: e.buildProgress ?? 1000,
      amountLeft: e.amountLeft ?? 1,
      mirrored: this.mirroredWalls.has(e.id),
      corner: e.defId === 'stoneWall' ? this.wallCorners.get(e.id) : undefined,
    });
  }

  private updateGhosts(state: GameState, vis: Uint8Array | null, liveIds: Set<EntityId>): void {
    for (const [id, g] of this.ghosts) {
      const tv = this.tileVis(vis, state, g.tileX, g.tileY);
      if (tv === 2) {
        const view = this.ghostViews.get(id);
        if (!liveIds.has(id)) {
          // We can see the spot and the building is gone: forget it.
          this.ghosts.delete(id);
          if (view) {
            view.root.destroy({ children: true });
            this.ghostViews.delete(id);
          }
        } else if (view) {
          view.root.visible = false;
        }
        continue;
      }
      // explored-but-not-visible: show the last-seen ghost
      // own buildings render live anyway (always visible to their owner in our draw rule)
      const wantVisible = tv === 1 && g.player !== this.humanPlayer;
      let view = this.ghostViews.get(id);
      if (!wantVisible) {
        if (view) view.root.visible = false;
        continue;
      }
      if (!view) {
        view = this.createGhostView();
        this.ghostViews.set(id, view);
      }
      // A building upgraded, aged up or completed out of sight must not keep the
      // art (or the scale) it was first drawn with.
      const choice = buildingFrameChoice(g.defId, g.buildProgress, g.age, g.amountLeft);
      const key = ghostFrameKey(g, choice);
      if (key !== view.key) {
        view.key = key;
        this.drawGhost(state, g, choice, view);
      }
      // Placement is deliberately not cached behind the frame key: build progress
      // crosses the flat/upright sort threshold at 250 while the construct0 frame
      // holds to 334, so a foundation re-scouted across that gap would keep a
      // stale depth and stay buried under the ground it stands on.
      this.placeGhost(g, choice, view);
      view.root.visible = true;
    }
  }

  /**
   * Ghosts mirror the live view's corner-join rig (sprite + mirrored twin + two
   * half-masks) so a remembered wall corner joins instead of reading as two
   * separated segments.
   */
  private createGhostView(): GhostView {
    const root = new Container();
    const sprite = new Sprite();
    const cornerSprite = new Sprite();
    const cornerPrimaryMask = new Graphics();
    const cornerSecondaryMask = new Graphics();
    sprite.tint = GHOST_TINT;
    cornerSprite.tint = GHOST_TINT;
    cornerSprite.visible = false;
    root.addChild(cornerSprite, sprite, cornerPrimaryMask, cornerSecondaryMask);
    this.container.addChild(root);
    return { root, sprite, cornerSprite, cornerPrimaryMask, cornerSecondaryMask, key: '' };
  }

  /** Depth, fade and world position for a remembered building. Cheap; runs per frame. */
  private placeGhost(g: GhostRecord, choice: FrameChoice, view: GhostView): void {
    // Fade the rig rather than the sprites: a joined corner owns two of them and
    // both must carry the same fog opacity.
    view.root.alpha = GHOST_ALPHA * choice.alpha;
    view.root.position.set(Math.round(g.wx), Math.round(g.wy));
    view.root.zIndex = entitySortDepth(g.defId, g.wy, g.buildProgress);
  }

  /** Build a ghost sprite through the exact frame + art-scale path live buildings use. */
  private drawGhost(state: GameState, g: GhostRecord, choice: FrameChoice, view: GhostView): void {
    const colorIdx = state.players[g.player]?.setup.color;
    const { frame } = this.assets.resolveFirst(choice.candidates, colorIdx);
    // Fortification art is authored well under one footprint: without the art
    // scale a remembered tower, keep, gate or wall draws at a fraction of the
    // size of the live sprite it stands in for.
    const scale = buildingSpriteScale(g.defId, frame.renderScale, frame.mirrored !== g.mirrored);
    view.sprite.texture = frame.texture;
    view.sprite.anchor.set(frame.anchorX, frame.anchorY);
    view.sprite.scale.set(scale.x, scale.y);
    applyWallCornerJoin(view, g.corner, frame);
  }

  private prunePositions(seen: Set<EntityId>): void {
    for (const id of this.curPos.keys()) {
      if (!seen.has(id)) {
        this.curPos.delete(id);
        this.prevPos.delete(id);
        this.damagedUntil.delete(id);
      }
    }
  }
}

/**
 * Approximate distance from a pointer to an entity's selectable visual body.
 * A building interior stays selectable, but never receives a huge negative score:
 * a directly clicked unit standing on a farm/building must sort ahead of its host plot.
 */
export function entityPickDistance(e: Entity, wx: number, wy: number): number {
  if (e.kind === 'building') {
    const tile = worldToTile(wx, wy);
    const size = gameData.buildings[e.defId]?.size ?? 1;
    const cx = e.x / FP;
    const cy = e.y / FP;
    const cheb = Math.max(Math.abs(tile.x - cx), Math.abs(tile.y - cy)) - size / 2;
    return Math.max(1, cheb * HALF_W); // approx world px outside the footprint
  }
  const p = tileToWorld(e.x / FP, e.y / FP);
  const bodyCy = p.y - (e.kind === 'unit' ? 12 : 8);
  return Math.hypot(wx - p.x, wy - bodyCy) - 12;
}

const TILE_W_SAFE = HALF_W * 2;

/**
 * Building health-bar y offset (root-local): the 6px-tall bar sits a ~5px gap
 * above the sprite's trimmed visible top, at integer pixels. Pure + exported
 * for unit tests.
 */
export function buildingHpBarY(spriteTopPx: number): number {
  return Math.round(spriteTopPx) - 10;
}

/** Compact building bars: exactly half the old near-full-footprint width. */
export function buildingHpBarWidth(footprintSize: number): number {
  return Math.round((footprintSize * TILE_W_SAFE - 8) / 2);
}

/** Owner-only fraction for an actively researching building's world progress bar. */
export function ownedResearchProgress(e: Entity, humanPlayer: PlayerId): number | null {
  if (e.kind !== 'building' || e.player !== humanPlayer || e.hp <= 0 || !e.research
    || e.research.totalTicks <= 0) return null;
  return Math.max(0, Math.min(1, 1 - e.research.ticksLeft / e.research.totalTicks));
}

/** Default rally marker: centered one half-tile beyond the building's south edge. */
export function defaultRallyTilePoint(e: Entity): [number, number] {
  const size = e.kind === 'building' ? gameData.buildings[e.defId]?.size ?? 1 : 1;
  return [e.tileX + size / 2, e.tileY + size + 0.5];
}

/** Resolve the live world destination represented by a production building's rally flag. */
export function rallyFlagWorldPoint(state: GameState, e: Entity): { x: number; y: number } | null {
  const def = e.kind === 'building' ? gameData.buildings[e.defId] : undefined;
  if (e.kind !== 'building' || (e.buildProgress ?? 1000) < 1000
    || (def?.trains?.length ?? 0) === 0) return null;
  const active = hasActiveRally(e);
  const target = active && e.rally?.targetId !== undefined
    ? state.entities.get(e.rally.targetId) : undefined;
  if (target) return tileToWorld(target.x / FP, target.y / FP);
  if (active && e.rally) return tileToWorld(e.rally.x / FP, e.rally.y / FP);
  const [tileX, tileY] = defaultRallyTilePoint(e);
  return tileToWorld(tileX, tileY);
}

export function resourceFrameName(e: Entity, map?: GameMap): string {
  if (e.stump) return 'obj/stump';
  const h = (Math.imul(e.id, 2654435761) >>> 0);
  switch (e.defId) {
    case 'tree': {
      if (!map || e.tileX < 0 || e.tileY < 0 || e.tileX >= map.width || e.tileY >= map.height) {
        return `obj/tree/${h % 3}`;
      }
      const terrain = map.terrainIds[map.terrain[e.tileY * map.width + e.tileX]];
      if (terrain === 'snow') return 'obj/tree/1'; // conifer forest
      if (terrain === 'sand' || terrain === 'dirt') return 'obj/tree/2'; // pale/dry woodland
      // Coarse spatial hash: nearby trees read as a forest type, while another
      // region of the map naturally gets a visibly different species.
      const regionX = Math.floor(e.tileX / 8);
      const regionY = Math.floor(e.tileY / 8);
      const regionHash = Math.imul(regionX + 17, 73856093) ^ Math.imul(regionY + 31, 19349663);
      return `obj/tree/${(regionHash >>> 0) % 3}`;
    }
    case 'goldMine': return `obj/gold/${h % 2}`;
    case 'stoneMine': return `obj/stone/${h % 2}`;
    case 'berryBush': return 'obj/berries';
    default: return `obj/${e.defId}/0`;
  }
}

/**
 * Identity of everything that decides how a ghost sprite is built. Recomputing
 * the sprite only when this changes keeps the fog layer allocation-free per frame.
 */
function ghostFrameKey(g: GhostRecord, choice: FrameChoice): string {
  const joinKey = g.corner
    ? `corner:${g.corner.xDir},${g.corner.yDir}`
    : g.mirrored ? 'wall-y' : '';
  return `${g.player}|${joinKey}|${choice.alpha}|${choice.candidates.join('|')}`;
}

function buildingFrame(state: GameState, e: Entity): FrameChoice {
  return buildingFrameChoice(
    e.defId,
    e.buildProgress ?? 1000,
    state.players[e.player]?.age ?? 'dark',
    e.amountLeft ?? 1,
  );
}
