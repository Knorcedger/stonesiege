import type { GameState, PlayerId } from '@bf/sim/types';

export type PlacementStatus = 'needs-visibility' | 'valid' | 'blocked';

/**
 * Expose authoritative placement validity only when the complete footprint is
 * visible. Otherwise hidden units and resources would become a red/green oracle.
 */
export function placementStatus(
  state: GameState,
  player: PlayerId,
  tileX: number,
  tileY: number,
  size: number,
  authoritativeCanPlace: () => boolean,
): PlacementStatus {
  const { width, height } = state.map;
  if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY)
    || !Number.isSafeInteger(size) || size <= 0
    || tileX < 0 || tileY < 0 || tileX + size > width || tileY + size > height) {
    return 'blocked';
  }
  const visibility = state.players[player]?.visibility;
  if (!visibility || visibility.length < width * height) return 'needs-visibility';
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      if (visibility[(tileY + dy) * width + tileX + dx] !== 2) {
        return 'needs-visibility';
      }
    }
  }
  return authoritativeCanPlace() ? 'valid' : 'blocked';
}
