// Endgame: the Wonder countdown stream (started / per-second countdown / destroyed /
// victory at zero) and a real combat-driven conquest in a practice game — spawned
// rams + knights (via Game.ops) wipe the enemy's TC and villagers; the garrisoned
// villagers die with the TC and the survivor army does not save the player (GDD).

import { describe, expect, it } from 'vitest';
import { gameData } from '@bf/data';
import type { EntityId, Game, SimEvent } from './types';
import { TICKS_PER_SECOND } from './types';
import { createGame } from './game';
import { entitiesOf, grassMap, player, practiceConfig, scenarioConfig } from './testutil';

const P1 = 1;
const P2 = 2;

describe('wonder victory', () => {
  it('completed wonder starts the countdown, streams per-second events, wins at zero', () => {
    const game = createGame(scenarioConfig(501, grassMap(30, 30), [
      { defId: 'townCenter', player: P1, tileX: 3, tileY: 3 },
      { defId: 'townCenter', player: P2, tileX: 20, tileY: 20 },
      { defId: 'wonder', player: P1, tileX: 10, tileY: 10 },
    ], [player(), player({ civ: 'english' })]));

    const first = game.advance([]);
    expect(first).toContainEqual({ kind: 'wonderStarted', player: P1, secondsLeft: 1000 });

    let countdowns = 0;
    let victory: Extract<SimEvent, { kind: 'victory' }> | null = null;
    let lastSeconds = 1001;
    for (let t = 0; t < 1000 * TICKS_PER_SECOND + 40 && !victory; t++) {
      for (const ev of game.advance([])) {
        if (ev.kind === 'wonderCountdown') {
          expect(ev.secondsLeft).toBeLessThan(lastSeconds); // strictly descending
          lastSeconds = ev.secondsLeft;
          countdowns++;
        }
        if (ev.kind === 'victory') victory = ev;
      }
    }
    expect(countdowns).toBe(999); // 999 → 1 (zero is the victory tick)
    expect(victory).toEqual({ kind: 'victory', winners: [P1] });
    expect(game.state.finished).toBe(true);
  });

  it('destroying the wonder cancels the countdown (wonderDestroyed, no victory)', () => {
    const game = createGame(scenarioConfig(502, grassMap(30, 30), [
      { defId: 'townCenter', player: P1, tileX: 3, tileY: 3 },
      { defId: 'townCenter', player: P2, tileX: 20, tileY: 20 },
      { defId: 'wonder', player: P1, tileX: 10, tileY: 10, ref: 'wonder' },
    ], [player(), player({ civ: 'english' })]));
    const wonder = game.state.refs.get('wonder')!;
    for (let t = 0; t < 100; t++) game.advance([]);
    const evs = game.advance([{ kind: 'deleteEntity', player: P1, entityId: wonder }]);
    expect(evs).toContainEqual({ kind: 'wonderDestroyed', player: P1 });
    for (let t = 0; t < 100; t++) {
      expect(game.advance([]).some((e) => e.kind === 'victory' || e.kind === 'wonderCountdown')).toBe(false);
    }
    expect(game.state.finished).toBe(false);
  });
});

