import { CONFIG, LOCAL_TEST_CONFIG } from "./config.js";
import { measureLatency, measureLatencyUntilAborted } from "./latency.js";
import { measureDownload } from "./download.js";
import { measureUpload } from "./upload.js";
import { gradeBufferbloat, didSaturate, buildVerdicts, summarise } from "./verdict.js";
import { percentile } from "./stats.js";

export { CONFIG, LOCAL_TEST_CONFIG } from "./config.js";

/**
 * Runs the full test and returns a single result object.
 *
 * UI-free by design: callbacks in, data out. Drivable from a console, a Web
 * Worker or a component without changing a line.
 */
export async function runTest({ onPhase, onSample, signal, overrides } = {}) {
  const cfg = { ...CONFIG, ...(overrides ?? {}) };
  const startedAt = new Date().toISOString();

  // --- Phase 1: idle latency -------------------------------------------
  onPhase?.("idle-latency");
  const idle = await measureLatency({
    samples: cfg.idlePingSamples,
    signal,
    onSample
  });

  // --- Phase 2: download, latency sampled concurrently ------------------
  onPhase?.("download");

  const loadController = new AbortController();
  const loadedLatencyPromise = measureLatencyUntilAborted({
    signal: loadController.signal
  });

  const download = await measureDownload({
    durationMs: cfg.downloadDurationMs,
    streams: cfg.downloadStreams,
    chunkBytes: cfg.downloadChunkBytes,
    warmupMs: cfg.warmupMs,
    maxBytes: cfg.maxDownloadBytes,
    signal,
    onSample
  });

  loadController.abort();

  let loaded;
  try {
    loaded = await loadedLatencyPromise;
  } catch {
    loaded = { samples: [], median: idle.median, jitter: idle.jitter };
  }

  // --- Phase 3: upload --------------------------------------------------
  onPhase?.("upload");
  const upload = await measureUpload({
    durationMs: cfg.uploadDurationMs,
    streams: cfg.uploadStreams,
    chunkBytes: cfg.uploadChunkBytes,
    warmupMs: cfg.uploadWarmupMs ?? cfg.warmupMs,
    maxBytes: cfg.maxUploadBytes,
    signal,
    onSample
  });

  // --- Assemble ---------------------------------------------------------

  // 95th percentile, not median: bufferbloat is a worst-case property and
  // the median hides the spikes that actually break calls.
  const loadedP95 = loaded.samples.length
    ? percentile(loaded.samples, 95)
    : idle.median;

  const loadedMedian = loaded.samples.length ? loaded.median : idle.median;

  const saturated = didSaturate(download.timeline);
  const bufferbloat = gradeBufferbloat(idle.median, loadedP95, saturated);

  const result = {
    startedAt,
    download: Number(download.mbps.toFixed(2)),
    upload: Number(upload.mbps.toFixed(2)),
    latency: {
      idle: Number(idle.median.toFixed(1)),
      loaded: Number(loadedMedian.toFixed(1)),
      loadedP95: Number(loadedP95.toFixed(1)),
      min: Number(idle.min.toFixed(1)),
      jitter: Number(idle.jitter.toFixed(1))
    },
    bufferbloat,
    saturated,
    bytes: {
      downloaded: download.totalBytes,
      uploaded: upload.totalBytes
    },
    capped: {
      download: download.cappedByBytes,
      upload: upload.cappedByBytes
    },
    uploadDetail: {
      sustained: upload.sustained,
      peak: upload.peak,
      stillRamping: upload.stillRamping,
      requests: upload.requests,
      failures: upload.failures
    },
    timeline: {
      download: download.timeline,
      upload: upload.timeline
    }
  };

  result.verdicts = buildVerdicts({
    download: result.download,
    upload: result.upload,
    latency: result.latency.idle,
    jitter: result.latency.jitter
  });

  result.summary = summarise({
    download: result.download,
    upload: result.upload,
    latency: result.latency.idle,
    jitter: result.latency.jitter,
    bufferbloat: result.bufferbloat
  });

  onPhase?.("done");
  return result;
}

export const runLocalTest = (opts = {}) =>
  runTest({ ...opts, overrides: { ...LOCAL_TEST_CONFIG, ...(opts.overrides ?? {}) } });

if (typeof window !== "undefined") {
  window.__runSpeedTest = runTest;
  window.__runLocalTest = runLocalTest;
}
