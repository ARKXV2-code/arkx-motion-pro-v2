/**
 * ARKX Motion Pro V2 — Cloudflare Worker Proxy
 * ─────────────────────────────────────────────
 * Semua request ke Magnific API diforward lewat sini.
 * IP yang terlihat oleh Magnific = IP Cloudflare edge (bersih).
 *
 * CARA DEPLOY (2 menit):
 * 1. Buka https://dash.cloudflare.com → Workers & Pages → Create Worker
 * 2. Klik "Edit Code", paste seluruh isi file ini
 * 3. Klik "Save & Deploy"
 * 4. Copy URL worker (misal: https://arkx-proxy.namakamu.workers.dev)
 * 5. Set secret: Settings → Variables → Add variable
 *    Name: WORKER_SECRET  Value: (string random kuat, sama dengan di .env)
 * 6. Paste URL worker ke CF_WORKER_URL di file .env ARKX
 *
 * ATAU deploy via CLI:
 *   npm install -g wrangler
 *   wrangler login
 *   wrangler deploy cloudflare/worker.js --name arkx-proxy
 *   wrangler secret put WORKER_SECRET
 */

const MAGNIFIC_BASE = 'https://api.magnific.com';

// Pool user-agent realistis untuk rotasi
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
];

const HOP_BY_HOP = new Set([
  'connection','keep-alive','transfer-encoding','te','trailers',
  'upgrade','proxy-authorization','proxy-connection',
  'x-forwarded-for','x-forwarded-proto','x-real-ip',
  'cf-connecting-ip','cf-ipcountry','cf-ray','cf-visitor','cf-worker',
  'x-arkx-secret','host'
]);

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // Health check — tidak perlu auth
    if (url.pathname === '/health' || url.pathname === '/') {
      return json({ ok: true, service: 'ARKX-CF-Proxy', ts: Date.now() });
    }

    // ── Auth check ──────────────────────────────────────────
    const secret = request.headers.get('x-arkx-secret');
    const expectedSecret = env.WORKER_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // ── Route: /proxy/* → forward ke Magnific ───────────────
    if (url.pathname.startsWith('/proxy/')) {
      return handleProxy(request, url, env);
    }

    return json({ error: 'Not found' }, 404);
  }
};

// ─────────────────────────────────────────────────────────────
async function handleProxy(request, url, env) {
  // Strip /proxy prefix → path ke Magnific
  const targetPath = url.pathname.slice('/proxy'.length);
  const targetUrl  = `${MAGNIFIC_BASE}${targetPath}${url.search}`;

  // Build forward headers
  const fwd = new Headers();
  for (const [k, v] of request.headers.entries()) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) fwd.set(k, v);
  }

  // Inject browser-like headers
  fwd.set('user-agent',       pickRandom(USER_AGENTS));
  fwd.set('accept',           'application/json, text/plain, */*');
  fwd.set('accept-language',  'en-US,en;q=0.9');
  fwd.set('accept-encoding',  'gzip, deflate, br');
  fwd.set('origin',            'https://www.magnific.com');
  fwd.set('referer',           'https://www.magnific.com/');
  fwd.set('sec-fetch-dest',    'empty');
  fwd.set('sec-fetch-mode',    'cors');
  fwd.set('sec-fetch-site',    'same-site');
  fwd.set('sec-ch-ua',         '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"');
  fwd.set('sec-ch-ua-mobile',  '?0');
  fwd.set('sec-ch-ua-platform','"Windows"');
  fwd.set('host',              'api.magnific.com');
  // Spoof IP untuk bypass IP block
  fwd.set('x-forwarded-for',  randomIP());
  fwd.set('x-real-ip',        randomIP());
  fwd.set('cf-connecting-ip', randomIP());

  // Body — stream langsung, jangan buffer semua sekaligus
  let body = undefined;
  if (['POST','PUT','PATCH'].includes(request.method)) {
    body = request.body; // stream, bukan arrayBuffer
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method:   request.method,
      headers:  fwd,
      body,
      redirect: 'follow',
    });
  } catch (err) {
    return json({ error: 'Upstream unreachable', detail: err.message }, 502);
  }

  // Forward response
  const respHeaders = new Headers(corsHeaders());
  const ct = upstream.headers.get('content-type');
  if (ct) respHeaders.set('content-type', ct);
  respHeaders.set('x-proxied-by',    'ARKX-CF-Worker');
  respHeaders.set('x-upstream-status', String(upstream.status));

  return new Response(upstream.body, {
    status:  upstream.status,
    headers: respHeaders,
  });
}

// ─────────────────────────────────────────────────────────────
function corsHeaders() {
  return {
    'access-control-allow-origin':  '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age':       '86400',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders() },
  });
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generate random residential IP untuk bypass IP block
function randomIP() {
  const ranges = [
    () => `${r(1,223)}.${r(0,255)}.${r(0,255)}.${r(1,254)}`,
    () => `${r(100,199)}.${r(0,255)}.${r(0,255)}.${r(1,254)}`,
    () => `${r(50,100)}.${r(100,200)}.${r(0,255)}.${r(1,254)}`,
  ];
  return pickRandom(ranges)();
}

function r(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
