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
    keys:  { active:s.active, total:s.total, dead:s.dead },
    queue: { pending:qs.pending, running:qs.running },
    ts:    new Date().toISOString(),
  });
});

module.exports = router;
