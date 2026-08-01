// ScenarioDef -> { start: ScenarioStart, meta } resolver with hard validation.
// Every failure is collected and thrown as one ScenarioValidationError whose messages
// pinpoint the offending row/coordinate/trigger. Depends only on @bf/sim/types and @bf/data.

import type {
  AgeId, GameMap, PlayerSetup, ScenarioStart, TerrainId,
} from '@bf/sim/types';
import { AGES } from '@bf/sim/types';
import type { GameData } from '@bf/data';
import { gameData } from '@bf/data';
import type {
  Condition, MapToken, Rect, ScenarioDef, ScenarioEntity, ScenarioPlayer, TriggerEffect,
} from './schema';

export class ScenarioValidationError extends Error {
  readonly errors: string[];
  constructor(scenarioId: string, errors: string[]) {
    super(
      `scenario '${scenarioId}': ${errors.length} validation error(s):\n` +
      errors.map((e) => `  - ${e}`).join('\n'),
    );
    this.name = 'ScenarioValidationError';
    this.errors = errors;
  }
}

/** Map-token gaia objects -> def ids in @bf/data (resources + units). */
export const OBJECT_DEF_IDS: Record<NonNullable<MapToken['object']>, string> = {
  tree: 'tree',
  gold: 'goldMine',
  stone: 'stoneMine',
  berries: 'berryBush',
  deer: 'deer',
  sheep: 'sheep',
  wolf: 'wolf',
};

const VALID_TERRAINS: readonly TerrainId[] = [
  'grass', 'dirt', 'sand', 'water', 'shallows', 'road', 'farmland', 'snow',
];

export interface ScenarioMeta {
  id: string;
  campaign: string;
  index: number;
  title: string;
  briefing: ScenarioDef['briefing'];
  players: ScenarioPlayer[];
  /** ScenarioPlayer[] pre-mapped onto sim PlayerSetup (index + 1 = PlayerId).
   *  Per-player popCaps ride along (PlayerSetup.popCap) — the sim min's them
   *  with the global GameConfig.popCap in recomputePopCap. */
  playerSetups: PlayerSetup[];
  startCamera: { x: number; y: number };
  maxAge?: AgeId;
  /** Highest per-player popCap — the global GameConfig.popCap ceiling; the
   *  per-player caps in playerSetups tighten it per seat. */
  popCap: number;
}

