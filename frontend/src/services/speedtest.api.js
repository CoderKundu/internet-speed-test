import axios from "axios";

export async function fetchSpeedTest() {
  const res = await axios.get("http://YOUR-BACKEND-URL/api/speedtest");
  return res.data;
}
