/**
 * Key Store — Supabase primary + local JSON fallback
 */
const fs      = require('fs-extra');
const path    = require('path');
const { nanoid } = require('nanoid');
const log     = require('./logger');
const db      = require('./supabase');

const DATA_DIR   = path.join(__dirname, '../data');
const FILE_KEYS  = path.join(DATA_DIR, 'keys.json');
const FILE_STATS = path.join(DATA_DIR, 'keystats.json');

let pool  = [];
let stats = {};
let rr    = 0;

async function init() {
  await fs.ensureDir(DATA_DIR);

  if (db.isReady()) {
    // Load dari Supabase
    const keys = await db.select('api_keys', { order: 'added_at', asc: true });
    const sts  = await db.select('key_stats');
    if (keys) {
      pool = keys.map(k => ({ id: k.id, key: k.key, label: k.label, active: k.active, addedAt: k.added_at }));
      if (sts) {
        sts.forEach(s => {
          stats[s.key_id] = {
            req: s.req||0, ok: s.ok||0, err: s.err||0,
            latency: s.latency||[], status: s.status||'active',
            deadReason: s.dead_reason, lastUsed: s.last_used,
          };
        });
      }
      log.info(`KeyStore: ${pool.length} keys loaded from Supabase`);
    }
  } else {
    // Fallback local JSON
    if (await fs.pathExists(FILE_KEYS))  { try { pool  = (await fs.readJson(FILE_KEYS)).keys  || []; } catch {} }
    if (await fs.pathExists(FILE_STATS)) { try { stats = await fs.readJson(FILE_STATS); } catch {} }
    log.info(`KeyStore: ${pool.length} keys loaded from local`);
  }

  pool.forEach(k => { if (!stats[k.id]) stats[k.id] = _blankStat(); });

  // Auto revive dead keys setiap 1 jam (untuk 429 daily limit)
  setInterval(() => {
    const dead = pool.filter(k => _status(k.id) === 'dead' && stats[k.id]?.deadReason?.includes('429'));
    if (dead.length > 0) {
      log.info(`🔄 Auto-reviving ${dead.length} daily-limit keys...`);
      dead.forEach(k => revive(k.id));
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
  s.req++; s.lastUsed = new Date().toISOString();
  if (ok) { s.ok++; }
  else {
    s.err++;
    if (errMsg && /401|403|invalid_api_key|Unauthorized/i.test(errMsg)) markDead(id, errMsg);
    if (errMsg && /429|daily.limit/i.test(errMsg)) markDead(id, '429: daily limit');
  }
  if (ms) { s.latency.push(ms); if (s.latency.length > 20) s.latency.shift(); }
  _saveStats(id);
}

function markDead(id, reason) {
  if (!stats[id]) stats[id] = _blankStat();
  stats[id].status = 'dead'; stats[id].deadReason = reason; stats[id].deadAt = new Date().toISOString();
  _saveStats(id);
  log.warn(`🔴 Key ${id.slice(0,8)}… dead: ${reason}`);
}

function revive(id) {
  if (stats[id]) { stats[id].status = 'active'; delete stats[id].deadReason; }
  _saveStats(id);
}

async function add(rawKeys) {
  const added = [];
  for (const raw of rawKeys) {
    const key = raw.trim();
    if (!key || key.length < 10 || pool.find(k => k.key === key)) continue;
    const obj = { id: nanoid(10), key, label: `Key-${pool.length+1}`, active: true, addedAt: new Date().toISOString() };
    pool.push(obj); stats[obj.id] = _blankStat(); added.push(obj);

    if (db.isReady()) {
      await db.upsert('api_keys', { id: obj.id, key: obj.key, label: obj.label, active: true, added_at: obj.addedAt });
      await db.upsert('key_stats', { key_id: obj.id, req:0, ok:0, err:0, status:'active', latency: [] });
    }
  }
  await _saveKeys();
  log.success(`Added ${added.length} keys (total: ${pool.length})`);
  return added;
}

async function remove(id) {
  pool = pool.filter(k => k.id !== id); delete stats[id];
  if (db.isReady()) await db.del('api_keys', { id });
  await _saveKeys();
}

async function removeAll() {
  const ids = pool.map(k => k.id);
  pool = []; stats = {};
  if (db.isReady()) { for (const id of ids) await db.del('api_keys', { id }); }
  await _saveKeys(); await fs.writeJson(FILE_STATS, {}, { spaces:2 });
  log.info('🗑️ All keys removed');
}

async function toggle(id) {
  const k = pool.find(k => k.id === id);
  if (k) {
    k.active = !k.active;
    if (db.isReady()) await db.update('api_keys', { id }, { active: k.active });
    await _saveKeys();
  }
  return k;
}

function all() {
  return pool.map(k => ({
    ...k, key_masked: k.key.slice(0,8)+'…'+k.key.slice(-4),
    stats: stats[k.id]||_blankStat(), status: _status(k.id), avgLatency: _avgLatency(k.id),
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
  const t0 = Date.now();
  try {
    const res = await axios.get('https://api.magnific.com/v1/ai/image-to-video/kling-v2-6', {
      headers: { 'x-magnific-api-key': keyObj.key, 'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 12000, validateStatus: () => true,
    });
    const ms = Date.now() - t0;
    if ([200,404,405,422].includes(res.status)) {
      revive(keyObj.id);
      log.success(`Key ${keyObj.id.slice(0,8)}… alive (${res.status}, ${ms}ms)`);
      return { id: keyObj.id, alive: true, ms };
    }
    if ([401,403].includes(res.status)) markDead(keyObj.id, `HTTP ${res.status}`);
    return { id: keyObj.id, alive: false, status: res.status };
  } catch(e) { return { id: keyObj.id, alive: false, error: e.message }; }
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

async function _saveKeys() {
  try { await fs.writeJson(FILE_KEYS, { keys: pool }, { spaces:2 }); } catch {}
}

async function _saveStats(id) {
  try {
    const s = stats[id];
    if (!s) return;
    if (db.isReady()) {
      await db.upsert('key_stats', {
        key_id: id, req: s.req, ok: s.ok, err: s.err,
        status: s.status, dead_reason: s.deadReason||null,
        last_used: s.lastUsed, latency: s.latency,
      }, 'key_id');
    }
    // Save all stats to local
    const allStats = {};
    pool.forEach(k => { allStats[k.id] = stats[k.id]; });
    await fs.writeJson(FILE_STATS, allStats, { spaces:2 });
  } catch {}
}

module.exports = { init, next, smart, record, markDead, revive, add, remove, removeAll, toggle, all, summary, healthCheck, healthCheckAll };
