const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

export const fetchSpeedTest = async () => {
  const res = await fetch(`${API_BASE}/api/speedtest`);
  return res.json();
};

