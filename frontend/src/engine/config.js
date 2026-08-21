/**
 * Every tunable in one place.
 */

export const ENDPOINTS = {
  ping: "/ping.txt",
  download: "/api/download",
  upload: "/api/upload"
};

export const CONFIG = {
  idlePingSamples: 20,

  downloadDurationMs: 10_000,

  // Upload runs longer than download because it ramps far more slowly.
  // Measured evidence: across four runs the final upload samples were
  // consistently ~2x the reported average, and the sparkline was still
  // climbing when a 10s window closed. A test that ends mid-ramp reports
  // the ramp, which is why every run returned the same ~15 Mbps regardless
  // of conditions.
  uploadDurationMs: 15_000,

  // Download reaches steady state quickly; 800ms is enough to skip TCP
  // slow-start.
  warmupMs: 800,

  // Upload needs far more. This is set from the observed ramp length rather
  // than from theory — over HTTP/2 the streams share one connection, so
  // slow-start alone does not explain a multi-second climb at 75ms RTT.
  // Whatever the mechanism, the data says the first few seconds are not
  // representative.
  uploadWarmupMs: 5_000,

  downloadStreams: 5,
  uploadStreams: 4,

  downloadChunkBytes: 4_000_000,

  // 1 MB: completion-based counting means chunk size sets gauge
  // granularity. Netlify's request cap is 6 MB.
  uploadChunkBytes: 1_000_000,

  maxDownloadBytes: 200_000_000,

  // Raised to match the longer window — a 15s upload at 35 Mbps moves ~65 MB,
  // which the old 60 MB ceiling would have truncated, reintroducing the exact
  // problem this change is meant to fix.
  maxUploadBytes: 90_000_000,

  sampleIntervalMs: 200
};

export const LOCAL_TEST_CONFIG = {
  idlePingSamples: 8,
  downloadDurationMs: 3_000,
  uploadDurationMs: 3_000,
  downloadStreams: 2,
  uploadStreams: 2,
  maxDownloadBytes: 30_000_000,
  maxUploadBytes: 10_000_000,
  warmupMs: 300,
  uploadWarmupMs: 300
};
