/**
 * Auth Routes — register, login, admin management
 */
const router = require('express').Router();
const auth   = require('../services/authStore');
const log    = require('../services/logger');

// ── Middleware: cek token ─────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'] || req.cookies?.token;
  const user  = auth.verifyToken(token);
  if (!user) return res.status(401).json({ ok: false, error: 'Login required' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Admin only' });
    next();
  });
}

// ── Public routes ─────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, name, password } = req.body;
    if (!email || !name || !password) return res.status(400).json({ ok: false, error: 'email, name, password required' });
    if (password.length < 6) return res.status(400).json({ ok: false, error: 'Password minimal 6 karakter' });
    const user = await auth.register(email, name, password);
    log.info(`📝 Register: ${email}`);
    res.json({ ok: true, message: 'Pendaftaran berhasil! Menunggu persetujuan admin.', user });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ ok: false, error: 'email & password required' });
    const { user, token } = await auth.login(email, password);
    log.info(`🔐 Login: ${email}`);
    res.json({ ok: true, user, token });
  } catch (e) { res.status(401).json({ ok: false, error: e.message }); }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    await auth.changePassword(req.user.id, oldPassword, newPassword);
    res.json({ ok: true, message: 'Password berhasil diubah' });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

// ── Admin routes ──────────────────────────────────────────────
router.get('/users', requireAdmin, (req, res) => {
  res.json({ ok: true, users: auth.getAll() });
});

router.get('/users/pending', requireAdmin, (req, res) => {
  res.json({ ok: true, users: auth.getPending() });
});

router.post('/users/:id/approve', requireAdmin, async (req, res) => {
  try {
    const user = await auth.approve(req.params.id);
    log.success(`✅ User approved: ${user.email}`);
    res.json({ ok: true, user });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.post('/users/:id/reject', requireAdmin, async (req, res) => {
  try {
    const user = await auth.reject(req.params.id);
    log.warn(`❌ User rejected: ${user.email}`);
    res.json({ ok: true, user });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.post('/users/:id/ban', requireAdmin, async (req, res) => {
  try {
    const user = await auth.ban(req.params.id);
    log.warn(`🚫 User banned: ${user.email}`);
    res.json({ ok: true, user });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    await auth.deleteUser(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.post('/users/:id/plan', requireAdmin, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['free','pro','enterprise'].includes(plan)) return res.status(400).json({ ok:false, error:'Invalid plan' });
    const user = await auth.setPlan(req.params.id, plan);
    res.json({ ok: true, user });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.requireAdmin = requireAdmin;