export interface LoadedScenario {
  start: ScenarioStart;
  meta: ScenarioMeta;
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

function defSize(data: GameData, defId: string): number {
  return data.buildings[defId]?.size ?? 1;
}

function defExists(data: GameData, defId: string): boolean {
  return defId in data.units || defId in data.buildings || defId in data.resources;
}

/** Resolve a ScenarioDef into a sim-ready ScenarioStart + host metadata. Throws on any invalid input. */
export function loadScenario(def: ScenarioDef, data: GameData = gameData): LoadedScenario {
  const errors: string[] = [];
  const err = (msg: string) => { errors.push(msg); };

  const { map } = def;
  const width = map.width;
  const height = map.height;

  // ---------- map dimensions ----------
  if (!isInt(width) || width < 1) err(`map: width ${width} is not a positive integer`);
  if (!isInt(height) || height < 1) err(`map: height ${height} is not a positive integer`);
  if (map.rows.length !== height) {
    err(`map: ${map.rows.length} rows provided but height is ${height}`);
  }

  // ---------- legend ----------
  const legendChars = Object.keys(map.legend);
  for (const ch of legendChars) {
    if (ch.length !== 1) err(`map legend '${ch}': keys must be single characters`);
    const token = map.legend[ch];
    if (!VALID_TERRAINS.includes(token.terrain)) {
      err(`map legend '${ch}': unknown terrain '${token.terrain}'`);
    }
    if (token.object !== undefined) {
      const objDef = OBJECT_DEF_IDS[token.object];
      if (objDef === undefined) {
        err(`map legend '${ch}': unknown object '${token.object}'`);
      } else if (!defExists(data, objDef)) {
        err(`map legend '${ch}': object '${token.object}' -> def '${objDef}' missing from game data`);
      }
    }
  }

  // ---------- rows -> terrain grid + auto gaia objects ----------
  // terrainIds: deduped legend terrains in legend-declaration order (stable, deterministic).
  const terrainIds: TerrainId[] = [];
  for (const ch of legendChars) {
    const t = map.legend[ch].terrain;
    if (VALID_TERRAINS.includes(t) && !terrainIds.includes(t)) terrainIds.push(t);
  }
  const terrainIndex = new Map<TerrainId, number>(terrainIds.map((t, i) => [t, i]));

  const terrain = new Uint8Array(Math.max(0, width * height));
  const gaiaObjects: ScenarioStart['entities'] = [];
  const rowCount = Math.min(map.rows.length, height);
  for (let y = 0; y < rowCount; y++) {
    const row = map.rows[y];
    if (row.length !== width) {
      err(`map row ${y}: length ${row.length} != width ${width}`);
      continue;
    }
    for (let x = 0; x < width; x++) {
      const ch = row[x];
      const token = map.legend[ch];
      if (token === undefined) {
        err(`map row ${y}, col ${x} (x=${x}, y=${y}): char '${ch}' is not in the legend`);
        continue;
      }
      const ti = terrainIndex.get(token.terrain);
      if (ti !== undefined) terrain[y * width + x] = ti;
      if (token.object !== undefined && OBJECT_DEF_IDS[token.object] !== undefined) {
        gaiaObjects.push({ defId: OBJECT_DEF_IDS[token.object], player: 0, tileX: x, tileY: y });
      }
    }
  }

  // ---------- players ----------
  if (def.players.length < 1) err('players: at least one player is required');
  def.players.forEach((p, i) => {
    const where = `players[${i}] '${p.name}'`;
    if (!(p.civ in data.civs)) err(`${where}: unknown civ '${p.civ}'`);
    if (!AGES.includes(p.age)) err(`${where}: unknown age '${p.age}'`);
    if (!isInt(p.color) || p.color < 0 || p.color > 7) err(`${where}: color ${p.color} out of range 0..7`);
    if (p.popCap !== undefined && (!isInt(p.popCap) || p.popCap < 1)) {
      err(`${where}: popCap ${p.popCap} is not a positive integer`);
    }
    for (const [k, v] of Object.entries(p.resources)) {
      if (!isInt(v) || v < 0) err(`${where}: resource ${k}=${v} must be a non-negative integer`);
    }
  });
  const playerCount = def.players.length;
  const validPlayer = (p: number) => isInt(p) && p >= 0 && p <= playerCount;
  const playerRange = `0..${playerCount} (0 = gaia)`;

  if (def.maxAge !== undefined && !AGES.includes(def.maxAge)) {
    err(`maxAge: unknown age '${def.maxAge}'`);
  }

  // ---------- shared helpers ----------
  const inBounds = (x: number, y: number) => isInt(x) && isInt(y) && x >= 0 && y >= 0 && x < width && y < height;
  const checkRect = (where: string, r: Rect) => {
    if (!isInt(r.x) || !isInt(r.y) || !isInt(r.w) || !isInt(r.h) || r.w < 1 || r.h < 1
      || r.x < 0 || r.y < 0 || r.x + r.w > width || r.y + r.h > height) {
      err(`${where}: area {x:${r.x}, y:${r.y}, w:${r.w}, h:${r.h}} is not a valid rect inside the ${width}x${height} map`);
    }
  };
  const checkDefIds = (where: string, defIds: string[]) => {
    for (const id of defIds) if (!defExists(data, id)) err(`${where}: unknown def '${id}'`);
  };
  const checkEntity = (where: string, e: ScenarioEntity) => {
    const label = e.ref !== undefined ? `${where} (ref '${e.ref}')` : where;
    if (!defExists(data, e.def)) err(`${label}: unknown def '${e.def}'`);
    if (!validPlayer(e.player)) err(`${label}: player ${e.player} out of range ${playerRange}`);
    if (!inBounds(e.x, e.y)) {
      err(`${label} '${e.def}' at (${e.x}, ${e.y}): out of map bounds ${width}x${height}`);
    } else {
      const size = defSize(data, e.def);
      if (e.x + size > width || e.y + size > height) {
        err(`${label} '${e.def}' at (${e.x}, ${e.y}): footprint ${size}x${size} exceeds map bounds ${width}x${height}`);
      }
    }
    if (e.hp !== undefined && (!isInt(e.hp) || e.hp < 1)) err(`${label}: hp ${e.hp} must be a positive integer`);
    if (e.amountLeft !== undefined && (!isInt(e.amountLeft) || e.amountLeft < 0)) {
      err(`${label}: amountLeft ${e.amountLeft} must be a non-negative integer`);
    }
    if (e.facing !== undefined && (!isInt(e.facing) || e.facing < 0 || e.facing > 7)) {
      err(`${label}: facing ${e.facing} out of range 0..7`);
    }
  };

  // ---------- entities (initial placements) ----------
  const refs = new Set<string>();
  const addRef = (where: string, ref: string) => {
    if (refs.has(ref)) err(`${where}: duplicate ref '${ref}'`);
    else refs.add(ref);
  };
  def.entities.forEach((e, i) => {
    checkEntity(`entities[${i}]`, e);
    if (e.ref !== undefined) addRef(`entities[${i}]`, e.ref);
  });

  // Spawn-effect refs join the ref universe (they exist once their trigger fires).
  def.triggers.forEach((t) => {
    t.effects.forEach((fx, fi) => {
      if (fx.kind !== 'spawn') return;
      fx.entities.forEach((e, ei) => {
        if (e.ref !== undefined) addRef(`trigger '${t.id}' effect[${fi}] spawn[${ei}]`, e.ref);
      });
    });
  });

  // ---------- triggers ----------
  const triggerIds = new Set<string>();
  for (const t of def.triggers) {
    if (triggerIds.has(t.id)) err(`trigger '${t.id}': duplicate trigger id`);
    else triggerIds.add(t.id);
  }
  // Objective universe: every id that some objectiveAdd can introduce.
  const objectiveIds = new Set<string>();
  for (const t of def.triggers) {
    for (const fx of t.effects) if (fx.kind === 'objectiveAdd') objectiveIds.add(fx.id);
  }
  const checkObjective = (where: string, id: string) => {
    if (!objectiveIds.has(id)) err(`${where}: objective '${id}' is never added by any objectiveAdd effect`);
  };
  const checkTriggerRef = (where: string, id: string) => {
    if (!triggerIds.has(id)) err(`${where}: unknown trigger '${id}'`);
  };
  const checkEntityRef = (where: string, ref: string) => {
    if (!refs.has(ref)) err(`${where}: unknown entity ref '${ref}'`);
  };

  const checkCondition = (where: string, c: Condition) => {
    switch (c.kind) {
      case 'always':
        break;
      case 'timerSeconds':
        if (typeof c.seconds !== 'number' || !Number.isFinite(c.seconds) || c.seconds < 0) {
          err(`${where}: timerSeconds ${c.seconds} must be >= 0`);
        }
        break;
      case 'entitiesInArea':
        if (c.player !== undefined && !validPlayer(c.player)) err(`${where}: player ${c.player} out of range ${playerRange}`);
        if (c.defIds !== undefined) checkDefIds(where, c.defIds);
        checkRect(where, c.area);
        if (c.atLeast === undefined && c.atMost === undefined) {
          err(`${where}: entitiesInArea needs atLeast and/or atMost`);
        }
        break;
      case 'refDestroyed':
        checkEntityRef(where, c.ref);
        break;
      case 'refsDestroyed':
        if (c.refs.length === 0) err(`${where}: refsDestroyed needs at least one ref`);
        for (const r of c.refs) checkEntityRef(where, r);
        break;
      case 'playerDefeated':
        if (!validPlayer(c.player) || c.player === 0) err(`${where}: player ${c.player} out of range 1..${playerCount}`);
        break;
      case 'researched':
        if (!validPlayer(c.player) || c.player === 0) err(`${where}: player ${c.player} out of range 1..${playerCount}`);
        if (!(c.techId in data.techs)) err(`${where}: unknown tech '${c.techId}'`);
        break;
      case 'ageReached':
        if (!validPlayer(c.player) || c.player === 0) err(`${where}: player ${c.player} out of range 1..${playerCount}`);
        if (!AGES.includes(c.age)) err(`${where}: unknown age '${c.age}'`);
        break;
      case 'resourcesAtLeast':
        if (!validPlayer(c.player) || c.player === 0) err(`${where}: player ${c.player} out of range 1..${playerCount}`);
        if (!isInt(c.amount) || c.amount < 0) err(`${where}: amount ${c.amount} must be a non-negative integer`);
        break;
      case 'ownedAtLeast':
        if (!validPlayer(c.player) || c.player === 0) err(`${where}: player ${c.player} out of range 1..${playerCount}`);
        checkDefIds(where, c.defIds);
        if (!isInt(c.atLeast) || c.atLeast < 0) err(`${where}: atLeast ${c.atLeast} must be a non-negative integer`);
        break;
      case 'ownedAtMost':
        if (!validPlayer(c.player) || c.player === 0) err(`${where}: player ${c.player} out of range 1..${playerCount}`);
        checkDefIds(where, c.defIds);
        if (!isInt(c.atMost) || c.atMost < 0) err(`${where}: atMost ${c.atMost} must be a non-negative integer`);
        break;
      case 'objectiveComplete':
        checkObjective(where, c.objectiveId);
        break;
      case 'triggerFired':
        checkTriggerRef(where, c.triggerId);
        break;
      default: {
        const unknown = c as { kind: string };
        err(`${where}: unknown condition kind '${unknown.kind}'`);
      }
    }
  };

  const checkEffect = (where: string, fx: TriggerEffect) => {
    switch (fx.kind) {
      case 'message':
      case 'victory':
      case 'defeat':
      case 'playSting':
        break;
      case 'objectiveAdd':
        break; // adds itself to the universe
      case 'objectiveComplete':
      case 'objectiveFail':
        checkObjective(where, fx.id);
        break;
      case 'spawn':
        fx.entities.forEach((e, ei) => checkEntity(`${where} spawn[${ei}]`, e));
        break;
      case 'changeOwner':
        if (fx.refs.length === 0) err(`${where}: changeOwner needs at least one ref`);
        for (const r of fx.refs) checkEntityRef(where, r);
        if (!validPlayer(fx.toPlayer)) err(`${where}: toPlayer ${fx.toPlayer} out of range ${playerRange}`);
        break;
      case 'revealArea':
        if (!validPlayer(fx.player) || fx.player === 0) err(`${where}: player ${fx.player} out of range 1..${playerCount}`);
        checkRect(where, fx.area);
        break;
      case 'addResources':
        if (!validPlayer(fx.player) || fx.player === 0) err(`${where}: player ${fx.player} out of range 1..${playerCount}`);
        for (const [k, v] of Object.entries(fx.amounts)) {
          if (!isInt(v)) err(`${where}: amount ${k}=${v} must be an integer`);
        }
        break;
      case 'aiProfile':
      case 'aiAttackNow':
        if (!validPlayer(fx.player) || fx.player === 0) err(`${where}: player ${fx.player} out of range 1..${playerCount}`);
        if (fx.kind === 'aiAttackNow' && fx.targetArea !== undefined) checkRect(where, fx.targetArea);
        break;
      case 'panCamera':
        if (!inBounds(fx.x, fx.y)) err(`${where}: panCamera (${fx.x}, ${fx.y}) out of map bounds ${width}x${height}`);
        break;
      case 'armTrigger':
        checkTriggerRef(where, fx.triggerId);
        break;
      default: {
        const unknown = fx as { kind: string };
        err(`${where}: unknown effect kind '${unknown.kind}'`);
      }
    }
  };

  for (const t of def.triggers) {
    if (t.conditions.length === 0) err(`trigger '${t.id}': needs at least one condition (use {kind:'always'})`);
    t.conditions.forEach((c, ci) => checkCondition(`trigger '${t.id}' condition[${ci}] ${c.kind}`, c));
    t.effects.forEach((fx, fi) => checkEffect(`trigger '${t.id}' effect[${fi}] ${fx.kind}`, fx));
  }

  // ---------- camera ----------
  if (!inBounds(def.startCamera.x, def.startCamera.y)) {
    err(`startCamera (${def.startCamera.x}, ${def.startCamera.y}) out of map bounds ${width}x${height}`);
  }

  if (errors.length > 0) throw new ScenarioValidationError(def.id, errors);

  // ---------- build ScenarioStart ----------
  const gameMap: GameMap = { width, height, terrain, terrainIds };
  const entities: ScenarioStart['entities'] = [
    // authored entities first (refs early, deterministic ids), then map-token gaia objects
    ...def.entities.map((e) => ({
      defId: e.def, player: e.player, tileX: e.x, tileY: e.y,
      ...(e.hp !== undefined ? { hp: e.hp } : {}),
      ...(e.facing !== undefined ? { facing: e.facing } : {}),
      ...(e.ref !== undefined ? { ref: e.ref } : {}),
      ...(e.amountLeft !== undefined ? { amountLeft: e.amountLeft } : {}),
    })),
    ...gaiaObjects,
  ];

  const meta: ScenarioMeta = {
    id: def.id,
    campaign: def.campaign,
    index: def.index,
    title: def.title,
    briefing: def.briefing,
    players: def.players,
    playerSetups: def.players.map((p) => ({
      name: p.name, civ: p.civ, team: p.team, isHuman: p.isHuman, color: p.color,
      startingResources: p.resources, startingAge: p.age,
      ...(p.popCap !== undefined ? { popCap: p.popCap } : {}),
    })),
    startCamera: def.startCamera,
    ...(def.maxAge !== undefined ? { maxAge: def.maxAge } : {}),
    popCap: def.players.reduce((m, p) => Math.max(m, p.popCap ?? 200), 1),
  };

  return { start: { type: 'scenario', map: gameMap, entities }, meta };
}
