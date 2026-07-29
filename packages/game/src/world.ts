// World layer: y-sorted entity sprites with activity/facing/tick-driven
// animation, interpolation between the last two sim ticks, selection rings,
// health bars, building construct states, fog-based hiding with remembered
// building ghosts, and projectile fx.

import { Container, Graphics, Sprite } from 'pixi.js';
import {
  FP, GAIA, TICKS_PER_SECOND,
  type Entity, type EntityId, type GameState, type PlayerId, type SimEvent,
} from '@bf/sim/types';
import { gameData } from '@bf/data';
import type { GameAssets } from './assets';
import { animForActivity, animFrameIndex, type AnimName } from './frames';
import { HALF_H, HALF_W, tileToWorld, worldToTile } from './camera';

const HIGHLIGHT = 0xf4eedd;
const OUTLINE = 0x1a1208;
const HP_GREEN = 0x3e8c34;
const HP_YELLOW = 0xd4a82a;
const HP_RED = 0xb3261e;
const HP_BG = 0x2c1f12;
const GHOST_TINT = 0x9aa4ad;

interface EntityView {
  root: Container;
  ring: Graphics;
  sprite: Sprite;
  hpBar: Graphics;
  lastFrameKey: string;
  lastAnim: AnimName | '';
  animStartTick: number;
  lastHpKey: string;
  lastRingKey: string;
}

interface GhostRecord {
  defId: string;
  player: PlayerId;
  tileX: number;
  tileY: number;
  wx: number;
  wy: number;
  age: string;
}

interface Projectile {
  gfx: Graphics;
  x0: number; y0: number; x1: number; y1: number;
  startTick: number;
  flightTicks: number;
  arc: 'flat' | 'high';
}

export interface PickResult {
  entity: Entity;
  dist: number;
}

const GAIA_ANIMAL = (defId: string): boolean => {
  const def = gameData.units[defId];
  return !!def && def.trainedAt.length === 0;
};

export class WorldLayer {
  readonly container = new Container();
  selection = new Set<EntityId>();

  private views = new Map<EntityId, EntityView>();
  private ghostViews = new Map<EntityId, Sprite>();
  private ghosts = new Map<EntityId, GhostRecord>();
  private prevPos = new Map<EntityId, { x: number; y: number }>();
  private curPos = new Map<EntityId, { x: number; y: number }>();
  private frameCounts = new Map<string, number>();
  private projectiles: Projectile[] = [];
  private projLayer = new Container();

  constructor(
    private assets: GameAssets,
    private humanPlayer: PlayerId,
  ) {
    this.container.sortableChildren = true;
    this.projLayer.zIndex = 1_000_000;
    this.container.addChild(this.projLayer);
  }

  /** Snapshot positions at each tick boundary (for interpolation). */
  onTick(state: GameState): void {
    this.prevPos = this.curPos;
    const next = new Map<EntityId, { x: number; y: number }>();
    for (const e of state.entities.values()) next.set(e.id, { x: e.x, y: e.y });
    this.curPos = next;
  }

  onSimEvents(events: SimEvent[], tick: number): void {
    for (const ev of events) {
      if (ev.kind === 'projectileFired') {
        const a = tileToWorld(ev.x0 / FP, ev.y0 / FP);
        const b = tileToWorld(ev.x1 / FP, ev.y1 / FP);
        const gfx = new Graphics();
        gfx.moveTo(-4, 0).lineTo(4, 0).stroke({ width: 2, color: 0xb08c5c });
        this.projLayer.addChild(gfx);
        this.projectiles.push({
          gfx, x0: a.x, y0: a.y, x1: b.x, y1: b.y,
          startTick: tick, flightTicks: Math.max(1, ev.flightTicks), arc: ev.arc,
        });
      }
    }
  }

