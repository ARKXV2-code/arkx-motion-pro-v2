/**
 * Magnific AI — Video Generation Service
 * Base: https://api.magnific.com
 * Auth: x-magnific-api-key header
 * Docs: https://docs.magnific.com
 */
const { call } = require('./cfProxy');
const log = require('./logger');

// ── Model registry ───────────────────────────────────────────
const MODELS = {
  // ── Kling Image-to-Video ──────────────────────────────────
  'kling-2.6-std': {
    provider:'kling', mode:'std', maxDur:15,
    t2v:false, i2v:true, motion:false,
    ep_i2v:  'image-to-video/kling-v2-6-std',
    ep_poll: 'image-to-video/kling-v2-6',   // poll endpoint universal
  },
  'kling-2.6-pro': {
    provider:'kling', mode:'pro', maxDur:15,
    t2v:false, i2v:true, motion:false,
    ep_i2v:  'image-to-video/kling-v2-6-pro',
    ep_poll: 'image-to-video/kling-v2-6',
  },
  'kling-2.5-pro': {
    provider:'kling', mode:'pro', maxDur:15,
    t2v:false, i2v:true, motion:false,
    ep_i2v:  'image-to-video/kling-v2-5-pro',
    ep_poll: 'image-to-video/kling-v2-6',
  },
  // ── Kling Motion Control (max 30s) ────────────────────────
  'kling-motion-2.6-std': {
    provider:'kling', mode:'std', maxDur:30,
    t2v:false, i2v:false, motion:true,
    ep_motion: 'video/kling-v2-6-motion-control-std',
    ep_poll:   'image-to-video/kling-v2-6',  // poll universal
  },
  'kling-motion-2.6-pro': {
    provider:'kling', mode:'pro', maxDur:30,
    t2v:false, i2v:false, motion:true,
    ep_motion: 'video/kling-v2-6-motion-control-pro',
    ep_poll:   'image-to-video/kling-v2-6',
  },
  'kling-motion-3-std': {
    provider:'kling', mode:'std', maxDur:30,
    t2v:false, i2v:false, motion:true,
    ep_motion: 'video/kling-v2-6-motion-control-std',
    ep_poll:   'image-to-video/kling-v2-6',
  },
  'kling-motion-3-pro': {
    provider:'kling', mode:'pro', maxDur:30,
    t2v:false, i2v:false, motion:true,
    ep_motion: 'video/kling-v2-6-motion-control-pro',
    ep_poll:   'image-to-video/kling-v2-6',
  },
  // ── WAN Models ────────────────────────────────────────────
  'wan-t2v': {
    provider:'wan', maxDur:15,
    t2v:true, i2v:false, motion:false,
    ep_t2v:  'text-to-video/wan-2-5-t2v-1080p',
    ep_poll: 'text-to-video/wan-2-5-t2v-1080p',
  },
  'wan-i2v': {
    provider:'wan', maxDur:15,
    t2v:false, i2v:true, motion:false,
    ep_i2v:  'image-to-video/wan-2-5-i2v-1080p',
    ep_poll: 'image-to-video/wan-2-5-i2v-1080p',
  },
  // ── Seedance ──────────────────────────────────────────────
  'seedance-1.5-pro': {
    provider:'seedance', maxDur:15,
    t2v:false, i2v:true, motion:false,
    ep_i2v:  'image-to-video/seedance-pro-1080p',
    ep_poll: 'image-to-video/seedance-pro-1080p',
  },
};

const LABELS = {
  'kling-2.6-std':        'Kling 2.6 Standard',
  'kling-2.6-pro':        'Kling 2.6 Pro',
  'kling-2.5-pro':        'Kling 2.5 Pro',
  'kling-motion-2.6-std': 'Kling Motion 2.6 Std',
  'kling-motion-2.6-pro': 'Kling Motion 2.6 Pro',
  'kling-motion-3-std':   'Kling Motion V3 Std',
  'kling-motion-3-pro':   'Kling Motion V3 Pro',
  'wan-t2v':              'WAN 2.5 Text→Video',
  'wan-i2v':              'WAN 2.5 Image→Video',
  'seedance-1.5-pro':     'Seedance Pro 1080p',
};

// ── Text to Video ─────────────────────────────────────────────
async function textToVideo({ modelId, prompt, negPrompt, duration, ratio, cfg }) {
  const m = _model(modelId);
  if (!m.t2v) throw new Error(`${modelId} tidak support text-to-video. Gunakan Image→Video untuk model Kling.`);
  if (!m.ep_t2v) throw new Error(`Model ${modelId} tidak memiliki endpoint T2V`);
  const dur = Math.min(duration || 5, m.maxDur);
  log.info(`🎬 T2V: ${modelId} | ${dur}s | ${ratio}`);

  const body = {
    prompt,
    negative_prompt: negPrompt || '',
    duration:        String(dur),
    aspect_ratio:    ratio || '16:9',
  };

  const res = await call(`/v1/ai/${m.ep_t2v}`, 'POST', body);
  return { taskId: _taskId(res), ep_poll: m.ep_poll };
}

