import { CONFIG, LOCAL_TEST_CONFIG } from "./config.js";
import { measureLatency, measureLatencyUntilAborted } from "./latency.js";
import { measureDownload } from "./download.js";
import { measureUpload } from "./upload.js";
import { gradeBufferbloat, buildVerdicts, summarise } from "./verdict.js";

export { CONFIG, LOCAL_TEST_CONFIG } from "./config.js";

/**
 * Runs the full test and returns a single result object.
 *
 * Deliberately UI-free: no React, no DOM, no rendering assumptions. It takes
 * callbacks and returns data, so it can be driven from a console, a Web
 * Worker, or a component without changing a line.
 *
 * @param {(phase: string) => void}  onPhase   "idle-latency" | "download" | "upload" | "done"
 * @param {(sample: object) => void} onSample  live throughput samples for the gauge
 * @param {AbortSignal}              signal    cancel an in-flight test
 * @param {object}                   overrides partial CONFIG, e.g. LOCAL_TEST_CONFIG
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

  // --- Phase 2: download, with latency sampled concurrently -------------
  // Running the probes *during* saturation is the whole trick. Measuring
  // latency before and after would show nothing interesting.
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
    warmupMs: cfg.warmupMs,
    maxBytes: cfg.maxUploadBytes,
    signal,
    onSample
  });

  // --- Assemble ---------------------------------------------------------
  const loadedMedian = loaded.samples.length ? loaded.median : idle.median;
  const bufferbloat = gradeBufferbloat(idle.median, loadedMedian);

  const result = {
    startedAt,
    download: Number(download.mbps.toFixed(2)),
    upload: Number(upload.mbps.toFixed(2)),
    latency: {
      idle: Number(idle.median.toFixed(1)),
      loaded: Number(loadedMedian.toFixed(1)),
      min: Number(idle.min.toFixed(1)),
      jitter: Number(idle.jitter.toFixed(1))
    },
    bufferbloat,
    bytes: {
      downloaded: download.totalBytes,
      uploaded: upload.totalBytes
    },
    capped: {
      download: download.cappedByBytes,
      upload: upload.cappedByBytes
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

/** Shorthand for console testing against `netlify dev`. */
export const runLocalTest = (opts = {}) =>
  runTest({ ...opts, overrides: { ...LOCAL_TEST_CONFIG, ...(opts.overrides ?? {}) } });

if (typeof window !== "undefined") {
  window.__runSpeedTest = runTest;
  window.__runLocalTest = runLocalTest;
}
