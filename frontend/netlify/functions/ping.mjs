/**
 * GET /api/ping
 *
 * 204, no body, as fast as possible. Anything in here inflates your
 * latency figure.
 */
export default async () =>
  new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate",
      "access-control-allow-origin": "*"
    }
  });

export const config = { path: "/api/ping" };
