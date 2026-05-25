/**
 * Magnific AI — Video Generation Service
 * Base: https://api.magnific.com
 * Auth: x-magnific-api-key header
 *
 * DURATION FORMAT (verified dari docs resmi):
 * - Kling 3 Pro/Std  : enum<string> '3'-'15'
 * - Kling 2.6 Pro    : enum<string> '5' | '10'
 * - Kling 2.5 Pro    : enum<string> '5' | '10'
 * - Kling 2.1 Pro    : enum<string> '5' | '10'
 * - Hailuo 02        : enum<integer> 6 (fixed)
 * - WAN 2.5/2.6      : integer
 * - Seedance Pro     : integer
 * - Motion Control   : tidak ada field duration
 */
const { call } = require('./cfProxy');
const log = require('./logger');

// ── Aspect ratio mapping untuk Kling 2.6 ─────────────────────
const KLING26_RATIO = {
  '16:9':  'widescreen_16_9',
  '9:16':  'social_story_9_16',
  '1:1':   'square_1_1',
  '4:3':   'widescreen_16_9',
  '3:4':   'social_story_9_16',
  '21:9':  'widescreen_16_9',
};

// ── Duration helpers ──────────────────────────────────────────
// Kling 3: string '3'-'15'
function durKling3(dur, max = 15) {
  const d = Math.max(3, Math.min(parseInt(dur) || 5, max));
  return String(d);
}

// Kling 2.x: string '5' atau '10' only
function durKling2(dur) {
  const d = parseInt(dur) || 5;
  return d <= 5 ? '5' : '10';
}

// WAN/Seedance: integer
function durInt(dur, max = 10) {
  const d = parseInt(dur) || 5;
  return Math.max(1, Math.min(d, max));
}

// ── Model registry ───────────────────────────────────────────
// Status: ✅ confirmed jalan | ❓ belum ditest | ❌ 404 (dihapus)
const MODELS = {
  // ✅ Kling 3 Pro — T2V + I2V
  'kling-3-pro': {
    provider: 'kling3', mode: 'pro', maxDur: 15,
    t2v: true, i2v: true, motion: false,
    ep_submit: 'video/kling-v3-pro',
    ep_poll:   'video/kling-v3',
  },
  // ✅ Kling 2.6 Pro — T2V + I2V
  'kling-2.6-pro': {
    provider: 'kling26', mode: 'pro', maxDur: 10,
    t2v: true, i2v: true, motion: false,
    ep_submit: 'image-to-video/kling-v2-6-pro',
    ep_poll:   'image-to-video/kling-v2-6',
  },
  // ❓ Kling 2.5 Pro — I2V only (belum ditest)
  'kling-2.5-pro': {
    provider: 'kling25', mode: 'pro', maxDur: 10,
    t2v: false, i2v: true, motion: false,
    ep_submit: 'image-to-video/kling-v2-5-pro',
    ep_poll:   'image-to-video/kling-v2-5-pro',
  },
  // ✅ Motion Control 2.6
  'kling-motion-2.6-std': {
    provider: 'motion', mode: 'std', maxDur: 10,
    t2v: false, i2v: false, motion: true,
    ep_motion: 'video/kling-v2-6-motion-control-std',
    ep_poll:   'image-to-video/kling-v2-6',
  },
  'kling-motion-2.6-pro': {
    provider: 'motion', mode: 'pro', maxDur: 10,
    t2v: false, i2v: false, motion: true,
    ep_motion: 'video/kling-v2-6-motion-control-pro',
    ep_poll:   'image-to-video/kling-v2-6',
  },
  // ✅ WAN 2.5 T2V
  'wan-t2v': {
    provider: 'wan', maxDur: 10,
    t2v: true, i2v: false, motion: false,
    ep_submit: 'text-to-video/wan-2-5-t2v-1080p',
    ep_poll:   'text-to-video/wan-2-5-t2v-1080p',
  },
  // ❓ WAN 2.5 I2V (belum ditest)
  'wan-i2v': {
    provider: 'wan', maxDur: 10,
    t2v: false, i2v: true, motion: false,
    ep_submit: 'image-to-video/wan-2-5-i2v-1080p',
    ep_poll:   'image-to-video/wan-2-5-i2v-1080p',
  },
  // ✅ Hailuo 02 — T2V + I2V
  'hailuo-02': {
    provider: 'hailuo', maxDur: 6,
    t2v: true, i2v: true, motion: false,
    ep_submit: 'image-to-video/minimax-hailuo-02-1080p',
    ep_poll:   'image-to-video/minimax-hailuo-02-1080p',
  },
};

