/**
 * ARKX Motion Pro V2 — Cloudflare Worker Proxy v2
 * ─────────────────────────────────────────────────
 * Bypass Magnific IP block dengan:
 * 1. Rotate User-Agent realistis
 * 2. Spoof IP headers dengan residential IP ranges
 * 3. Randomize request fingerprint
 * 4. Strip semua Cloudflare headers
 *
 * DEPLOY:
 * 1. Cloudflare Dashboard → Workers & Pages → Create Worker
 * 2. Edit Code → paste file ini → Save & Deploy
 * 3. Settings → Variables → WORKER_SECRET = arkx_jagoan_2024_XyZ789
 * 4. Copy URL → paste ke Settings app ARKX
 */

const MAGNIFIC_BASE = 'https://api.magnific.com';

// ── User Agent pool — browser terbaru ────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1',
];

// ── Residential IP ranges (Asia, EU, US) ─────────────────────
const IP_RANGES = [
  // Indonesia Telkom
  () => `114.${r(120,125)}.${r(0,255)}.${r(1,254)}`,
  () => `180.${r(240,255)}.${r(0,255)}.${r(1,254)}`,
  // Singapore
  () => `103.${r(1,50)}.${r(0,255)}.${r(1,254)}`,
  () => `175.${r(41,45)}.${r(0,255)}.${r(1,254)}`,
  // US residential
  () => `${r(68,72)}.${r(1,200)}.${r(0,255)}.${r(1,254)}`,
  () => `${r(98,100)}.${r(1,200)}.${r(0,255)}.${r(1,254)}`,
  // EU
  () => `${r(77,80)}.${r(1,200)}.${r(0,255)}.${r(1,254)}`,
  () => `${r(185,190)}.${r(1,200)}.${r(0,255)}.${r(1,254)}`,
];

// Headers yang harus dibuang (Cloudflare & hop-by-hop)
const STRIP_HEADERS = new Set([
  'connection','keep-alive','transfer-encoding','te','trailers',
  'upgrade','proxy-authorization','proxy-connection',
  'x-forwarded-for','x-forwarded-proto','x-real-ip',
  'cf-connecting-ip','cf-ipcountry','cf-ray','cf-visitor',
  'cf-worker','cf-ew-via','cdn-loop',
  'x-arkx-secret','host',
]);

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health' || url.pathname === '/') {
      return json({ ok: true, service: 'ARKX-CF-Proxy-v2', ts: Date.now() });
    }

    // Auth
    const secret = request.headers.get('x-arkx-secret');
    if (!env.WORKER_SECRET || secret !== env.WORKER_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }

    if (url.pathname.startsWith('/proxy/')) {
      return handleProxy(request, url, env);
    }

    return json({ error: 'Not found' }, 404);
  }
};

async function handleProxy(request, url, env) {
  const targetPath = url.pathname.slice('/proxy'.length);
  const targetUrl  = `${MAGNIFIC_BASE}${targetPath}${url.search}`;

  const ua      = pick(USER_AGENTS);
  const fakeIP  = pick(IP_RANGES)();
  const isChrome = ua.includes('Chrome') && !ua.includes('Edg');
  const isSafari = ua.includes('Safari') && !ua.includes('Chrome');

  // Build clean headers
  const fwd = new Headers();

  // Forward hanya header yang aman
  for (const [k, v] of request.headers.entries()) {
    if (!STRIP_HEADERS.has(k.toLowerCase())) {
      fwd.set(k, v);
    }
  }

  // Override dengan browser fingerprint
  fwd.set('host',             'api.magnific.com');
  fwd.set('user-agent',       ua);
  fwd.set('accept',           'application/json, text/plain, */*');
  fwd.set('accept-language',  pick(['en-US,en;q=0.9', 'en-GB,en;q=0.9,id;q=0.8', 'id-ID,id;q=0.9,en;q=0.8']));
  fwd.set('accept-encoding',  'gzip, deflate, br, zstd');
  fwd.set('origin',           'https://www.magnific.com');
  fwd.set('referer',          'https://www.magnific.com/');

  // Spoof IP
  fwd.set('x-forwarded-for',  `${fakeIP}, ${pick(IP_RANGES)()}`);
  fwd.set('x-real-ip',        fakeIP);
  fwd.set('true-client-ip',   fakeIP);

  // Browser-specific headers
  if (isChrome) {
    const ver = ua.match(/Chrome\/(\d+)/)?.[1] || '136';
    fwd.set('sec-ch-ua',          `"Chromium";v="${ver}", "Google Chrome";v="${ver}", "Not-A.Brand";v="99"`);
    fwd.set('sec-ch-ua-mobile',   '?0');
    fwd.set('sec-ch-ua-platform', pick(['"Windows"', '"macOS"', '"Linux"']));
    fwd.set('sec-fetch-dest',     'empty');
    fwd.set('sec-fetch-mode',     'cors');
    fwd.set('sec-fetch-site',     'same-site');
  }

  // Random request ID untuk tiap request
  fwd.set('x-request-id', crypto.randomUUID());

  let body = undefined;
  if (['POST','PUT','PATCH'].includes(request.method)) {
    body = request.body;
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

  const respHeaders = new Headers(corsHeaders());
  const ct = upstream.headers.get('content-type');
  if (ct) respHeaders.set('content-type', ct);
  respHeaders.set('x-proxied-by',      'ARKX-CF-v2');
  respHeaders.set('x-upstream-status', String(upstream.status));

  return new Response(upstream.body, {
    status:  upstream.status,
    headers: respHeaders,
  });
}

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

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function r(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
