/**
 * ARKX Motion Pro V2 — Main Server
 * Node.js hanya untuk: serve UI, handle file upload, manage keys/queue/history
 * Semua call ke Magnific API → lewat Cloudflare Worker
 */
require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const compress = require('compression');
const path     = require('path');
const http     = require('http');
const WebSocket = require('ws');
const fs       = require('fs-extra');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// ── Globals ──────────────────────────────────────────────────
global.wss = wss;

// ── Middleware ───────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compress());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// ── WebSocket realtime log ────────────────────────────────────
wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'connected', msg: 'ARKX Motion Pro V2 ready' }));
  ws.on('error', () => {});
});

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));

// Semua route public dulu (auth akan diaktifkan setelah login UI siap)
app.use('/api/keys',     require('./routes/keys'));
app.use('/api/generate', require('./routes/generate'));
app.use('/api/history',  require('./routes/history'));
app.use('/api/queue',    require('./routes/queue'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/health',   require('./routes/health'));

// Telegram webhook
app.post('/webhook/telegram', (req, res) => {
  try { require('./services/telegram').processUpdate(req.body); } catch {}
  res.sendStatus(200);
});

// SPA fallback
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  require('./services/logger').error('Server error: ' + err.message);
  res.status(500).json({ ok: false, error: err.message });
});

// ── Boot ─────────────────────────────────────────────────────
async function boot() {
  await fs.ensureDir(path.join(__dirname, 'data'));
  await fs.ensureDir(path.join(__dirname, 'tmp'));

  await require('./services/keyStore').init();
  await require('./services/historyStore').init();
  await require('./services/authStore').init();
  require('./services/queue').init();

  // Telegram (opsional)
  if (process.env.TELEGRAM_BOT_TOKEN) {
    require('./services/telegram').init(process.env.TELEGRAM_BOT_TOKEN);
  }

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`\n⚡ ARKX Motion Pro V2`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`🔗 CF Worker: ${process.env.CF_WORKER_URL || '⚠️  Belum diset di .env'}\n`);
  });
}

boot().catch(console.error);
