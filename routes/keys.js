const router  = require('express').Router();
const multer  = require('multer');
const upload  = multer({ storage: multer.memoryStorage() });
const store   = require('../services/keyStore');

router.get('/',           (_, res) => res.json({ ok:true, keys: store.all(), summary: store.summary() }));
router.get('/summary',    (_, res) => res.json({ ok:true, summary: store.summary() }));

// Tambah keys — JSON body { keys: "sk-a\nsk-b" } atau { keys: ["sk-a","sk-b"] }
router.post('/add', async (req, res) => {
  try {
    let raw = req.body.keys || req.body.key || '';
    const list = Array.isArray(raw) ? raw : raw.split(/[\n,\r]+/);
    const added = await store.add(list);
    res.json({ ok:true, added: added.length, total: store.summary().total });
  } catch (e) { res.status(500).json({ ok:false, error: e.message }); }
});

// Upload file .txt berisi keys
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok:false, error:'No file' });
    const list = req.file.buffer.toString('utf-8').split(/[\n,\r]+/);
    const added = await store.add(list);
    res.json({ ok:true, added: added.length, total: store.summary().total });
  } catch (e) { res.status(500).json({ ok:false, error: e.message }); }
});

router.delete('/:id',        async (req, res) => { await store.remove(req.params.id); res.json({ ok:true }); });

// DELETE semua keys sekaligus
router.delete('/', async (req, res) => {
  try {
    const count = store.all().length;
    await store.removeAll();
    res.json({ ok:true, deleted: count });
  } catch(e) { res.status(500).json({ ok:false, error:e.message }); }
});
router.patch('/:id/toggle',  async (req, res) => { const k = await store.toggle(req.params.id); res.json({ ok:true, key:k }); });
router.patch('/:id/revive',  (req, res) => { store.revive(req.params.id); res.json({ ok:true }); });
router.post('/health-check', async (_, res) => {
  try { const r = await store.healthCheckAll(); res.json({ ok:true, results:r }); }
  catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

module.exports = router;
