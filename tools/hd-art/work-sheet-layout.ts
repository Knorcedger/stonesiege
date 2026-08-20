export const WORK_ANIMS = ['chop', 'farm', 'forage', 'mine', 'build'] as const;
export type WorkAnimation = (typeof WORK_ANIMS)[number];

/**
 * Most generated work sheets use S,SE,E,NE,N and need their middle columns
 * mirrored into the runtime S,SW,W,NW,N contract. The approved mining sheet
 * is already authored in runtime order and must be copied unchanged.
 */
export function shouldMirrorWorkDirection(anim: WorkAnimation, direction: number): boolean {
  return anim !== 'mine' && direction > 0 && direction < 4;
}
