const router = require('express').Router();
const fs     = require('fs-extra');
const path   = require('path');
const log    = require('../services/logger');

const SETTINGS_FILE = path.join(__dirname, '../data/settings.json');

// Load saved settings on startup
async function loadSavedSettings() {
  try {
    if (await fs.pathExists(SETTINGS_FILE)) {
      const s = await fs.readJson(SETTINGS_FILE);
      if (s.imgbbKey)       process.env.IMGBB_API_KEY       = s.imgbbKey;
      if (s.workerUrl)      process.env.CF_WORKER_URL       = s.workerUrl;
      if (s.workerSecret)   process.env.CF_WORKER_SECRET    = s.workerSecret;
      if (s.telegramToken)  process.env.TELEGRAM_BOT_TOKEN  = s.telegramToken;
    }
  } catch {}
}
loadSavedSettings();

async function saveSettings(patch) {
  await fs.ensureDir(path.join(__dirname, '../data'));
  let current = {};
  if (await fs.pathExists(SETTINGS_FILE)) current = await fs.readJson(SETTINGS_FILE);
  Object.assign(current, patch);
  await fs.writeJson(SETTINGS_FILE, current, { spaces: 2 });
}

// GET current settings
router.get('/', (_, res) => {
  res.json({
    ok:           true,
    workerUrl:    process.env.CF_WORKER_URL    || '',
    workerSet:    !!process.env.CF_WORKER_URL,
    secretSet:    !!process.env.CF_WORKER_SECRET,
    telegramSet:  !!process.env.TELEGRAM_BOT_TOKEN,
    supabaseSet:  !!process.env.SUPABASE_URL,
    imgbbSet:     !!process.env.IMGBB_API_KEY,
    imgbbKey:     process.env.IMGBB_API_KEY ? '***' + process.env.IMGBB_API_KEY.slice(-4) : '',
  });
});

// POST save ImgBB API key
router.post('/imgbb', async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ ok:false, error:'key required' });
    process.env.IMGBB_API_KEY = key.trim();
    await saveSettings({ imgbbKey: key.trim() });
    log.success('✅ ImgBB API key saved');
    res.json({ ok:true, msg:'ImgBB key saved' });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

// POST save CF Worker settings
router.post('/worker', async (req, res) => {
  try {
    const { url, secret } = req.body;
    if (url)    { process.env.CF_WORKER_URL    = url.trim();    await saveSettings({ workerUrl: url.trim() }); }
    if (secret) { process.env.CF_WORKER_SECRET = secret.trim(); await saveSettings({ workerSecret: secret.trim() }); }
    log.success('✅ Worker settings saved');
    res.json({ ok:true, msg:'Worker settings saved' });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

// POST setup Telegram bot
router.post('/telegram', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ ok:false, error:'token required' });
    process.env.TELEGRAM_BOT_TOKEN = token;
    await saveSettings({ telegramToken: token });
    require('../services/telegram').init(token);
    res.json({ ok:true, msg:'Telegram bot connected' });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

// GET logs
router.get('/logs', (req, res) => {
  res.json({ ok:true, logs: log.getLogs(parseInt(req.query.limit)||100) });
});

// DELETE logs
router.delete('/logs', (_, res) => { log.clear(); res.json({ ok:true }); });

module.exports = router;
