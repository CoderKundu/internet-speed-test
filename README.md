# Internet Speed Test

A browser-based connection diagnostic. Measures download, upload, idle latency,
jitter, and how much latency the connection adds when saturated (bufferbloat).

Live: [net-speedtest.netlify.app](https://net-speedtest.netlify.app)

---

## What this actually measures — and what it doesn't

Every number here has been checked against an independent reference
([fast.com](https://fast.com), which pulls from Netflix's CDN — different
servers, different code, different company). Some of them agree. Some don't.
Both are documented below, because a measurement tool that hides its error
bars is worse than no tool.

### Validated

| Metric | This tool | fast.com | Verdict |
|---|---|---|---|
| Download (≤50 Mbps links) | 90 Mbps | 100 Mbps | Within 10% |
| Bufferbloat (median Δ) | +64.9 ms | +66 ms | Within 2% |
| Jitter | 0.7–1.8 ms | — | Stable across runs |

The bufferbloat agreement is the one I'm most pleased with: two tools with
nothing in common landed a millisecond apart on how much latency the
connection adds under load.

### Known limits

**Download saturates around 50 Mbps.** Not a connection limit — a hosting
one. The download payload is a static asset served from Netlify's edge, and a
single fetch of that asset tops out at 25–47 Mbps regardless of chunk size or
stream count. On a 100 Mbps line this tool reports 20–90 depending on
conditions. Above roughly 50 Mbps, you are measuring Netlify, not your ISP.

**Upload under-reports, badly.** Reported 25–30 Mbps against fast.com's 110.
Uploading requires a server to receive bytes, so a serverless function stays
in the path and becomes the ceiling. There is no static-asset trick for the
upload direction.

**Latency is measured to the CDN edge, not to a nearby server.** This tool
reports ~78 ms; fast.com reports ~10 ms from the same machine. Both are
correct — fast.com's servers are in Noida, Vikaspuri and Patna, and the
Netlify edge serving this project is much further away. The number is real
but answers "how far is Netlify" rather than "how good is your connection."

**The "Worst 5%" figure includes this tool's own transport.** The latency
probe shares an HTTP/2 connection with the download streams, so a probe can
stall behind queued download data. Those 1–2 second outliers are real events
but are not necessarily your router. This is why bufferbloat is graded on the
median, not the 95th percentile.

**Tested on one connection, one browser, one machine.** Chrome on Windows/WSL,
a single Jio fibre line in Lucknow. No mobile testing, no Safari, no genuinely
slow link.

---

## Architecture

Everything is measured in the browser. There is no backend computing speeds.

```
src/engine/
  config.js     all tunables in one place
  stats.js      median, percentile, RFC-3550 jitter
  latency.js    RTT probes against a static asset
  download.js   parallel range requests against a static asset
  upload.js     parallel POSTs to a Worker-style function
  verdict.js    bufferbloat grading, saturation detection, activity verdicts
  index.js      orchestration; returns one result object
```

The engine is UI-free — callbacks in, data out. It runs from a browser
console, a React component, or a Web Worker without modification. `App.jsx`
consumes it and knows nothing about how measurement works.

**Download** issues parallel HTTP range requests against `public/random.bin`,
16 MB of incompressible random bytes served straight from the CDN with no
compute in the path. Fixed duration rather than fixed size, so slow and fast
links both get a usable measurement window. First 800 ms discarded to skip
TCP slow-start.

**Upload** POSTs 1 MB chunks to a function that drains the body and replies
with the byte count. Bytes are counted only when the server acknowledges
them. A 5-second warmup is discarded because upload ramps far more slowly
than download.

**Latency** probes a 1-byte static file, discarding the first two probes so
DNS, TCP and TLS setup don't get reported as network latency.

**Bufferbloat** samples latency *during* the download phase and compares the
median against idle. If the download never sustained near its own peak, the
result is reported as inconclusive rather than graded — you cannot observe
queueing if you never filled the queue.

---

## Measurement bugs found during the rebuild

The original version of this project shelled out to the Ookla CLI on a Render
server. It measured Render's datacentre bandwidth and reported it as the
visitor's connection speed. Every user would have seen the same number.

Fixing that turned out to be the start rather than the end. Each of the
following produced a plausible-looking number that was measuring the wrong
thing:

1. **Ookla CLI on the server** — reported the host's bandwidth, not the
   visitor's.
2. **Latency probed against a serverless function** — function invocation
   overhead counted as network distance. Read 373 ms deployed and 127 ms over
   loopback, where the true round trip is zero. Fixed by probing a static file:
   373 → 80 ms.
3. **Connection setup counted as jitter** — the first probe pays DNS + TCP +
   TLS, and jitter is built from consecutive differences, so one 700 ms
   outlier contributed two enormous ones. 42.3 → 0.4 ms.
4. **Upload progress events measured the socket buffer** — `xhr.upload.onprogress`
   fires when bytes reach the OS buffer, not the server. A 4 MB POST read
   ~104 Mbps on a 9 Mbps link, then zero while it drained. Fixed by counting
   only server-acknowledged bytes.
5. **Upload measured its own ramp** — a 10-second window ended before upload
   reached steady state, so four consecutive runs reported ~15 Mbps while
   their own final samples reached 30–36. Longer window, longer warmup:
   15 → 27 Mbps.
6. **Unsaturated runs graded as excellent** — two runs a minute apart scored
   A (+1 ms) and F (+332 ms) on the same router. The A came from a run that
   never filled the link. Now detected and reported as inconclusive.
7. **Download generated bytes inside a function** — producing crypto-grade
   randomness per request capped throughput at what a Lambda can compute, not
   what the network can carry. This was the same failure as bug 1 in different
   clothing. Fixed with a static asset: 20 → 90 Mbps.

There was also a wrong turn worth recording: bufferbloat was briefly graded on
the 95th percentile of loaded latency, on the reasoning that bufferbloat is a
worst-case property. It sounds right. The data disagreed — median matched
fast.com to within 2%, p95 was off by a factor of eighteen — so it was
reverted.

The through-line: every one of these produced a number that looked like a
measurement and was actually an artifact of how the measurement was taken.
Internal consistency caught most of them. The last one was only caught by
comparing against an outside reference, which is why that comparison is now
documented rather than assumed.

---

## Running locally

```bash
cd frontend
npm install
head -c 16000000 /dev/urandom > public/random.bin   # not committed
netlify dev
```

Note that `netlify dev` cannot test uploads — the local function runtime
crashes with `Cannot write headers after they are sent` under sustained POSTs.
That is a CLI bug, not a project one. Upload has to be tested against a
deploy.

Console access to the engine:

```js
const r = await window.__runSpeedTest({ onPhase: console.log });
console.log(r);
```

---

## What I'd do next

- **Move to Cloudflare Workers.** Unmetered bandwidth and POPs inside India
  would likely lift the download ceiling and cut the latency-to-edge figure.
  The engine is platform-agnostic, so only deployment config and the upload
  handler would change. Untested — listed as a hypothesis, not a plan.
- **Adaptive sizing.** A short probe before the main run to pick chunk sizes
  and stream counts from an estimated rate, so gigabit links get a real
  measurement window instead of hitting a byte ceiling in under a second.
- **Probe latency over a separate connection** to separate genuine router
  queueing from HTTP/2 head-of-line blocking.
- **Run history** in localStorage with a sparkline, so the run-to-run variance
  is visible rather than something the user has to discover.
