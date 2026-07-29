// Pure command-card model (DOM-free, unit-tested): which build/train buttons
// the card shows, whether each is enabled, and which icon variant (colored vs
// `/gray` companion) it renders. hud.ts only materializes this model into DOM,
// so "affordable actions render colored" is testable without a browser.

import { AGES, type AgeId, type ResourceType } from '@bf/sim/types';
import { PENDING_COMMAND_KINDS } from '@bf/sim/commands';
import { buildAgeIndex } from '@bf/sim/construction';
import { gameData } from '@bf/data';

export type Stockpile = Partial<Record<ResourceType, number>>;

export interface CardButtonModel {
  id: string;
  /** Icon actually rendered: the colored atlas icon, or its `/gray` companion when disabled. */
  icon: string;
  enabled: boolean;
  /** Present iff disabled — surfaced by the tap-for-reason tip. */
  reason?: string;
}

const RESOURCE_KEYS: ResourceType[] = ['food', 'wood', 'gold', 'stone'];

export function canAffordCost(stockpile: Stockpile, cost: Stockpile): boolean {
  return RESOURCE_KEYS.every((r) => (stockpile[r] ?? 0) >= (cost[r] ?? 0));
}

/** Contract (ASSET_CONTRACT): every icon ships a grayscale companion at `<icon>/gray`. */
export function iconVariant(icon: string, enabled: boolean): string {
  return enabled ? icon : `${icon}/gray`;
}

/**
 * Villager "Build" card buttons: gray ONLY for genuinely unavailable actions
 * (unaffordable cost, or the build verb still wave-2-pending in the sim).
 */
export function buildMenuButtons(stockpile: Stockpile, age: AgeId): CardButtonModel[] {
  const ageIdx = AGES.indexOf(age);
  const pending = PENDING_COMMAND_KINDS.has('build');
  return Object.values(gameData.buildings)
    // buildAgeIndex mirrors the sim's construction gate (e.g. extra TCs unlock in Castle Age)
    .filter((bd) => !bd.requiresTech && buildAgeIndex(bd) <= ageIdx)
    .map((bd) => {
      const affordable = canAffordCost(stockpile, bd.cost);
      const enabled = !pending && affordable;
      return {
        id: bd.id,
        icon: iconVariant(bd.icon, enabled),
        enabled,
        reason: enabled ? undefined : pending ? 'construction arrives in wave 2' : 'not enough resources',
      };
    });
}

/** Production building "Train" card buttons for one building def. */
export function trainMenuButtons(stockpile: Stockpile, age: AgeId, buildingDefId: string): CardButtonModel[] {
  const ageIdx = AGES.indexOf(age);
  const def = gameData.buildings[buildingDefId];
  return (def?.trains ?? [])
    .map((uid) => gameData.units[uid])
    .filter((u) => !!u && !u.requiresTech && AGES.indexOf(u.age) <= ageIdx)
    .map((u) => {
      const enabled = canAffordCost(stockpile, u.cost);
      return {
        id: u.id,
        icon: iconVariant(u.icon, enabled),
        enabled,
        reason: enabled ? undefined : 'not enough resources',
      };
    });
}
