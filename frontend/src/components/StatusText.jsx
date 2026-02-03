export default function StatusText({ status }) {
  if (status === "download") return <p>Testing Download Speed…</p>;
  if (status === "upload") return <p>Testing Upload Speed…</p>;
  if (status === "result") return <p>Test Completed</p>;
  return <p>Click start to test your speed</p>;
}
