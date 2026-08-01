// Event-driven combat/eco feedback layer (renderer-only, non-deterministic-safe:
// nothing here feeds back into the sim):
// - projectile sprites (arrow / bolt / stone) with per-event arc from
//   projectileFired.flightTicks; misses land and fade, stones puff on impact
// - impact flashes on attackImpact
// - death playthrough: corpses replay die -> decay -> fade after the entity
//   leaves the state (works whether the sim keeps a 'dying' entity for a few
//   ticks or removes it the same tick it emits entityDied)
// - building rubble on destruction (bld/<defId>/rubble), farms excepted per
//   ASSET_CONTRACT
// - conversion beam + sparkles while a monk's activity is 'converting'
//
// Two containers: `ground` sorts under the entity layer (corpses/rubble),
// `air` above it (projectiles, flashes, beams).

import { Container, Graphics, Sprite } from 'pixi.js';
import {
  FP, GAIA, TICKS_PER_SECOND,
  type Entity, type EntityId, type GameState, type PlayerId, type SimEvent,
} from '@bf/sim/types';
import { gameData } from '@bf/data';
import type { GameAssets } from './assets';
import { ANIM_FPS, animFrameIndex } from './frames';
import { GAIA_NEUTRAL_COLOR } from './recolor';
import { tileToWorld } from './camera';
import { projectileKindFor, type ProjectileKind } from './projectiles';

interface Projectile {
  gfx: Graphics;
  x0: number; y0: number; x1: number; y1: number;
  startTick: number;
  flightTicks: number;
  peak: number;
  kind: ProjectileKind;
  hit: boolean;
  landedTick: number | null;
}

interface Flash {
  gfx: Graphics;
  startTick: number;
  ticks: number;
  color: number;
}

interface Corpse {
  sprite: Sprite;
  defId: string;
  colorIdx: number | undefined;
  facing: number;
  isBuilding: boolean;
  /** Tick the corpse entered its current phase. */
  phaseStart: number;
  phase: 'die' | 'decay' | 'rubble' | 'fade';
  dieFrames: number;
  decayFrames: number;
  lastFrameKey: string;
}

interface DeferredDeath {
  defId: string;
  player: PlayerId;
  colorIdx: number | undefined;
  facing: number;
  wx: number;
  wy: number;
  isBuilding: boolean;
}

const DIE_TICKS = (frames: number): number =>
  Math.max(1, Math.round((frames / ANIM_FPS.die) * TICKS_PER_SECOND));
const DECAY_TICKS = (frames: number): number =>
  Math.max(1, Math.round((frames / ANIM_FPS.decay) * TICKS_PER_SECOND));
const FADE_TICKS = 2 * TICKS_PER_SECOND;
const RUBBLE_TICKS = 12 * TICKS_PER_SECOND;
const ARROW_LINGER_TICKS = 30;

export class FxLayer {
  readonly ground = new Container();
  readonly air = new Container();

  private projectiles: Projectile[] = [];
  private flashes: Flash[] = [];
  private corpses: Corpse[] = [];
  private deferred = new Map<EntityId, DeferredDeath>();
  private beamGfx = new Graphics();

  constructor(private assets: GameAssets) {
    this.ground.sortableChildren = true;
    this.air.addChild(this.beamGfx);
  }

  destroy(): void {
    this.ground.destroy({ children: true });
    this.air.destroy({ children: true });
  }

  onSimEvents(state: GameState, events: SimEvent[], tick: number): void {
    for (const ev of events) {
      switch (ev.kind) {
        case 'projectileFired':
          this.spawnProjectile(state, ev, tick);
          break;
        case 'attackImpact': {
          const target = state.entities.get(ev.targetId);
          if (target) {
            const p = tileToWorld(target.x / FP, target.y / FP);
            this.spawnFlash(p.x, p.y - (target.kind === 'unit' ? 10 : 6), tick, ev.melee ? 0xf4eedd : 0xffd76a, 5);
          }
          break;
        }
        case 'entityDied':
          this.onEntityDied(state, ev, tick);
          break;
        case 'conversionComplete': {
          const target = state.entities.get(ev.targetId);
          if (target) {
            const p = tileToWorld(target.x / FP, target.y / FP);
            this.spawnFlash(p.x, p.y - 12, tick, 0xe6c04a, 10);
          }
          break;
        }
        default:
          break;
      }
    }
  }

