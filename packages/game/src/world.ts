// World layer: y-sorted entity sprites with activity/facing/tick-driven
// animation, interpolation between the last two sim ticks, selection rings,
// health bars, building construct states, fog-based hiding with remembered
// building ghosts, damage-taken blink, villager carry icons, garrison count
// badges, and gather-target highlights. Event-driven fx (projectiles, impact
// flashes, corpses, rubble, conversion beams) live in fx.ts.

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import {
  FP, GAIA, TICKS_PER_SECOND,
  type Entity, type EntityId, type GameState, type PlayerId, type SimEvent,
} from '@bf/sim/types';
import { gameData, unitAggroRange } from '@bf/data';
import type { GameAssets } from './assets';
import { animForActivity, animFrameIndex, unitRig, type AnimName } from './frames';
import { hasActiveRally } from './hud/cardModel';
import { GAIA_NEUTRAL_COLOR } from './recolor';
import { HALF_H, HALF_W, tileToWorld, worldToTile } from './camera';
import { getSettings } from './settings';

const HIGHLIGHT = 0xf4eedd;
const GATHER_HIGHLIGHT = 0xe6c04a;
const OUTLINE = 0x1a1208;
const HP_GREEN = 0x3e8c34;
const HP_YELLOW = 0xd4a82a;
const HP_RED = 0xb3261e;
const HP_BG = 0x2c1f12;
const RESEARCH_BLUE = 0x5b8fc9;
const GHOST_TINT = 0x9aa4ad;
const AGGRO_COLOR = 0xe9d6a5;
const AGGRO_LINE_ALPHA = 0.24;
const AGGRO_FILL_ALPHA = 0.025;

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

interface GhostRecord {
  defId: string;
  player: PlayerId;
  tileX: number;
  tileY: number;
  wx: number;
  wy: number;
  age: string;
}

export interface PickResult {
  entity: Entity;
  dist: number;
}

export class WorldLayer {
  readonly container = new Container();
  selection = new Set<EntityId>();

  /** Faint ground circles for the selected military units' true auto-acquire radius. */
  private aggroLayer = new Container();
  private aggroViews = new Map<EntityId, { graphic: Graphics; range: number }>();
  private views = new Map<EntityId, EntityView>();
  private ghostViews = new Map<EntityId, Sprite>();
  private ghosts = new Map<EntityId, GhostRecord>();
  /** Rally flag markers for selected own production buildings (GDD: rally shown as a flag). */
  private rallyFlags = new Graphics();
  private lastRallyFlagKey = '';
  private prevPos = new Map<EntityId, { x: number; y: number }>();
  private curPos = new Map<EntityId, { x: number; y: number }>();
  private frameCounts = new Map<string, number>();
  /** entityId -> tick until which the damage-taken red blink lasts. */
  private damagedUntil = new Map<EntityId, number>();
  /** Resource/target ids highlighted because selected villagers gather them. */
  private gatherTargets = new Set<EntityId>();

