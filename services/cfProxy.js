/**
 * Magnific API Caller — Direct dari Railway server
 * Railway IP bersih, tidak diblokir Magnific
 */
const axios = require('axios');
const keys  = require('./keyStore');
const log   = require('./logger');

const MAGNIFIC_BASE = 'https://api.magnific.com';
const MAX_RETRY     = 5;

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
      data:         body || undefined,
      timeout:      120_000,
      maxRedirects: 5,
      validateStatus: () => true, // handle semua status manual
    });

    const ms  = Date.now() - t0;
    const msg = res.data?.message || res.data?.error || `HTTP ${res.status}`;

    // ── 2xx SUCCESS ──────────────────────────────────────────
    if (res.status >= 200 && res.status < 300) {
      keys.record(keyObj.id, true, ms, null);
      log.success(`✅ ${res.status} (${ms}ms)`);
      return res.data;
    }

    // ── 401 / 403 — key mati ─────────────────────────────────
    if ([401, 403].includes(res.status)) {
      log.error(`❌ ${res.status} — ${msg}`);
      keys.record(keyObj.id, false, ms, `${res.status}: ${msg}`);
      keys.markDead(keyObj.id, `HTTP ${res.status}: ${msg}`);
      if (attempt < MAX_RETRY) {
        log.retry(`🔄 Key mati, ganti key (attempt ${attempt+1}/${MAX_RETRY})`);
        await sleep(500);
        return call(endpoint, method, body, extraHeaders, attempt + 1);
      }
      throw new Error(`Semua key mati (${res.status}). Tambah key baru.`);
    }

    // ── 429 — quota habis, mark dead & coba key lain ─────────
    if (res.status === 429) {
      log.warn(`⛔ Key quota habis (429) — ${msg}`);
      keys.record(keyObj.id, false, ms, `429: ${msg}`);
      keys.markDead(keyObj.id, `429 daily limit`);
      if (attempt < MAX_RETRY) {
        log.retry(`🔄 Coba key lain (attempt ${attempt+1}/${MAX_RETRY})`);
        await sleep(1000);
        return call(endpoint, method, body, extraHeaders, attempt + 1);
      }
      throw new Error('Semua key sudah habis quota harian. Tambah key baru.');
    }

    // ── 404 — endpoint tidak ditemukan ───────────────────────
    if (res.status === 404) {
      log.error(`❌ 404 — ${msg} [${endpoint}]`);
      keys.record(keyObj.id, false, ms, `404: ${msg}`);
      throw new Error(`404: ${msg}`);
    }

    // ── 5xx — server error, retry ────────────────────────────
    if (res.status >= 500) {
      log.error(`❌ ${res.status} — ${msg}`);
      keys.record(keyObj.id, false, ms, `${res.status}: ${msg}`);
      if (attempt < 3) {
        await sleep(2000);
        return call(endpoint, method, body, extraHeaders, attempt + 1);
      }
      throw new Error(`Server error ${res.status}: ${msg}`);
    }

    // ── Other 4xx ────────────────────────────────────────────
    log.error(`❌ ${res.status} — ${msg}`);
    keys.record(keyObj.id, false, ms, `${res.status}: ${msg}`);
    throw new Error(msg);

  } catch (err) {
    // Hanya handle network/timeout error (bukan HTTP error yang sudah dihandle di atas)
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || (!err.response && !err.message.includes('HTTP'))) {
      const ms = Date.now() - t0;
      log.error(`❌ Network/timeout: ${err.message}`);
      keys.record(keyObj.id, false, ms, err.message);
      if (attempt < 3) {
        log.warn(`🔄 Network retry ${attempt+1}/3…`);
        await sleep(3000 * (attempt + 1));
        return call(endpoint, method, body, extraHeaders, attempt + 1);
      }
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
  delete headers['Content-Type']; // form-data set sendiri

  try {
    const res = await axios.post(url, formData, {
      headers, timeout: 120_000,
      maxContentLength: 100 * 1024 * 1024,
      maxBodyLength:    100 * 1024 * 1024,
      validateStatus:   () => true,
    });

    const ms  = Date.now() - t0;
    const msg = res.data?.message || res.data?.error || `HTTP ${res.status}`;

    if (res.status >= 200 && res.status < 300) {
      keys.record(keyObj.id, true, ms, null);
      return res.data;
    }

    keys.record(keyObj.id, false, ms, `${res.status}: ${msg}`);
    if ([401, 403].includes(res.status)) keys.markDead(keyObj.id, `HTTP ${res.status}`);
    if (res.status === 429) keys.markDead(keyObj.id, '429 daily limit');
    if (attempt < 3 && res.status !== 429) {
      await sleep(2000);
      return callForm(endpoint, formData, attempt + 1);
    }
    throw new Error(msg || `Upload error ${res.status}`);

  } catch (err) {
    if (!err.response && attempt < 3) {
      await sleep(2000);
      return callForm(endpoint, formData, attempt + 1);
    }
    throw err;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { call, callForm };
