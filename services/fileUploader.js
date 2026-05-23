/**
 * File Uploader — upload file → URL publik
 * Image  : ImgBB (primary) → tmpfiles → 0x0.st → catbox
 * Video  : tmpfiles → 0x0.st → catbox
 */

const axios    = require('axios');
const FormData = require('form-data');
const log      = require('./logger');

const IMGBB_KEY  = process.env.IMGBB_API_KEY || '3fc18340c0464bc6b1dc3c6556ddebe1';
const MAX_BASE64 = 5 * 1024 * 1024; // 5MB

// ── Public API ────────────────────────────────────────────────

/** Untuk I2V biasa — file kecil boleh base64 */
async function uploadToTemp(buffer, filename, mimetype) {
  if (buffer.length < MAX_BASE64) {
    log.info(`📎 ${_mb(buffer.length)}MB → base64`);
    return `data:${mimetype};base64,${buffer.toString('base64')}`;
  }
  return uploadToUrl(buffer, filename, mimetype);
}

/** SELALU → URL publik. Wajib untuk motion control */
async function uploadToUrl(buffer, filename, mimetype) {
  const isImg = mimetype.startsWith('image/');
  log.info(`📤 Upload ${_mb(buffer.length)}MB → URL...`);

  const providers = isImg
    ? [_imgbb, _tmpfiles, _upload0x0, _catbox]
    : [_tmpfiles, _upload0x0, _catbox];

  for (const fn of providers) {
    try {
      const url = await fn(buffer, filename, mimetype);
      if (url && url.startsWith('http')) {
        log.success(`✅ [${fn.name}] ${url}`);
        return url;
      }
    } catch (e) {
      log.warn(`${fn.name} gagal: ${e.message}`);
    }
  }

  throw new Error('Semua upload gagal. Cek koneksi internet server.');
}

// ── Providers ─────────────────────────────────────────────────

/** ImgBB — primary untuk image */
async function _imgbb(buffer, filename, mimetype) {
  const form = new FormData();
  form.append('image', buffer.toString('base64'));
  form.append('name', filename.replace(/\.[^.]+$/, '')); // nama tanpa ekstensi

  const res = await axios.post(
    `https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`,
    form,
    { headers: form.getHeaders(), timeout: 30_000 }
  );

  const url = res.data?.data?.url;
  if (!url) throw new Error('No URL in ImgBB response');
  return url;
}

/** tmpfiles.org — image & video */
async function _tmpfiles(buffer, filename, mimetype) {
  const form = new FormData();
  form.append('file', buffer, { filename, contentType: mimetype });

  const res = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
    headers: form.getHeaders(),
    timeout: 60_000,
    maxContentLength: 100 * 1024 * 1024,
    maxBodyLength:    100 * 1024 * 1024,
  });

  const raw = res.data?.data?.url;
  if (!raw) throw new Error('No URL');
  return raw.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
}

/** 0x0.st — image & video */
async function _upload0x0(buffer, filename, mimetype) {
  const form = new FormData();
  form.append('file', buffer, { filename, contentType: mimetype });

  const res = await axios.post('https://0x0.st', form, {
    headers: form.getHeaders(),
    timeout: 60_000,
    maxContentLength: 100 * 1024 * 1024,
    maxBodyLength:    100 * 1024 * 1024,
  });

  const url = (res.data || '').trim();
  if (!url.startsWith('http')) throw new Error('Invalid URL');
  return url;
}

/** catbox.moe — image & video, 200MB */
async function _catbox(buffer, filename, mimetype) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('userhash', '');
  form.append('fileToUpload', buffer, { filename, contentType: mimetype });

  const res = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: form.getHeaders(),
    timeout: 60_000,
    maxContentLength: 200 * 1024 * 1024,
    maxBodyLength:    200 * 1024 * 1024,
  });

  const url = (res.data || '').trim();
  if (!url.startsWith('http')) throw new Error('Invalid URL');
  return url;
}

function _mb(b) { return (b / 1024 / 1024).toFixed(1); }

module.exports = { uploadToTemp, uploadToUrl };