  /** Per-frame. tickFloat = state.tick + alpha. */
  update(state: GameState, tickFloat: number): void {
    this.flushDeferred(state, tickFloat);
    this.updateProjectiles(tickFloat);
    this.updateFlashes(tickFloat);
    this.updateCorpses(tickFloat);
    this.drawConversionBeams(state, tickFloat);
  }

  // ---------------------------------------------------------------- projectiles

  private spawnProjectile(
    state: GameState,
    ev: Extract<SimEvent, { kind: 'projectileFired' }>,
    tick: number,
  ): void {
    const a = tileToWorld(ev.x0 / FP, ev.y0 / FP);
    const b = tileToWorld(ev.x1 / FP, ev.y1 / FP);
    const kind = projectileKindFor(state.entities.get(ev.fromId)?.defId ?? '');
    const gfx = new Graphics();
    drawProjectileShape(gfx, kind);
    // launch/impact heights: shots leave a body/roof and strike a body, not feet
    const y0 = a.y - 14;
    const y1 = b.y - 8;
    const dist = Math.hypot(b.x - a.x, y1 - y0);
    const peak = ev.arc === 'high' ? Math.max(18, dist * 0.28) : dist * 0.07;
    this.air.addChild(gfx);
    this.projectiles.push({
      gfx, x0: a.x, y0, x1: b.x, y1,
      startTick: tick, flightTicks: Math.max(1, ev.flightTicks),
      peak, kind, hit: ev.hit, landedTick: null,
    });
  }

