/**
 * Auth Store — user management, admin approval
 * Admin: nuallakoko@gmail.com
 * Data persistent di Railway Volume
 */
const fs     = require('fs-extra');
const path   = require('path');
const crypto = require('crypto');
const db     = require('./supabase');

const DATA_DIR    = path.join(__dirname, '../data');
const FILE        = path.join(DATA_DIR, 'users.json');
const ADMIN_EMAIL = 'nuallakoko@gmail.com';

let users = [];

async function init() {
  await fs.ensureDir(DATA_DIR);

  if (db.isReady()) {
    const rows = await db.select('users');
    if (rows && rows.length > 0) {
      users = rows.map(r => ({
        id: r.id, email: r.email, name: r.name, role: r.role,
        status: r.status, password: r.password,
        createdAt: r.created_at, lastLogin: r.last_login,
        telegramChatId: r.telegram_chat_id,
      }));
      console.log(`👤 Auth: ${users.length} users from Supabase`);
    }
  } else if (await fs.pathExists(FILE)) {
    try { users = (await fs.readJson(FILE)).users || []; } catch { users = []; }
    console.log(`👤 Auth: ${users.length} users from local`);
  }

  // Pastikan admin selalu ada
  if (!users.find(u => u.email === ADMIN_EMAIL)) {
    const admin = {
      id: _id(), email: ADMIN_EMAIL, name: 'Admin', role: 'admin',
      status: 'approved', password: _hash('admin123'),
      createdAt: new Date().toISOString(), lastLogin: null,
    };
    users.push(admin);
    await _save();
  }
}

async function register(email, name, password) {
  email = email.toLowerCase().trim();
  if (users.find(u => u.email === email)) throw new Error('Email sudah terdaftar');
  const user = {
    id: _id(), email, name, role: 'user', status: 'pending',
    password: _hash(password), createdAt: new Date().toISOString(), lastLogin: null,
  };
  users.push(user);
  await _save();
  _notifyAdmin(email, name);
  return _safe(user);
}

async function login(email, password) {
  email = email.toLowerCase().trim();
  const user = users.find(u => u.email === email);
  if (!user)                      throw new Error('Email tidak ditemukan');
  if (user.password !== _hash(password)) throw new Error('Password salah');
  if (user.status === 'pending')  throw new Error('Akun menunggu persetujuan admin');
  if (user.status === 'rejected') throw new Error('Akun ditolak oleh admin');
  if (user.status === 'banned')   throw new Error('Akun diblokir');
  user.lastLogin = new Date().toISOString();
  await _save();
  return { user: _safe(user), token: _genToken(user.id) };
}

function verifyToken(token) {
  if (!token) return null;
  try {
    const [userId, sig] = token.split('.');
    if (_sign(userId) !== sig) return null;
    return users.find(u => u.id === userId && u.status === 'approved') || null;
  } catch { return null; }
}

async function approve(userId)    { const u=_find(userId); u.status='approved'; await _save(); return _safe(u); }
async function reject(userId)     { const u=_find(userId); u.status='rejected'; await _save(); return _safe(u); }
async function ban(userId)        { const u=_find(userId); u.status='banned';   await _save(); return _safe(u); }
async function deleteUser(userId) { users=users.filter(u=>u.id!==userId); await _save(); }

async function changePassword(userId, oldPass, newPass) {
  const u = _find(userId);
  if (u.password !== _hash(oldPass)) throw new Error('Password lama salah');
  if (newPass.length < 6) throw new Error('Password baru minimal 6 karakter');
  u.password = _hash(newPass);
  await _save();
}

function getAll()     { return users.map(_safe); }
function getPending() { return users.filter(u => u.status === 'pending').map(_safe); }
function getById(id)  { return _safe(_find(id)); }

function _find(id) {
  const u = users.find(u => u.id === id);
  if (!u) throw new Error('User tidak ditemukan');
  return u;
}
function _safe(u)    { const { password, ...safe } = u; return safe; }
function _hash(str)  { return crypto.createHash('sha256').update(str + 'arkx_salt_2024').digest('hex'); }
function _id()       { return crypto.randomBytes(8).toString('hex'); }
function _sign(uid)  { return crypto.createHmac('sha256','arkx_token_secret_2024').update(uid).digest('hex').slice(0,32); }
function _genToken(uid) { return `${uid}.${_sign(uid)}`; }

function _notifyAdmin(email, name) {
  try {
    const tg = require('./telegram');
    const admin = users.find(u => u.email === ADMIN_EMAIL);
    if (tg.bot && admin?.telegramChatId) {
      tg.notify(admin.telegramChatId, `🔔 *Pendaftaran Baru*\n\nNama: ${name}\nEmail: ${email}`);
    }
  } catch {}
}

async function _save() {
  try {
    await fs.ensureDir(DATA_DIR);
    await fs.writeJson(FILE, { users }, { spaces: 2 });
    if (db.isReady()) {
      for (const u of users) {
        await db.upsert('users', {
          id: u.id, email: u.email, name: u.name, role: u.role,
          status: u.status, password: u.password,
          created_at: u.createdAt, last_login: u.lastLogin,
          telegram_chat_id: u.telegramChatId || null,
        });
      }
    }
  } catch(e) { console.error('Auth save failed:', e.message); }
}

module.exports = {
  init, register, login, verifyToken,
  approve, reject, ban, deleteUser, changePassword,
  getAll, getPending, getById, ADMIN_EMAIL,
};
