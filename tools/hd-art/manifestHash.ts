// Content identity for emitted HD atlas files (issue #149).
//
// The manifest names every atlas file; stamping a short content hash per file
// lets the renderer keep atlas bytes in a persistent cache and lets a freshly
// revalidated manifest vouch for exactly which cached bytes are still current.
// The renderer re-derives this value with WebCrypto over downloaded bytes, so
// the algorithm here and in packages/game/src/artworkStore.ts must stay in
// lockstep: lowercase hex sha256, truncated to ASSET_HASH_LENGTH characters.

import { createHash } from 'node:crypto';

export const ASSET_HASH_LENGTH = 16;

export function assetContentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, ASSET_HASH_LENGTH);
}
