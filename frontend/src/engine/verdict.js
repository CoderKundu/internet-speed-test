/**
 * Turning numbers into meaning.
 */

export function gradeBufferbloat(idleMs, loadedMedianMs, saturated = true) {
  const increase = Math.max(0, loadedMedianMs - idleMs);

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

/**
 * Activity verdicts, with three outcomes rather than two.
 *
 * ---------------------------------------------------------------------------
 * Why "inconclusive" has to exist
 * ---------------------------------------------------------------------------
 * Every measurement this tool produces is a *lower bound* on the truth, for
 * reasons documented in the README:
 *
 *   - download is capped by the CDN edge above ~50 Mbps
 *   - upload is capped by the serverless function receiving it
 *   - latency is to the CDN edge, which is further away than the servers a
 *     game or call would actually talk to (78ms here vs ~10ms measured by a
 *     test using in-country servers)
 *
 * A check that PASSES on those numbers definitely passes — the real values
 * can only be better. A check that FAILS might still pass in reality.
 *
 * Reporting "4K streaming: FAIL" on a 100 Mbps connection because the tool
 * could only measure 20 is worse than saying nothing. So a failing check is
 * re-evaluated optimistically: peak observed throughput instead of the
 * average, and latency ignored entirely. If it passes optimistically, the
 * honest answer is that we cannot tell.
 *
 * A genuinely slow connection still fails, because its peaks are low too.
 */
export function buildVerdicts({
  download,
  upload,
  latency,
  jitter,
  downloadPeak = 0,
  uploadPeak = 0
}) {
  const checks = [
    {
      name: "4K streaming",
      detail: "Needs ~25 Mbps down",
      fn: (d, u, l) => d >= 25
    },
    {
      name: "HD video calls",
      detail: "Needs 5 down / 3 up, sub-150ms latency, steady jitter",
      fn: (d, u, l) => d >= 5 && u >= 3 && l < 150 && jitter < 30
    },
    {
      name: "Competitive gaming",
      detail: "Needs sub-60ms latency and low jitter",
      fn: (d, u, l) => l < 60 && jitter < 15
    },
    {
      name: "Large file uploads",
      detail: "Needs ~10 Mbps up to be painless",
      fn: (d, u, l) => u >= 10
    },
    {
      name: "Multiple users at once",
      detail: "Needs bandwidth headroom and responsive latency",
      fn: (d, u, l) => d >= 50 && u >= 10 && l < 150
    }
  ];

  const bestDown = Math.max(download, downloadPeak);
  const bestUp = Math.max(upload, uploadPeak);

  return checks.map((c) => {
    if (c.fn(download, upload, latency)) {
      return { name: c.name, detail: c.detail, ok: true, status: "pass" };
    }

    // Could it pass if the tool's known under-measurement were corrected?
    // Latency passed as 0 because there is no upper-bound-free estimate of
    // the true figure — only the knowledge that it is lower than measured.
    if (c.fn(bestDown, bestUp, 0)) {
      return {
        name: c.name,
        detail: c.detail,
        ok: false,
        status: "inconclusive",
        inconclusive: true
      };
    }

    return { name: c.name, detail: c.detail, ok: false, status: "fail" };
  });
}

export function summarise({ download, upload, latency, jitter, bufferbloat }) {
  if (bufferbloat.inconclusive) {
    return "Bandwidth and latency measured cleanly, but the link never saturated, so responsiveness under load could not be assessed.";
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
    return "Limited bandwidth measured. Fine for browsing, tight for HD video — though the figure may be capped by the test host rather than the connection.";
  }
  return "Healthy connection across bandwidth, latency and stability.";
}