  /** Main per-frame update. tickFloat = state.tick + alpha. */
  update(state: GameState, alpha: number, tickFloat: number): void {
    const vis = state.players[this.humanPlayer]?.visibility ?? null;
    const seen = new Set<EntityId>();

    for (const e of state.entities.values()) {
      seen.add(e.id);
      const tileVis = this.tileVis(vis, state, e.tileX, e.tileY);

      // remembered-building bookkeeping
      if (e.kind === 'building' && tileVis === 2) {
        this.rememberBuilding(state, e);
      }

      const visible =
        e.player === this.humanPlayer ||
        (e.kind === 'resource' ? tileVis >= 1 : tileVis === 2);

      let view = this.views.get(e.id);
      if (!visible) {
        if (view) view.root.visible = false;
        continue;
      }
      if (!view) {
        view = this.createView();
        this.views.set(e.id, view);
      }
      view.root.visible = true;
      this.updateView(state, e, view, alpha, tickFloat);
    }

    // stale views
    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        view.root.destroy({ children: true });
        this.views.delete(id);
        this.selection.delete(id);
      }
    }
    this.prunePositions(seen);
    this.updateGhosts(state, vis, seen);
    this.updateProjectiles(tickFloat);
  }

  /** Interpolated world position of an entity. */
  entityWorldPos(e: Entity, alpha: number): { x: number; y: number } {
    const prev = this.prevPos.get(e.id);
    const cur = this.curPos.get(e.id) ?? { x: e.x, y: e.y };
    const fx = prev ? prev.x + (cur.x - prev.x) * alpha : cur.x;
    const fy = prev ? prev.y + (cur.y - prev.y) * alpha : cur.y;
    return tileToWorld(fx / FP, fy / FP);
  }

  /**
   * Hit-test entities near a world point (slop in world px). Returns candidates
   * sorted by distance; the input layer applies GDD snap priority.
   */
  pickAt(state: GameState, wx: number, wy: number, slop: number): PickResult[] {
    const vis = state.players[this.humanPlayer]?.visibility ?? null;
    const results: PickResult[] = [];
    const tile = worldToTile(wx, wy);
    for (const e of state.entities.values()) {
      const tv = this.tileVis(vis, state, e.tileX, e.tileY);
      const visible = e.player === this.humanPlayer || (e.kind === 'resource' ? tv >= 1 : tv === 2);
      if (!visible || e.activity === 'dying') continue;
      let d: number;
      if (e.kind === 'building') {
        const size = gameData.buildings[e.defId]?.size ?? 1;
        const cx = e.x / FP;
        const cy = e.y / FP;
        const cheb = Math.max(Math.abs(tile.x - cx), Math.abs(tile.y - cy)) - size / 2;
        d = cheb * HALF_W; // approx world px outside the footprint
      } else {
        const p = tileToWorld(e.x / FP, e.y / FP);
        const bodyCy = p.y - (e.kind === 'unit' ? 12 : 8);
        d = Math.hypot(wx - p.x, wy - bodyCy) - 12;
      }
      if (d <= slop) results.push({ entity: e, dist: d });
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
      if (e.kind !== 'unit' || e.player !== player || e.activity === 'dying') continue;
      const p = tileToWorld(e.x / FP, e.y / FP);
      if (p.x >= lo.x && p.x <= hi.x && p.y >= lo.y && p.y <= hi.y) out.push(e);
    }
    return out;
  }

  /** Own units of one type within a world-space rect (double-tap select-all-on-screen). */
  unitsOfTypeInRect(state: GameState, defId: string, x0: number, y0: number, x1: number, y1: number, player: PlayerId): Entity[] {
    return this.unitsInWorldRect(state, x0, y0, x1, y1, player).filter((e) => e.defId === defId);
  }

  // ------------------------------------------------------------------ internals

  private tileVis(vis: Uint8Array | null, state: GameState, tx: number, ty: number): number {
    if (!vis) return 2;
    if (tx < 0 || ty < 0 || tx >= state.map.width || ty >= state.map.height) return 0;
    return vis[ty * state.map.width + tx];
  }

  private createView(): EntityView {
    const root = new Container();
    const ring = new Graphics();
    const sprite = new Sprite();
    const hpBar = new Graphics();
    root.addChild(ring, sprite, hpBar);
    this.container.addChild(root);
    return { root, ring, sprite, hpBar, lastFrameKey: '', lastAnim: '', animStartTick: 0, lastHpKey: '', lastRingKey: '' };
  }

  private updateView(state: GameState, e: Entity, view: EntityView, alpha: number, tickFloat: number): void {
    const pos = this.entityWorldPos(e, alpha);
    view.root.position.set(Math.round(pos.x), Math.round(pos.y));
    // flat things (farms, foundations-stage-0) sort under everything else
    const flat = e.defId === 'farm' || (e.kind === 'building' && (e.buildProgress ?? 1000) < 250);
    view.root.zIndex = flat ? pos.y - 4000 : pos.y;

    const colorIdx = e.player === GAIA ? undefined : state.players[e.player]?.setup.color;
    const { candidates, alpha: sprAlpha } = this.frameNameFor(state, e, tickFloat, view);
    const key = candidates.join('|');
    if (key !== view.lastFrameKey) {
      let frame = null;
      for (let i = 0; i < candidates.length - 1 && !frame; i++) {
        frame = this.assets.tryResolve(candidates[i], colorIdx);
      }
      frame ??= this.assets.resolveFrame(candidates[candidates.length - 1], colorIdx);
      view.sprite.texture = frame.texture;
      view.sprite.anchor.set(frame.anchorX, frame.anchorY);
      view.sprite.scale.x = frame.mirrored ? -1 : 1;
      view.lastFrameKey = key;
    }
    view.sprite.alpha = sprAlpha;

    this.drawRing(e, view);
    this.drawHpBar(e, view);
  }

  private frameNameFor(state: GameState, e: Entity, tickFloat: number, view: EntityView): { candidates: string[]; alpha: number } {
    if (e.kind === 'resource') {
      return { candidates: [resourceFrameName(e)], alpha: 1 };
    }
    if (e.kind === 'building') {
      return buildingFrame(state, e);
    }
    // unit (incl. gaia animals under obj/)
    const prefix = GAIA_ANIMAL(e.defId) ? 'obj' : 'unit';
    const anim = animForActivity(e.activity, e.defId === 'villager');
    if (anim !== view.lastAnim) {
      view.lastAnim = anim;
      view.animStartTick = tickFloat;
    }
    const countKey = `${prefix}/${e.defId}/${anim}/0`;
    let count = this.frameCounts.get(countKey);
    if (count === undefined) {
      count = this.assets.frameCount(countKey);
      this.frameCounts.set(countKey, count);
    }
    if (count === 0) {
      // fall back to idle, then to a warning placeholder via resolveFrame
      const idleKey = `${prefix}/${e.defId}/idle/0`;
      let idleCount = this.frameCounts.get(idleKey);
      if (idleCount === undefined) {
        idleCount = this.assets.frameCount(idleKey);
        this.frameCounts.set(idleKey, idleCount);
      }
      if (idleCount > 0) {
        return { candidates: [`${prefix}/${e.defId}/idle/${e.facing}/0`], alpha: 1 };
      }
      return { candidates: [`${prefix}/${e.defId}/${anim}/${e.facing}/0`], alpha: 1 };
    }
    const ageSec = (tickFloat - view.animStartTick) / TICKS_PER_SECOND;
    const frame = animFrameIndex(anim, ageSec, count);
    return { candidates: [`${prefix}/${e.defId}/${anim}/${e.facing}/${frame}`], alpha: 1 };
  }

  private drawRing(e: Entity, view: EntityView): void {
    const selected = this.selection.has(e.id);
    const key = selected ? `1:${e.kind}:${e.defId}` : '';
    if (key === view.lastRingKey) return;
    view.lastRingKey = key;
    view.ring.clear();
    if (!selected) return;
    if (e.kind === 'building') {
      const size = gameData.buildings[e.defId]?.size ?? 1;
      const hw = size * HALF_W;
      const hh = size * HALF_H;
      view.ring
        .moveTo(0, -hh).lineTo(hw, 0).lineTo(0, hh).lineTo(-hw, 0).closePath()
        .stroke({ width: 1.5, color: HIGHLIGHT });
    } else {
      const cav = (gameData.units[e.defId]?.speed ?? 0) > 1.1;
      const rx = cav ? 14 : 10;
      const ry = cav ? 7 : 5;
      view.ring.ellipse(0, 1, rx, ry + 1).stroke({ width: 1, color: OUTLINE });
      view.ring.ellipse(0, 0, rx, ry).stroke({ width: 1, color: HIGHLIGHT });
    }
  }

  private drawHpBar(e: Entity, view: EntityView): void {
    const selected = this.selection.has(e.id);
    const damaged = e.hp < e.maxHp;
    const show = (selected || damaged) && e.activity !== 'dying' && e.kind !== 'resource';
    const frac = Math.max(0, Math.min(1, e.hp / Math.max(1, e.maxHp)));
    const key = show ? `${frac.toFixed(2)}:${e.kind}:${e.defId}` : '';
    if (key === view.lastHpKey) return;
    view.lastHpKey = key;
    view.hpBar.clear();
    if (!show) return;
    const isB = e.kind === 'building';
    const size = isB ? gameData.buildings[e.defId]?.size ?? 1 : 0;
    const w = isB ? size * TILE_W_SAFE - 8 : 26;
    const yOff = isB ? -(size * HALF_H + 14 + size * 8) : -34;
    const color = frac > 0.5 ? HP_GREEN : frac > 0.25 ? HP_YELLOW : HP_RED;
    view.hpBar.rect(-w / 2 - 1, yOff - 1, w + 2, 6).fill(OUTLINE);
    view.hpBar.rect(-w / 2, yOff, w, 4).fill(HP_BG);
    if (frac > 0) view.hpBar.rect(-w / 2, yOff, Math.max(1, Math.round(w * frac)), 4).fill(color);
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
    });
  }

  private updateGhosts(state: GameState, vis: Uint8Array | null, liveIds: Set<EntityId>): void {
    for (const [id, g] of this.ghosts) {
      const tv = this.tileVis(vis, state, g.tileX, g.tileY);
      if (tv === 2) {
        if (!liveIds.has(id)) {
          // We can see the spot and the building is gone: forget it.
          this.ghosts.delete(id);
          const spr = this.ghostViews.get(id);
          if (spr) {
            spr.destroy();
            this.ghostViews.delete(id);
          }
        } else {
          const spr = this.ghostViews.get(id);
          if (spr) spr.visible = false;
        }
        continue;
      }
      // explored-but-not-visible: show the last-seen ghost
      const wantVisible = tv === 1 && g.player !== this.humanPlayer;
      // own buildings render live anyway (always visible to their owner in our draw rule)
      let spr = this.ghostViews.get(id);
      if (wantVisible) {
        if (!spr) {
          spr = new Sprite();
          spr.tint = GHOST_TINT;
          spr.alpha = 0.8;
          this.ghostViews.set(id, spr);
          this.container.addChild(spr);
          const colorIdx = state.players[g.player]?.setup.color;
          const frame =
            this.assets.tryResolve(`bld/${g.defId}/${g.age}/done`, colorIdx) ??
            this.assets.resolveFrame(`bld/${g.defId}/done`, colorIdx);
          spr.texture = frame.texture;
          spr.anchor.set(frame.anchorX, frame.anchorY);
          spr.position.set(Math.round(g.wx), Math.round(g.wy));
          spr.zIndex = g.wy;
        }
        spr.visible = true;
      } else if (spr) {
        spr.visible = false;
      }
    }
  }

  private updateProjectiles(tickFloat: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const t = (tickFloat - p.startTick) / p.flightTicks;
      if (t >= 1) {
        p.gfx.destroy();
        this.projectiles.splice(i, 1);
        continue;
      }
      const x = p.x0 + (p.x1 - p.x0) * t;
      const dist = Math.hypot(p.x1 - p.x0, p.y1 - p.y0);
      const peak = p.arc === 'high' ? dist * 0.25 : dist * 0.08;
      const y = p.y0 + (p.y1 - p.y0) * t - Math.sin(Math.PI * t) * peak;
      p.gfx.position.set(x, y);
      p.gfx.rotation = Math.atan2(p.y1 - p.y0, p.x1 - p.x0);
    }
  }

  private prunePositions(seen: Set<EntityId>): void {
    for (const id of this.curPos.keys()) {
      if (!seen.has(id)) {
        this.curPos.delete(id);
        this.prevPos.delete(id);
      }
    }
  }
}

