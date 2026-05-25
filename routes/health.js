const router = require('express').Router();
const keys   = require('../services/keyStore');
const q      = require('../services/queue');

router.get('/', (_, res) => {
  const s = keys.summary();
  const qs = q.status();
  res.json({
    ok: true, name:'ARKX Motion Pro V2', version:'2.0.0',
    uptime: Math.floor(process.uptime()),
    workerConfigured: !!process.env.CF_WORKER_URL,
    keys:  { active:s.active, total:s.total, dead:s.dead, totalReq:s.totalReq, totalOk:s.totalOk, totalErr:s.totalErr },
    queue: { pending:qs.pending, running:qs.running },
    ts:    new Date().toISOString(),
  });
});

// Test koneksi ke Magnific (via CF Worker kalau ada)
router.get('/magnific', async (_, res) => {
  const axios = require('axios');
  const t0 = Date.now();

  const workerUrl    = (process.env.CF_WORKER_URL || '').replace(/\/$/, '');
  const workerSecret = process.env.CF_WORKER_SECRET || '';
  const useWorker    = !!workerUrl;

  const targetUrl = useWorker
    ? `${workerUrl}/proxy/v1/ai/image-to-video/kling-v2-6`
    : 'https://api.magnific.com/v1/ai/image-to-video/kling-v2-6';

  const headers = {
    'x-magnific-api-key': 'health_check_probe',
    'Accept': 'application/json',
  };
  if (useWorker && workerSecret) headers['x-arkx-secret'] = workerSecret;

  try {
    const r = await axios.get(targetUrl, {
      headers,
      timeout: 10000,
      validateStatus: () => true,
    });
    const ms  = Date.now() - t0;
    const msg = r.data?.message || r.data?.error || '';
    const ipBlocked = r.status === 403 && (
      msg.toLowerCase().includes('ip') ||
      msg.toLowerCase().includes('block') ||
      msg.toLowerCase().includes('suspicious')
    );

    res.json({
      ok:        !ipBlocked,
      status:    r.status,
      latency:   ms,
      reachable: true,
      ipBlocked,
      via:       useWorker ? `CF Worker (${workerUrl})` : 'Direct',
      message:   ipBlocked
        ? '⛔ IP diblokir Magnific! Pastikan CF Worker aktif.'
        : useWorker
          ? `✅ OK via CF Worker (${ms}ms)`
          : `✅ Direct OK (${ms}ms)`,
      detail: msg.slice(0, 100),
    });
  } catch(e) {
    res.json({
      ok:        false,
      reachable: false,
      latency:   Date.now() - t0,
      ipBlocked: false,
      via:       useWorker ? 'CF Worker' : 'Direct',
      message:   '❌ Tidak bisa reach: ' + e.message,
    });
  }
});

module.exports = router;
