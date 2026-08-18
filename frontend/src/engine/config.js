/**
 * Every tunable in one place. Change numbers here, not in the modules.
 */

export const ENDPOINTS = {
  ping: "/api/ping",
  download: "/api/download",
  upload: "/api/upload"
};

export const CONFIG = {
  // Latency
  idlePingSamples: 20,

  // Throughput windows
  downloadDurationMs: 10_000,
  uploadDurationMs: 8_000,

  // Time to ignore at the start of each throughput phase. TCP starts slow and
  // ramps up; including that ramp drags your average well below the truth.
  warmupMs: 800,

  // Parallel connections. A single TCP stream rarely saturates a fast link,
  // so one stream systematically under-reports on good connections.
  downloadStreams: 5,
  uploadStreams: 3,

  // Per-request payload sizes.
  // Netlify caps request bodies at 6 MB (hard 413 above it) and streamed
  // responses at 20 MB. These sit safely under both.
  downloadChunkBytes: 4_000_000,
  uploadChunkBytes: 4_000_000,

  // --- Byte ceilings ---------------------------------------------------
  // A duration-only stop condition is unbounded in bytes. On a gigabit link
  // a 10-second download moves well over a gigabyte, which would burn a
  // month of Netlify's 100 GB free bandwidth in roughly 80 runs — and on
  // loopback, where there is no network limit at all, it simply buries the
  // dev server.
  //
  // The test stops at whichever comes first: the deadline or the ceiling.
  // Fast connections hit the ceiling early and get a shorter (but still
  // valid) measurement window.
  maxDownloadBytes: 200_000_000,
  maxUploadBytes: 60_000_000,

  // How often to emit a live sample for the gauge.
  sampleIntervalMs: 200
};

/**
 * Tiny preset for testing against `netlify dev`.
 *
 * Loopback has effectively infinite bandwidth, so the full config will
 * saturate your CPU and kill the local server before the run finishes. Use
 * this to check the *shape* of the result; real numbers need a deploy.
 *
 *   runTest({ overrides: LOCAL_TEST_CONFIG })
 */
export const LOCAL_TEST_CONFIG = {
  idlePingSamples: 8,
  downloadDurationMs: 3_000,
  uploadDurationMs: 2_000,
  downloadStreams: 2,
  uploadStreams: 1,
  maxDownloadBytes: 30_000_000,
  maxUploadBytes: 10_000_000,
  warmupMs: 300
};
