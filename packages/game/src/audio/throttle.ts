// Pure SFX throttle policy (unit-tested; the WebAudio engine consults it).
// Two rules per category: a max number of concurrently-sounding voices, and a
// minimum gap between voice starts. A battle of forty swings must sound like
// a battle, not a jackhammer — and never eat every WebAudio voice.

export interface CategoryPolicy {
  /** Max voices of this category sounding at once. */
  maxConcurrent: number;
  /** Minimum ms between two starts of this category. */
  minGapMs: number;
}

export const DEFAULT_POLICIES: Record<string, CategoryPolicy> = {
  gather: { maxConcurrent: 3, minGapMs: 90 },
  build: { maxConcurrent: 2, minGapMs: 120 },
  combat: { maxConcurrent: 4, minGapMs: 60 },
  structure: { maxConcurrent: 3, minGapMs: 90 },
  bow: { maxConcurrent: 3, minGapMs: 70 },
  arrowHit: { maxConcurrent: 3, minGapMs: 70 },
  // siege voices are long and loud: a handful of rams or a mangonel splash must
  // read as weight, not as a drum roll
  ram: { maxConcurrent: 2, minGapMs: 200 },
  siege: { maxConcurrent: 2, minGapMs: 160 },
  siegeHit: { maxConcurrent: 2, minGapMs: 140 },
  collapse: { maxConcurrent: 2, minGapMs: 250 },
  monk: { maxConcurrent: 2, minGapMs: 300 },
  bell: { maxConcurrent: 1, minGapMs: 250 },
  sting: { maxConcurrent: 1, minGapMs: 1800 },
  ui: { maxConcurrent: 4, minGapMs: 30 },
};

interface CategoryState {
  /** Expiry timestamps (ms) of currently-sounding voices. */
  voices: number[];
  lastStart: number;
}

export class SfxThrottle {
  private readonly policies: Record<string, CategoryPolicy>;
  private readonly state = new Map<string, CategoryState>();

  constructor(policies: Record<string, CategoryPolicy> = DEFAULT_POLICIES) {
    this.policies = policies;
  }

  /** How many voices of a category are still sounding at `now`. */
  activeCount(category: string, now: number): number {
    const s = this.state.get(category);
    if (!s) return 0;
    s.voices = s.voices.filter((end) => end > now);
    return s.voices.length;
  }

  /**
   * Ask to start a voice. True = allowed (the voice is booked for durationMs);
   * false = denied (over the concurrency cap or inside the min gap). Unknown
   * categories are always allowed (no policy = no throttle).
   */
  request(category: string, now: number, durationMs: number): boolean {
    const policy = this.policies[category];
    if (!policy) return true;
    let s = this.state.get(category);
    if (!s) {
      s = { voices: [], lastStart: -Infinity };
      this.state.set(category, s);
    }
    s.voices = s.voices.filter((end) => end > now);
    if (s.voices.length >= policy.maxConcurrent) return false;
    if (now - s.lastStart < policy.minGapMs) return false;
    s.voices.push(now + Math.max(0, durationMs));
    s.lastStart = now;
    return true;
  }
}

/**
 * Default attenuation horizon (world px): past this, an ordinary voice is
 * culled. audio/combat.ts reaches for this so heavy siege voices can be
 * described as "further than normal" without restating the number.
 */
export const SFX_FAR_DEFAULT = 1500;

/**
 * Camera-distance attenuation (pure): full volume inside `near` world px,
 * linear falloff to zero at `far`. Returns 0 for anything past `far` so the
 * caller can skip synthesis entirely.
 */
export function attenuation(distancePx: number, near = 380, far = SFX_FAR_DEFAULT): number {
  if (distancePx <= near) return 1;
  if (distancePx >= far) return 0;
  return 1 - (distancePx - near) / (far - near);
}
