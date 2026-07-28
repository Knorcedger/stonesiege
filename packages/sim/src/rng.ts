/**
 * Deterministic RNG for the simulation (PCG-XSH-RR-style on 32-bit ints via Math.imul).
 * Every random decision in @bf/sim MUST come from a SimRng — never Math.random.
 */
export class SimRng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
    // decorrelate nearby seeds
    this.nextU32(); this.nextU32();
  }

  /** Uniform uint32. */
  nextU32(): number {
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x;
  }

  /** Integer in [0, n) — n must be a positive integer. */
  nextInt(n: number): number {
    return this.nextU32() % n;
  }

  /** Integer in [min, max] inclusive. */
  nextRange(min: number, max: number): number {
    return min + this.nextInt(max - min + 1);
  }

  /** True with probability num/den (integer odds — keeps the sim float-free). */
  chance(num: number, den: number): boolean {
    return this.nextInt(den) < num;
  }

  /** Fork an independent stream (e.g. mapgen vs combat) so extra draws don't shift others. */
  fork(streamId: number): SimRng {
    return new SimRng((this.nextU32() ^ Math.imul(streamId, 0x85ebca6b)) >>> 0);
  }
}
