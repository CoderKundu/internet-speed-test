export default function ActionButton({ status, onClick }) {
  const disabled = status === "download" || status === "upload";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        marginTop: "24px",
        padding: "12px 30px",
        fontSize: "14px",
        fontWeight: 600,
        letterSpacing: "0.6px",
        color: "#020617",
        background: disabled
          ? "#64748b"
          : "linear-gradient(135deg, #38bdf8, #22d3ee)",
        border: "none",
        borderRadius: "999px",
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled
          ? "none"
          : "0 10px 30px rgba(34,211,238,0.35)",
        transition: "all 0.25s ease"
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow =
            "0 15px 40px rgba(34,211,238,0.5)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow =
          "0 10px 30px rgba(34,211,238,0.35)";
      }}
    >
      {status === "result" ? "TEST AGAIN 🚀" : "START TEST ⚡"}
    </button>
  );
}


