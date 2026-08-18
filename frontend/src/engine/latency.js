import { ENDPOINTS, CONFIG } from "./config.js";
import { median, jitter } from "./stats.js";

/**
 * One round trip to /api/ping.
 *
 * The cache-buster is not optional. Without it the browser serves the second
 * probe from memory and reports a sub-millisecond "latency" that has nothing
 * to do with the network.
 */
export async function probe(signal) {
  const t0 = performance.now();
  await fetch(`${ENDPOINTS.ping}?cb=${Math.random()}`, {
    cache: "no-store",
    signal
  });
  return performance.now() - t0;
}

/**
 * Sequential probes. Sequential rather than parallel on purpose: parallel
 * requests queue against each other and you end up measuring your own
 * contention instead of the path.
 */
export async function measureLatency({
  samples = CONFIG.idlePingSamples,
  onSample,
  signal
} = {}) {
  const rtts = [];

  for (let i = 0; i < samples; i++) {
    if (signal?.aborted) break;
    try {
      const rtt = await probe(signal);
      rtts.push(rtt);
      onSample?.({ rtt, index: i });
    } catch {
      // A dropped probe is a data point about the connection, not a crash.
      // Skip it and keep going.
    }
  }

  return {
    samples: rtts,
    median: median(rtts),
    min: rtts.length ? Math.min(...rtts) : 0,
    jitter: jitter(rtts),
    lost: samples - rtts.length
  };
}

/**
 * Probes continuously until aborted. Used to sample latency *while* the link
 * is saturated, which is what makes the bufferbloat number meaningful.
 */
export async function measureLatencyUntilAborted({ signal, onSample } = {}) {
  const rtts = [];

  while (!signal?.aborted) {
    try {
      const rtt = await probe(signal);
      rtts.push(rtt);
      onSample?.({ rtt });
    } catch {
      break;
    }
  }

  return {
    samples: rtts,
    median: median(rtts),
    jitter: jitter(rtts)
  };
}
