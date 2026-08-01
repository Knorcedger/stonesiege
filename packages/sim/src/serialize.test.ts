// Snapshot / resume proof: run game A 500 scripted ticks (economy + construction +
// research queue + combat + monk heal + garrison walks + an IN-FLIGHT path search),
// serialize through a real JSON round trip, resume as B, then drive A and B through
// 500 more identical scripted ticks — hashes must match at every 100-tick checkpoint,
// and re-serializing both must produce byte-identical JSON.

import { describe, expect, it } from 'vitest';
import { createGame, createGameFromSnapshot } from './game';
import { SNAPSHOT_SCHEMA_VERSION, rleDecodeInto, rleEncode } from './serialize';
import { fp } from './types';
import type { Command, Entity, Game, GameSnapshot } from './types';
import type { SimState } from './internal';
import { entitiesOf, practiceConfig, player } from './testutil';

/** Nearest gaia entity of defId to `from` (deterministic: strict < keeps first-inserted). */
function nearestGaia(game: Game, defId: string, from: Entity | undefined): Entity | undefined {
  if (!from) return undefined;
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const e of game.state.entities.values()) {
    if (e.player !== 0 || e.defId !== defId || (e.amountLeft ?? 1) <= 0) continue;
    const dx = e.tileX - from.tileX, dy = e.tileY - from.tileY;
    const dd = dx * dx + dy * dy;
    if (dd < bestD) { bestD = dd; best = e; }
  }
  return best;
}

/** First placeable spot for defId in a deterministic outward ring scan around `from`. */
function placeSpot(game: Game, playerId: number, defId: string, from: Entity | undefined): { x: number; y: number } | null {
  if (!from) return null;
  for (let r = 3; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (game.canPlace(playerId, defId, from.tileX + dx, from.tileY + dy)) {
          return { x: from.tileX + dx, y: from.tileY + dy };
        }
      }
    }
  }
  return null;
}

/**
 * Scripted command stream, a pure function of the game's own (deterministic) state —
 * identical states produce identical commands, so A and B stay in lockstep post-resume.
 */
function scriptFor(game: Game, tick: number): Command[] {
  const s = game.state;
  const tc1 = entitiesOf(s.entities, 1, 'townCenter')[0];
  const tc2 = entitiesOf(s.entities, 2, 'townCenter')[0];
  const vills1 = entitiesOf(s.entities, 1, 'villager').map((e) => e.id);
  const vills2 = entitiesOf(s.entities, 2, 'villager').map((e) => e.id);
  const scout1 = entitiesOf(s.entities, 1, 'scout')[0];
  const ref = (r: string): number | undefined => s.refs.get(r);
  const cmds: Command[] = [];
  switch (tick) {
    case 5: { // economy running: berries for p1, wood for p2
      const bush = nearestGaia(game, 'berryBush', tc1);
      if (bush) cmds.push({ kind: 'gather', player: 1, units: vills1, targetId: bush.id });
      const tree = nearestGaia(game, 'tree', tc2);
      if (tree) cmds.push({ kind: 'gather', player: 2, units: vills2, targetId: tree.id });
      break;
    }
    case 10: // shared queue: two villagers, then loom sits QUEUED across the snapshot
      cmds.push({ kind: 'train', player: 1, buildingId: tc1.id, defId: 'villager' });
      cmds.push({ kind: 'train', player: 1, buildingId: tc1.id, defId: 'villager' });
      cmds.push({ kind: 'research', player: 1, buildingId: tc1.id, techId: 'loom' });
      break;
    case 80: { // barracks foundation: 1 builder, in progress at snapshot AND at t1000
      const spot = placeSpot(game, 1, 'barracks', tc1);
      if (spot && vills1.length > 0) {
        cmds.push({ kind: 'build', player: 1, units: [vills1[0]], defId: 'barracks', tileX: spot.x, tileY: spot.y });
      }
      break;
    }
    case 470: { // battle next to p2's TC (spawned at 455): melee + arrows + TC fire
      const raiders = ['sz-a1', 'sz-a2'].map(ref).filter((x): x is number => x !== undefined);
      const d1 = ref('sz-d1');
      if (raiders.length > 0 && d1 !== undefined) cmds.push({ kind: 'attack', player: 1, units: raiders, targetId: d1 });
      const archer = ref('sz-a3');
      if (archer !== undefined && tc2) cmds.push({ kind: 'attack', player: 1, units: [archer], targetId: tc2.id });
      break;
    }
    case 480: { // monk channels a heal across the snapshot boundary
      const monk = ref('sz-m1'), wounded = ref('sz-a1');
      if (monk !== undefined && wounded !== undefined) {
        cmds.push({ kind: 'heal', player: 1, units: [monk], targetId: wounded });
      }
      break;
    }
    case 490: // garrison walks in flight at the snapshot (one villager keeps chopping)
      if (tc2 && vills2.length > 1) cmds.push({ kind: 'garrison', player: 2, units: vills2.slice(0, 2), targetId: tc2.id });
      break;
    case 499: // cross-map group move: the path search is mid-expansion at tick 500
      cmds.push({
        kind: 'move', player: 1,
        units: [...vills1.slice(1), ...(scout1 ? [scout1.id] : [])],
        x: fp(110), y: fp(110),
      });
      break;
    case 540: { // post-resume: retask the marchers onto gold
      const mine = nearestGaia(game, 'goldMine', tc1);
      if (mine) cmds.push({ kind: 'gather', player: 1, units: vills1, targetId: mine.id });
      break;
    }
    case 600: { // storm the TC
      const raiders = ['sz-a1', 'sz-a2', 'sz-a3'].map(ref).filter((x): x is number => x !== undefined);
      if (raiders.length > 0 && tc2) cmds.push({ kind: 'attack', player: 1, units: raiders, targetId: tc2.id });
      break;
    }
    case 650: // return-to-work bell
      if (tc2) cmds.push({ kind: 'ungarrison', player: 2, buildingId: tc2.id });
      break;
    case 800:
      cmds.push({ kind: 'stop', player: 1, units: vills1 });
      if (tc1) cmds.push({ kind: 'setRally', player: 1, buildingId: tc1.id, x: fp(tc1.tileX + 6), y: fp(tc1.tileY + 6) });
      break;
    default:
      break;
  }
  return cmds;
}

