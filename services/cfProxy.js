/**
 * Magnific API Caller
 * Direct call ke api.magnific.com dari Railway server
 * Railway IP = bersih, tidak diblokir Magnific
 */
const axios  = require('axios');
const keys   = require('./keyStore');
const log    = require('./logger');

const MAGNIFIC_BASE = 'https://api.magnific.com';
const MAX_RETRY     = 5;

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

function pickUA() { return UA_POOL[Math.floor(Math.random() * UA_POOL.length)]; }

function buildHeaders(apiKey, extra = {}) {
  return {
    'x-magnific-api-key': apiKey,
    'Content-Type':       'application/json',
    'User-Agent':         pickUA(),
    'Accept':             'application/json, text/plain, */*',
    'Accept-Language':    'en-US,en;q=0.9',
    'Accept-Encoding':    'gzip, deflate, br',
    'Origin':             'https://www.magnific.com',
    'Referer':            'https://www.magnific.com/',
    'sec-fetch-dest':     'empty',
    'sec-fetch-mode':     'cors',
    'sec-fetch-site':     'same-site',
    'sec-ch-ua':          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile':   '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Cache-Control':      'no-cache',
    'Pragma':             'no-cache',
    ...extra,
  };
}

async function call(endpoint, method = 'GET', body = null, extraHeaders = {}, attempt = 0) {
  const keyObj = keys.smart();
  if (!keyObj) throw new Error('Tidak ada API key aktif. Tambahkan key di tab Keys.');

  const url     = `${MAGNIFIC_BASE}${endpoint}`;
  const t0      = Date.now();
  const headers = buildHeaders(keyObj.key, extraHeaders);

  log.info(`📡 [${attempt > 0 ? `retry#${attempt}` : 'req'}] ${method} ${endpoint} [key:${keyObj.id.slice(0,8)}…]`);

  try {
    const res = await axios({
      method, url, headers,
      data:    body || undefined,
      timeout: 120_000,
      maxRedirects: 5,
      validateStatus: s => s < 500, // jangan throw untuk 4xx, handle manual
    });

    const ms = Date.now() - t0;

    // Handle 4xx manual
    if (res.status >= 400) {
      const msg = res.data?.message || res.data?.error || `HTTP ${res.status}`;
      log.error(`❌ ${res.status} — ${msg}`);
      keys.record(keyObj.id, false, ms, `${res.status}: ${msg}`);

      if ([401, 403].includes(res.status)) {
        keys.markDead(keyObj.id, `HTTP ${res.status}: ${msg}`);
        if (attempt < MAX_RETRY) {
          log.retry(`🔄 Key mati (${res.status}), ganti key attempt ${attempt+1}/${MAX_RETRY}`);
          await sleep(500);
          return call(endpoint, method, body, extraHeaders, attempt + 1);
        }
      }

      if (res.status === 429 && attempt < MAX_RETRY) {
        const wait = (attempt + 1) * 5000;
        log.warn(`⏳ Rate limit, tunggu ${wait}ms…`);
        await sleep(wait);
        return call(endpoint, method, body, extraHeaders, attempt + 1);
      }

      throw new Error(msg);
    }

    keys.record(keyObj.id, true, ms, null);
    log.success(`✅ ${res.status} (${ms}ms)`);
    return res.data;

  } catch (err) {
    // Network/timeout error
    if (!err.response) {
      const ms = Date.now() - t0;
      log.error(`❌ Network error: ${err.message}`);
      keys.record(keyObj.id, false, ms, err.message);

      if (attempt < 3) {
        log.warn(`🔄 Network retry ${attempt+1}/3…`);
        await sleep(3000 * (attempt + 1));
        return call(endpoint, method, body, extraHeaders, attempt + 1);
      }
      throw new Error(`Network error: ${err.message}. Pastikan server bisa akses api.magnific.com`);
    }

    throw err;
  }
}

async function callForm(endpoint, formData, attempt = 0) {
  const keyObj = keys.smart();
  if (!keyObj) throw new Error('Tidak ada API key aktif');

  const url     = `${MAGNIFIC_BASE}${endpoint}`;
  const t0      = Date.now();
  const headers = buildHeaders(keyObj.key, formData.getHeaders());
  // Remove Content-Type dari buildHeaders karena form-data set sendiri
  delete headers['Content-Type'];

  try {
    const res = await axios.post(url, formData, {
      headers,
      timeout: 120_000,
      maxContentLength: 100 * 1024 * 1024,
      maxBodyLength:    100 * 1024 * 1024,
    });
    keys.record(keyObj.id, true, Date.now() - t0, null);
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    const msg    = err.response?.data?.message || err.message;
    keys.record(keyObj.id, false, Date.now() - t0, `${status}: ${msg}`);
    if ([401, 403].includes(status)) keys.markDead(keyObj.id, `HTTP ${status}`);
    if (attempt < 3) { await sleep(2000); return callForm(endpoint, formData, attempt + 1); }
    throw new Error(msg || `Upload error ${status}`);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { call, callForm };