// ── Image to Video ────────────────────────────────────────────
async function imageToVideo({ modelId, imageData, prompt, negPrompt, duration, ratio, cfg }) {
  const m = _model(modelId);
  if (!m.i2v) throw new Error(`${modelId} tidak support image-to-video`);
  const dur = Math.min(duration || 5, m.maxDur);
  log.info(`🖼️ I2V: ${modelId} | ${dur}s | ${ratio}`);

  const body = {
    image:           imageData,   // URL publik atau base64
    prompt:          prompt || '',
    negative_prompt: negPrompt || '',
    duration:        String(dur),
    aspect_ratio:    ratio || '16:9',
    ...(m.provider === 'kling' ? { cfg_scale: parseFloat(cfg) || 0.5 } : {}),
  };

  const res = await call(`/v1/ai/${m.ep_i2v}`, 'POST', body);
  return { taskId: _taskId(res), ep_poll: m.ep_poll };
}

// ── Motion Control (max 30s) ──────────────────────────────────
// Docs: image_url + video_url (keduanya harus URL publik)
async function motionControl({ modelId, imageData, videoData, prompt, duration, ratio, strength }) {
  const m = _model(modelId);
  if (!m.motion) throw new Error(`${modelId} tidak support motion control`);
  const dur = Math.min(duration || 5, 30);
  log.info(`🎮 Motion: ${modelId} | ${dur}s | ${ratio}`);

  // Magnific motion control butuh URL publik, bukan base64
  if (!imageData) throw new Error('image_url wajib untuk motion control');

  // Pastikan image URL (bukan base64)
  if (imageData.startsWith('data:')) throw new Error('Image harus URL publik untuk motion control');

  const body = {
    image_url:             imageData,
    prompt:                prompt || '',
    cfg_scale:             parseFloat(strength) || 0.5,
    character_orientation: 'video',
  };

  // Video referensi opsional
  if (videoData && !videoData.startsWith('data:')) {
    body.video_url = videoData;
  }

  const res = await call(`/v1/ai/${m.ep_motion}`, 'POST', body);
  return { taskId: _taskId(res), ep_poll: m.ep_poll };
}

// ── Poll task status ──────────────────────────────────────────
async function pollTask(taskId, epPoll) {
  const ep = epPoll || 'image-to-video/kling-v2-6';
  log.info(`🔍 Poll: /v1/ai/${ep}/${taskId}`);
  const res = await call(`/v1/ai/${ep}/${taskId}`, 'GET');
  return _parseStatus(taskId, res);
}

// ── Wait for completion ───────────────────────────────────────
async function waitDone(taskId, epPoll, queueId, onProgress) {
  const MAX = 120;
  for (let i = 0; i < MAX; i++) {
    await sleep(5000);
    const s = await pollTask(taskId, epPoll);
    if (onProgress) onProgress(s);
    // Broadcast dengan queueId agar frontend bisa match
    _broadcast({ type: 'progress', taskId, queueId, ...s });
    log.info(`📊 ${taskId.slice(0,8)}: ${s.status} ${Math.round((s.progress||0)*100)}%`);
    if (['COMPLETED','completed','succeed','success','DONE'].includes(s.status)) return s;
    if (['FAILED','failed','error','ERROR','CANCELLED'].includes(s.status)) throw new Error(s.error || 'Task failed');
  }
  throw new Error('Timeout 10 menit');
}

// ── Helpers ───────────────────────────────────────────────────
function _model(id) {
  const m = MODELS[id];
  if (!m) throw new Error(`Model tidak dikenal: ${id}`);
  return m;
}

function _taskId(res) {
  const id = res?.data?.task_id || res?.task_id || res?.data?.id || res?.id;
  if (!id) throw new Error('API tidak mengembalikan task_id: ' + JSON.stringify(res).slice(0,300));
  return id;
}

function _parseStatus(taskId, res) {
  const data = res?.data || res;
  const status   = data?.status || 'CREATED';
  const progress = status === 'COMPLETED' ? 1 : status === 'IN_PROGRESS' ? 0.5 : 0;

  // Magnific response: data.generated = ["url1", "url2"] (array of strings)
  let videoUrl = null;
  if (Array.isArray(data?.generated) && data.generated.length > 0) {
    videoUrl = data.generated[0]; // string URL langsung
  }
  // Fallback untuk format lain
  if (!videoUrl) {
    videoUrl = data?.generated?.[0]?.url
      || data?.result?.url
      || data?.video_url
      || data?.output?.url
      || null;
  }

  return { taskId, status, progress, videoUrl, error: data?.error || null };
}

function _broadcast(data) {
  if (!global.wss) return;
  const p = JSON.stringify(data);
  global.wss.clients.forEach(c => { if (c.readyState === 1) { try { c.send(p); } catch {} } });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { MODELS, LABELS, textToVideo, imageToVideo, motionControl, pollTask, waitDone };
