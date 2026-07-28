export * from './schema';

import type { GameData } from './schema';
import { units } from './units';
import { buildings } from './buildings';
import { techs } from './techs';
import { civs } from './civs';
import { resources } from './resources';

export { units, buildings, techs, civs, resources };

export const gameData: GameData = { units, buildings, techs, civs, resources };
