/**
 * File Handler — terima upload dari browser, convert ke base64
 * File disimpan sementara di /tmp lalu dihapus setelah dipakai
 */
const fs   = require('fs-extra');
const path = require('path');
const log  = require('./logger');

const TMP_DIR  = path.join(__dirname, '../tmp');
const MAX_MB   = parseInt(process.env.MAX_FILE_SIZE_MB || '50');
const MAX_BYTES = MAX_MB * 1024 * 1024;

// Bersihkan file tmp yang lebih dari 1 jam
async function cleanOld() {
  try {
    const files = await fs.readdir(TMP_DIR);
    const now   = Date.now();
    for (const f of files) {
      const fp   = path.join(TMP_DIR, f);
      const stat = await fs.stat(fp);
      if (now - stat.mtimeMs > 3_600_000) await fs.remove(fp);
    }
  } catch {}
}

// Jalankan cleanup setiap 30 menit
setInterval(cleanOld, 30 * 60 * 1000);

/**
 * Convert buffer ke base64 data-url
 */
function toBase64(buffer, mimetype) {
  return `data:${mimetype};base64,${buffer.toString('base64')}`;
}

/**
 * Validasi file upload
 */
function validate(file, allowedTypes) {
  if (!file) throw new Error('File tidak ditemukan');
  if (file.size > MAX_BYTES) throw new Error(`File terlalu besar (max ${MAX_MB}MB)`);
  if (allowedTypes && !allowedTypes.includes(file.mimetype)) {
    throw new Error(`Tipe file tidak didukung: ${file.mimetype}`);
  }
}

const IMAGE_TYPES = ['image/jpeg','image/jpg','image/png','image/webp','image/gif'];
const VIDEO_TYPES = ['video/mp4','video/webm','video/quicktime','video/x-msvideo','video/mpeg'];

module.exports = { toBase64, validate, IMAGE_TYPES, VIDEO_TYPES, TMP_DIR };
