const router = require('express').Router();
const q      = require('../services/queue');

router.get('/',         (_, res) => res.json({ ok:true, ...q.status() }));
router.get('/:id',      (req, res) => {
  const t = q.getTask(req.params.id);
  if (!t) return res.status(404).json({ ok:false, error:'Task not found' });
  res.json({ ok:true, task:t });
});

module.exports = router;
