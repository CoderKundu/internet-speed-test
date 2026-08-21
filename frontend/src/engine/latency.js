import { CONFIG } from "./config.js";
import { median, jitter } from "./stats.js";

/**
 * Latency is measured against a static file, NOT a serverless function.
 *
 * Probing /api/ping reported 373ms deployed and 127ms over loopback, where
 * the true round trip is effectively zero. Nearly 300ms of that was function
 * invocation cost — scheduling, cold start, runtime startup — none of which
 * is network distance. A static asset is served from the CDN edge with no
 * function involved, so what you time is the actual path to the POP.
 */
export const PING_TARGET = "/ping.txt";

export async function probe(signal) {
  const t0 = performance.now();
  await fetch(`${PING_TARGET}?cb=${Math.random()}`, {
    cache: "no-store",
    signal
  });
  return performance.now() - t0;
}

/**
 * Discarded probes run before measurement starts.
 *
 * The first request to an origin pays DNS resolution, the TCP handshake and
 * TLS negotiation — easily 700ms on a fresh connection. Every later probe
 * reuses the warm connection at ~80ms. Including that first sample barely
 * moves the median but wrecks jitter, since jitter is built from consecutive
 * differences and one 700ms outlier contributes two enormous ones.
 *
 * A run reading min 77.1 / median 80.2 / jitter 42.3 is the signature: tight
 * cluster, absurd instability figure. Two throwaway probes fix it.
 */
const WARMUP_PROBES = 2;

export async function measureLatency({
  samples = CONFIG.idlePingSamples,
  onSample,
  signal
} = {}) {
  // Warm the connection. Results deliberately ignored.
  for (let i = 0; i < WARMUP_PROBES; i++) {
    if (signal?.aborted) break;
    try {
      await probe(signal);
    } catch {
      // Nothing to do — if the connection cannot be warmed, the measured
      // probes below will fail too and report themselves as lost.
    }
  }

  const rtts = [];

  for (let i = 0; i < samples; i++) {
    if (signal?.aborted) break;
    try {
      const rtt = await probe(signal);
      rtts.push(rtt);
      onSample?.({ rtt, index: i });
    } catch {
      // A dropped probe is a data point about the connection, not a crash.
    }
  }

  return {
    samples: rtts,
    median: median(rtts),
    min: rtts.length ? Math.min(...rtts) : 0,
    max: rtts.length ? Math.max(...rtts) : 0,
    jitter: jitter(rtts),
    lost: samples - rtts.length
  };
}

/**
 * Probes continuously until aborted. Used to sample latency *while* the link
 * is saturated, which is what makes the bufferbloat number meaningful.
 *
 * No warmup here — by the time this runs the connection is already hot from
 * the idle phase.
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
    max: rtts.length ? Math.max(...rtts) : 0,
    jitter: jitter(rtts)
  };
}