  private updateProjectiles(tickFloat: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const t = (tickFloat - p.startTick) / p.flightTicks;
      if (t >= 1) {
        if (p.landedTick === null) {
          p.landedTick = tickFloat;
          if (p.kind === 'stone') {
            // stones burst on landing (hit or ground scatter)
            this.spawnFlash(p.x1, p.y1, tickFloat, 0xb0a890, 8);
            p.gfx.destroy();
            this.projectiles.splice(i, 1);
            continue;
          }
          if (p.hit) {
            // arrows/bolts that hit vanish into the target
            p.gfx.destroy();
            this.projectiles.splice(i, 1);
            continue;
          }
          // misses stick in the ground briefly
          p.gfx.position.set(p.x1, p.y1);
        }
        const linger = (tickFloat - p.landedTick) / ARROW_LINGER_TICKS;
        if (linger >= 1) {
          p.gfx.destroy();
          this.projectiles.splice(i, 1);
        } else {
          p.gfx.alpha = 1 - linger;
        }
        continue;
      }
      const tt = Math.max(0, t);
      const x = p.x0 + (p.x1 - p.x0) * tt;
      const y = p.y0 + (p.y1 - p.y0) * tt - Math.sin(Math.PI * tt) * p.peak;
      p.gfx.position.set(x, y);
      // orient along the flight tangent (includes the arc slope)
      const dx = p.x1 - p.x0;
      const dy = (p.y1 - p.y0) - Math.PI * Math.cos(Math.PI * tt) * p.peak;
      if (p.kind !== 'stone') p.gfx.rotation = Math.atan2(dy, dx);
    }
  }

  // ---------------------------------------------------------------- flashes

  private spawnFlash(wx: number, wy: number, tick: number, color: number, size: number): void {
    const gfx = new Graphics();
    for (let k = 0; k < 5; k++) {
      const ang = (k / 5) * Math.PI * 2 + 0.35;
      gfx.moveTo(Math.cos(ang) * 1.5, Math.sin(ang) * 1.5)
        .lineTo(Math.cos(ang) * size, Math.sin(ang) * size);
    }
    gfx.stroke({ width: 1.5, color });
    gfx.circle(0, 0, Math.max(1.5, size * 0.3)).fill({ color, alpha: 0.9 });
    gfx.position.set(wx, wy);
    this.air.addChild(gfx);
    this.flashes.push({ gfx, startTick: tick, ticks: 7, color });
  }

  private updateFlashes(tickFloat: number): void {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      const t = (tickFloat - f.startTick) / f.ticks;
      if (t >= 1) {
        f.gfx.destroy();
        this.flashes.splice(i, 1);
        continue;
      }
      f.gfx.alpha = 1 - t;
      f.gfx.scale.set(0.6 + t * 0.9);
    }
  }

  // ---------------------------------------------------------------- corpses

  private onEntityDied(
    state: GameState,
    ev: Extract<SimEvent, { kind: 'entityDied' }>,
    tick: number,
  ): void {
    const live = state.entities.get(ev.id);
    const defId = ev.defId;
    const isBuilding = !!gameData.buildings[defId];
    if (!isBuilding && !gameData.units[defId]) return; // resources leave no corpse
    if (defId === 'farm') return; // ASSET_CONTRACT: farms have no rubble
    const colorIdx = ev.player === GAIA
      ? GAIA_NEUTRAL_COLOR
      : state.players[ev.player]?.setup.color;
    if (live) {
      // Sim keeps a dying entity: the live view plays 'die'; when it vanishes
      // from the state we take over at the decay/rubble phase.
      const p = tileToWorld(live.x / FP, live.y / FP);
      this.deferred.set(ev.id, {
        defId, player: ev.player, colorIdx,
        facing: live.facing, wx: p.x, wy: p.y, isBuilding,
      });
    } else {
      const p = tileToWorld(ev.x / FP, ev.y / FP);
      this.spawnCorpse(defId, colorIdx, 0, p.x, p.y, isBuilding, /*playDie*/ !isBuilding, tick);
    }
  }

  private flushDeferred(state: GameState, tickFloat: number): void {
    for (const [id, d] of this.deferred) {
      if (state.entities.has(id)) continue;
      this.deferred.delete(id);
      // the live entity already played its die anim — start at decay/rubble
      this.spawnCorpse(d.defId, d.colorIdx, d.facing, d.wx, d.wy, d.isBuilding, /*playDie*/ false, tickFloat);
    }
  }

  private spawnCorpse(
    defId: string,
    colorIdx: number | undefined,
    facing: number,
    wx: number,
    wy: number,
    isBuilding: boolean,
    playDie: boolean,
    tick: number,
  ): void {
    const sprite = new Sprite();
    sprite.position.set(Math.round(wx), Math.round(wy));
    sprite.zIndex = wy - 3000; // above farms (-4000), below live entities
    this.ground.addChild(sprite);

    if (isBuilding) {
      const frame = this.assets.tryResolve(`bld/${defId}/rubble`, colorIdx);
      if (!frame) {
        sprite.destroy();
        return;
      }
      sprite.texture = frame.texture;
      sprite.anchor.set(frame.anchorX, frame.anchorY);
      this.corpses.push({
        sprite, defId, colorIdx, facing, isBuilding: true,
        phaseStart: tick, phase: 'rubble', dieFrames: 0, decayFrames: 0, lastFrameKey: 'rubble',
      });
      return;
    }

    const prefix = (gameData.units[defId]?.trainedAt.length ?? 0) === 0 ? 'obj' : 'unit';
    const dieFrames = this.assets.frameCount(`${prefix}/${defId}/die/0`);
    const decayFrames = this.assets.frameCount(`${prefix}/${defId}/decay/0`);
    if (dieFrames === 0 && decayFrames === 0) {
      sprite.destroy();
      return; // nothing to show (missing atlas + no mock)
    }
    const phase: Corpse['phase'] = playDie && dieFrames > 0 ? 'die' : decayFrames > 0 ? 'decay' : 'fade';
    this.corpses.push({
      sprite, defId, colorIdx, facing, isBuilding: false,
      phaseStart: tick, phase, dieFrames, decayFrames, lastFrameKey: '',
    });
  }

  private updateCorpses(tickFloat: number): void {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      const age = tickFloat - c.phaseStart;

      if (c.phase === 'rubble') {
        if (age >= RUBBLE_TICKS) {
          c.phase = 'fade';
          c.phaseStart = tickFloat;
        }
        continue;
      }
      if (c.phase === 'fade') {
        const t = age / FADE_TICKS;
        if (t >= 1) {
          c.sprite.destroy();
          this.corpses.splice(i, 1);
        } else {
          c.sprite.alpha = 1 - t;
        }
        continue;
      }

      const prefix = (gameData.units[c.defId]?.trainedAt.length ?? 0) === 0 ? 'obj' : 'unit';
      if (c.phase === 'die') {
        const total = DIE_TICKS(c.dieFrames);
        if (age >= total) {
          c.phase = c.decayFrames > 0 ? 'decay' : 'fade';
          c.phaseStart = tickFloat;
          continue;
        }
        const idx = animFrameIndex('die', age / TICKS_PER_SECOND, c.dieFrames);
        this.setCorpseFrame(c, `${prefix}/${c.defId}/die/${c.facing}/${idx}`);
        continue;
      }
      // decay
      const total = DECAY_TICKS(c.decayFrames);
      if (age >= total) {
        c.phase = 'fade';
        c.phaseStart = tickFloat;
        continue;
      }
      const idx = animFrameIndex('decay', age / TICKS_PER_SECOND, c.decayFrames);
      this.setCorpseFrame(c, `${prefix}/${c.defId}/decay/${c.facing}/${idx}`);
    }
  }

  private setCorpseFrame(c: Corpse, name: string): void {
    if (c.lastFrameKey === name) return;
    c.lastFrameKey = name;
    const frame = this.assets.tryResolve(name, c.colorIdx);
    if (!frame) return;
    c.sprite.texture = frame.texture;
    c.sprite.anchor.set(frame.anchorX, frame.anchorY);
    c.sprite.scale.x = frame.mirrored ? -1 : 1;
  }

  // ---------------------------------------------------------------- conversion beam

  private drawConversionBeams(state: GameState, tickFloat: number): void {
    const g = this.beamGfx;
    g.clear();
    for (const e of state.entities.values()) {
      if (e.activity !== 'converting' || e.targetId === undefined) continue;
      if (!gameData.units[e.defId]?.converts) continue;
      const target: Entity | undefined = state.entities.get(e.targetId);
      if (!target) continue;
      const a = tileToWorld(e.x / FP, e.y / FP);
      const b = tileToWorld(target.x / FP, target.y / FP);
      const ax = a.x, ay = a.y - 16;
      const bx = b.x, by = b.y - 12;
      // wavering golden beam
      const segs = 8;
      const phase = tickFloat * 0.45;
      g.moveTo(ax, ay);
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const wob = Math.sin(phase + t * Math.PI * 3) * 3 * Math.sin(Math.PI * t);
        const nx = -(by - ay);
        const ny = bx - ax;
        const len = Math.hypot(nx, ny) || 1;
        g.lineTo(ax + (bx - ax) * t + (nx / len) * wob, ay + (by - ay) * t + (ny / len) * wob);
      }
      g.stroke({ width: 1.5, color: 0xe6c04a, alpha: 0.85 });
      // sparkles drifting up around the target
      for (let s = 0; s < 3; s++) {
        const sp = (phase * 0.7 + s / 3) % 1;
        const sx = bx + Math.sin((s * 2.1 + phase) * 1.7) * 7;
        const sy = by - sp * 18;
        g.circle(sx, sy, 1.2).fill({ color: 0xf4eedd, alpha: 1 - sp });
      }
    }
  }
}

/** Projectile silhouettes (no atlas frames exist for projectiles — drawn shapes). */
function drawProjectileShape(gfx: Graphics, kind: ProjectileKind): void {
  switch (kind) {
    case 'arrow':
      gfx.moveTo(-5, 0).lineTo(3, 0).stroke({ width: 1.5, color: 0x8a6a42 });
      gfx.moveTo(3, 0).lineTo(5.5, 0).stroke({ width: 2, color: 0xd8d0c0 });
      gfx.moveTo(-5, -1).lineTo(-3.5, 0).lineTo(-5, 1).stroke({ width: 1, color: 0xb99a6b });
      break;
    case 'bolt':
      gfx.moveTo(-3.5, 0).lineTo(2.5, 0).stroke({ width: 2, color: 0x555a62 });
      gfx.moveTo(2.5, 0).lineTo(4.5, 0).stroke({ width: 2.5, color: 0xc9ccd2 });
      break;
    case 'stone':
      gfx.circle(0, 0, 3.5).fill(0x76715f).stroke({ width: 1, color: 0x3a382e });
      break;
  }
}