const LABELS = {
  'kling-3-pro':          'Kling 3 Pro',
  'kling-2.6-pro':        'Kling 2.6 Pro',
  'kling-2.5-pro':        'Kling 2.5 Pro',
  'kling-motion-2.6-std': 'Kling Motion 2.6 Std',
  'kling-motion-2.6-pro': 'Kling Motion 2.6 Pro',
  'wan-t2v':              'WAN 2.5 Text→Video',
  'wan-i2v':              'WAN 2.5 Image→Video',
  'hailuo-02':            'MiniMax Hailuo 02',
};

// ── Text to Video ─────────────────────────────────────────────
async function textToVideo({ modelId, prompt, negPrompt, duration, ratio, cfg }) {
  const m = _model(modelId);
  if (!m.t2v) throw new Error(`${modelId} tidak support text-to-video`);
  log.info(`🎬 T2V: ${modelId} | ${duration}s | ${ratio}`);

  let body;
  if (m.provider === 'kling3') {
    body = {
      prompt,
      negative_prompt: negPrompt || '',
      duration:        durKling3(duration, m.maxDur),
      aspect_ratio:    ratio || '16:9',
      cfg_scale:       parseFloat(cfg) || 0.7,
      generate_audio:  false,
    };
  } else if (m.provider === 'kling26') {
    body = {
      prompt,
      negative_prompt: negPrompt || '',
      duration:        durKling2(duration),
      aspect_ratio:    KLING26_RATIO[ratio] || 'widescreen_16_9',
      cfg_scale:       parseFloat(cfg) || 0.7,
    };
  } else if (m.provider === 'wan') {
    body = {
      prompt,
      negative_prompt:         negPrompt || '',
      duration:                durInt(duration, m.maxDur),
      enable_prompt_expansion: true,
    };
  } else if (m.provider === 'hailuo') {
    body = {
      prompt,
      duration:         6,
      prompt_optimizer: true,
    };
  } else {
    body = {
      prompt,
      negative_prompt: negPrompt || '',
      duration:        durInt(duration, m.maxDur),
    };
  }

  const res = await call(`/v1/ai/${m.ep_submit}`, 'POST', body);
  return { taskId: _taskId(res), ep_poll: m.ep_poll };
}

// ── Image to Video ────────────────────────────────────────────
async function imageToVideo({ modelId, imageData, prompt, negPrompt, duration, ratio, cfg }) {
  const m = _model(modelId);
  if (!m.i2v) throw new Error(`${modelId} tidak support image-to-video`);
  log.info(`🖼️ I2V: ${modelId} | ${duration}s | ${ratio}`);
  const ep = m.ep_submit;

  // Semua provider butuh URL publik
  const needsUrl = ['kling3','kling26','kling25','kling21','wan','wan26','hailuo'];
  if (needsUrl.includes(m.provider) && imageData.startsWith('data:')) {
    throw new Error(`${m.provider} membutuhkan URL publik, bukan base64.`);
  }

  let body;
  if (m.provider === 'kling3') {
    // Kling 3: image_url, duration string '3'-'15'
    body = {
      image_url:       imageData,
      prompt:          prompt || '',
      negative_prompt: negPrompt || '',
      duration:        durKling3(duration, m.maxDur),
      aspect_ratio:    ratio || '16:9',
      cfg_scale:       parseFloat(cfg) || 0.7,
      generate_audio:  false,
    };
  } else if (m.provider === 'kling26') {
    // Kling 2.6: image URL, duration string '5'/'10', aspect_ratio mapped
    body = {
      image:           imageData,
      prompt:          prompt || '',
      negative_prompt: negPrompt || '',
      duration:        durKling2(duration),
      aspect_ratio:    KLING26_RATIO[ratio] || 'widescreen_16_9',
      cfg_scale:       parseFloat(cfg) || 0.7,
    };
  } else if (m.provider === 'kling25') {
    // Kling 2.5: image (base64 or URL), duration string '5'/'10'
    body = {
      image:           imageData,
      prompt:          prompt || '',
      negative_prompt: negPrompt || '',
      duration:        durKling2(duration),
      cfg_scale:       parseFloat(cfg) || 0.7,
    };
  } else if (m.provider === 'kling21') {
    // Kling 2.1: image (base64 or URL), duration string '5'/'10'
    body = {
      image:           imageData,
      prompt:          prompt || '',
      negative_prompt: negPrompt || '',
      duration:        durKling2(duration),
      cfg_scale:       parseFloat(cfg) || 0.7,
    };
  } else if (m.provider === 'wan') {
    // WAN 2.5 I2V: image URL, duration integer
    body = {
      prompt:                  prompt || '',
      image:                   imageData,
      negative_prompt:         negPrompt || '',
      duration:                durInt(duration, m.maxDur),
      enable_prompt_expansion: true,
    };
  } else if (m.provider === 'wan26') {
    // WAN 2.6 I2V: image URL, size instead of aspect_ratio, duration integer
    const WAN26_SIZE = {
      '16:9': '1920*1080', '9:16': '1080*1920', '1:1': '1440*1440',
      '4:3':  '1632*1248', '3:4':  '1248*1632',
    };
    body = {
      prompt:                  prompt || '',
      image:                   imageData,
      negative_prompt:         negPrompt || '',
      duration:                durInt(duration, m.maxDur),
      size:                    WAN26_SIZE[ratio] || '1920*1080',
      enable_prompt_expansion: false,
      shot_type:               'single',
    };
  } else if (m.provider === 'hailuo') {
    // Hailuo: first_frame_image URL, duration integer 6 (fixed)
    body = {
      prompt:            prompt || '',
      first_frame_image: imageData,
      duration:          6,
      prompt_optimizer:  true,
    };
  } else if (m.provider === 'kling21') {
    // Kling 2.1 Pro/Master: image (base64 or URL), duration string '5'/'10'
    body = {
      image:           imageData,
      prompt:          prompt || '',
      negative_prompt: negPrompt || '',
      duration:        durKling2(duration),
      cfg_scale:       parseFloat(cfg) || 0.7,
    };
  } else {
    body = {
      image:           imageData,
      prompt:          prompt || '',
      negative_prompt: negPrompt || '',
      duration:        durInt(duration, m.maxDur),
      cfg_scale:       parseFloat(cfg) || 0.7,
    };
  }

  const res = await call(`/v1/ai/${ep}`, 'POST', body);
  return { taskId: _taskId(res), ep_poll: m.ep_poll };
}

