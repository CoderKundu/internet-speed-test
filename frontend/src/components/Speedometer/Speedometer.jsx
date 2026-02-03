const RADIUS = 140;
const STROKE = 16;
const CIRCUMFERENCE = Math.PI * RADIUS;

export default function Speedometer({ speed, mode }) {
  const progress = Math.min(speed / 200, 1);
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const color =
    mode === "download"
      ? "#38bdf8"
      : mode === "upload"
      ? "#22c55e"
      : "#64748b";

  return (
    <div
      style={{
        width: "100%",
        maxWidth:320,
        height: 200,
        position: "relative",
        margin: "0 auto"
      }}
    >
      <svg viewBox="0 0 320 200" width="100%" height="auto">

        {/* Background arc */}
        <path
          d="M 20 180 A 140 140 0 0 1 300 180"
          fill="none"
          stroke="#1e293b"
          strokeWidth={STROKE}
        />

        {/* Progress arc */}
        <path
          d="M 20 180 A 140 140 0 0 1 300 180"
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 0.3s ease-out"
          }}
        />
      </svg>

      {/* Speed number */}
      <div
        style={{
          position: "absolute",
          top: 90,
          width: "100%",
          textAlign: "center"
        }}
      >
        <div style={{ fontSize: "clamp(32px, 8vw, 42px)", fontWeight: "bold" }}>
          {speed.toFixed(1)}
        </div>
        <div style={{ fontSize: "clamp(12px, 3vw, 14px)", color: "#94a3b8" }}>
          Mbps
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            letterSpacing: 1,
            color
          }}
        >
          {mode === "download"
            ? "DOWNLOAD"
            : mode === "upload"
            ? "UPLOAD"
            : "READY"}
        </div>
      </div>
    </div>
  );
}
