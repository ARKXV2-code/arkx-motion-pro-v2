const router  = require('express').Router();
const store   = require('../services/historyStore');

router.get('/',       (req, res) => res.json({ ok:true, ...store.get(req.query) }));
router.get('/stats',  (_, res)   => res.json({ ok:true, stats: store.stats() }));
router.delete('/:id', async (req, res) => { await store.del(req.params.id); res.json({ ok:true }); });
router.delete('/',    async (_, res)   => { await store.clear(); res.json({ ok:true }); });

module.exports = router;