/** Tick 455: drop a battle + a monk next to p2's TC via Game.ops (both runs identical). */
function spawnSkirmish(game: Game): void {
  const tc2 = entitiesOf(game.state.entities, 2, 'townCenter')[0];
  if (!tc2) return;
  game.ops!.spawn([
    { defId: 'militia', player: 1, tileX: tc2.tileX - 4, tileY: tc2.tileY, ref: 'sz-a1' },
    { defId: 'militia', player: 1, tileX: tc2.tileX - 4, tileY: tc2.tileY + 1, ref: 'sz-a2' },
    { defId: 'archer', player: 1, tileX: tc2.tileX - 6, tileY: tc2.tileY, ref: 'sz-a3' },
    { defId: 'monk', player: 1, tileX: tc2.tileX - 7, tileY: tc2.tileY + 1, ref: 'sz-m1' },
    { defId: 'militia', player: 2, tileX: tc2.tileX - 2, tileY: tc2.tileY + 4, ref: 'sz-d1' },
    { defId: 'militia', player: 2, tileX: tc2.tileX - 1, tileY: tc2.tileY + 4, ref: 'sz-d2' },
  ]);
}

function makeGame(): Game {
  return createGame(practiceConfig(0xf00d, [player({ name: 'A', civ: 'scots' }), player({ name: 'B', civ: 'english' })]));
}

function step(game: Game, tick: number): void {
  if (tick === 455) spawnSkirmish(game);
  game.advance(scriptFor(game, tick));
}

describe('snapshot / resume', () => {
  it('resumes byte-identically: 500 scripted ticks, serialize, 500 more — equal hashes every 100', () => {
    const a = makeGame();
    for (let t = 1; t <= 500; t++) step(a, t);

    // the snapshot moment must actually be busy, or this test proves nothing
    const sa = a.state as SimState;
    expect(sa.pathSearches.length, 'in-flight path search').toBeGreaterThan(0);
    expect(sa.foundations.size, 'building under construction').toBeGreaterThan(0);
    expect(sa.combat.size, 'live engagements').toBeGreaterThan(0);
    expect(sa.monks.size, 'monk channel state').toBeGreaterThan(0);
    expect(sa.gather.size, 'gathering villagers').toBeGreaterThan(0);
    const garrisoned = [...sa.entities.values()].filter((e) => e.garrisonedIn !== undefined).length;
    expect(sa.garrisoning.size + garrisoned, 'garrison walks or occupants').toBeGreaterThan(0);
    const queuedResearch = entitiesOf(sa.entities, 1, 'townCenter')[0].trainQueue!.some((q) => q.techId === 'loom');
    expect(queuedResearch, 'loom queued through the snapshot').toBe(true);

    // real-world path: snapshot survives JSON storage byte-for-byte
    const json = JSON.stringify(a.serialize());
    const b = createGameFromSnapshot(JSON.parse(json) as GameSnapshot);
    expect(b.hash(), 'hash equal immediately after resume').toBe(a.hash());
    expect(b.state.tick).toBe(500);

    const hashesA: number[] = [], hashesB: number[] = [];
    for (let t = 501; t <= 1000; t++) {
      step(a, t); // each game scripts from its OWN state — lockstep iff states are identical
      step(b, t);
      if (t % 100 === 0) { hashesA.push(a.hash()); hashesB.push(b.hash()); }
    }
    expect(hashesA).toEqual(hashesB);
    expect(new Set(hashesA).size, 'the sim kept evolving').toBeGreaterThan(1);

    // full-state check, stronger than the hash: identical snapshots at t1000
    expect(JSON.stringify(b.serialize())).toBe(JSON.stringify(a.serialize()));
  });

  it('a freshly created game round-trips too (tick 0, generated map)', () => {
    const a = makeGame();
    const b = createGameFromSnapshot(a.serialize());
    expect(b.hash()).toBe(a.hash());
    for (let t = 1; t <= 200; t++) { step(a, t); step(b, t); }
    expect(b.hash()).toBe(a.hash());
  });

  it('rejects snapshots with a mismatched schemaVersion', () => {
    const snap = makeGame().serialize();
    expect(snap.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(() => createGameFromSnapshot({ ...snap, schemaVersion: SNAPSHOT_SCHEMA_VERSION + 1 }))
      .toThrow(/schemaVersion/);
    expect(() => createGameFromSnapshot({} as GameSnapshot)).toThrow(/schemaVersion/);
  });

  it('RLE helpers round-trip and reject truncated data', () => {
    const values = [0, 0, 0, 5, 5, 1, 0, 0, 7];
    const pairs = rleEncode(values);
    const out = new Array<number>(values.length);
    rleDecodeInto(pairs, out);
    expect(out).toEqual(values);
    expect(rleEncode([])).toEqual([]);
    expect(() => rleDecodeInto(pairs, new Array<number>(5))).toThrow(/length mismatch/);
  });
});
