import Header from "../components/Header";
import Speedometer from "../components/Speedometer/Speedometer";
import StatusText from "../components/StatusText";
import ActionButton from "../components/ActionButton";
import ResultCards from "../components/ResultCards";
import { useSpeedTest } from "../hooks/useSpeedTest";

export default function Home() {
  const { status, speed, result, startTest } = useSpeedTest();
const cardAnimation = `
@keyframes cardIn {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
`;

  return (
    <div
  style={{
    minHeight: "100vh",
    background: "radial-gradient(circle at top, #1e293b, #020617 70%)",
    color: "#e5e7eb",
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  }}
>

      <div
  style={{
    width: "90%",
    maxWidth: "420px",
    textAlign: "center",
    padding: "32px",
    background: "rgba(2, 6, 23, 0.85)",
    borderRadius: "20px",
    backdropFilter: "blur(12px)",
    boxShadow:
      "0 0 0 1px rgba(148,163,184,0.05), 0 20px 60px rgba(0,0,0,0.8)",
    animation: "cardIn 0.6s ease-out"
  }}
>



        {/* Header */}
        <Header />

        {/* Status text */}
        <StatusText status={status} />

        {/* Speedometer */}
        <div style={{ margin: "30px 0" }}>
          <Speedometer speed={speed} mode={status} />
        </div>

        {/* Action button */}
        <ActionButton status={status} onClick={startTest} />

        {/* Result cards (only after test completes) */}
        {status === "result" && result && (
          <ResultCards data={result} />
        )}
      </div>
    </div>
  );
}
