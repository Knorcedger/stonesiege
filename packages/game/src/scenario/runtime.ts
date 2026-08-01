// Scenario-side glue for campaign games:
//  - ScenarioOps implementation bridging TriggerRuntime onto the live sim
//    (reads from game.state, writes through game.ops) and the host UI
//    callbacks (message banner, objectives panel, camera pan, stings,
//    victory/defeat).
// Campaign hero defs (heroWallace & co.) are canonical @bf/data units, so the
// sim resolves them natively — no live-gameData injection needed anymore.
// Bot profile changes go straight to @bf/ai (applyAiProfile / attackNow) via
// the ui hooks game.ts provides.

import type { Game, GameState } from '@bf/sim/types';
import type { AiProfile, EntityQuery, ScenarioOps, SpawnRequest } from '@bf/scenarios';

/** Everything the trigger engine calls back INTO the client. */
export interface ScenarioUiHooks {
  message(msg: { text: string; speaker?: string; portrait?: string }): void;
  panCamera(tileX: number, tileY: number): void;
  objectiveAdded(id: string, text: string): void;
  objectiveCompleted(id: string): void;
  objectiveFailed(id: string): void;
  playSting(sting: 'horn' | 'victory' | 'defeat' | 'alert'): void;
  victory(): void;
  defeat(reason?: string): void;
  setAiProfile(player: number, profile: AiProfile): void;
  aiAttackNow(player: number, targetArea?: { x: number; y: number; w: number; h: number }): void;
}

/** Manual count fallback mirroring SimOps.getCounts rules (mock sim has no ops). */
function countFallback(state: GameState, q: EntityQuery): number {
  let n = 0;
  for (const e of state.entities.values()) {
    if (q.player !== undefined && e.player !== q.player) continue;
    if (q.defIds !== undefined && !q.defIds.includes(e.defId)) continue;
    if (e.kind === 'resource') {
      if ((e.amountLeft ?? 0) <= 0 || e.stump) continue;
    } else {
      if (e.hp <= 0 || e.activity === 'dying') continue;
      if (e.kind === 'building' && (e.buildProgress ?? 1000) < 1000) continue;
    }
    if (q.area !== undefined) {
      const { x, y, w, h } = q.area;
      if (e.tileX < x || e.tileX >= x + w || e.tileY < y || e.tileY >= y + h) continue;
    }
    n++;
  }
  return n;
}

/** Build the ScenarioOps the TriggerRuntime runs against. */
export function makeScenarioOps(game: Game, ui: ScenarioUiHooks): ScenarioOps {
  const state = game.state;
  return {
    // ---- read side ----
    tick: () => state.tick,
    getEntityByRef(ref) {
      const id = state.refs.get(ref);
      if (id === undefined) return null;
      const e = state.entities.get(id);
      if (!e || e.activity === 'dying') return null;
      if (e.kind !== 'resource' && e.hp <= 0) return null;
      return { id: e.id, defId: e.defId, player: e.player, tileX: e.tileX, tileY: e.tileY, hp: e.hp };
    },
    countEntities: (q) => (game.ops ? game.ops.getCounts(q) : countFallback(state, q)),
    getAge: (player) => state.players[player]?.age ?? 'dark',
    getResource: (player, type) => state.players[player]?.stockpile[type] ?? 0,
    hasResearched: (player, techId) => state.players[player]?.researchedTechs.includes(techId) ?? false,
    isDefeated: (player) => state.players[player]?.defeated ?? false,
    // ---- write side (through the sim's own deterministic ops) ----
    spawn(entities: SpawnRequest[]) {
      game.ops?.spawn(entities);
    },
    changeOwner(refs, toPlayer) {
      const ids = refs
        .map((r) => state.refs.get(r))
        .filter((id): id is number => id !== undefined);
      if (ids.length > 0) game.ops?.changeOwner(ids, toPlayer);
    },
    revealArea(player, area) {
      game.ops?.revealArea(player, area);
    },
    addResources(player, amounts) {
      game.ops?.addResources(player, amounts);
    },
    setAiProfile: (player, profile) => ui.setAiProfile(player, profile),
    aiAttackNow: (player, targetArea) => ui.aiAttackNow(player, targetArea),
    // ---- host/UI callbacks ----
    message: (m) => ui.message(m),
    panCamera: (x, y) => ui.panCamera(x, y),
    objectiveAdded: (id, text) => ui.objectiveAdded(id, text),
    objectiveCompleted: (id) => ui.objectiveCompleted(id),
    objectiveFailed: (id) => ui.objectiveFailed(id),
    playSting: (s) => ui.playSting(s),
    victory: () => ui.victory(),
    defeat: (r) => ui.defeat(r),
  };
}

