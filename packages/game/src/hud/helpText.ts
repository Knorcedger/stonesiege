// Pure, data-driven extended tooltip copy. Keeping this out of the DOM HUD makes
// the teaching text testable and ensures it stays in sync with balance data.

import { gameData, type ArmorClass, type TechDef, type TechEffect, type UnitDef } from '@bf/data';

const STAT_LABEL: Record<string, string> = {
  hp: 'HP', attack: 'attack', armorMelee: 'melee armor', armorPierce: 'pierce armor',
  range: 'range', speed: 'movement speed', los: 'line of sight', rof: 'attack reload time',
  accuracy: 'accuracy', carryCapacity: 'carry capacity', buildRate: 'building speed',
  trainTime: 'training time', conversionResist: 'conversion resistance',
  garrisonCapacity: 'garrison capacity', farmFood: 'farm food', popCap: 'population cap',
  minRange: 'minimum range',
};

const CLASS_LABEL: Partial<Record<ArmorClass, string>> = {
  infantry: 'infantry', archer: 'archers', cavalry: 'cavalry', siege: 'siege', monk: 'monks',
  spearman: 'spearmen', uniqueUnit: 'unique units', building: 'buildings', castle: 'castles',
  wallOrTower: 'walls and towers', ram: 'rams', villager: 'villagers',
};

function names(ids: readonly string[]): string {
  return ids.map((id) => gameData.units[id]?.name ?? gameData.buildings[id]?.name ?? id).join(', ');
}

function targets(effect: TechEffect): string {
  if (!('targetIds' in effect) && !('targetClasses' in effect)) return 'all applicable units';
  const parts: string[] = [];
  if ('targetIds' in effect && effect.targetIds?.length) parts.push(names(effect.targetIds));
  if ('targetClasses' in effect && effect.targetClasses?.length) {
    parts.push(effect.targetClasses.map((c) => CLASS_LABEL[c] ?? c).join(', '));
  }
  return parts.join(' and ') || 'all applicable units';
}

function signed(value: number, suffix = ''): string {
  return `${value > 0 ? '+' : ''}${value}${suffix}`;
}

function effectText(effect: TechEffect): string {
  switch (effect.kind) {
    case 'statAdd':
      return `${STAT_LABEL[effect.stat] ?? effect.stat} ${signed(effect.amount)} for ${targets(effect)}`;
    case 'statMult':
      return `${STAT_LABEL[effect.stat] ?? effect.stat} ${signed(effect.percent, '%')} for ${targets(effect)}`;
    case 'bonusDamage':
      return `${signed(effect.amount)} bonus damage vs ${CLASS_LABEL[effect.vs] ?? effect.vs} for ${targets(effect)}`;
    case 'gatherMult':
      return `${effect.task[0].toUpperCase()}${effect.task.slice(1)} gathering ${signed(effect.percent, '%')}`;
    case 'upgradeUnit':
      return `Upgrades all ${names([effect.from])} into ${names([effect.to])}, including existing units`;
    case 'enableUnit': return `Unlocks ${names([effect.id])}`;
    case 'enableBuilding': return `Unlocks ${names([effect.id])}`;
    case 'ageUp': return `Advances your civilization to the ${effect.to[0].toUpperCase()}${effect.to.slice(1)} Age`;
    case 'freeTech': return `Grants ${gameData.techs[effect.techId]?.name ?? effect.techId} for free`;
    case 'ballistics': return 'Ranged attacks lead moving targets instead of aiming at their old position';
    case 'costMult': return `Cost ${signed(effect.percent, '%')} for ${targets(effect)}`;
  }
}

const TECH_ADVICE: Record<string, string> = {
  loom: 'Why: makes villagers much less vulnerable to early raids.',
  wheelbarrow: 'Why: villagers make fewer drop-off trips and spend less time walking, improving the whole economy.',
  handCart: 'Why: a large late-game economy loses less time carrying resources to drop-off buildings.',
  ballistics: 'Why: moving units can no longer dodge arrows simply by continuing to walk.',
  horseCollar: 'Why: each new farm lasts longer before it must be reseeded.',
  heavyPlow: 'Why: farms last longer, reducing wood cost and villager downtime.',
  cropRotation: 'Why: maximizes the lifetime food supplied by every new farm.',
  murderHoles: 'Why: towers and castles can defend themselves against units standing directly beside them.',
  siegeEngineers: 'Why: siege reaches farther and tears down buildings faster.',
};

export function techExtendedTip(tech: TechDef | undefined): string {
  if (!tech) return '';
  const effects = tech.effects.map(effectText).join('; ');
  const advice = TECH_ADVICE[tech.id];
  return `Effect: ${effects}.${advice ? `\n${advice}` : ''}`;
}

function bonusTargets(unit: UnitDef): string[] {
  return unit.attacks.slice(1).filter((a) => a.amount > 0)
    .map((a) => CLASS_LABEL[a.cls] ?? a.cls);
}

/** Plain-language role/counter advice for train buttons and selected units. */
export function unitExtendedTip(unit: UnitDef | undefined): string {
  if (!unit) return '';
  if (unit.gather) return 'Role: Builds structures and gathers resources. Keep villagers protected; they are your economy.';
  if (unit.heals || unit.converts) {
    return 'Role: Support unit. Heals friendly units and can convert enemies.\nWatch out for: Fast cavalry and focused attacks.';
  }
  if (unit.classes.includes('spearman')) {
    return 'Role: Anti-cavalry infantry.\nGood against: Cavalry.\nWatch out for: Archers and skirmishers.';
  }
  if (unit.id.toLowerCase().includes('skirmisher')) {
    return 'Role: Ranged counter unit.\nGood against: Archers and spearmen.\nWatch out for: Cavalry and melee infantry.';
  }
  if (unit.classes.includes('ram')) {
    return 'Role: Building destroyer with very high arrow resistance.\nGood against: Buildings and other siege.\nWatch out for: Melee units.';
  }
  if (unit.classes.includes('siege')) {
    const splash = (unit.areaRadius ?? 0) > 0;
    return splash
      ? `Role: Splash-damage siege.\nGood against: Groups of units and buildings.\nWatch out for: Units inside its ${unit.minRange ?? 0}-tile minimum range.`
      : 'Role: Long-range building destroyer.\nGood against: Buildings.\nWatch out for: Fast melee units.';
  }
  if (unit.classes.includes('cavalry')) {
    return 'Role: Fast melee raider.\nGood against: Archers, monks, and exposed villagers.\nWatch out for: Spearmen.';
  }
  if (unit.classes.includes('archer')) {
    return 'Role: Ranged damage dealer.\nGood against: Slow infantry from a distance.\nWatch out for: Skirmishers and cavalry.';
  }
  if (unit.classes.includes('infantry')) {
    return 'Role: General-purpose melee infantry.\nGood against: Light melee units and buildings.\nWatch out for: Archers.';
  }
  const good = [...new Set(bonusTargets(unit))];
  return good.length > 0 ? `Good against: ${good.join(', ')}.` : 'Role: Combat unit.';
}

export function extendedTooltip(base: string, detail: string, enabled: boolean): string {
  return enabled && detail ? `${base}\n\n${detail}` : base;
}
