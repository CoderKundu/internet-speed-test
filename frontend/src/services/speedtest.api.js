const API_BASE = import.meta.env.VITE_API_URL;

if (!API_BASE) {
  throw new Error("VITE_API_URL is not defined");
}

export const fetchSpeedTest = async () => {
  const res = await fetch(`${API_BASE}/api/speedtest`, {
    method: "GET",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch speed test");
  }

  return res.json();
};
