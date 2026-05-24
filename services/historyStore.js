/**
 * History Store — persistent JSON + optional Supabase
 * Data disimpan di Railway Volume kalau ada
 */
const fs   = require('fs-extra');
const path = require('path');
const { v4: uuid } = require('uuid');

const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'data')
  : path.join(__dirname, '../data');

const FILE = path.join(DATA_DIR, 'history.json');
let db = [];
let supabase = null;

async function init() {
  await fs.ensureDir(DATA_DIR);
  if (await fs.pathExists(FILE)) {
    try { db = (await fs.readJson(FILE)).items || []; }
    catch { db = []; }
  }

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      console.log('✅ Supabase connected');
    } catch(e) { console.log('⚠️ Supabase failed:', e.message); }
  }
  console.log(`📁 History: ${db.length} records loaded`);
}

async function save(entry) {
  const rec = { id: uuid(), ...entry, createdAt: new Date().toISOString() };
  db.unshift(rec);
  if (db.length > 500) db = db.slice(0, 500);
  await _save();
  if (supabase) { try { await supabase.from('history').insert([rec]); } catch {} }
  return rec;
}

async function update(taskId, patch) {
  const idx = db.findIndex(h => h.taskId === taskId);
  if (idx >= 0) { Object.assign(db[idx], patch); await _save(); }
}

function get({ limit=50, offset=0, type, status } = {}) {
  let rows = [...db];
  if (type)   rows = rows.filter(r => r.type   === type);
  if (status) rows = rows.filter(r => r.status === status);
  return { total: rows.length, items: rows.slice(offset, offset+limit) };
}

async function del(id) {
  db = db.filter(h => h.id !== id);
  await _save();
}

async function clear() {
  db = [];
  await _save();
}

function stats() {
  const byModel = {}, byType = {}, byStatus = {};
  db.forEach(h => {
    byModel[h.model]   = (byModel[h.model]  ||0)+1;
    byType[h.type]     = (byType[h.type]    ||0)+1;
    byStatus[h.status] = (byStatus[h.status]||0)+1;
  });
  return { total: db.length, byModel, byType, byStatus };
}

async function _save() {
  try { await fs.writeJson(FILE, { items: db }, { spaces: 2 }); }
  catch(e) { console.error('History save failed:', e.message); }
}

module.exports = { init, save, update, get, del, clear, stats };
