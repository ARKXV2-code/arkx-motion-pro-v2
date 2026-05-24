/**
 * History Store — Supabase primary + local JSON fallback
 */
const fs   = require('fs-extra');
const path = require('path');
const { v4: uuid } = require('uuid');
const db   = require('./supabase');

const DATA_DIR = path.join(__dirname, '../data');
const FILE     = path.join(DATA_DIR, 'history.json');
let mem = []; // in-memory cache

async function init() {
  await fs.ensureDir(DATA_DIR);

  if (db.isReady()) {
    const rows = await db.select('history', { order: 'created_at', asc: false, limit: 200 });
    if (rows) {
      mem = rows.map(r => ({
        id: r.id, type: r.type, model: r.model, prompt: r.prompt,
        taskId: r.task_id, ep_poll: r.ep_poll, status: r.status,
        videoUrl: r.video_url, error: r.error,
        params: r.params||{}, createdAt: r.created_at,
      }));
      console.log(`📁 History: ${mem.length} records from Supabase`);
      return;
    }
  }

  // Fallback local
  if (await fs.pathExists(FILE)) {
    try { mem = (await fs.readJson(FILE)).items || []; } catch { mem = []; }
  }
  console.log(`📁 History: ${mem.length} records from local`);
}

async function save(entry) {
  const rec = { id: uuid(), ...entry, createdAt: new Date().toISOString() };
  mem.unshift(rec);
  if (mem.length > 500) mem = mem.slice(0, 500);

  if (db.isReady()) {
    await db.insert('history', {
      id: rec.id, type: rec.type, model: rec.model, prompt: rec.prompt,
      task_id: rec.taskId, ep_poll: rec.ep_poll, status: rec.status,
      video_url: rec.videoUrl, error: rec.error,
      params: rec.params||{}, created_at: rec.createdAt,
    });
  }
  await _saveLocal();
  return rec;
}

async function update(taskId, patch) {
  const idx = mem.findIndex(h => h.taskId === taskId);
  if (idx >= 0) {
    Object.assign(mem[idx], patch);
    if (db.isReady()) {
      await db.update('history', { task_id: taskId }, {
        status:    patch.status,
        video_url: patch.videoUrl || null,
        error:     patch.error    || null,
      });
    }
    await _saveLocal();
  }
}

function get({ limit=50, offset=0, type, status } = {}) {
  let rows = [...mem];
  if (type)   rows = rows.filter(r => r.type   === type);
  if (status) rows = rows.filter(r => r.status === status);
  return { total: rows.length, items: rows.slice(offset, offset+limit) };
}

async function del(id) {
  mem = mem.filter(h => h.id !== id);
  if (db.isReady()) await db.del('history', { id });
  await _saveLocal();
}

async function clear() {
  mem = [];
  if (db.isReady()) {
    try { await db.client().from('history').delete().neq('id', '00000000-0000-0000-0000-000000000000'); } catch {}
  }
  await _saveLocal();
}

function stats() {
  const byModel={}, byType={}, byStatus={};
  mem.forEach(h => {
    byModel[h.model]   = (byModel[h.model]  ||0)+1;
    byType[h.type]     = (byType[h.type]    ||0)+1;
    byStatus[h.status] = (byStatus[h.status]||0)+1;
  });
  return { total: mem.length, byModel, byType, byStatus };
}

async function _saveLocal() {
  try { await fs.writeJson(FILE, { items: mem }, { spaces:2 }); } catch {}
}

module.exports = { init, save, update, get, del, clear, stats };
