/**
 * Turning numbers into meaning. This is the part reviewers actually engage
 * with — anyone can print 48.2 Mbps, far fewer explain what it implies.
 */

/**
 * Bufferbloat grade.
 *
 * Measures how far latency degrades when the link is saturated. Oversized
 * router buffers queue packets instead of dropping them, so a connection that
 * pings at 20ms idle can sit at 400ms under load — which is why a video call
 * falls apart the moment someone else starts a download, even on a link whose
 * headline speed looks fine.
 *
 * Grading is on the *increase*, not the absolute figure: a satellite link at
 * 600ms idle isn't bloated, it's just far away.
 */
export function gradeBufferbloat(idleMs, loadedMs) {
  const increase = Math.max(0, loadedMs - idleMs);

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

  return { grade, label, increaseMs: increase };
}

/**
 * Activity verdicts. Thresholds are deliberately conservative — the aim is
 * "will this actually work", not "does it technically meet the minimum".
 */
export function buildVerdicts({ download, upload, latency, jitter }) {
  const checks = [
    {
      name: "4K streaming",
      ok: download >= 25,
      detail: "Needs ~25 Mbps down"
    },
    {
      name: "HD video calls",
      ok: download >= 5 && upload >= 3 && jitter < 30,
      detail: "Needs 5 down / 3 up and steady latency"
    },
    {
      name: "Competitive gaming",
      ok: latency < 60 && jitter < 15,
      detail: "Needs sub-60ms latency and low jitter"
    },
    {
      name: "Large file uploads",
      ok: upload >= 10,
      detail: "Needs ~10 Mbps up to be painless"
    },
    {
      name: "Multiple users at once",
      ok: download >= 50 && upload >= 10,
      detail: "Needs headroom for concurrent activity"
    }
  ];

  return checks.map((c) => ({ ...c, status: c.ok ? "pass" : "fail" }));
}

/**
 * One-line summary, driven by whichever dimension is weakest. Reporting the
 * bottleneck is more useful than reporting the headline number.
 */
export function summarise({ download, upload, latency, jitter, bufferbloat }) {
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
