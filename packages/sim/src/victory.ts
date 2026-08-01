// Wonder victory (GDD Victory / Defeat: optional wonder win — build + stand timer).
// A completed Wonder starts a countdown (def.wonderTimer seconds); the sim emits a
// once-per-second wonderCountdown stream for the HUD, cancels with wonderDestroyed if
// the building falls, and declares victory for the owner's team at zero. Conquest
// elimination lives in commands.ts (checkEliminations).

import { gameData } from '@bf/data';
import { GAIA, TICKS_PER_SECOND } from './types';
import type { PlayerId, SimEvent } from './types';
import type { SimState } from './internal';

function wonderWin(state: SimState, owner: PlayerId, events: SimEvent[]): void {
  const team = state.players[owner].setup.team;
  const winners: PlayerId[] = [];
  for (const p of state.players) {
    if (p.id === GAIA || p.defeated) continue;
    if (p.id === owner || (team > 0 && p.setup.team === team)) winners.push(p.id);
  }
  state.finished = true;
  events.push({ kind: 'victory', winners });
}

/** Per-tick wonder pass: start timers, count down, cancel on destruction, win at 0. */
export function tickWonders(state: SimState, events: SimEvent[]): void {
  // start timers for newly completed wonders
  for (const e of state.entities.values()) {
    if (e.kind !== 'building' || e.player === GAIA || e.hp <= 0) continue;
    if ((e.buildProgress ?? 1000) < 1000) continue;
    const def = gameData.buildings[e.defId];
    if (!def?.wonder || state.wonders.has(e.id)) continue;
    const seconds = def.wonderTimer ?? 1000;
    state.wonders.set(e.id, { player: e.player, ticksLeft: seconds * TICKS_PER_SECOND });
    events.push({ kind: 'wonderStarted', player: e.player, secondsLeft: seconds });
  }
  // count down / cancel
  for (const [id, timer] of state.wonders) {
    const e = state.entities.get(id);
    if (!e || e.hp <= 0) {
      state.wonders.delete(id);
      events.push({ kind: 'wonderDestroyed', player: timer.player });
      continue;
    }
    if (state.players[timer.player]?.defeated) { // owner resigned/eliminated
      state.wonders.delete(id);
      events.push({ kind: 'wonderDestroyed', player: timer.player });
      continue;
    }
    timer.ticksLeft--;
    if (timer.ticksLeft <= 0) {
      state.wonders.delete(id);
      wonderWin(state, timer.player, events);
      return; // game over — no further timers matter
    }
    if (timer.ticksLeft % TICKS_PER_SECOND === 0) {
      events.push({
        kind: 'wonderCountdown', player: timer.player,
        secondsLeft: timer.ticksLeft / TICKS_PER_SECOND,
      });
    }
  }
}
