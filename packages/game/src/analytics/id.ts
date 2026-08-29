/**
 * Anonymous analytics identifier. This is presentation/platform state, never
 * simulation state, so it deliberately does not use the deterministic sim RNG.
 */
export function randomAnalyticsId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // A storage- or crypto-restricted WebView still degrades without breaking play.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}
