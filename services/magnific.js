/**
 * Magnific AI — Video Generation Service
 * Base: https://api.magnific.com
 * Auth: x-magnific-api-key header
 * Docs: https://docs.magnific.com
 *
 * VERIFIED ENDPOINTS (dari docs resmi):
 * - POST /v1/ai/image-to-video/kling-v2-6-pro     → Kling 2.6 Pro T2V+I2V
 * - POST /v1/ai/image-to-video/kling-v2-5-pro     → Kling 2.5 Pro I2V
 * - POST /v1/ai/image-to-video/kling-v2-1-pro     → Kling 2.1 Pro I2V
 * - POST /v1/ai/image-to-video/wan-2-5-i2v-1080p  → WAN 2.5 I2V
 * - POST /v1/ai/text-to-video/wan-2-5-t2v-1080p   → WAN 2.5 T2V
 * - POST /v1/ai/image-to-video/seedance-pro-1080p → Seedance Pro
 * - POST /v1/ai/video/kling-v2-6-motion-control-std/pro → Motion Control
 * Poll: GET /v1/ai/image-to-video/kling-v2-6/{task-id}
 */
const { call } = require('./cfProxy');
const log = require('./logger');

// ── Aspect ratio mapping untuk Kling 2.6 ─────────────────────
const KLING26_RATIO = {
  '16:9':  'widescreen_16_9',
  '9:16':  'social_story_9_16',
  '1:1':   'square_1_1',
  '4:3':   'widescreen_16_9',  // fallback
  '3:4':   'social_story_9_16', // fallback
  '21:9':  'widescreen_16_9',  // fallback
};

// Duration hanya 5 atau 10 untuk semua model Kling
function clampDur(dur, max = 10) {
  const d = parseInt(dur) || 5;
  if (d <= 5) return '5';
  return String(Math.min(d, max));
}

// ── Model registry ───────────────────────────────────────────
const MODELS = {
  // ── Kling 2.6 Pro — T2V + I2V (aspect_ratio format berbeda) ─
  'kling-2.6-pro': {
    provider: 'kling26', mode: 'pro', maxDur: 10,
    t2v: true, i2v: true, motion: false,
    ep_submit: 'image-to-video/kling-v2-6-pro',
    ep_poll:   'image-to-video/kling-v2-6',
  },
  // ── Kling 2.5 Pro — I2V only ─────────────────────────────
  'kling-2.5-pro': {
    provider: 'kling', mode: 'pro', maxDur: 10,
    t2v: false, i2v: true, motion: false,
    ep_submit: 'image-to-video/kling-v2-5-pro',
    ep_poll:   'image-to-video/kling-v2-5-pro',
  },
  // ── Kling 2.1 Pro — I2V only ─────────────────────────────
  'kling-2.1-pro': {
    provider: 'kling', mode: 'pro', maxDur: 10,
    t2v: false, i2v: true, motion: false,
    ep_submit: 'image-to-video/kling-v2-1-pro',
    ep_poll:   'image-to-video/kling-v2-1-pro',
  },
  // ── Kling Motion Control (max 30s) ────────────────────────
  'kling-motion-2.6-std': {
    provider: 'kling', mode: 'std', maxDur: 30,
    t2v: false, i2v: false, motion: true,
    ep_motion: 'video/kling-v2-6-motion-control-std',
    ep_poll:   'image-to-video/kling-v2-6',
  },
  'kling-motion-2.6-pro': {
    provider: 'kling', mode: 'pro', maxDur: 30,
    t2v: false, i2v: false, motion: true,
    ep_motion: 'video/kling-v2-6-motion-control-pro',
    ep_poll:   'image-to-video/kling-v2-6',
  },
  'kling-motion-3-std': {
    provider: 'kling', mode: 'std', maxDur: 30,
    t2v: false, i2v: false, motion: true,
    ep_motion: 'video/kling-v2-6-motion-control-std',
    ep_poll:   'image-to-video/kling-v2-6',
  },
  'kling-motion-3-pro': {
    provider: 'kling', mode: 'pro', maxDur: 30,
    t2v: false, i2v: false, motion: true,
    ep_motion: 'video/kling-v2-6-motion-control-pro',
    ep_poll:   'image-to-video/kling-v2-6',
  },
  // ── WAN 2.5 ───────────────────────────────────────────────
  'wan-t2v': {
    provider: 'wan', maxDur: 10,
    t2v: true, i2v: false, motion: false,
    ep_submit: 'text-to-video/wan-2-5-t2v-1080p',
    ep_poll:   'text-to-video/wan-2-5-t2v-1080p',
  },
  'wan-i2v': {
    provider: 'wan', maxDur: 10,
    t2v: false, i2v: true, motion: false,
    ep_submit: 'image-to-video/wan-2-5-i2v-1080p',
    ep_poll:   'image-to-video/wan-2-5-i2v-1080p',
  },
  // ── Seedance Pro 1080p ────────────────────────────────────
  'seedance-pro': {
    provider: 'seedance', maxDur: 10,
    t2v: false, i2v: true, motion: false,
    ep_submit: 'image-to-video/seedance-pro-1080p',
    ep_poll:   'image-to-video/seedance-pro-1080p',
  },
};