const TILE_W_SAFE = HALF_W * 2;

function resourceFrameName(e: Entity): string {
  const h = (Math.imul(e.id, 2654435761) >>> 0);
  switch (e.defId) {
    case 'tree': return `obj/tree/${h % 3}`;
    case 'goldMine': return `obj/gold/${h % 2}`;
    case 'stoneMine': return `obj/stone/${h % 2}`;
    case 'berryBush': return 'obj/berries';
    default: return `obj/${e.defId}/0`;
  }
}

function buildingFrame(state: GameState, e: Entity): { candidates: string[]; alpha: number } {
  const progress = e.buildProgress ?? 1000;
  if (e.defId === 'farm') {
    // ART_BIBLE §4.4: farms have no construct/rubble frames — obj/farm/<stage>,
    // with a build-progress dropout (approximated here with alpha ramp).
    if (progress < 1000) {
      return { candidates: ['obj/farm/0'], alpha: 0.35 + (progress / 1000) * 0.65 };
    }
    const stage = (e.amountLeft ?? 1) <= 0 ? 4 : 3;
    return { candidates: [`obj/farm/${stage}`], alpha: 1 };
  }
  if (progress < 1000) {
    const stage = progress < 334 ? 0 : progress < 667 ? 1 : 2;
    return { candidates: [`bld/${e.defId}/construct${stage}`], alpha: 1 };
  }
  const age = state.players[e.player]?.age ?? 'dark';
  // TC/house have per-age variants (`bld/<defId>/<age>/done`); everything else
  // is authored once as `bld/<defId>/done` — try the variant, fall back.
  return { candidates: [`bld/${e.defId}/${age}/done`, `bld/${e.defId}/done`], alpha: 1 };
}