  constructor(
    private assets: GameAssets,
    private humanPlayer: PlayerId,
    private getUnitLos: (defId: string) => number = (defId) => gameData.units[defId]?.los ?? 0,
  ) {
    this.container.sortableChildren = true;
    this.aggroLayer.zIndex = -1e9; // below every entity, above terrain
    this.rallyFlags.zIndex = 1e9; // markers float above every sprite
    this.container.addChild(this.aggroLayer, this.rallyFlags);
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
      if (ev.kind === 'attackImpact') {
        // damage-taken red blink (~4 ticks); the impact flash itself is fx.ts
        this.damagedUntil.set(ev.targetId, tick + 4);
      }
    }
  }

  /** Main per-frame update. tickFloat = state.tick + alpha. */
  update(state: GameState, alpha: number, tickFloat: number): void {
    const vis = state.players[this.humanPlayer]?.visibility ?? null;
    const seen = new Set<EntityId>();
    this.refreshGatherTargets(state);

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
      const active = hasActiveRally(e);
      const target = active && e.rally?.targetId !== undefined
        ? state.entities.get(e.rally.targetId) : undefined;
      const p = target
        ? tileToWorld(target.x / FP, target.y / FP)
        : active && e.rally
          ? tileToWorld(e.rally.x / FP, e.rally.y / FP)
          : tileToWorld(...defaultRallyTilePoint(e));
      spots.push({ x: Math.round(p.x), y: Math.round(p.y) });
    }
    const key = spots.map((s) => `${s.x},${s.y}`).join('|');
    if (key === this.lastRallyFlagKey) return;
    this.lastRallyFlagKey = key;
    this.rallyFlags.clear();
    for (const s of spots) {
      // ground marker + pole + gold pennant (same look as the garrison badge flag)
      this.rallyFlags.ellipse(s.x, s.y, 7, 4).stroke({ width: 1.5, color: OUTLINE });
      this.rallyFlags.ellipse(s.x, s.y, 7, 4).stroke({ width: 1, color: GATHER_HIGHLIGHT });
      this.rallyFlags.moveTo(s.x, s.y).lineTo(s.x, s.y - 20).stroke({ width: 1.5, color: OUTLINE });
      this.rallyFlags
        .poly([s.x, s.y - 20, s.x + 13, s.y - 16, s.x, s.y - 12])
        .fill(GATHER_HIGHLIGHT)
        .stroke({ width: 1, color: OUTLINE });
    }
  }

  /** Targets of the currently selected villagers (GDD: gather target highlights). */
  private refreshGatherTargets(state: GameState): void {
    this.gatherTargets.clear();
    for (const id of this.selection) {
      const e = state.entities.get(id);
      if (!e || e.kind !== 'unit' || e.player !== this.humanPlayer || e.defId !== 'villager') continue;
      const target = e.intent?.kind === 'gather'
        ? e.intent.targetId
        : (e.activity === 'gathering' || e.activity === 'carrying') ? e.targetId : undefined;
      if (target !== undefined) this.gatherTargets.add(target);
    }
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
    for (const e of state.entities.values()) {
      const tv = this.tileVis(vis, state, e.tileX, e.tileY);
      const visible = e.player === this.humanPlayer || (e.kind === 'resource' ? tv >= 1 : tv === 2);
      // Garrisoned units sit at their host building's anchor but are not drawn —
      // they must never steal a tap aimed at the building itself.
      if (!visible || e.activity === 'dying' || e.garrisonedIn !== undefined) continue;
      const d = entityPickDistance(e, wx, wy);
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
    return {
      root, ring, sprite, hpBar,
      lastFrameKey: '', lastAnim: '', animStartTick: 0, lastHpKey: '', lastRingKey: '', spriteTopPx: 0,
      carry: null, lastCarryKey: '', badge: null, badgeText: null, lastBadgeKey: '',
    };
  }

  private updateView(state: GameState, e: Entity, view: EntityView, alpha: number, tickFloat: number): void {
    const pos = this.entityWorldPos(e, alpha);
    view.root.position.set(Math.round(pos.x), Math.round(pos.y));
    // flat things (farms, foundations-stage-0) sort under everything else
    const flat = e.defId === 'farm' || (e.kind === 'building' && (e.buildProgress ?? 1000) < 250);
    view.root.zIndex = flat ? pos.y - 4000 : pos.y;

    // Gaia entities use the neutral swap: some (sheep) carry a real mask band that
    // must never render raw magenta. Atlases without masks serve the plain frame.
    const colorIdx = e.player === GAIA ? GAIA_NEUTRAL_COLOR : state.players[e.player]?.setup.color;
    const { candidates, alpha: sprAlpha } = this.frameNameFor(state, e, tickFloat, view);
    const key = candidates.join('|');
    if (key !== view.lastFrameKey) {
      let frame = null;
      let resolvedName = candidates[candidates.length - 1];
      for (let i = 0; i < candidates.length - 1 && !frame; i++) {
        frame = this.assets.tryResolve(candidates[i], colorIdx);
        if (frame) resolvedName = candidates[i];
      }
      frame ??= this.assets.resolveFrame(resolvedName, colorIdx);
      view.sprite.texture = frame.texture;
      view.sprite.anchor.set(frame.anchorX, frame.anchorY);
      view.sprite.scale.x = frame.mirrored ? -1 : 1;
      // Trimmed visible top (frames carry transparent headroom): overlays like
      // the health bar must anchor to pixels, not the texture rect.
      view.spriteTopPx = Math.round(
        this.assets.contentTopPx(resolvedName) - frame.anchorY * frame.texture.height,
      );
      view.lastFrameKey = key;
    }
    view.sprite.alpha = sprAlpha;
    // damage-taken red blink (attackImpact recorded in onSimEvents)
    view.sprite.tint = (this.damagedUntil.get(e.id) ?? 0) > tickFloat ? 0xff8070 : 0xffffff;

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
              fontFamily: 'VT323, monospace', fontSize: 12,
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
      return { candidates: [resourceFrameName(e)], alpha: 1 };
    }
    if (e.kind === 'building') {
      return buildingFrame(state, e);
    }
    // unit (incl. gaia animals under obj/; heroes render via their `sprite` rig alias)
    const { spriteId, prefix } = unitRig(e.defId);
    const anim = animForActivity(e.activity, e.defId === 'villager');
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
        return { candidates: [`${prefix}/${spriteId}/idle/${e.facing}/0`], alpha: 1 };
      }
      return { candidates: [`${prefix}/${spriteId}/${anim}/${e.facing}/0`], alpha: 1 };
    }
    const ageSec = (tickFloat - view.animStartTick) / TICKS_PER_SECOND;
    const frame = animFrameIndex(anim, ageSec, count);
    return { candidates: [`${prefix}/${spriteId}/${anim}/${e.facing}/${frame}`], alpha: 1 };
  }

  private drawRing(e: Entity, view: EntityView): void {
    const selected = this.selection.has(e.id);
    // gather-target highlight: amber ring on what the selected villagers work
    const highlighted = !selected && this.gatherTargets.has(e.id);
    const key = selected ? `1:${e.kind}:${e.defId}` : highlighted ? `h:${e.kind}:${e.defId}` : '';
    if (key === view.lastRingKey) return;
    view.lastRingKey = key;
    view.ring.clear();
    if (!selected && !highlighted) return;
    const color = selected ? HIGHLIGHT : GATHER_HIGHLIGHT;
    if (e.kind === 'building') {
      const size = gameData.buildings[e.defId]?.size ?? 1;
      const hw = size * HALF_W;
      const hh = size * HALF_H;
      view.ring
        .moveTo(0, -hh).lineTo(hw, 0).lineTo(0, hh).lineTo(-hw, 0).closePath()
        .stroke({ width: 1.5, color });
    } else {
      const cav = (gameData.units[e.defId]?.speed ?? 0) > 1.1;
      const rx = cav ? 14 : 10;
      const ry = cav ? 7 : 5;
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
          // Farms have no bld/ frames (ART_BIBLE §4.4): remember them as a mature
          // field (obj/farm/2) instead of the missing bld/farm/done placeholder.
          const frame = g.defId === 'farm'
            ? this.assets.resolveFrame('obj/farm/2', colorIdx)
            : this.assets.tryResolve(`bld/${g.defId}/${g.age}/done`, colorIdx) ??
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

export function resourceFrameName(e: Entity): string {
  if (e.stump) return 'obj/stump';
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