describe('conquest by combat (practice game)', () => {
  it('rams level the TC (garrisoned villagers die with it), knights hunt the rest → defeat + victory', () => {
    const game = createGame(practiceConfig(503, [player(), player({ civ: 'english' })]));
    const tc2 = entitiesOf(game.state.entities, P2, 'townCenter')[0];
    const vills2 = entitiesOf(game.state.entities, P2, 'villager').map((e) => e.id);
    expect(vills2).toHaveLength(3);

    // walkable tiles ringing the enemy TC for the strike force
    const size = gameData.buildings.townCenter.size;
    const spots: Array<{ x: number; y: number }> = [];
    for (let r = 2; r <= 4 && spots.length < 8; r++) {
      for (let dy = -r; dy <= size + r && spots.length < 8; dy++) {
        for (let dx = -r; dx <= size + r && spots.length < 8; dx++) {
          if (Math.max(Math.abs(dx - 1), Math.abs(dy - 1)) !== r + 1) continue;
          const x = tc2.tileX + dx, y = tc2.tileY + dy;
          if (game.isWalkable(x, y)) spots.push({ x, y });
        }
      }
    }
    expect(spots.length).toBeGreaterThanOrEqual(7);
    const rams = game.ops!.spawn(spots.slice(0, 4).map((s) => ({
      defId: 'siegeRam', player: P1, tileX: s.x, tileY: s.y,
    })));
    const knights = game.ops!.spawn(spots.slice(4, 7).map((s) => ({
      defId: 'knight', player: P1, tileX: s.x, tileY: s.y,
    })));

    const cmds: Parameters<Game['advance']>[0] = [
      { kind: 'attack', player: P1, units: rams, targetId: tc2.id },
    ];
    knights.forEach((k, i) => {
      cmds.push({ kind: 'attack', player: P1, units: [k], targetId: vills2[i] });
    });
    game.advance(cmds);

    const events: SimEvent[] = [];
    for (let t = 0; t < 2500 && !game.state.finished; t++) {
      events.push(...game.advance([]));
    }
    // TC destroyed with kill credit; the fleeing villagers garrisoned and died inside
    const tcDeath = events.find((e) => e.kind === 'entityDied' && e.id === tc2.id);
    expect(tcDeath).toBeDefined();
    expect((tcDeath as Extract<SimEvent, { kind: 'entityDied' }>).killer).toBe(P1);
    for (const v of vills2) expect(game.state.entities.get(v)?.hp ?? 0).toBeLessThanOrEqual(0);

    // GDD conquest: no TC + no villagers + no production buildings = defeated —
    // the scout still standing does not save player 2
    expect(events).toContainEqual({ kind: 'playerDefeated', player: P2 });
    expect(events).toContainEqual({ kind: 'victory', winners: [P1] });
    expect(game.state.finished).toBe(true);
    expect(game.state.players[P2].defeated).toBe(true);
  });
});

describe('scenario ops surface', () => {
  it('spawn/changeOwner/revealArea/addResources/getCounts are live and deterministic', () => {
    const game = createGame(scenarioConfig(504, grassMap(30, 30), [
      { defId: 'townCenter', player: P1, tileX: 3, tileY: 3 },
      { defId: 'townCenter', player: P2, tileX: 20, tileY: 20 },
    ], [player(), player({ civ: 'english' })]));
    const ops = game.ops!;

    const ids: EntityId[] = ops.spawn([
      { defId: 'militia', player: P1, tileX: 10, tileY: 10, ref: 'hero' },
      { defId: 'militia', player: P1, tileX: 11, tileY: 10 },
    ]);
    expect(ids).toHaveLength(2);
    expect(game.state.refs.get('hero')).toBe(ids[0]);
    expect(ops.getCounts({ player: P1, defIds: ['militia'] })).toBe(2);
    expect(game.state.players[P1].pop).toBe(2);

    ops.changeOwner([ids[0]], P2);
    expect(game.state.entities.get(ids[0])!.player).toBe(P2);
    expect(ops.getCounts({ player: P1, defIds: ['militia'] })).toBe(1);
    expect(game.state.players[P1].pop).toBe(1);
    expect(game.state.players[P2].pop).toBe(1);

    ops.addResources(P1, { food: 500, gold: -50 });
    expect(game.state.players[P1].stockpile.food).toBe(700);
    expect(game.state.players[P1].stockpile.gold).toBe(50);

    const vis = game.state.players[P1].visibility;
    const t = 25 * 30 + 25; // (25,25) far from anything P1 has seen
    expect(vis[t]).toBe(0);
    ops.revealArea(P1, { x: 24, y: 24, w: 4, h: 4 });
    expect(vis[t]).toBe(1); // explored, not "visible"

    expect(ops.getCounts({ player: P2, area: { x: 18, y: 18, w: 6, h: 6 } })).toBe(1); // their TC
  });
});
