import axios from "axios";

export async function fetchSpeedTest() {
  const res = await axios.get("http://localhost:5000/api/speedtest");
  return res.data;
}