const LABELS = {
  'kling-2.6-pro':        'Kling 2.6 Pro',
  'kling-2.5-pro':        'Kling 2.5 Pro',
  'kling-2.1-pro':        'Kling 2.1 Pro',
  'kling-motion-2.6-std': 'Kling Motion 2.6 Std',
  'kling-motion-2.6-pro': 'Kling Motion 2.6 Pro',
  'kling-motion-3-std':   'Kling Motion V3 Std',
  'kling-motion-3-pro':   'Kling Motion V3 Pro',
  'wan-t2v':              'WAN 2.5 Text→Video',
  'wan-i2v':              'WAN 2.5 Image→Video',
  'seedance-pro':         'Seedance Pro 1080p',
};

// ── Text to Video ─────────────────────────────────────────────
async function textToVideo({ modelId, prompt, negPrompt, duration, ratio, cfg }) {
  const m = _model(modelId);
  if (!m.t2v) throw new Error(`${modelId} tidak support text-to-video`);
  const dur = clampDur(duration, m.maxDur);
  log.info(`🎬 T2V: ${modelId} | ${dur}s | ${ratio}`);

  let body;
  if (m.provider === 'kling26') {
    // Kling 2.6 Pro: aspect_ratio format berbeda, tidak ada field image untuk T2V
    body = {
      prompt,
      negative_prompt: negPrompt || '',
      duration:        dur,
      aspect_ratio:    KLING26_RATIO[ratio] || 'widescreen_16_9',
      cfg_scale:       parseFloat(cfg) || 0.5,
    };
  } else if (m.provider === 'wan') {
    body = {
      prompt,
      negative_prompt:          negPrompt || '',
      duration:                 dur,
      enable_prompt_expansion:  true,
    };
  } else {
    body = { prompt, negative_prompt: negPrompt || '', duration: dur };
  }

  const res = await call(`/v1/ai/${m.ep_submit}`, 'POST', body);
  return { taskId: _taskId(res), ep_poll: m.ep_poll };
}

// ── Image to Video ────────────────────────────────────────────
async function imageToVideo({ modelId, imageData, prompt, negPrompt, duration, ratio, cfg }) {
  const m = _model(modelId);
  if (!m.i2v) throw new Error(`${modelId} tidak support image-to-video`);
  const dur = clampDur(duration, m.maxDur);
  log.info(`🖼️ I2V: ${modelId} | ${dur}s | ${ratio}`);

  let body;
  if (m.provider === 'kling26') {
    // Kling 2.6 Pro I2V: pakai Option 2 (dengan image)
    body = {
      image:           imageData,
      prompt:          prompt || '',
      negative_prompt: negPrompt || '',
      duration:        dur,
      aspect_ratio:    KLING26_RATIO[ratio] || 'widescreen_16_9',
      cfg_scale:       parseFloat(cfg) || 0.5,
    };
  } else if (m.provider === 'wan') {
    // WAN I2V: image harus URL publik
    if (imageData.startsWith('data:')) throw new Error('WAN I2V membutuhkan URL publik, bukan base64. Gunakan ImgBB.');
    body = {
      prompt:                   prompt || '',
      image:                    imageData,
      negative_prompt:          negPrompt || '',
      duration:                 dur,
      enable_prompt_expansion:  true,
    };
  } else if (m.provider === 'seedance') {
    body = {
      image:           imageData,
      prompt:          prompt || '',
      negative_prompt: negPrompt || '',
      duration:        dur,
    };
  } else {
    // Kling 2.1/2.5 Pro
    body = {
      image:           imageData,
      prompt:          prompt || '',
      negative_prompt: negPrompt || '',
      duration:        dur,
      cfg_scale:       parseFloat(cfg) || 0.5,
    };
  }

  const res = await call(`/v1/ai/${m.ep_submit}`, 'POST', body);
  return { taskId: _taskId(res), ep_poll: m.ep_poll };
}

// ── Motion Control (max 30s) ──────────────────────────────────
async function motionControl({ modelId, imageData, videoData, prompt, duration, ratio, strength }) {
  const m = _model(modelId);
  if (!m.motion) throw new Error(`${modelId} tidak support motion control`);
  const dur = Math.min(parseInt(duration) || 5, 30);
  log.info(`🎮 Motion: ${modelId} | ${dur}s | ${ratio}`);

  if (!imageData) throw new Error('image_url wajib untuk motion control');
  if (imageData.startsWith('data:')) throw new Error('Image harus URL publik untuk motion control');

  const body = {
    image_url:             imageData,
    prompt:                prompt || '',
    cfg_scale:             parseFloat(strength) || 0.5,
    character_orientation: 'video',
  };
  if (videoData && !videoData.startsWith('data:')) body.video_url = videoData;

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
  if (!m) throw new Error(`Model tidak dikenal: ${id}. Model tersedia: ${Object.keys(MODELS).join(', ')}`);
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

  let videoUrl = null;
  if (Array.isArray(data?.generated) && data.generated.length > 0) {
    videoUrl = typeof data.generated[0] === 'string' ? data.generated[0] : data.generated[0]?.url;
  }
  if (!videoUrl) {
    videoUrl = data?.result?.url || data?.video_url || data?.output?.url || null;
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
