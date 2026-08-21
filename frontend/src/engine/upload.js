import { ENDPOINTS, CONFIG } from "./config.js";
import { toMbps, percentile } from "./stats.js";

/**
 * Upload throughput.
 *
 * Not xhr.upload.onprogress: that fires when bytes reach the OS socket
 * buffer, not the server, so a 4 MB POST read ~104 Mbps on a 9 Mbps link and
 * then zero while the buffer drained.
 *
 * Not raw completion either: xhr.onload fires for 500s and 413s too, so
 * bytes are counted only when the endpoint confirms them via {received: N}.
 *
 * And not the whole window: upload ramps slowly enough that a 10s test spent
 * most of its time accelerating. Four consecutive runs reported ~15 Mbps
 * while their own final samples reached 30-36 — the average was describing
 * the ramp, not the link.
 */
function makePayload(bytes) {
  const buf = new Uint8Array(bytes);
  for (let off = 0; off < bytes; off += 65_536) {
    crypto.getRandomValues(buf.subarray(off, Math.min(off + 65_536, bytes)));
  }
  return buf;
}

function postChunk(payload, signal) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", ENDPOINTS.upload, true);
    xhr.responseType = "json";

    xhr.onload = () => {
      if (xhr.status !== 200) return resolve({ bytes: 0, status: xhr.status });
      let body = xhr.response;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { body = null; }
      }
      const ack = body && typeof body.received === "number" ? body.received : 0;
      resolve({ bytes: ack, status: 200 });
    };

    xhr.onerror = () => resolve({ bytes: 0, status: 0 });
    xhr.onabort = () => resolve({ bytes: 0, status: -1 });

    if (signal) signal.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.send(payload);
  });
}

export async function measureUpload({
  durationMs = CONFIG.uploadDurationMs,
  streams = CONFIG.uploadStreams,
  chunkBytes = CONFIG.uploadChunkBytes,
  warmupMs = CONFIG.uploadWarmupMs,
  maxBytes = CONFIG.maxUploadBytes,
  onSample,
  signal
} = {}) {
  const start = performance.now();
  const deadline = start + durationMs;

  const payload = makePayload(chunkBytes);

  let totalBytes = 0;
  let requests = 0;
  let failures = 0;
  let stoppedEarly = false;
  let warmBytes = null;
  let warmTime = null;

  const timeline = [];

  const shouldStop = () =>
    performance.now() >= deadline || totalBytes >= maxBytes || signal?.aborted;

  const warmupTimer = setTimeout(() => {
    warmBytes = totalBytes;
    warmTime = performance.now();
  }, warmupMs);

  // Acknowledgements arrive in clumps, so a short window swings between
  // bursts and gaps.
  const WINDOW_MS = 2500;
  const recent = [{ t: start, bytes: 0 }];

  const sampler = setInterval(() => {
    const now = performance.now();
    recent.push({ t: now, bytes: totalBytes });
    while (recent.length > 1 && now - recent[0].t > WINDOW_MS) recent.shift();

    const oldest = recent[0];
    const seconds = (now - oldest.t) / 1000;
    const mbps = seconds > 0 ? toMbps(totalBytes - oldest.bytes, seconds) : 0;

    timeline.push({ atMs: now - start, mbps });
    onSample?.({ mbps, elapsedMs: now - start, phase: "upload" });
  }, CONFIG.sampleIntervalMs);

  const worker = async () => {
    while (!shouldStop()) {
      const { bytes, status } = await postChunk(payload, signal);
      requests += 1;
      if (bytes > 0) {
        totalBytes += bytes;
      } else {
        failures += 1;
        if (failures > 3 && failures >= requests / 2) break;
      }
      if (status === -1) break;
      if (totalBytes >= maxBytes) stoppedEarly = true;
    }
  };

  await Promise.all(Array.from({ length: streams }, worker));

  clearTimeout(warmupTimer);
  clearInterval(sampler);

  const end = performance.now();

  const measuredBytes = warmBytes === null ? totalBytes : totalBytes - warmBytes;
  const measuredSeconds =
    warmTime === null ? (end - start) / 1000 : (end - warmTime) / 1000;

  const mbps = toMbps(measuredBytes, measuredSeconds);

  /**
   * Ramp diagnostic.
   *
   * If the post-warmup window still climbs steadily, the window is still too
   * short and this figure is still an underestimate. Comparing the last
   * third against the p90 of all post-warmup samples makes that visible
   * rather than leaving it to be inferred from a sparkline.
   */
  const postWarm = timeline.filter((t) => t.atMs >= warmupMs).map((t) => t.mbps);
  const lastThird = postWarm.slice(Math.floor(postWarm.length * 0.67));
  const sustained = lastThird.length
    ? lastThird.reduce((a, b) => a + b, 0) / lastThird.length
    : mbps;
  const peak = postWarm.length ? percentile(postWarm, 90) : mbps;
  const stillRamping = peak > 0 && sustained / peak > 1.15;

  return {
    mbps,
    totalBytes,
    measuredBytes,
    durationMs: end - start,
    cappedByBytes: stoppedEarly,
    requests,
    failures,
    sustained: Number(sustained.toFixed(2)),
    peak: Number(peak.toFixed(2)),
    stillRamping,
    timeline
  };
}
