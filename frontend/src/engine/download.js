import { ENDPOINTS, CONFIG } from "./config.js";
import { toMbps } from "./stats.js";

/**
 * Download throughput.
 *
 * ---------------------------------------------------------------------------
 * Why a static file and not a serverless function
 * ---------------------------------------------------------------------------
 * The original endpoint generated random bytes per request inside a Netlify
 * function. Feeding a 100 Mbps link that way means producing 12.5 MB of
 * crypto-grade randomness every second inside a Lambda, which is nowhere
 * near achievable. The result: fast.com measured this connection at 100 Mbps
 * while this tool reported 20, and the sparkline showed the isolated bursts
 * characteristic of a compute-bound producer rather than a saturated link.
 *
 * That is the same failure the project's original backend had — it shelled
 * out to the Ookla CLI and measured the *server's* bandwidth. Generating
 * bytes in a function measures the function.
 *
 * A static asset is served straight from the CDN edge at line rate, with no
 * compute in the path. Range requests carve arbitrary chunk sizes out of one
 * file, so a single 16 MB asset covers every chunk size the engine needs.
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

  const assetSize = CONFIG.downloadAssetBytes;
  const span = Math.min(chunkBytes, assetSize) - 1;

  const worker = async (workerIndex) => {
    let round = 0;

    while (!shouldStop()) {
      // Vary the range per request so neither the browser nor an
      // intermediate proxy can serve a repeat from cache, which would
      // otherwise report an imaginary multi-gigabit result.
      const maxOffset = Math.max(0, assetSize - span - 1);
      const offset = maxOffset > 0
        ? Math.floor(Math.random() * maxOffset)
        : 0;

      let res;
      try {
        res = await fetch(
          `${ENDPOINTS.download}?cb=${workerIndex}-${round++}-${Math.random()}`,
          {
            cache: "no-store",
            signal,
            headers: { Range: `bytes=${offset}-${offset + span}` }
          }
        );
      } catch {
        break;
      }

      // 206 = partial content (ranges honoured), 200 = whole file returned.
      if (!res.ok || !res.body) break;

      const reader = res.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.length;

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

  await Promise.all(Array.from({ length: streams }, (_, i) => worker(i)));

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
    cappedByBytes: stoppedEarly,
    timeline
  };
}
