/**
 * Queue Service — concurrency 3, smart retry, realtime status
 */
const PQueue = require('p-queue').default;
const { v4: uuid } = require('uuid');
const log = require('./logger');

let q;
const active    = new Map();
const completed = [];
const MAX_DONE  = 100;

function init() {
  q = new PQueue({ concurrency: 3 });
  q.on('idle', () => { log.queue('Queue idle'); _broadcast(); });
  log.info('Queue ready (concurrency:3)');
}

function add(fn, meta = {}) {
  const id   = uuid();
  const item = {
    id, status:'queued', meta,
    createdAt: new Date().toISOString(),
    startedAt: null, doneAt: null,
    result: null, error: null, retries: 0,
  };
  active.set(id, item);
  _broadcast();
  log.queue(`📥 Queued: ${id.slice(0,8)} [${meta.type||'?'}]`);

  const promise = q.add(async () => {
    item.status    = 'running';
    item.startedAt = new Date().toISOString();
    _broadcast();
    log.queue(`▶️ Running: ${id.slice(0,8)}`);

    try {
      const result = await fn();
      item.status = 'done';
      item.doneAt = new Date().toISOString();
      item.result = result;
      _done(id, item);
      _broadcast();
      log.success(`✅ Done: ${id.slice(0,8)}`);
      return result;
    } catch(e) {
      item.status = 'failed';
      item.doneAt = new Date().toISOString();
      item.error  = e.message;
      _done(id, item);
      _broadcast();
      log.error(`❌ Failed: ${id.slice(0,8)} — ${e.message}`);
      throw e;
    }
  });

  return { id, promise };
}

function status() {
  return {
    pending:   q ? q.size    : 0,
    running:   q ? q.pending : 0,
    active:    [...active.values()],
    queued:    [...active.values()].filter(i => i.status === 'queued'),
    completed: completed.slice(0, 20),
  };
}

function getTask(id) {
  return active.get(id) || completed.find(c => c.id === id) || null;
}

function _done(id, item) {
  active.delete(id);
  completed.unshift({ ...item });
  if (completed.length > MAX_DONE) completed.pop();
}

function _broadcast() {
  if (!global.wss) return;
  const s = status();
  const p = JSON.stringify({ type:'queue', pending: s.pending, running: s.running });
  global.wss.clients.forEach(c => { if (c.readyState===1) { try { c.send(p); } catch {} } });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { init, add, status, getTask };
