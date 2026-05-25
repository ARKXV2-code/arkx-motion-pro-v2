/**
 * Magnific API Caller — via Cloudflare Worker Proxy
 * Railway → CF Worker (IP bersih) → Magnific API
 *
 * CF Worker URL: process.env.CF_WORKER_URL
 * CF Worker Secret: process.env.CF_WORKER_SECRET
 *
 * Fallback: direct ke Magnific kalau CF Worker tidak dikonfigurasi
 */
const axios = require('axios');
const keys  = require('./keyStore');
const log   = require('./logger');

const MAX_RETRY = 5;

function getWorkerUrl()    { return (process.env.CF_WORKER_URL    || '').replace(/\/$/, ''); }
function getWorkerSecret() { return process.env.CF_WORKER_SECRET  || ''; }

function buildUrl(endpoint) {
  const workerUrl = getWorkerUrl();
  if (workerUrl) {
    // Lewat CF Worker: https://worker.dev/proxy/v1/ai/...
    return `${workerUrl}/proxy${endpoint}`;
  }
  // Fallback direct
  return `https://api.magnific.com${endpoint}`;
}

function buildHeaders(apiKey, extra = {}) {
  const workerUrl    = getWorkerUrl();
  const workerSecret = getWorkerSecret();

  const headers = {
    'x-magnific-api-key': apiKey,
    'Content-Type':       'application/json',
    'Accept':             'application/json, text/plain, */*',
    ...extra,
  };

  // Tambah secret kalau pakai CF Worker
  if (workerUrl && workerSecret) {
    headers['x-arkx-secret'] = workerSecret;
  }

  return headers;
}

async function call(endpoint, method = 'GET', body = null, extraHeaders = {}, attempt = 0) {
  const keyObj = keys.smart();
  if (!keyObj) throw new Error('Tidak ada API key aktif. Tambahkan key di tab Keys.');

  const url     = buildUrl(endpoint);
  const t0      = Date.now();
  const headers = buildHeaders(keyObj.key, extraHeaders);
  const via     = getWorkerUrl() ? '→ CF Worker' : '→ Direct';

  log.info(`📡 [${attempt > 0 ? `retry#${attempt}` : 'req'}] ${method} ${endpoint} [key:${keyObj.id.slice(0,8)}…] ${via}`);

  try {
    const res = await axios({
      method, url, headers,
      data:           body || undefined,
      timeout:        120_000,
      maxRedirects:   5,
      validateStatus: () => true,
    });

    const ms  = Date.now() - t0;
    const msg = res.data?.message || res.data?.error || `HTTP ${res.status}`;

    // ── 2xx SUCCESS ──────────────────────────────────────────
    if (res.status >= 200 && res.status < 300) {
      keys.record(keyObj.id, true, ms, null);
      log.success(`✅ ${res.status} (${ms}ms)`);
      return res.data;
    }

    // ── 401 / 403 — key mati atau IP block ───────────────────
    if ([401, 403].includes(res.status)) {
      log.error(`❌ ${res.status} — ${msg}`);
      keys.record(keyObj.id, false, ms, `${res.status}: ${msg}`);
      // Hanya mark dead kalau bukan IP block
      const isIpBlock = msg.toLowerCase().includes('ip') || msg.toLowerCase().includes('block') || msg.toLowerCase().includes('suspicious');
      if (!isIpBlock) keys.markDead(keyObj.id, `HTTP ${res.status}: ${msg}`);
      if (attempt < MAX_RETRY) {
        await sleep(500);
        return call(endpoint, method, body, extraHeaders, attempt + 1);
      }
      throw new Error(isIpBlock ? '⛔ IP diblokir Magnific. Pastikan CF Worker aktif.' : `Semua key mati (${res.status}). Tambah key baru.`);
    }

    // ── 429 — quota habis ────────────────────────────────────
    if (res.status === 429) {
      log.warn(`⛔ Key quota habis (429) — ${msg}`);
      keys.record(keyObj.id, false, ms, `429: ${msg}`);
      keys.markDead(keyObj.id, `429 daily limit`);
      if (attempt < MAX_RETRY) {
        log.info(`🔄 Coba key lain (attempt ${attempt+1}/${MAX_RETRY})`);
        await sleep(1000);
        return call(endpoint, method, body, extraHeaders, attempt + 1);
      }
      throw new Error('Semua key sudah habis quota harian. Tambah key baru.');
    }

    // ── 404 ──────────────────────────────────────────────────
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
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' ||
        (!err.response && !err.message.includes('HTTP') && !err.message.includes('404') && !err.message.includes('429'))) {
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

  const url          = buildUrl(endpoint);
  const t0           = Date.now();
  const workerSecret = getWorkerSecret();
  const workerUrl    = getWorkerUrl();

  const headers = {
    'x-magnific-api-key': keyObj.key,
    ...formData.getHeaders(),
  };
  if (workerUrl && workerSecret) headers['x-arkx-secret'] = workerSecret;

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
