// DEV-ONLY mock simulation implementing the @bf/sim Game interface (types.ts)
// so the renderer can be built/tested standalone while the real sim lands in
// parallel. Flat-ish grass map, straight-line movement, basic train/build/
// gather/attack behaviors — NOT deterministic, NOT balanced, NOT the real rules.
// simBridge.ts swaps this for the real createGame via USE_MOCK.

import {
  FP, GAIA, TICKS_PER_SECOND,
  type Command, type Entity, type EntityId, type Fixed, type Game, type GameConfig,
  type GameMap, type GameState, type PlayerId, type PlayerState, type ProductionSpeed, type SimEvent,
  type Stockpile, type TerrainId,
} from '@bf/sim/types';
import { gameData } from '@bf/data';
import { facingFromDelta } from '../frames';

type Order =
  | { type: 'move'; x: Fixed; y: Fixed; attackMove?: boolean }
  | { type: 'attack'; targetId: EntityId }
  | { type: 'gather'; targetId: EntityId }
  | { type: 'build'; targetId: EntityId };

const TERRAIN_IDS: readonly TerrainId[] = ['grass', 'dirt', 'water', 'road'];
const T_GRASS = 0, T_DIRT = 1, T_WATER = 2, T_ROAD = 3;

const DYING_TICKS = 30;

function defOf(defId: string) {
  return gameData.units[defId] ?? null;
}

function costOf(defId: string): Partial<Stockpile> {
  return gameData.units[defId]?.cost ?? gameData.buildings[defId]?.cost ?? {};
}

class MockGame implements Game {
  private st: {
    tick: number;
    map: GameMap;
    entities: Map<EntityId, Entity>;
    players: PlayerState[];
    refs: Map<string, EntityId>;
    finished: boolean;
    productionSpeed: ProductionSpeed;
  };

  private nextId = 1;
  private orders = new Map<EntityId, Order>();
  private buildFloat = new Map<EntityId, number>();
  private cooldown = new Map<EntityId, number>();
  private dyingUntil = new Map<EntityId, number>();
  private occ: Uint8Array; // buildings + resource objects footprint
  private rand: () => number;

  constructor(private config: GameConfig) {
    const gen = config.map;
    const width = gen.type === 'practice-random' ? gen.width : gen.map.width;
    const height = gen.type === 'practice-random' ? gen.height : gen.map.height;
    let s = (config.seed >>> 0) || 1;
    this.rand = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0x100000000;
    };

    const terrain = new Uint8Array(width * height).fill(T_GRASS);
    const map: GameMap = { width, height, terrain, terrainIds: TERRAIN_IDS };
    this.occ = new Uint8Array(width * height);

    const players: PlayerState[] = [
      this.mkPlayer(0, 'Gaia', 'scots', 6, false, width * height),
    ];
    config.players.forEach((setup, i) => {
      const p = this.mkPlayer(i + 1, setup.name, setup.civ, setup.color, setup.isHuman, width * height);
      p.setup = { ...setup };
      if (setup.startingResources) Object.assign(p.stockpile, setup.startingResources);
      players.push(p);
    });

    this.st = {
      tick: 0, map, entities: new Map(), players, refs: new Map(), finished: false,
      productionSpeed: config.productionSpeed ?? 2,
    };

    // terrain decor: dirt patches, a lake, a road
    for (let i = 0; i < 14; i++) this.blob(terrain, width, height, T_DIRT, 2 + Math.floor(this.rand() * 4));
    this.blob(terrain, width, height, T_WATER, 7, Math.floor(width * 0.12), Math.floor(height * 0.7));
    for (let x = Math.floor(width * 0.25); x < width * 0.72; x++) {
      const y = Math.floor(height * 0.5 + Math.sin(x / 9) * 3);
      terrain[y * width + x] = T_ROAD;
    }

