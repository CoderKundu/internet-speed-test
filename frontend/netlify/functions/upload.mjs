/**
 * POST /api/upload
 *
 * Drains the body and reports the byte count so the client can confirm
 * nothing was truncated. Netlify caps request payloads at 6 MB; keep each
 * POST at 4 MB or under.
 */
export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      }
    });
  }

  if (!req.body) {
    return new Response(JSON.stringify({ received: 0 }), {
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*"
      }
    });
  }

  const reader = req.body.getReader();
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
  }

  return new Response(JSON.stringify({ received }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
  });
};

export const config = { path: "/api/upload" };
