/**
 * Every tunable in one place.
 */

export const ENDPOINTS = {
  // Both of these are static assets served from the CDN edge, not functions.
  // A function in the path caps throughput at whatever the runtime can
  // produce, which on this project meant reporting 20 Mbps on a 100 Mbps
  // link and 77ms of latency on an 11ms connection.
  ping: "/ping.txt",
  download: "/random.bin",

  // Upload still needs a server to receive bytes, so this one stays a
  // function — and remains the component most likely to under-report.
  upload: "/api/upload"
};

export const CONFIG = {
  idlePingSamples: 20,

  downloadDurationMs: 10_000,
  uploadDurationMs: 15_000,

  warmupMs: 800,
  uploadWarmupMs: 5_000,

  // More streams than before. With a static asset there is no per-request
  // compute cost, so the limiting factor becomes per-request round trips —
  // more concurrency hides that latency.
  downloadStreams: 5,
  uploadStreams: 4,

  // Size of public/random.bin. Range requests carve chunks out of it, so
  // this caps the largest single request.
  downloadAssetBytes: 16_000_000,

  // Larger chunks than the old 4 MB function limit allowed. Fewer requests
  // means less round-trip overhead, which matters on fast links.
  downloadChunkBytes: 8_000_000,

  uploadChunkBytes: 1_000_000,

  // Raised: a 100 Mbps link moves 125 MB in 10 seconds, so the old 200 MB
  // ceiling would have truncated fast connections.
  maxDownloadBytes: 400_000_000,
  maxUploadBytes: 200_000_000,

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