    // starting bases
    const bases: Array<[number, number]> = [
      [Math.floor(width * 0.62), Math.floor(height * 0.66)],
      [Math.floor(width * 0.3), Math.floor(height * 0.26)],
    ];
    config.players.forEach((_, i) => {
      const [bx, by] = bases[i % bases.length];
      const pid = i + 1;
      this.spawnBuilding('townCenter', pid, bx - 2, by - 2, 1000);
      this.spawnBuilding('house', pid, bx + 4, by + 2, 1000);
      this.spawnBuilding('house', pid, bx - 6, by - 3, 1000);
      for (let v = 0; v < 6; v++) {
        this.spawnUnit('villager', pid, bx - 3 + v, by + 3);
      }
      for (let m = 0; m < 3; m++) {
        this.spawnUnit('militia', pid, bx + 3 + m, by - 1);
      }
      // nearby resources
      this.cluster('tree', bx - 9, by - 7, 10, 3);
      this.cluster('goldMine', bx + 7, by + 5, 4, 1.4);
      this.cluster('berryBush', bx - 6, by + 6, 5, 1.6);
    });
    // neutral middle resources + forests
    this.cluster('tree', Math.floor(width * 0.48), Math.floor(height * 0.42), 16, 4);
    this.cluster('stoneMine', Math.floor(width * 0.5), Math.floor(height * 0.58), 4, 1.4);
    for (let i = 0; i < 4; i++) {
      this.spawnUnit('sheep', GAIA, Math.floor(width * 0.45 + this.rand() * 8), Math.floor(height * 0.5 + this.rand() * 8));
    }
    this.recomputeVisibility();
    this.recomputePop();
  }

  get state(): GameState {
    return this.st as unknown as GameState;
  }

  hash(): number {
    let h = 2166136261;
    for (const e of this.st.entities.values()) {
      h = Math.imul(h ^ e.id, 16777619);
      h = Math.imul(h ^ e.x, 16777619);
      h = Math.imul(h ^ e.y, 16777619);
      h = Math.imul(h ^ e.hp, 16777619);
    }
    return (h ^ this.st.tick) >>> 0;
  }

  /** Dev mock has no persistence: an unloadable stub (schemaVersion -1 is always rejected). */
  serialize(): { schemaVersion: number } {
    return { schemaVersion: -1 };
  }

  canPlace(player: PlayerId, defId: string, tileX: number, tileY: number): boolean {
    const def = gameData.buildings[defId];
    if (!def) return false;
    const { map } = this.st;
    for (let dy = 0; dy < def.size; dy++) {
      for (let dx = 0; dx < def.size; dx++) {
        const x = tileX + dx;
        const y = tileY + dy;
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
        const t = map.terrain[y * map.width + x];
        if (t === T_WATER) return false;
        if (this.occ[y * map.width + x]) return false;
      }
    }
    return true;
  }

  isWalkable(tileX: number, tileY: number): boolean {
    const { map } = this.st;
    if (tileX < 0 || tileY < 0 || tileX >= map.width || tileY >= map.height) return false;
    if (map.terrain[tileY * map.width + tileX] === T_WATER) return false;
    return !this.occ[tileY * map.width + tileX];
  }

  advance(commands: Command[]): SimEvent[] {
    const events: SimEvent[] = [];
    this.st.tick++;
    for (const cmd of commands) this.applyCommand(cmd, events);
    this.stepUnits(events);
    this.stepProduction(events);
    this.stepConstruction(events);
    this.reapDead();
    if (this.st.tick % 5 === 0) this.recomputeVisibility();
    this.recomputePop();
    return events;
  }

  // ---------------------------------------------------------------- commands

  private applyCommand(cmd: Command, events: SimEvent[]): void {
    switch (cmd.kind) {
      case 'move':
      case 'attackMove': {
        for (const id of cmd.units) {
          const e = this.ownUnit(cmd.player, id);
          if (!e) continue;
          this.orders.set(id, { type: 'move', x: cmd.x, y: cmd.y, attackMove: cmd.kind === 'attackMove' });
          e.activity = 'moving';
          e.targetId = undefined;
        }
        break;
      }
      case 'attack': {
        for (const id of cmd.units) {
          const e = this.ownUnit(cmd.player, id);
          if (!e || !this.st.entities.has(cmd.targetId)) continue;
          this.orders.set(id, { type: 'attack', targetId: cmd.targetId });
          e.targetId = cmd.targetId;
        }
        break;
      }
      case 'gather': {
        for (const id of cmd.units) {
          const e = this.ownUnit(cmd.player, id);
          const target = this.st.entities.get(cmd.targetId);
          if (!e || e.defId !== 'villager' || !target) continue;
          this.orders.set(id, { type: 'gather', targetId: cmd.targetId });
          e.targetId = cmd.targetId;
        }
        break;
      }
      case 'repair':
      case 'build': {
        let targetId: EntityId | undefined;
        if (cmd.kind === 'build') {
          if (!this.canPlace(cmd.player, cmd.defId, cmd.tileX, cmd.tileY)) return;
          const player = this.st.players[cmd.player];
          if (!player || !this.pay(player, costOf(cmd.defId))) return;
          const b = this.spawnBuilding(cmd.defId, cmd.player, cmd.tileX, cmd.tileY, 0);
          events.push({ kind: 'buildingPlaced', id: b.id, defId: cmd.defId, player: cmd.player });
          targetId = b.id;
        } else {
          targetId = cmd.targetId;
        }
        if (targetId === undefined) return;
        for (const id of cmd.units) {
          const e = this.ownUnit(cmd.player, id);
          if (!e || e.defId !== 'villager') continue;
          this.orders.set(id, { type: 'build', targetId });
          e.targetId = targetId;
        }
        break;
      }
      case 'train': {
        const b = this.ownBuilding(cmd.player, cmd.buildingId);
        const def = gameData.units[cmd.defId];
        const player = this.st.players[cmd.player];
        if (!b || !def || !player || (b.buildProgress ?? 1000) < 1000) return;
        b.trainQueue ??= [];
        if (b.trainQueue.length >= 5) return;
        if (player.pop + (def.pop ?? 1) > player.popCap) return;
        if (!this.pay(player, def.cost)) return;
        const totalTicks = Math.max(1, Math.round(def.trainTime * TICKS_PER_SECOND));
        b.trainQueue.push({ defId: cmd.defId, ticksLeft: totalTicks, totalTicks });
        break;
      }
      case 'cancelTrain': {
        const b = this.ownBuilding(cmd.player, cmd.buildingId);
        const player = this.st.players[cmd.player];
        if (!b || !player || !b.trainQueue || !b.trainQueue[cmd.index]) return;
        const [removed] = b.trainQueue.splice(cmd.index, 1);
        this.refund(player, costOf(removed.defId));
        break;
      }
      case 'setRally': {
        const b = this.ownBuilding(cmd.player, cmd.buildingId);
        if (!b) return;
        b.rally = { x: cmd.x, y: cmd.y, targetId: cmd.targetId };
        break;
      }
      case 'stop': {
        for (const id of cmd.units) {
          const e = this.ownUnit(cmd.player, id);
          if (!e) continue;
          this.orders.delete(id);
          e.activity = 'idle';
          e.targetId = undefined;
        }
        break;
      }
      case 'deleteEntity': {
        const e = this.st.entities.get(cmd.entityId);
        if (e && e.player === cmd.player && e.activity !== 'dying') this.kill(e, events);
        break;
      }
      case 'resign': {
        // enough of the GDD defeat flow for the HUD end screens to be testable
        // standalone: mark defeated, destroy holdings, declare the survivors
        const p = this.st.players[cmd.player];
        if (!p || p.defeated) return;
        p.defeated = true;
        for (const e of [...this.st.entities.values()]) {
          if (e.player === cmd.player && e.activity !== 'dying') this.kill(e, events);
        }
        events.push({ kind: 'playerDefeated', player: cmd.player });
        const alive = this.st.players.filter((pl) => pl.id !== GAIA && !pl.defeated).map((pl) => pl.id);
        if (alive.length <= 1) {
          this.st.finished = true;
          events.push({ kind: 'victory', winners: alive });
        }
        break;
      }
      case 'setProductionSpeed':
        if (this.st.players[cmd.player]?.setup.isHuman) this.st.productionSpeed = cmd.multiplier;
        break;
      default:
        // research/garrison/convert/heal/marketTrade: not simulated in the mock
        break;
    }
  }

  // ------------------------------------------------------------------ steps

  private stepUnits(events: SimEvent[]): void {
    for (const e of this.st.entities.values()) {
      if (e.kind !== 'unit' || e.activity === 'dying') continue;
      const order = this.orders.get(e.id);
      if (!order) continue;
      const def = defOf(e.defId);
      if (!def) continue;
      const stepFx = Math.max(1, Math.round((def.speed * FP) / TICKS_PER_SECOND));

      if (order.type === 'move') {
        if (this.walkToward(e, order.x, order.y, stepFx)) {
          this.orders.delete(e.id);
          e.activity = 'idle';
        } else {
          e.activity = 'moving';
        }
      } else if (order.type === 'attack') {
        const target = this.st.entities.get(order.targetId);
        if (!target || target.activity === 'dying') {
          this.orders.delete(e.id);
          e.activity = 'idle';
          e.targetId = undefined;
          continue;
        }
        const rangeFx = Math.round(((def.range || 0.2) + 0.9 + this.radiusOf(target)) * FP);
        if (this.distFx(e, target) > rangeFx) {
          this.walkToward(e, target.x, target.y, stepFx);
          e.activity = 'moving';
        } else {
          e.activity = 'attacking';
          e.facing = facingFromDelta((target.x - e.x) / FP, (target.y - e.y) / FP, e.facing);
          const cd = this.cooldown.get(e.id) ?? 0;
          if (this.st.tick >= cd) {
            this.cooldown.set(e.id, this.st.tick + Math.max(1, Math.round(def.rof * TICKS_PER_SECOND)));
            const atk = def.attacks[0]?.amount ?? 1;
            const armor = 0;
            const dmg = Math.max(1, atk - armor);
            target.hp -= dmg;
            events.push({ kind: 'attackImpact', attackerId: e.id, targetId: target.id, damage: dmg, melee: (def.range ?? 0) === 0 });
            if ((def.range ?? 0) > 0) {
              events.push({
                kind: 'projectileFired', fromId: e.id, targetId: target.id,
                x0: e.x, y0: e.y - FP, x1: target.x, y1: target.y,
                flightTicks: Math.max(2, Math.round(this.distFx(e, target) / FP / (def.projectileSpeed ?? 6) * TICKS_PER_SECOND)),
                arc: 'flat', hit: true,
              });
            }
            if (target.hp <= 0) this.kill(target, events);
          }
        }
      } else if (order.type === 'gather') {
        const target = this.st.entities.get(order.targetId);
        if (!target || (target.amountLeft ?? 0) <= 0) {
          this.orders.delete(e.id);
          e.activity = 'idle';
          continue;
        }
        const rangeFx = Math.round((0.9 + this.radiusOf(target)) * FP);
        if (this.distFx(e, target) > rangeFx) {
          this.walkToward(e, target.x, target.y, stepFx);
          e.activity = 'moving';
        } else {
          e.activity = 'gathering';
          e.facing = facingFromDelta((target.x - e.x) / FP, (target.y - e.y) / FP, e.facing);
          if (this.st.tick % 40 === 0 && target.amountLeft !== undefined) {
            target.amountLeft = Math.max(0, target.amountLeft - 4 * this.st.productionSpeed);
            if (target.amountLeft <= 0 && target.resourceType) {
              events.push({ kind: 'resourceDepleted', id: target.id, resourceType: target.resourceType });
              this.removeEntity(target);
            }
          }
        }
      } else if (order.type === 'build') {
        const target = this.st.entities.get(order.targetId);
        if (!target || (target.buildProgress ?? 1000) >= 1000) {
          this.orders.delete(e.id);
          e.activity = 'idle';
          continue;
        }
        const rangeFx = Math.round((1.0 + this.radiusOf(target)) * FP);
        if (this.distFx(e, target) > rangeFx) {
          this.walkToward(e, target.x, target.y, stepFx);
          e.activity = 'moving';
        } else {
          e.activity = 'building';
          e.facing = facingFromDelta((target.x - e.x) / FP, (target.y - e.y) / FP, e.facing);
          const def = gameData.buildings[target.defId];
          const totalTicks = Math.max(1, (def?.buildTime ?? 30) * TICKS_PER_SECOND);
          const cur = this.buildFloat.get(target.id) ?? target.buildProgress ?? 0;
          this.buildFloat.set(target.id, cur + (1000 * this.st.productionSpeed) / totalTicks);
        }
      }
    }
  }

  private stepProduction(events: SimEvent[]): void {
    for (const e of this.st.entities.values()) {
      if (e.kind !== 'building' || !e.trainQueue?.length || (e.buildProgress ?? 1000) < 1000) continue;
      const head = e.trainQueue[0];
      head.ticksLeft -= this.st.productionSpeed;
      if (head.ticksLeft <= 0) {
        e.trainQueue.shift();
        const def = gameData.buildings[e.defId];
        const size = def?.size ?? 2;
        const u = this.spawnUnit(head.defId, e.player, e.tileX + Math.floor(size / 2), e.tileY + size);
        events.push({ kind: 'unitTrained', id: u.id, defId: head.defId, player: e.player, buildingId: e.id });
        events.push({ kind: 'entitySpawned', id: u.id, defId: head.defId, player: e.player });
        if (e.rally) {
          this.orders.set(u.id, { type: 'move', x: e.rally.x, y: e.rally.y });
          u.activity = 'moving';
        }
      }
    }
  }

  private stepConstruction(events: SimEvent[]): void {
    for (const [id, progress] of this.buildFloat) {
      const e = this.st.entities.get(id);
      if (!e) {
        this.buildFloat.delete(id);
        continue;
      }
      const was = e.buildProgress ?? 0;
      e.buildProgress = Math.min(1000, Math.floor(progress));
      if (was < 1000 && e.buildProgress >= 1000) {
        events.push({ kind: 'buildingComplete', id: e.id, defId: e.defId, player: e.player });
        this.buildFloat.delete(id);
      }
    }
  }

  private reapDead(): void {
    for (const [id, until] of this.dyingUntil) {
      if (this.st.tick >= until) {
        const e = this.st.entities.get(id);
        if (e) this.removeEntity(e);
        this.dyingUntil.delete(id);
      }
    }
  }

  // ---------------------------------------------------------------- helpers

  private mkPlayer(id: number, name: string, civ: string, color: number, isHuman: boolean, tiles: number): PlayerState {
    return {
      id,
      setup: { name, civ, team: 0, isHuman, color },
      stockpile: { food: 200, wood: 200, gold: 100, stone: 200 },
      age: 'dark',
      pop: 0,
      popCap: 0,
      researchedTechs: [],
      defeated: false,
      visibility: new Uint8Array(tiles),
    };
  }

  private ownUnit(player: PlayerId, id: EntityId): Entity | null {
    const e = this.st.entities.get(id);
    return e && e.kind === 'unit' && e.player === player && e.activity !== 'dying' ? e : null;
  }

  private ownBuilding(player: PlayerId, id: EntityId): Entity | null {
    const e = this.st.entities.get(id);
    return e && e.kind === 'building' && e.player === player ? e : null;
  }

  private pay(player: PlayerState, cost: Partial<Stockpile>): boolean {
    for (const [res, amt] of Object.entries(cost)) {
      if ((player.stockpile[res as keyof Stockpile] ?? 0) < (amt ?? 0)) return false;
    }
    for (const [res, amt] of Object.entries(cost)) {
      player.stockpile[res as keyof Stockpile] -= amt ?? 0;
    }
    return true;
  }

  private refund(player: PlayerState, cost: Partial<Stockpile>): void {
    for (const [res, amt] of Object.entries(cost)) {
      player.stockpile[res as keyof Stockpile] += amt ?? 0;
    }
  }

  private distFx(a: Entity, b: Entity): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private radiusOf(e: Entity): number {
    if (e.kind === 'building') return (gameData.buildings[e.defId]?.size ?? 1) / 2;
    return 0.3;
  }

  /** Step toward (tx, ty); returns true when arrived. */
  private walkToward(e: Entity, tx: Fixed, ty: Fixed, stepFx: number): boolean {
    const dx = tx - e.x;
    const dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d <= stepFx) {
      e.x = tx;
      e.y = ty;
      this.syncTile(e);
      return true;
    }
    e.x += Math.round((dx / d) * stepFx);
    e.y += Math.round((dy / d) * stepFx);
    e.facing = facingFromDelta(dx / FP, dy / FP, e.facing);
    this.syncTile(e);
    return false;
  }

  private syncTile(e: Entity): void {
    e.tileX = Math.floor(e.x / FP);
    e.tileY = Math.floor(e.y / FP);
  }

  private spawnUnit(defId: string, player: PlayerId, tileX: number, tileY: number): Entity {
    const def = gameData.units[defId];
    const e: Entity = {
      id: this.nextId++,
      kind: 'unit',
      defId,
      player,
      x: tileX * FP + FP / 2,
      y: tileY * FP + FP / 2,
      tileX, tileY,
      facing: Math.floor(this.rand() * 8),
      hp: def?.hp ?? 25,
      maxHp: def?.hp ?? 25,
      activity: 'idle',
    };
    this.st.entities.set(e.id, e);
    return e;
  }

  private spawnBuilding(defId: string, player: PlayerId, tileX: number, tileY: number, progress: number): Entity {
    const def = gameData.buildings[defId];
    const size = def?.size ?? 2;
    const e: Entity = {
      id: this.nextId++,
      kind: 'building',
      defId,
      player,
      x: (tileX + size / 2) * FP,
      y: (tileY + size / 2) * FP,
      tileX, tileY,
      facing: 0,
      hp: def?.hp ?? 500,
      maxHp: def?.hp ?? 500,
      activity: 'idle',
      buildProgress: progress,
      trainQueue: def?.trains ? [] : undefined,
    };
    if (defId === 'farm') {
      e.amountLeft = def?.providesFood ?? 175;
      e.resourceType = 'food';
    }
    this.st.entities.set(e.id, e);
    this.stampOcc(tileX, tileY, size, 1);
    return e;
  }

  private spawnResource(defId: string, tileX: number, tileY: number): Entity | null {
    const def = gameData.resources[defId];
    if (!def) return null;
    if (!this.isWalkable(tileX, tileY)) return null;
    const e: Entity = {
      id: this.nextId++,
      kind: 'resource',
      defId,
      player: GAIA,
      x: tileX * FP + FP / 2,
      y: tileY * FP + FP / 2,
      tileX, tileY,
      facing: 0,
      hp: def.hp ?? 1,
      maxHp: def.hp ?? 1,
      activity: 'idle',
      amountLeft: def.amount,
      resourceType: def.resourceType,
    };
    this.st.entities.set(e.id, e);
    this.stampOcc(tileX, tileY, 1, 1);
    return e;
  }

  private cluster(defId: string, cx: number, cy: number, count: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      const x = Math.round(cx + (this.rand() - 0.5) * spread * 2.5);
      const y = Math.round(cy + (this.rand() - 0.5) * spread * 2.5);
      this.spawnResource(defId, x, y);
    }
  }

  private blob(terrain: Uint8Array, w: number, h: number, t: number, r: number, cx?: number, cy?: number): void {
    const x0 = cx ?? Math.floor(this.rand() * w);
    const y0 = cy ?? Math.floor(this.rand() * h);
    for (let y = Math.max(0, y0 - r); y <= Math.min(h - 1, y0 + r); y++) {
      for (let x = Math.max(0, x0 - r); x <= Math.min(w - 1, x0 + r); x++) {
        if ((x - x0) ** 2 + (y - y0) ** 2 <= r * r) terrain[y * w + x] = t;
      }
    }
  }

  private stampOcc(tileX: number, tileY: number, size: number, v: number): void {
    const { map } = this.st;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const x = tileX + dx;
        const y = tileY + dy;
        if (x >= 0 && y >= 0 && x < map.width && y < map.height) {
          this.occ[y * map.width + x] = v;
        }
      }
    }
  }

  private kill(e: Entity, events: SimEvent[]): void {
    e.hp = 0;
    events.push({ kind: 'entityDied', id: e.id, defId: e.defId, player: e.player, x: e.x, y: e.y });
    if (e.kind === 'unit') {
      e.activity = 'dying';
      this.orders.delete(e.id);
      this.dyingUntil.set(e.id, this.st.tick + DYING_TICKS);
    } else {
      this.removeEntity(e);
    }
  }

  private removeEntity(e: Entity): void {
    if (e.kind === 'building' || e.kind === 'resource') {
      const size = e.kind === 'building' ? gameData.buildings[e.defId]?.size ?? 1 : 1;
      this.stampOcc(e.tileX, e.tileY, size, 0);
    }
    this.st.entities.delete(e.id);
    this.orders.delete(e.id);
    this.buildFloat.delete(e.id);
    this.cooldown.delete(e.id);
  }

  private recomputePop(): void {
    for (const p of this.st.players) {
      if (p.id === 0) continue;
      let pop = 0;
      let provided = 0;
      for (const e of this.st.entities.values()) {
        if (e.player !== p.id) continue;
        if (e.kind === 'unit' && e.activity !== 'dying') pop += gameData.units[e.defId]?.pop ?? 1;
        if (e.kind === 'building' && (e.buildProgress ?? 1000) >= 1000) {
          provided += gameData.buildings[e.defId]?.popProvided ?? 0;
        }
      }
      p.pop = pop;
      p.popCap = Math.min(this.config.popCap, provided);
    }
  }

  private recomputeVisibility(): void {
    const { map } = this.st;
    for (const p of this.st.players) {
      if (p.id === 0) continue;
      const vis = p.visibility;
      for (let i = 0; i < vis.length; i++) if (vis[i] === 2) vis[i] = 1;
      for (const e of this.st.entities.values()) {
        if (e.player !== p.id || e.activity === 'dying') continue;
        const los = Math.ceil(
          (e.kind === 'unit' ? gameData.units[e.defId]?.los : gameData.buildings[e.defId]?.los) ?? 4,
        );
        const r2 = los * los;
        for (let dy = -los; dy <= los; dy++) {
          const y = e.tileY + dy;
          if (y < 0 || y >= map.height) continue;
          for (let dx = -los; dx <= los; dx++) {
            const x = e.tileX + dx;
            if (x < 0 || x >= map.width) continue;
            if (dx * dx + dy * dy <= r2) vis[y * map.width + x] = 2;
          }
        }
      }
    }
  }
}

export function createMockGame(config: GameConfig): Game {
  return new MockGame(config);
}
