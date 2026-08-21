/**
 * Turning numbers into meaning.
 */

/**
 * Bufferbloat grade.
 *
 * ---------------------------------------------------------------------------
 * Graded on the 95th percentile of loaded latency, not the median
 * ---------------------------------------------------------------------------
 * Bufferbloat is a worst-case property. What ruins a video call is the spike
 * where a queued packet arrives 400ms late, not the typical round trip. A
 * median smooths those spikes away — which is how a connection that stalls
 * repeatedly under load can still report a healthy-looking average.
 *
 * ---------------------------------------------------------------------------
 * Why saturation has to be checked first
 * ---------------------------------------------------------------------------
 * You can only observe queueing if you fill the queue. Two runs a minute
 * apart on the same router produced A (+1ms) and F (+332ms); the A came from
 * a run that peaked at 55 Mbps and sagged to 20, never saturating the link.
 * Reporting "excellent" there is not a measurement, it is a failure to
 * measure — and it is the more dangerous of the two errors, because it tells
 * someone their connection is fine when it isn't.
 *
 * When the download phase does not sustain near its own peak, this returns
 * an inconclusive result rather than a grade.
 */
export function gradeBufferbloat(idleMs, loadedP95Ms, saturated = true) {
  const increase = Math.max(0, loadedP95Ms - idleMs);

  if (!saturated) {
    return {
      grade: "?",
      label:
        "Inconclusive — the download never sustained enough throughput to fill the connection's buffers, so there was nothing to measure. Run again on a quieter link.",
      increaseMs: increase,
      inconclusive: true
    };
  }

  let grade, label;
  if (increase < 30) {
    grade = "A";
    label = "Excellent — stays responsive under load";
  } else if (increase < 60) {
    grade = "B";
    label = "Good — minor slowdown under load";
  } else if (increase < 100) {
    grade = "C";
    label = "Fair — noticeable lag when busy";
  } else if (increase < 200) {
    grade = "D";
    label = "Poor — calls will stutter during downloads";
  } else {
    grade = "F";
    label = "Severe — unusable for calls while anything else runs";
  }

  return { grade, label, increaseMs: increase, inconclusive: false };
}

/**
 * Did the download phase actually saturate the link?
 *
 * Compares what the second half of the run sustained against the run's own
 * peak. A healthy saturating run ramps up and then holds near its ceiling. A
 * run that peaks early and decays never found the ceiling at all.
 *
 * Deliberately relative: absolute thresholds cannot work when the same code
 * runs on a 5 Mbps line and a gigabit one.
 */
export function didSaturate(timeline) {
  const vals = timeline.map((t) => t.mbps).filter((v) => v > 0.5);
  if (vals.length < 8) return false;

  const sorted = [...vals].sort((a, b) => a - b);
  const peak = sorted[Math.floor(sorted.length * 0.9)];
  if (peak <= 0) return false;

  const secondHalf = vals.slice(Math.floor(vals.length / 2));
  const sustained =
    secondHalf.slice().sort((a, b) => a - b)[Math.floor(secondHalf.length / 2)];

  return sustained / peak >= 0.6;
}

export function buildVerdicts({ download, upload, latency, jitter }) {
  const checks = [
    { name: "4K streaming", ok: download >= 25, detail: "Needs ~25 Mbps down" },
    {
      name: "HD video calls",
      ok: download >= 5 && upload >= 3 && latency < 150 && jitter < 30,
      detail: "Needs 5 down / 3 up, sub-150ms latency, steady jitter"
    },
    {
      name: "Competitive gaming",
      ok: latency < 60 && jitter < 15,
      detail: "Needs sub-60ms latency and low jitter"
    },
    { name: "Large file uploads", ok: upload >= 10, detail: "Needs ~10 Mbps up to be painless" },
    {
      name: "Multiple users at once",
      ok: download >= 50 && upload >= 10 && latency < 150,
      detail: "Needs bandwidth headroom and responsive latency"
    }
  ];

  return checks.map((c) => ({ ...c, status: c.ok ? "pass" : "fail" }));
}

export function summarise({ download, upload, latency, jitter, bufferbloat }) {
  if (bufferbloat.inconclusive) {
    return "Bandwidth and latency measured cleanly, but the link never saturated, so responsiveness under load could not be assessed.";
  }
  if (latency > 200) {
    return "Bandwidth is fine, but round-trip latency is very high — anything interactive will feel sluggish.";
  }
  if (bufferbloat.grade === "F" || bufferbloat.grade === "D") {
    return "Fast on paper, but latency collapses under load — likely router buffer bloat.";
  }
  if (jitter > 30) {
    return "Throughput is fine but latency is unstable, which hurts calls and gaming.";
  }
  if (upload < 3 && download > 25) {
    return "Strong download, weak upload — typical of cable and older DSL lines.";
  }
  if (download < 10) {
    return "Limited bandwidth. Fine for browsing, tight for HD video.";
  }
  return "Healthy connection across bandwidth, latency and stability.";
}
