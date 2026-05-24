const router  = require('express').Router();
const multer  = require('multer');
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100*1024*1024 } });
const mag     = require('../services/magnific');
const queue   = require('../services/queue');
const history = require('../services/historyStore');
const log     = require('../services/logger');
const { toBase64, validate, IMAGE_TYPES, VIDEO_TYPES } = require('../services/fileHandler');
const { uploadToTemp, uploadToUrl } = require('../services/fileUploader');

// ── List models ───────────────────────────────────────────────
router.get('/models', (_, res) => {
  const list = Object.entries(mag.MODELS).map(([id, m]) => ({
    id, ...m, label: mag.LABELS[id] || id,
  }));
  res.json({ ok:true, models: list });
});

// ── Text to Video ─────────────────────────────────────────────
router.post('/t2v', async (req, res) => {
  try {
    const { modelId, prompt, negPrompt, duration, ratio, cfg } = req.body;
    if (!modelId) return res.status(400).json({ ok:false, error:'modelId required' });
    if (!prompt)  return res.status(400).json({ ok:false, error:'prompt required' });

    // Validasi model support T2V sebelum masuk queue
    const modelCfg = mag.MODELS[modelId];
    if (!modelCfg) return res.status(400).json({ ok:false, error:`Model tidak dikenal: ${modelId}` });
    if (!modelCfg.t2v) return res.status(400).json({ ok:false, error:`${modelId} tidak support text-to-video. Gunakan Image→Video untuk model Kling.` });

    const { id: qId, promise } = queue.add(async () => {
      const { taskId, ep_poll } = await mag.textToVideo({ modelId, prompt, negPrompt, duration, ratio, cfg });
      await history.save({ type:'t2v', model:modelId, prompt, taskId, ep_poll, status:'processing', params:{ duration, ratio } });
      _waitAndFinish(taskId, ep_poll, modelId, { duration, ratio }, qId);
      return { taskId };
    }, { type:'t2v', model:modelId, prompt: prompt.slice(0,50) });

    res.json({ ok:true, queueId: qId });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ── Image to Video ────────────────────────────────────────────
router.post('/i2v', upload.single('image'), async (req, res) => {
  try {
    const { modelId, prompt, negPrompt, duration, ratio, cfg, imageUrl } = req.body;
    if (!modelId) return res.status(400).json({ ok:false, error:'modelId required' });

    const modelCfg = mag.MODELS[modelId];
    if (!modelCfg) return res.status(400).json({ ok:false, error:`Model tidak dikenal: ${modelId}` });
    if (!modelCfg.i2v) return res.status(400).json({ ok:false, error:`${modelId} tidak support image-to-video` });

    let imageData = imageUrl || null;
    if (req.file) {
      validate(req.file, IMAGE_TYPES);
      // WAN I2V butuh URL publik — semua model pakai uploadToUrl untuk konsistensi
      const modelCfg2 = mag.MODELS[modelId];
      if (modelCfg2?.provider === 'wan' || modelCfg2?.provider === 'seedance') {
        imageData = await uploadToUrl(req.file.buffer, req.file.originalname || 'image.jpg', req.file.mimetype);
      } else {
        imageData = await uploadToTemp(req.file.buffer, req.file.originalname || 'image.jpg', req.file.mimetype);
      }
    }
    if (!imageData) return res.status(400).json({ ok:false, error:'image required' });

    const { id: qId, promise } = queue.add(async () => {
      const { taskId, ep_poll } = await mag.imageToVideo({ modelId, imageData, prompt, negPrompt, duration, ratio, cfg });
      await history.save({ type:'i2v', model:modelId, prompt, taskId, ep_poll, status:'processing', params:{ duration, ratio } });
      _waitAndFinish(taskId, ep_poll, modelId, { duration, ratio }, qId);
      return { taskId };
    }, { type:'i2v', model:modelId });

    res.json({ ok:true, queueId: qId });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ── Motion Control ────────────────────────────────────────────
router.post('/motion', upload.fields([
  { name:'image', maxCount:1 },
  { name:'video', maxCount:1 },
]), async (req, res) => {
  try {
    const { modelId, prompt, duration, ratio, strength, imageUrl, videoUrl } = req.body;
    if (!modelId) return res.status(400).json({ ok:false, error:'modelId required' });

    const modelCfg = mag.MODELS[modelId];
    if (!modelCfg) return res.status(400).json({ ok:false, error:`Model tidak dikenal: ${modelId}` });
    if (!modelCfg.motion) return res.status(400).json({ ok:false, error:`${modelId} tidak support motion control` });

    let imageData = imageUrl || null;
    let videoData = videoUrl || null;

    if (req.files?.image?.[0]) {
      validate(req.files.image[0], IMAGE_TYPES);
      // Motion control WAJIB URL publik — pakai uploadToUrl bukan uploadToTemp
      imageData = await uploadToUrl(
        req.files.image[0].buffer,
        req.files.image[0].originalname || 'image.jpg',
        req.files.image[0].mimetype
      );
    }
    if (req.files?.video?.[0]) {
      validate(req.files.video[0], VIDEO_TYPES);
      // Video juga wajib URL publik
      videoData = await uploadToUrl(
        req.files.video[0].buffer,
        req.files.video[0].originalname || 'video.mp4',
        req.files.video[0].mimetype
      );
    }
    if (!imageData) return res.status(400).json({ ok:false, error:'image reference required' });

    const { id: qId, promise } = queue.add(async () => {
      const { taskId, ep_poll } = await mag.motionControl({ modelId, imageData, videoData, prompt, duration, ratio, strength });
      await history.save({ type:'motion', model:modelId, prompt, taskId, ep_poll, status:'processing', params:{ duration, ratio } });
      _waitAndFinish(taskId, ep_poll, modelId, { duration, ratio }, qId);
      return { taskId };
    }, { type:'motion', model:modelId });

    res.json({ ok:true, queueId: qId });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ── Poll task ─────────────────────────────────────────────────
router.get('/task/:taskId', async (req, res) => {
  try {
    const s = await mag.pollTask(req.params.taskId);
    res.json({ ok:true, task:s });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ── Background: tunggu selesai lalu broadcast + update history ─
function _waitAndFinish(taskId, epPoll, modelId, params, queueId) {
  mag.waitDone(taskId, epPoll, queueId).then(async final => {
    await history.update(taskId, { status:'done', videoUrl: final.videoUrl });
    _ws({ type:'completed', taskId, queueId, videoUrl: final.videoUrl });
    log.success(`🎬 Video ready: ${taskId.slice(0,8)}`);
  }).catch(async err => {
    await history.update(taskId, { status:'failed', error: err.message });
    _ws({ type:'failed', taskId, queueId, error: err.message });
    log.error(`Video failed: ${err.message}`);
  });
}

function _ws(data) {
  if (!global.wss) return;
  const p = JSON.stringify(data);
  global.wss.clients.forEach(c => { if (c.readyState===1) { try { c.send(p); } catch {} } });
}

module.exports = router;
