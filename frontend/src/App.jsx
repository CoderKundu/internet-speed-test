import { useState, useRef, useCallback } from "react";
import { runTest } from "./engine/index.js";

/* ── palette (from the design) ─────────────────────────────────────────── */
const CYAN = "oklch(0.78 0.13 195)";
const AMBER = "oklch(0.80 0.13 75)";
const RED = "oklch(0.68 0.17 25)";
const MUTED = "oklch(0.50 0.008 230)";
const TEXT = "oklch(0.93 0.005 230)";
const GRID = "oklch(0.27 0.008 230)";
const BG = "oklch(0.155 0.006 230)";
const CARD = "oklch(0.19 0.007 230)";
const DIM = "oklch(0.62 0.008 230)";

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
const SANS = "'IBM Plex Sans', system-ui, sans-serif";

/* Gauge geometry: r=88 → circumference 552.92, arc spans 75% of it. */
const CIRC = 552.92;
const ARC = 414.69;

const BAR_SLOTS = 54;

/**
 * Rounds to the nearest 5.
 *
 * Deliberate: three consecutive runs on this connection produced 41.96,
 * 54.61 and 84.4 Mbps. Printing "41.96" implies a precision the measurement
 * does not have. "≈40" is both shorter and more honest.
 */
const round5 = (n) => Math.round(n / 5) * 5;

const pctOf = (arr, p) => {
  const v = arr.filter((x) => x > 1).sort((a, b) => a - b);
  if (!v.length) return 0;
  return v[Math.min(v.length - 1, Math.floor((v.length - 1) * p))];
};

