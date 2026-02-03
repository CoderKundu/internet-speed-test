export default function ResultCards({ data }) {
  if (!data) return null;

  return (
    <div style={{ marginTop: "24px", fontSize: "14px", color: "#e5e7eb" }}>
      <p>⬇️ Download: {data.download} Mbps</p>
      <p>⬆️ Upload: {data.upload} Mbps</p>
      <p>📶 Ping: {data.ping} ms</p>
      <p>🌍 Location: {data.location}</p>
      <p>🏢 ISP: {data.isp}</p>
    </div>
  );
}

