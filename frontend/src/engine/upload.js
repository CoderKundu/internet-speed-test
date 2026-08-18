import { ENDPOINTS, CONFIG } from "./config.js";
import { toMbps } from "./stats.js";

/**
 * Upload throughput.
 *
 * Uses XMLHttpRequest rather than fetch, deliberately. fetch gives you no
 * upload progress events — you learn how many bytes went out only once the
 * whole request completes. XHR exposes xhr.upload.onprogress, which is the
 * only way to drive a live gauge during the upload phase.
 *
 * The payload is random rather than a zero-filled buffer for the same reason
 * the download endpoint generates randomness: a compressible body would
 * measure compression, not bandwidth.
 */
function makePayload(bytes) {
  const buf = new Uint8Array(bytes);
  // getRandomValues caps at 65536 bytes per call, so fill in blocks.
  for (let off = 0; off < bytes; off += 65_536) {
    crypto.getRandomValues(buf.subarray(off, Math.min(off + 65_536, bytes)));
  }
  return buf;
}

function postChunk(payload, onDelta, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let lastLoaded = 0;

    xhr.open("POST", ENDPOINTS.upload, true);

    xhr.upload.onprogress = (e) => {
      // e.loaded is cumulative for this request; the engine wants the delta.
      onDelta(e.loaded - lastLoaded);
      lastLoaded = e.loaded;
    };

    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.onabort = () => resolve(0);

    if (signal) {
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }

    xhr.send(payload);
  });
}

export async function measureUpload({
  durationMs = CONFIG.uploadDurationMs,
  streams = CONFIG.uploadStreams,
  chunkBytes = CONFIG.uploadChunkBytes,
  warmupMs = CONFIG.warmupMs,
  maxBytes = CONFIG.maxUploadBytes,
  onSample,
  signal
} = {}) {
  const start = performance.now();
  const deadline = start + durationMs;

  // Generate once and reuse across requests. Regenerating 4 MB of randomness
  // inside the loop would burn CPU that shows up as fake latency.
  const payload = makePayload(chunkBytes);

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
    onSample?.({ mbps, elapsedMs: now - start, phase: "upload" });

    lastT = now;
    lastBytes = totalBytes;
  }, CONFIG.sampleIntervalMs);

  const worker = async () => {
    while (!shouldStop()) {
      try {
        await postChunk(payload, (delta) => {
          totalBytes += delta;
        }, signal);
      } catch {
        break;
      }
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

  return {
    mbps: toMbps(measuredBytes, measuredSeconds),
    totalBytes,
    measuredBytes,
    durationMs: end - start,
    cappedByBytes: stoppedEarly,
    timeline
  };
}
