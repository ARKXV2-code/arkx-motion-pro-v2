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

// SPA fallback — landing di root, app di /app
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/app', (_, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/app/*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  require('./services/logger').error('Server error: ' + err.message);
  res.status(500).json({ ok: false, error: err.message });
});

// ── Boot ─────────────────────────────────────────────────────
async function boot() {
  const dataDir = path.join(__dirname, 'data');
  await fs.ensureDir(dataDir);
  await fs.ensureDir(path.join(__dirname, 'tmp'));

  // Init Supabase dulu (persistent storage)
  await require('./services/supabase').init();

  await require('./services/keyStore').init();
  await require('./services/historyStore').init();
  await require('./services/authStore').init();
  require('./services/queue').init();

  if (process.env.TELEGRAM_BOT_TOKEN) {
    require('./services/telegram').init(process.env.TELEGRAM_BOT_TOKEN);
  }

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n⚡ ARKX Motion Pro V2`);
    console.log(`🌐 http://0.0.0.0:${PORT}`);
    console.log(`📁 Data: ${dataDir}`);
    console.log(`🔗 Magnific: api.magnific.com\n`);
  });
}

boot().catch(err => { console.error('Boot failed:', err); process.exit(1); });

// Graceful shutdown
process.on('SIGTERM', () => { console.log('SIGTERM'); server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { console.log('SIGINT');  server.close(() => process.exit(0)); });
process.on('uncaughtException',  err => console.error('Uncaught:', err.message));
process.on('unhandledRejection', err => console.error('Unhandled:', String(err)));