export default function App() {
  const [phase, setPhase] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(0);
  const [dlSamples, setDlSamples] = useState([]);
  const [ulSamples, setUlSamples] = useState([]);
  const [idlePing, setIdlePing] = useState(0);
  const abortRef = useRef(null);

  const running = phase !== "idle" && phase !== "done" && phase !== "error";

  const onSample = useCallback((s) => {
    if (s.rtt !== undefined) {
      setIdlePing(s.rtt);
      return;
    }
    if (s.mbps === undefined) return;
    setLive(s.mbps);
    if (s.phase === "download") setDlSamples((p) => [...p, s.mbps]);
    else if (s.phase === "upload") setUlSamples((p) => [...p, s.mbps]);
  }, []);

  const run = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setResult(null);
    setError(null);
    setDlSamples([]);
    setUlSamples([]);
    setLive(0);
    setIdlePing(0);

    try {
      const r = await runTest({
        signal: controller.signal,
        onPhase: (p) => setPhase(p === "idle-latency" ? "latency" : p),
        onSample
      });
      setResult(r);
      setPhase("done");
    } catch (e) {
      if (controller.signal.aborted) {
        setPhase("idle");
      } else {
        setError(e?.message ?? String(e));
        setPhase("error");
      }
    }
  };

  const stop = () => abortRef.current?.abort();

  /* ── derived display values ──────────────────────────────────────────── */
  const bb = result?.bufferbloat;
  const bbColor = !bb ? MUTED : bb.inconclusive ? MUTED : bb.grade === "A" || bb.grade === "B" ? CYAN : bb.grade === "C" ? AMBER : RED;

  const dlScale = Math.max(50, ...dlSamples, result?.download ?? 0) * 1.1;
  const ulScale = Math.max(10, ...ulSamples, result?.upload ?? 0) * 1.1;

  let gaugeValue = "—";
  let gaugeUnit = "idle";
  let gaugeColor = GRID;
  let gaugeFrac = 0;
  let caption = "Ready to test";

  if (phase === "latency") {
    gaugeValue = idlePing.toFixed(0);
    gaugeUnit = "ms latency";
    gaugeColor = CYAN;
    gaugeFrac = Math.min(1, idlePing / 200);
    caption = "Phase 1 / 3 — latency";
  } else if (phase === "download") {
    gaugeValue = live.toFixed(1);
    gaugeUnit = "Mbps down";
    gaugeColor = CYAN;
    gaugeFrac = Math.min(1, live / dlScale);
    caption = "Phase 2 / 3 — download";
  } else if (phase === "upload") {
    gaugeValue = live.toFixed(1);
    gaugeUnit = "Mbps up";
    gaugeColor = AMBER;
    gaugeFrac = Math.min(1, live / ulScale);
    caption = "Phase 3 / 3 — upload";
  } else if (phase === "done" && result) {
    gaugeValue = "≈" + round5(result.download);
    gaugeUnit = "Mbps down";
    gaugeColor = CYAN;
    gaugeFrac = Math.min(1, result.download / dlScale);
    caption = "Test complete";
  } else if (phase === "error") {
    gaugeValue = "—";
    gaugeUnit = "failed";
    gaugeColor = RED;
    caption = "Test failed";
  }

  const order = { idle: 0, latency: 1, download: 2, upload: 3, done: 4, error: 4 };
  const cur = order[phase] ?? 0;

  const phaseRow = (name, idx, liveVal, doneVal, accent) => {
    const state = cur > idx ? "done" : cur === idx ? "live" : "wait";
    return {
      name,
      color: state === "wait" ? MUTED : state === "live" ? accent : TEXT,
      dot: state === "wait" ? "oklch(0.32 0.008 230)" : accent,
      value: state === "wait" ? "—" : state === "live" ? liveVal : doneVal
    };
  };

  const phases = [
    phaseRow("Latency", 1, idlePing.toFixed(0) + " ms",
      result ? result.latency.idle.toFixed(1) + " ms" : "—", CYAN),
    phaseRow("Download", 2, live.toFixed(0) + " Mbps",
      result ? "≈" + round5(result.download) + " Mbps" : "—", CYAN),
    phaseRow("Upload", 3, live.toFixed(1) + " Mbps",
      result ? "≈" + round5(result.upload) + " Mbps" : "—", AMBER)
  ];

  const bars = (samples, scale, color) => {
    const slots = Array.from({ length: BAR_SLOTS }, (_, i) => samples[i]);
    return slots.map((v, i) => ({
      h: v === undefined ? "2%" : Math.max(2, (v / scale) * 100) + "%",
      o: v === undefined ? 0.12 : i === samples.length - 1 && running ? 1 : 0.7,
      color
    }));
  };

  const showDl = phase === "upload" || phase === "done" || dlSamples.length > 0;
  const dlLo = round5(pctOf(dlSamples, 0.1));
  const dlHi = round5(pctOf(dlSamples, 0.9));
  const ulLo = pctOf(ulSamples, 0.1).toFixed(1);
  const ulHi = pctOf(ulSamples, 0.9).toFixed(1);

  const lat = result?.latency;
  const latencyStats = [
    { label: "Idle", value: lat ? lat.idle.toFixed(1) : "—", color: TEXT },
    { label: "Under load", value: lat ? lat.loaded.toFixed(1) : "—", color: bbColor },
    { label: "Minimum", value: lat ? lat.min.toFixed(1) : "—", color: TEXT },
    { label: "Jitter", value: lat ? lat.jitter.toFixed(1) : "—", color: lat && lat.jitter > 15 ? AMBER : TEXT }
  ];

  const bbMax = Math.max(lat?.loaded ?? 1, 1);
  const passCount = result?.verdicts.filter((v) => v.ok).length ?? 0;
  const capped = result?.capped?.download || result?.capped?.upload;

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: SANS, padding: "32px 28px 64px", boxSizing: "border-box" }}>
      <style>{`
        @keyframes pulseDot { 0%,100%{opacity:.25} 50%{opacity:1} }
        @media (max-width: 900px) {
          .split { grid-template-columns: 1fr !important; }
          .bbsplit { grid-template-columns: 1fr !important; }
          .stats { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* header */}
        <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, paddingBottom: 18, borderBottom: `1px solid ${GRID}`, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: DIM }}>Connection diagnostic</div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em" }}>Speed &amp; responsiveness test</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: "oklch(0.55 0.008 230)", textAlign: "right", lineHeight: 1.6 }}>
              <div>{result ? new Date(result.startedAt).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—"}</div>
              <div>{result ? `${(result.bytes.downloaded / 1e6).toFixed(1)} MB down · ${(result.bytes.uploaded / 1e6).toFixed(1)} MB up` : "no data yet"}</div>
            </div>
            <button
              onClick={running ? stop : run}
              style={{
                fontFamily: MONO, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase",
                padding: "12px 22px", borderRadius: 2,
                border: `1px solid ${running ? "oklch(0.68 0.17 25 / 0.5)" : "oklch(0.78 0.13 195 / 0.5)"}`,
                background: running ? "oklch(0.68 0.17 25 / 0.10)" : "oklch(0.78 0.13 195 / 0.10)",
                color: running ? RED : "oklch(0.84 0.11 195)", cursor: "pointer"
              }}>
              {running ? "Stop" : phase === "done" ? "Run again" : "Run test"}
            </button>
          </div>
        </header>

        {error && (
          <div style={{ border: `1px solid oklch(0.68 0.17 25 / 0.5)`, background: "oklch(0.68 0.17 25 / 0.08)", borderRadius: 3, padding: 16, fontFamily: MONO, fontSize: 12, color: RED }}>
            Test failed: {error}
          </div>
        )}

        {capped && (
          <div style={{ border: `1px solid oklch(0.80 0.13 75 / 0.4)`, background: "oklch(0.80 0.13 75 / 0.06)", borderRadius: 3, padding: 14, fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: AMBER }}>
            Data ceiling reached before the time window closed — the measurement ran shorter than intended, so treat these figures as less settled than usual.
          </div>
        )}

        {/* gauge + metrics */}
        <section className="split" style={{ display: "grid", gridTemplateColumns: "400px 1fr", gap: 20, alignItems: "stretch" }}>

          <div style={{ border: `1px solid ${GRID}`, background: CARD, borderRadius: 3, padding: "26px 26px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: DIM }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: running ? CYAN : GRID, animation: running ? "pulseDot 1.2s infinite" : "none" }} />
              <span>{caption}</span>
            </div>

            <div style={{ position: "relative", width: "100%", aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg viewBox="0 0 200 200" style={{ width: "100%", height: "100%", transform: "rotate(135deg)" }}>
                <circle cx="100" cy="100" r="88" fill="none" stroke="oklch(0.26 0.008 230)" strokeWidth="9" strokeDasharray={`${ARC} ${CIRC}`} strokeLinecap="round" />
                <circle cx="100" cy="100" r="88" fill="none" stroke={gaugeColor} strokeWidth="9" strokeDasharray={`${(ARC * gaugeFrac).toFixed(1)} ${CIRC}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 180ms linear" }} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                <div style={{ fontFamily: MONO, fontSize: 64, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{gaugeValue}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: "oklch(0.60 0.008 230)" }}>{gaugeUnit}</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 1, background: GRID, border: `1px solid ${GRID}`, borderRadius: 2, overflow: "hidden" }}>
              {phases.map((p) => (
                <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: "oklch(0.21 0.007 230)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.dot, flex: "none" }} />
                  <span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: p.color, flex: 1 }}>{p.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: p.color, fontVariantNumeric: "tabular-nums" }}>{p.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

              <MetricCard
                label="Download"
                value={showDl && result ? "≈" + round5(result.download) : running && phase === "download" ? live.toFixed(0) : "—"}
                note={dlSamples.length ? `samples ranged ${dlLo}–${dlHi} Mbps` : "waiting for samples"}
                bars={bars(dlSamples, dlScale, CYAN)}
              />

              <MetricCard
                label="Upload"
                value={result ? "≈" + round5(result.upload) : running && phase === "upload" ? live.toFixed(1) : "—"}
                note={ulSamples.length ? `samples ranged ${ulLo}–${ulHi} Mbps` : "waiting for samples"}
                bars={bars(ulSamples, ulScale, AMBER)}
              />
            </div>

            <div className="stats" style={{ border: `1px solid ${GRID}`, borderRadius: 3, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: GRID, padding: 1 }}>
              {latencyStats.map((s) => (
                <div key={s.label} style={{ background: CARD, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "oklch(0.60 0.008 230)" }}>{s.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", color: s.color }}>{s.value}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: "oklch(0.55 0.008 230)" }}>ms</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* bufferbloat */}
        <section style={{ border: `1px solid ${result ? bbColor + " / 0.55" : GRID}`, background: CARD, borderRadius: 3, overflow: "hidden" }}>
          <div className="bbsplit" style={{ display: "grid", gridTemplateColumns: "240px 1fr", alignItems: "stretch" }}>
            <div style={{ padding: 30, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 16, borderRight: `1px solid ${GRID}` }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "oklch(0.66 0.008 230)" }}>Bufferbloat</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                <span style={{ fontFamily: MONO, fontSize: 104, fontWeight: 600, lineHeight: 0.8, letterSpacing: "-0.05em", color: bbColor }}>{bb?.grade ?? "—"}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "oklch(0.60 0.008 230)" }}>grade</span>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.7, color: DIM }}>Latency added while the link is saturated. Most speed tests never report it.</div>
            </div>

            <div style={{ padding: 30, display: "flex", flexDirection: "column", gap: 22 }}>
              <div style={{ fontSize: 19, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.4, maxWidth: "52ch" }}>
                {bb?.label ?? "Run the test to measure how latency behaves under load."}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <BloatBar label="Idle" width={lat ? (lat.idle / bbMax) * 100 + "%" : "0%"} value={lat ? lat.idle.toFixed(1) : "—"} color={CYAN} />
                <BloatBar label="Under load" width={lat ? "100%" : "0%"} value={lat ? lat.loaded.toFixed(1) : "—"} color={bbColor} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: MONO, fontSize: 13, color: bbColor }}>
                <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}>{!bb ? "—" : bb.inconclusive ? "n/a" : "+" + Math.round(bb.increaseMs) + " ms"}</span>
                <span style={{ color: DIM }}>{bb?.inconclusive ? "link never saturated — nothing to measure" : "added latency when the connection is busy"}</span>
              </div>
            </div>
          </div>
        </section>

        {/* verdicts */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: DIM }}>What this connection can do</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: "oklch(0.55 0.008 230)" }}>{result ? `${passCount} of ${result.verdicts.length} pass` : ""}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
            {(result?.verdicts ?? PLACEHOLDER_VERDICTS).map((v) => {
              const done = Boolean(result);
              const color = done ? (v.ok ? CYAN : RED) : MUTED;
              const border = done ? (v.ok ? "oklch(0.78 0.13 195 / 0.4)" : "oklch(0.68 0.17 25 / 0.4)") : GRID;
              return (
                <div key={v.name} style={{ border: `1px solid ${border}`, background: CARD, borderRadius: 3, padding: 18, display: "flex", flexDirection: "column", gap: 10, minHeight: 118 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{v.name}</span>
                    <span style={{ fontFamily: MONO, fontSize: 13, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", border: `1px solid ${border}`, color, flex: "none" }}>
                      {done ? (v.ok ? "✓" : "✕") : "·"}
                    </span>
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.6, color: "oklch(0.60 0.008 230)" }}>{v.detail}</div>
                  <div style={{ marginTop: "auto", fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color }}>
                    {done ? v.status : "pending"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* summary */}
        <section style={{ borderTop: `1px solid ${GRID}`, paddingTop: 18, display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: DIM, paddingTop: 3, flex: "none" }}>Summary</div>
          <div style={{ fontSize: 16, lineHeight: 1.6, maxWidth: "70ch", color: "oklch(0.86 0.005 230)" }}>
            {result?.summary ?? "Run the test to get a verdict."}
          </div>
        </section>

      </div>
    </div>
  );
}

function MetricCard({ label, value, note, bars }) {
  return (
    <div style={{ border: `1px solid ${GRID}`, background: CARD, borderRadius: 3, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: DIM }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 46, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        <span style={{ fontFamily: MONO, fontSize: 14, color: "oklch(0.60 0.008 230)" }}>Mbps</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, lineHeight: 1.7, color: "oklch(0.60 0.008 230)" }}>{note}</div>
      <div style={{ height: 56, display: "flex", alignItems: "flex-end", gap: 2 }}>
        {bars.map((b, i) => (
          <div key={i} style={{ flex: 1, background: b.color, borderRadius: 1, minHeight: 1, height: b.h, opacity: b.o, transition: "height 160ms linear, opacity 160ms linear" }} />
        ))}
      </div>
    </div>
  );
}

function BloatBar({ label, width, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 104, fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: DIM }}>{label}</div>
      <div style={{ flex: 1, height: 20, background: "oklch(0.23 0.007 230)", borderRadius: 1, overflow: "hidden" }}>
        <div style={{ height: "100%", background: color, width, transition: "width 700ms cubic-bezier(.2,.7,.3,1)" }} />
      </div>
      <div style={{ width: 92, textAlign: "right", fontFamily: MONO, fontSize: 14, fontVariantNumeric: "tabular-nums", color }}>{value} ms</div>
    </div>
  );
}

const PLACEHOLDER_VERDICTS = [
  { name: "4K streaming", detail: "Needs ~25 Mbps down", ok: false, status: "pending" },
  { name: "HD video calls", detail: "Needs 5 down / 3 up, sub-150ms latency, steady jitter", ok: false, status: "pending" },
  { name: "Competitive gaming", detail: "Needs sub-60ms latency and low jitter", ok: false, status: "pending" },
  { name: "Large file uploads", detail: "Needs ~10 Mbps up to be painless", ok: false, status: "pending" },
  { name: "Multiple users at once", detail: "Needs bandwidth headroom and responsive latency", ok: false, status: "pending" }
];
