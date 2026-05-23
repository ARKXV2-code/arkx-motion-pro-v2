/**
 * Auth Store — user management, admin approval
 * Admin: nuallakoko@gmail.com
 */
const fs   = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '../data/users.json');
const ADMIN_EMAIL = 'nuallakoko@gmail.com';

let users = [];

async function init() {
  await fs.ensureDir(path.join(__dirname, '../data'));
  if (await fs.pathExists(FILE)) {
    users = (await fs.readJson(FILE)).users || [];
  }
  // Pastikan admin selalu ada
  if (!users.find(u => u.email === ADMIN_EMAIL)) {
    users.push({
      id:       _id(),
      email:    ADMIN_EMAIL,
      name:     'Admin',
      role:     'admin',
      status:   'approved',
      password: _hash('admin123'), // ganti password setelah login pertama
      createdAt: new Date().toISOString(),
      lastLogin: null,
    });
    await _save();
  }
  console.log(`👤 Auth: ${users.length} users loaded`);
}

// ── Register (pending approval) ───────────────────────────────
async function register(email, name, password) {
  email = email.toLowerCase().trim();
  if (users.find(u => u.email === email)) {
    throw new Error('Email sudah terdaftar');
  }
  const user = {
    id:        _id(),
    email,
    name,
    role:      'user',
    status:    'pending', // harus di-approve admin
    password:  _hash(password),
    createdAt: new Date().toISOString(),
    lastLogin: null,
  };
  users.push(user);
  await _save();

  // Notif ke admin via Telegram jika ada
  _notifyAdmin(email, name);
  return _safe(user);
}

// ── Login ─────────────────────────────────────────────────────
async function login(email, password) {
  email = email.toLowerCase().trim();
  const user = users.find(u => u.email === email);
  if (!user) throw new Error('Email tidak ditemukan');
  if (user.password !== _hash(password)) throw new Error('Password salah');
  if (user.status === 'pending') throw new Error('Akun menunggu persetujuan admin');
  if (user.status === 'rejected') throw new Error('Akun ditolak oleh admin');
  if (user.status === 'banned') throw new Error('Akun diblokir');

  user.lastLogin = new Date().toISOString();
  await _save();

  const token = _genToken(user.id);
  return { user: _safe(user), token };
}

// ── Verify token ──────────────────────────────────────────────
function verifyToken(token) {
  if (!token) return null;
  try {
    const [userId, sig] = token.split('.');
    const expected = _sign(userId);
    if (sig !== expected) return null;
    return users.find(u => u.id === userId && u.status === 'approved') || null;
  } catch { return null; }
}

// ── Admin: approve / reject / ban ────────────────────────────
async function approve(userId) {
  const u = _find(userId);
  u.status = 'approved';
  await _save();
  return _safe(u);
}

async function reject(userId) {
  const u = _find(userId);
  u.status = 'rejected';
  await _save();
  return _safe(u);
}

async function ban(userId) {
  const u = _find(userId);
  u.status = 'banned';
  await _save();
  return _safe(u);
}

async function deleteUser(userId) {
  users = users.filter(u => u.id !== userId);
  await _save();
}

// ── Change password ───────────────────────────────────────────
async function changePassword(userId, oldPass, newPass) {
  const u = _find(userId);
  if (u.password !== _hash(oldPass)) throw new Error('Password lama salah');
  u.password = _hash(newPass);
  await _save();
}

// ── Getters ───────────────────────────────────────────────────
function getAll()     { return users.map(_safe); }
function getPending() { return users.filter(u => u.status === 'pending').map(_safe); }
function getById(id)  { return _safe(_find(id)); }

// ── Internals ─────────────────────────────────────────────────
function _find(id) {
  const u = users.find(u => u.id === id);
  if (!u) throw new Error('User tidak ditemukan');
  return u;
}

function _safe(u) {
  const { password, ...safe } = u;
  return safe;
}

function _hash(str) {
  return crypto.createHash('sha256').update(str + 'arkx_salt_2024').digest('hex');
}

function _id() {
  return crypto.randomBytes(8).toString('hex');
}

function _sign(userId) {
  return crypto.createHmac('sha256', 'arkx_token_secret_2024').update(userId).digest('hex').slice(0, 32);
}

function _genToken(userId) {
  return `${userId}.${_sign(userId)}`;
}

function _notifyAdmin(email, name) {
  try {
    const tg = require('./telegram');
    if (tg.bot) {
      // Kirim notif ke admin jika ada chat ID tersimpan
      const adminUser = users.find(u => u.email === ADMIN_EMAIL);
      if (adminUser?.telegramChatId) {
        tg.notify(adminUser.telegramChatId,
          `🔔 *Pendaftaran Baru*\n\nNama: ${name}\nEmail: ${email}\n\nBuka dashboard untuk approve.`
        );
      }
    }
  } catch {}
}

async function _save() {
  await fs.writeJson(FILE, { users }, { spaces: 2 });
}

module.exports = {
  init, register, login, verifyToken,
  approve, reject, ban, deleteUser, changePassword,
  getAll, getPending, getById,
  ADMIN_EMAIL,
};
