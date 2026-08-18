#!/usr/bin/env bash
#
# Writes the three Netlify functions and updates netlify.toml.
#
# Run this from the folder that contains your existing netlify.toml
# (that is `frontend/` unless you moved it):
#
#   bash setup-functions.sh
#
set -euo pipefail

if [ ! -f netlify.toml ]; then
  echo "No netlify.toml here. cd into your frontend folder first."
  echo "Currently in: $(pwd)"
  exit 1
fi

# Keep a copy of the old config in case you want to diff it later.
cp netlify.toml netlify.toml.bak
echo "Backed up existing config to netlify.toml.bak"

mkdir -p netlify/functions

cat > netlify.toml << 'TOML_EOF'
[build]
  command = "npm run build"
  publish = "dist"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

# Order matters. Netlify matches redirects top to bottom and stops at the
# first hit, so the /api rule has to sit above the SPA catch-all.

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
TOML_EOF

cat > netlify/functions/download.mjs << 'DOWNLOAD_EOF'
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
DOWNLOAD_EOF

cat > netlify/functions/upload.mjs << 'UPLOAD_EOF'
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
UPLOAD_EOF

cat > netlify/functions/ping.mjs << 'PING_EOF'
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
PING_EOF

echo "22" > .nvmrc

echo ""
echo "Done. Created:"
echo "  netlify.toml            (updated, old copy at netlify.toml.bak)"
echo "  netlify/functions/download.mjs"
echo "  netlify/functions/upload.mjs"
echo "  netlify/functions/ping.mjs"
echo "  .nvmrc"
echo ""
echo "Next:  netlify dev"