// ── Motion Control ────────────────────────────────────────────
async function motionControl({ modelId, imageData, videoData, prompt, duration, ratio, strength }) {
  const m = _model(modelId);
  if (!m.motion) throw new Error(`${modelId} tidak support motion control`);
  log.info(`🎮 Motion: ${modelId} | ${ratio}`);

  if (!imageData) throw new Error('image_url wajib untuk motion control');
  if (imageData.startsWith('data:')) throw new Error('Image harus URL publik untuk motion control');

  // Motion control docs: tidak ada field duration
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
  const MAX = 240; // 240 × 5s = 20 menit
  let consecutiveBlocks = 0;

  for (let i = 0; i < MAX; i++) {
    await sleep(5000);
    try {
      const s = await pollTask(taskId, epPoll);
      consecutiveBlocks = 0;
      if (onProgress) onProgress(s);
      _broadcast({ type: 'progress', taskId, queueId, ...s });
      log.info(`📊 ${taskId.slice(0,8)}: ${s.status} ${Math.round((s.progress||0)*100)}%`);
      if (['COMPLETED','completed','succeed','success','DONE'].includes(s.status)) return s;
      if (['FAILED','failed','error','ERROR','CANCELLED'].includes(s.status)) throw new Error(s.error || 'Task failed');
    } catch (err) {
      if (err.message.includes('IP') || err.message.includes('block') ||
          err.message.includes('suspicious') || err.message.includes('diblokir')) {
        consecutiveBlocks++;
        if (consecutiveBlocks >= 12) throw new Error('Poll terus di-block. Cek History untuk hasil video.');
        await sleep(10000);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Timeout 20 menit');
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
  const status = data?.status || 'CREATED';

  let progress = 0;
  const s = status.toUpperCase();
  if      (['COMPLETED','SUCCEED','SUCCESS','DONE'].includes(s)) progress = 1;
  else if (['IN_PROGRESS','PROCESSING','RUNNING'].includes(s))   progress = 0.5;
  else if (['CREATED','QUEUED','PENDING'].includes(s))           progress = 0.1;

  if (data?.progress !== undefined) {
    const p = parseFloat(data.progress);
    progress = p > 1 ? p / 100 : p;
  }

  let videoUrl = null;
  if (Array.isArray(data?.generated) && data.generated.length > 0) {
    videoUrl = typeof data.generated[0] === 'string' ? data.generated[0] : data.generated[0]?.url;
  }
  if (!videoUrl && Array.isArray(data?.works) && data.works.length > 0) {
    videoUrl = data.works[0]?.resource || data.works[0]?.url || data.works[0]?.video_url;
  }
  if (!videoUrl) {
    videoUrl = data?.result?.url || data?.video_url || data?.output?.url
             || data?.result?.video_url || data?.url || null;
  }

  return { taskId, status, progress, videoUrl, error: data?.error || data?.message || null };
}

function _broadcast(data) {
  if (!global.wss) return;
  const p = JSON.stringify(data);
  global.wss.clients.forEach(c => { if (c.readyState === 1) { try { c.send(p); } catch {} } });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { MODELS, LABELS, textToVideo, imageToVideo, motionControl, pollTask, waitDone };
