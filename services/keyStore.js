/**
 * Key Store — simpan & rotasi 100+ Magnific API keys
 * Auto detect dead key, smart routing, per-key stats
 */
const fs      = require('fs-extra');
const path    = require('path');
const { nanoid } = require('nanoid');
const log     = require('./logger');

const FILE_KEYS  = path.join(__dirname, '../data/keys.json');
const FILE_STATS = path.join(__dirname, '../data/keystats.json');

let pool  = [];   // { id, key, label, active, addedAt }
let stats = {};   // { [id]: { req, ok, err, latency[], status, deadReason } }
let rr    = 0;    // round-robin cursor

// ── Init ─────────────────────────────────────────────────────
async function init() {
  if (await fs.pathExists(FILE_KEYS))  pool  = (await fs.readJson(FILE_KEYS)).keys  || [];
  if (await fs.pathExists(FILE_STATS)) stats = await fs.readJson(FILE_STATS);

  pool.forEach(k => { if (!stats[k.id]) stats[k.id] = _blankStat(); });
  log.info(`KeyStore: ${pool.length} keys loaded`);
}

// ── Get next active key (round-robin) ────────────────────────
function next() {
  const active = pool.filter(k => k.active !== false && _status(k.id) !== 'dead');
  if (!active.length) return null;
  rr = rr % active.length;
  const key = active[rr++];
  return key;
}

// ── Smart key: lowest error-rate first ───────────────────────
function smart() {
  const active = pool.filter(k => k.active !== false && _status(k.id) !== 'dead');
  if (!active.length) return null;
  return active.sort((a, b) => {
    const ra = _errRate(a.id), rb = _errRate(b.id);
    return ra - rb;
  })[0];
}

// ── Record usage ─────────────────────────────────────────────
function record(id, ok, ms, errMsg) {
  if (!stats[id]) stats[id] = _blankStat();
  const s = stats[id];
  s.req++;
  s.lastUsed = new Date().toISOString();
  if (ok) { s.ok++; } else {
    s.err++;
    if (errMsg && /401|403|invalid_api_key|Unauthorized|quota|rate.limit|insufficient/i.test(errMsg)) {
      markDead(id, errMsg);
    }
  }
  if (ms) { s.latency.push(ms); if (s.latency.length > 30) s.latency.shift(); }
  _saveStats();
}

// ── Mark dead / revive ───────────────────────────────────────
function markDead(id, reason) {
  if (!stats[id]) stats[id] = _blankStat();
  stats[id].status    = 'dead';
  stats[id].deadReason = reason;
  stats[id].deadAt    = new Date().toISOString();
  _saveStats();
  log.warn(`🔴 Key ${id.slice(0,8)}… dead: ${reason}`);
}

function revive(id) {
  if (stats[id]) { stats[id].status = 'active'; delete stats[id].deadReason; }
  _saveStats();
}

// ── CRUD ─────────────────────────────────────────────────────
async function add(rawKeys) {
  const added = [];
  for (const raw of rawKeys) {
    const key = raw.trim();
    if (!key || pool.find(k => k.key === key)) continue;
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

// ── Getters ──────────────────────────────────────────────────
function all() {
  return pool.map(k => ({
    ...k,
    key_masked: k.key.slice(0,8) + '…' + k.key.slice(-4),
    stats: stats[k.id] || _blankStat(),
    status: _status(k.id),
    avgLatency: _avgLatency(k.id),
  }));
}

function summary() {
  const total   = pool.length;
  const active  = pool.filter(k => k.active !== false && _status(k.id) !== 'dead').length;
  const dead    = pool.filter(k => _status(k.id) === 'dead').length;
  const totalReq = Object.values(stats).reduce((s,v) => s+(v.req||0), 0);
  const totalOk  = Object.values(stats).reduce((s,v) => s+(v.ok||0), 0);
  const totalErr = Object.values(stats).reduce((s,v) => s+(v.err||0), 0);
  return { total, active, dead, totalReq, totalOk, totalErr };
}

// ── Health check single key — langsung ke Magnific ───────────
async function healthCheck(keyObj) {
  const axios  = require('axios');
  const t0     = Date.now();
  try {
    // GET list tasks sebagai health check ringan
    await axios.get('https://api.magnific.com/v1/ai/image-to-video/kling-v2-6-std', {
      headers: {
        'x-magnific-api-key': keyObj.key,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      timeout: 12000,
    });
    const ms = Date.now() - t0;
    revive(keyObj.id);
    record(keyObj.id, true, ms, null);
    log.success(`Key ${keyObj.id.slice(0,8)}… alive (${ms}ms)`);
    return { id: keyObj.id, alive: true, ms };
  } catch (err) {
    const status = err.response?.status;
    // 200 atau 404/405 = key valid (endpoint exists, method wrong = key OK)
    if ([404, 405, 422].includes(status)) {
      const ms = Date.now() - t0;
      revive(keyObj.id);
      log.success(`Key ${keyObj.id.slice(0,8)}… alive via ${status} (${ms}ms)`);
      return { id: keyObj.id, alive: true, ms };
    }
    record(keyObj.id, false, Date.now()-t0, `${status}`);
    if ([401, 403].includes(status)) markDead(keyObj.id, `HTTP ${status}`);
    log.warn(`Key ${keyObj.id.slice(0,8)}… ${[401,403].includes(status)?'DEAD':'error'} (${status||err.message})`);
    return { id: keyObj.id, alive: false, status, error: err.message };
  }
}

async function healthCheckAll() {
  log.info('Health check all keys…');
  const results = [];
  for (const k of pool) results.push(await healthCheck(k));
  return results;
}

// ── Internals ────────────────────────────────────────────────
function _status(id)     { return stats[id]?.status || 'active'; }
function _errRate(id)    { const s=stats[id]; return s?.req>0 ? s.err/s.req : 0; }
function _avgLatency(id) { const l=stats[id]?.latency||[]; return l.length ? Math.round(l.reduce((a,b)=>a+b,0)/l.length) : null; }
function _blankStat()    { return { req:0, ok:0, err:0, latency:[], status:'active', lastUsed:null }; }
async function _saveKeys()  { await fs.writeJson(FILE_KEYS,  { keys: pool }, { spaces:2 }); }
async function _saveStats() { await fs.writeJson(FILE_STATS, stats,          { spaces:2 }); }

module.exports = { init, next, smart, record, markDead, revive, add, remove, removeAll, toggle, all, summary, healthCheck, healthCheckAll };
