/**
 * History Store — local JSON + optional Supabase
 */
const fs   = require('fs-extra');
const path = require('path');
const { v4: uuid } = require('uuid');

const FILE = path.join(__dirname, '../data/history.json');
let db = [];
let supabase = null;

async function init() {
  if (await fs.pathExists(FILE)) db = (await fs.readJson(FILE)).items || [];

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
      console.log('✅ Supabase connected');
    } catch {}
  }
}

async function save(entry) {
  const rec = { id: uuid(), ...entry, createdAt: new Date().toISOString() };
  db.unshift(rec);
  if (db.length > 500) db = db.slice(0, 500);
  await fs.writeJson(FILE, { items: db }, { spaces: 2 });
  if (supabase) { try { await supabase.from('history').insert([rec]); } catch {} }
  return rec;
}

async function update(taskId, patch) {
  const idx = db.findIndex(h => h.taskId === taskId);
  if (idx >= 0) { Object.assign(db[idx], patch); await fs.writeJson(FILE, { items: db }, { spaces:2 }); }
}

function get({ limit=50, offset=0, type, status } = {}) {
  let rows = [...db];
  if (type)   rows = rows.filter(r => r.type   === type);
  if (status) rows = rows.filter(r => r.status === status);
  return { total: rows.length, items: rows.slice(offset, offset+limit) };
}

async function del(id) {
  db = db.filter(h => h.id !== id);
  await fs.writeJson(FILE, { items: db }, { spaces:2 });
}

async function clear() { db = []; await fs.writeJson(FILE, { items:[] }, { spaces:2 }); }

function stats() {
  const byModel  = {}, byType = {}, byStatus = {};
  db.forEach(h => {
    byModel[h.model]   = (byModel[h.model]  ||0)+1;
    byType[h.type]     = (byType[h.type]    ||0)+1;
    byStatus[h.status] = (byStatus[h.status]||0)+1;
  });
  return { total: db.length, byModel, byType, byStatus };
}

module.exports = { init, save, update, get, del, clear, stats };
