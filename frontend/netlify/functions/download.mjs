/**
 * GET /api/download?bytes=N
 *
 * Streams N bytes of freshly generated random data. Random rather than zeros
 * because brotli would flatten a repeating buffer and hand you a fake number.
 */
export default async (req) => {
  const url = new URL(req.url);
  const requested = Number(url.searchParams.get("bytes")) || 4_000_000;
  const total = Math.min(Math.max(requested, 65_536), 16_000_000);

  let sent = 0;

  const stream = new ReadableStream({
    pull(controller) {
      if (sent >= total) {
        controller.close();
        return;
      }
      const size = Math.min(65_536, total - sent);
      const chunk = new Uint8Array(size);
      crypto.getRandomValues(chunk);
      controller.enqueue(chunk);
      sent += size;
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(total),
      "cache-control": "no-store, no-cache, must-revalidate",
      "access-control-allow-origin": "*"
    }
  });
};

export const config = { path: "/api/download" };
