/**
 * Small statistics helpers. Kept separate so they are trivially unit-testable.
 */

export function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function percentile(nums, p) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[idx];
}

/**
 * Jitter: mean absolute difference between *consecutive* round trips.
 *
 * This is the RFC 3550 notion, and it is not the same as the standard
 * deviation of the RTTs themselves. A connection that sits steadily at 90ms
 * has high latency but near-zero jitter; one that alternates 20/120/20/120
 * has a similar mean but is unusable for calls. Only the consecutive-diff
 * version distinguishes them, which is the whole point of measuring it.
 */
export function jitter(rtts) {
  if (rtts.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < rtts.length; i++) {
    sum += Math.abs(rtts[i] - rtts[i - 1]);
  }
  return sum / (rtts.length - 1);
}

export const toMbps = (bytes, seconds) =>
  seconds > 0 ? (bytes * 8) / seconds / 1e6 : 0;
