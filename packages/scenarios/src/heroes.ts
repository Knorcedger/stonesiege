// Campaign hero unit defs (docs/CAMPAIGN_WALLACE.md Appendix A): ordinary UnitDefs with
// boosted stats, not trainable, immune to conversion. These are PLACEHOLDERS owned by the
// scenarios package until canonical hero defs land in @bf/data — withCampaignHeroes()
// merges them in only where @bf/data does not already define the id, so the data pack
// wins the moment real defs (with unique icons/stats) arrive. Icons reuse existing atlas
// frames so nothing references art that does not exist yet.

import type { GameData, UnitDef } from '@bf/data';
import { gameData } from '@bf/data';

function hero(
  id: string, name: string, hp: number, attack: number, icon: string,
  extra: Partial<UnitDef> = {},
): UnitDef {
  return {
    id, name, age: 'dark',
    trainedAt: [], cost: {}, trainTime: 0, // never trainable; scenario-placed only
    hp,
    attacks: [{ cls: 'melee', amount: attack }],
    armor: [{ cls: 'melee', amount: 1 }, { cls: 'pierce', amount: 1 }],
    range: 0, rof: 2, speed: 0.96, los: 6,
    classes: ['infantry', 'uniqueUnit'],
    conversionResist: 100, // heroes cannot be converted
    icon,
    ...extra,
  };
}

/** All nine campaign heroes from Appendix A. */
export const campaignHeroUnits: Record<string, UnitDef> = {
  // ---- Scots ----
  heroWallace: hero('heroWallace', 'William Wallace', 200, 14, 'icon/champion'),
  heroMoray: hero('heroMoray', 'Andrew Moray', 180, 12, 'icon/knight'),
  heroGraham: hero('heroGraham', 'Sir John de Graham', 160, 12, 'icon/manAtArms'),
  heroFraser: hero('heroFraser', 'Sir Simon Fraser', 160, 12, 'icon/lightCavalry'),
  // ---- English ----
  // Heselrig is the scenario-1 boss: killable by Wallace plus a handful of militia.
  heroHeselrig: hero('heroHeselrig', 'William Heselrig', 120, 9, 'icon/manAtArms'),
  heroCressingham: hero('heroCressingham', 'Hugh de Cressingham', 150, 8, 'icon/manAtArms'),
  heroWarenne: hero('heroWarenne', 'John de Warenne', 200, 12, 'icon/knight'),
  heroEdward: hero('heroEdward', 'Edward Longshanks', 250, 16, 'icon/paladin'),
  heroValence: hero('heroValence', 'Aymer de Valence', 200, 14, 'icon/knight'),
};

/**
 * GameData extended with any campaign hero the base data does not define yet.
 * @bf/data always wins: once real hero defs land there, these placeholders are inert.
 */
export function withCampaignHeroes(data: GameData): GameData {
  const missing: Record<string, UnitDef> = {};
  for (const [id, def] of Object.entries(campaignHeroUnits)) {
    if (!(id in data.units)) missing[id] = def;
  }
  return { ...data, units: { ...data.units, ...missing } };
}

/** Default game data + campaign heroes — what campaign scenario loading should use. */
export const campaignGameData: GameData = withCampaignHeroes(gameData);
