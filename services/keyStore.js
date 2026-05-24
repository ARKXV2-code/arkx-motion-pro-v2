/**
 * Key Store — simpan & rotasi 100+ Magnific API keys
 * Auto detect dead key, smart routing, per-key stats
 * Data disimpan di /data (Railway Volume untuk persistence)
 */
const fs      = require('fs-extra');
const path    = require('path');
const { nanoid } = require('nanoid');
const log     = require('./logger');

// Railway Volume path — kalau ada RAILWAY_VOLUME_MOUNT_PATH pakai itu
const DATA_DIR   = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'data')
  : path.join(__dirname, '../data');

const FILE_KEYS  = path.join(DATA_DIR, 'keys.json');
const FILE_STATS = path.join(DATA_DIR, 'keystats.json');

let pool  = [];
let stats = {};
let rr    = 0;

async function init() {
  await fs.ensureDir(DATA_DIR);
  if (await fs.pathExists(FILE_KEYS))  pool  = (await fs.readJson(FILE_KEYS)).keys  || [];
  if (await fs.pathExists(FILE_STATS)) {
    try { stats = await fs.readJson(FILE_STATS); } catch { stats = {}; }
  }
  pool.forEach(k => { if (!stats[k.id]) stats[k.id] = _blankStat(); });
  log.info(`KeyStore: ${pool.length} keys loaded (${DATA_DIR})`);

  // Auto health check setiap 1 jam
  setInterval(() => {
    const deadKeys = pool.filter(k => _status(k.id) === 'dead');
    if (deadKeys.length > 0) {
      log.info(`🔄 Auto-reviving ${deadKeys.length} dead keys for retry...`);
      deadKeys.forEach(k => revive(k.id));
    }
  }, 60 * 60 * 1000);
}

function next() {
  const active = pool.filter(k => k.active !== false && _status(k.id) !== 'dead');
  if (!active.length) return null;
  rr = rr % active.length;
  return active[rr++];
}

function smart() {
  const active = pool.filter(k => k.active !== false && _status(k.id) !== 'dead');
  if (!active.length) return null;
  return active.sort((a, b) => _errRate(a.id) - _errRate(b.id))[0];
}

function record(id, ok, ms, errMsg) {
  if (!stats[id]) stats[id] = _blankStat();
  const s = stats[id];
  s.req++;
  s.lastUsed = new Date().toISOString();
  if (ok) { s.ok++; }
  else {
    s.err++;
    if (errMsg && /401|403|invalid_api_key|Unauthorized/i.test(errMsg)) {
      markDead(id, errMsg);
    }
    // 429 daily limit — mark dead tapi auto revive besok
    if (errMsg && /429|daily.limit|quota/i.test(errMsg)) {
      markDead(id, `429: daily limit`);
    }
  }
  if (ms) { s.latency.push(ms); if (s.latency.length > 30) s.latency.shift(); }
  _saveStats();
}

function markDead(id, reason) {
  if (!stats[id]) stats[id] = _blankStat();
  stats[id].status     = 'dead';
  stats[id].deadReason = reason;
  stats[id].deadAt     = new Date().toISOString();
  _saveStats();
  log.warn(`🔴 Key ${id.slice(0,8)}… dead: ${reason}`);
}

function revive(id) {
  if (stats[id]) { stats[id].status = 'active'; delete stats[id].deadReason; }
  _saveStats();
}

async function add(rawKeys) {
  const added = [];
  for (const raw of rawKeys) {
    const key = raw.trim();
    if (!key || key.length < 10) continue;
    if (pool.find(k => k.key === key)) continue;
    const obj = { id: nanoid(10), key, label: `Key-${pool.length+1}`, active: true, addedAt: new Date().toISOString() };
    pool.push(obj);
    stats[obj.id] = _blankStat();
    added.push(obj);
  }
  await _saveKeys(); await _saveStats();
  log.success(`Added ${added.length} keys (total: ${pool.length})`);
  return added;
}

async function remove(id) {
  pool = pool.filter(k => k.id !== id);
  delete stats[id];
  await _saveKeys(); await _saveStats();
}

async function removeAll() {
  pool = []; stats = {};
  await _saveKeys(); await _saveStats();
  log.info('🗑️ All keys removed');
}

async function toggle(id) {
  const k = pool.find(k => k.id === id);
  if (k) { k.active = !k.active; await _saveKeys(); }
  return k;
}

function all() {
  return pool.map(k => ({
    ...k,
    key_masked: k.key.slice(0,8) + '…' + k.key.slice(-4),
    stats:      stats[k.id] || _blankStat(),
    status:     _status(k.id),
    avgLatency: _avgLatency(k.id),
  }));
}

function summary() {
  const total    = pool.length;
  const active   = pool.filter(k => k.active !== false && _status(k.id) !== 'dead').length;
  const dead     = pool.filter(k => _status(k.id) === 'dead').length;
  const totalReq = Object.values(stats).reduce((s,v) => s+(v.req||0), 0);
  const totalOk  = Object.values(stats).reduce((s,v) => s+(v.ok||0), 0);
  const totalErr = Object.values(stats).reduce((s,v) => s+(v.err||0), 0);
  return { total, active, dead, totalReq, totalOk, totalErr };
}

async function healthCheck(keyObj) {
  const axios = require('axios');
  const t0    = Date.now();
  try {
    const res = await axios.get('https://api.magnific.com/v1/ai/image-to-video/kling-v2-6', {
      headers: { 'x-magnific-api-key': keyObj.key, 'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 12000,
      validateStatus: () => true,
    });
    const ms = Date.now() - t0;
    // 200, 404, 405 = key valid
    if ([200, 404, 405, 422].includes(res.status)) {
      revive(keyObj.id);
      log.success(`Key ${keyObj.id.slice(0,8)}… alive (${res.status}, ${ms}ms)`);
      return { id: keyObj.id, alive: true, ms, status: res.status };
    }
    if ([401, 403].includes(res.status)) markDead(keyObj.id, `HTTP ${res.status}`);
    log.warn(`Key ${keyObj.id.slice(0,8)}… dead (${res.status})`);
    return { id: keyObj.id, alive: false, status: res.status };
  } catch (err) {
    log.warn(`Key ${keyObj.id.slice(0,8)}… error: ${err.message}`);
    return { id: keyObj.id, alive: false, error: err.message };
  }
}

async function healthCheckAll() {
  log.info('Health check all keys…');
  const results = [];
  for (const k of pool) results.push(await healthCheck(k));
  return results;
}

function _status(id)     { return stats[id]?.status || 'active'; }
function _errRate(id)    { const s=stats[id]; return s?.req>0 ? s.err/s.req : 0; }
function _avgLatency(id) { const l=stats[id]?.latency||[]; return l.length ? Math.round(l.reduce((a,b)=>a+b,0)/l.length) : null; }
function _blankStat()    { return { req:0, ok:0, err:0, latency:[], status:'active', lastUsed:null }; }
async function _saveKeys()  { try { await fs.writeJson(FILE_KEYS,  { keys: pool }, { spaces:2 }); } catch(e) { log.error('Save keys failed: '+e.message); } }
async function _saveStats() { try { await fs.writeJson(FILE_STATS, stats,          { spaces:2 }); } catch(e) { log.error('Save stats failed: '+e.message); } }

module.exports = { init, next, smart, record, markDead, revive, add, remove, removeAll, toggle, all, summary, healthCheck, healthCheckAll };
