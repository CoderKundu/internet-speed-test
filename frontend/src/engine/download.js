import { ENDPOINTS, CONFIG } from "./config.js";
import { toMbps } from "./stats.js";

/**
 * Download throughput.
 *
 * Fixed *duration*, not fixed size. Each worker loops — request a chunk, read
 * it to completion, request another — until the deadline. A fixed-size test
 * takes 40 seconds on a slow line and 0.2 seconds on a fast one, and 0.2
 * seconds is far too short to measure anything stable.
 *
 * Stops at whichever arrives first: the deadline or maxBytes. Without the
 * byte ceiling the test is unbounded in data volume, which is a problem both
 * for hosting bandwidth and for local testing where there is no network to
 * act as a natural brake.
 *
 * Bytes are counted as they stream in via getReader(), which is also what
 * feeds the live gauge. Waiting for arrayBuffer() would give you one number
 * at the end and nothing to animate.
 */
export async function measureDownload({
  durationMs = CONFIG.downloadDurationMs,
  streams = CONFIG.downloadStreams,
  chunkBytes = CONFIG.downloadChunkBytes,
  warmupMs = CONFIG.warmupMs,
  maxBytes = CONFIG.maxDownloadBytes,
  onSample,
  signal
} = {}) {
  const start = performance.now();
  const deadline = start + durationMs;

  let totalBytes = 0;
  let stoppedEarly = false;

  let warmBytes = null;
  let warmTime = null;

  const timeline = [];
  let lastT = start;
  let lastBytes = 0;

  const shouldStop = () =>
    performance.now() >= deadline || totalBytes >= maxBytes || signal?.aborted;

  const warmupTimer = setTimeout(() => {
    warmBytes = totalBytes;
    warmTime = performance.now();
  }, warmupMs);

  const sampler = setInterval(() => {
    const now = performance.now();
    const seconds = (now - lastT) / 1000;
    const mbps = toMbps(totalBytes - lastBytes, seconds);

    timeline.push({ atMs: now - start, mbps });
    onSample?.({ mbps, elapsedMs: now - start, phase: "download" });

    lastT = now;
    lastBytes = totalBytes;
  }, CONFIG.sampleIntervalMs);

  const worker = async () => {
    while (!shouldStop()) {
      let res;
      try {
        res = await fetch(
          `${ENDPOINTS.download}?bytes=${chunkBytes}&cb=${Math.random()}`,
          { cache: "no-store", signal }
        );
      } catch {
        break;
      }

      if (!res.ok || !res.body) break;

      const reader = res.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.length;

          // Bail out mid-chunk rather than letting a slow connection
          // overrun the window, or a fast one blow past the ceiling.
          if (shouldStop()) {
            if (totalBytes >= maxBytes) stoppedEarly = true;
            await reader.cancel();
            break;
          }
        }
      } catch {
        break;
      }
    }
  };

  await Promise.all(Array.from({ length: streams }, worker));

  clearTimeout(warmupTimer);
  clearInterval(sampler);

  const end = performance.now();

  const measuredBytes = warmBytes === null ? totalBytes : totalBytes - warmBytes;
  const measuredSeconds =
    warmTime === null ? (end - start) / 1000 : (end - warmTime) / 1000;

  return {
    mbps: toMbps(measuredBytes, measuredSeconds),
    totalBytes,
    measuredBytes,
    durationMs: end - start,
    // True when the byte ceiling ended the run instead of the clock. Worth
    // surfacing: it means the connection is fast enough that the window was
    // shorter than intended, so the figure is less settled.
    cappedByBytes: stoppedEarly,
    timeline
  };
}
