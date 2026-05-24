/**
 * Supabase Service — persistent storage untuk semua data
 * Fallback ke local JSON kalau Supabase tidak tersedia
 */
let sb = null;
let ready = false;

async function init() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.log('⚠️  Supabase tidak dikonfigurasi — pakai local JSON');
    return false;
  }
  try {
    const { createClient } = require('@supabase/supabase-js');
    sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { persistSession: false } }
    );
    // Test koneksi
    const { error } = await sb.from('settings').select('key').limit(1);
    if (error) throw error;
    ready = true;
    console.log('✅ Supabase connected');
    return true;
  } catch(e) {
    console.log('⚠️  Supabase error:', e.message, '— pakai local JSON');
    sb = null; ready = false;
    return false;
  }
}

function isReady() { return ready && sb !== null; }
function client()  { return sb; }

// ── Generic helpers ───────────────────────────────────────────
async function upsert(table, data, onConflict = 'id') {
  if (!isReady()) return null;
  try {
    const { error } = await sb.from(table).upsert(data, { onConflict });
    if (error) throw error;
    return true;
  } catch(e) { console.error(`Supabase upsert ${table}:`, e.message); return null; }
}

async function insert(table, data) {
  if (!isReady()) return null;
  try {
    const { error } = await sb.from(table).insert(data);
    if (error) throw error;
    return true;
  } catch(e) { console.error(`Supabase insert ${table}:`, e.message); return null; }
}

async function update(table, match, data) {
  if (!isReady()) return null;
  try {
    let q = sb.from(table).update(data);
    Object.entries(match).forEach(([k,v]) => { q = q.eq(k, v); });
    const { error } = await q;
    if (error) throw error;
    return true;
  } catch(e) { console.error(`Supabase update ${table}:`, e.message); return null; }
}

async function del(table, match) {
  if (!isReady()) return null;
  try {
    let q = sb.from(table).delete();
    Object.entries(match).forEach(([k,v]) => { q = q.eq(k, v); });
    const { error } = await q;
    if (error) throw error;
    return true;
  } catch(e) { console.error(`Supabase delete ${table}:`, e.message); return null; }
}

async function select(table, opts = {}) {
  if (!isReady()) return null;
  try {
    let q = sb.from(table).select(opts.columns || '*');
    if (opts.eq)     Object.entries(opts.eq).forEach(([k,v]) => { q = q.eq(k, v); });
    if (opts.order)  q = q.order(opts.order, { ascending: opts.asc ?? false });
    if (opts.limit)  q = q.limit(opts.limit);
    if (opts.offset) q = q.range(opts.offset, opts.offset + (opts.limit||50) - 1);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  } catch(e) { console.error(`Supabase select ${table}:`, e.message); return null; }
}

async function getSetting(key) {
  if (!isReady()) return null;
  try {
    const { data } = await sb.from('settings').select('value').eq('key', key).single();
    return data?.value || null;
  } catch { return null; }
}

async function setSetting(key, value) {
  if (!isReady()) return;
  try {
    await sb.from('settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  } catch(e) { console.error('Supabase setSetting:', e.message); }
}

module.exports = { init, isReady, client, upsert, insert, update, del, select, getSetting, setSetting };
