# 🚀 Tutorial Deploy ARKX Motion Pro V2
## Step by Step — Tidak Ada yang Terlewat

---

## BAGIAN 1 — Deploy Cloudflare Worker

### Step 1: Buka Cloudflare Dashboard

1. Buka browser di HP atau PC
2. Pergi ke → **https://dash.cloudflare.com**
3. Login dengan akun Cloudflare kamu
   - Belum punya akun? Daftar gratis di **https://cloudflare.com**

---

### Step 2: Buat Worker Baru

1. Setelah login, lihat sidebar kiri
2. Klik **"Workers & Pages"**
3. Klik tombol **"Create"** (warna biru/orange)
4. Pilih **"Create Worker"**
5. Di kolom nama, **hapus nama default** dan ketik: `arkx-proxy`
6. Klik tombol **"Deploy"** (biarkan kode default dulu, kita ganti nanti)

---

### Step 3: Edit Kode Worker

Setelah deploy, kamu akan melihat halaman worker.

1. Klik tombol **"Edit Code"** (ada di kanan atas)
2. Akan muncul editor kode dengan 2 panel:
   - Panel kiri = kode
   - Panel kanan = preview
3. **Klik di dalam panel kiri** (area kode)
4. Tekan **Ctrl+A** untuk select semua kode yang ada
5. Tekan **Delete** untuk hapus semua

Sekarang editor kosong. Lanjut ke step berikutnya.

---

### Step 4: Copy Kode Worker dari PC

1. Buka **File Explorer** di PC kamu
2. Pergi ke folder: `D:\arkxv2\cloudflare\`
3. Klik kanan file **`worker.js`**
4. Pilih **"Open with"** → **Notepad** (atau VS Code)
5. Tekan **Ctrl+A** (select semua)
6. Tekan **Ctrl+C** (copy)

---

### Step 5: Paste ke Cloudflare Editor

1. Kembali ke browser Cloudflare
2. Klik di dalam editor yang sudah kosong tadi
3. Tekan **Ctrl+V** (paste)
4. Kamu akan melihat kode panjang muncul
5. Klik tombol **"Save & Deploy"** (pojok kanan atas)
6. Tunggu beberapa detik sampai muncul pesan sukses

---

### Step 6: Catat URL Worker

Setelah deploy berhasil, kamu akan melihat URL worker.

Contoh tampilannya:
```
https://arkx-proxy.namakamu.workers.dev
```

**⚠️ PENTING: Copy/catat URL ini, akan dipakai nanti di Step 10**

---

### Step 7: Set Secret (Kunci Keamanan)

Ini penting agar worker kamu tidak bisa dipakai orang lain.

1. Masih di halaman worker yang sama
2. Klik tab **"Settings"** (ada di baris tab atas)
3. Scroll ke bawah sampai ketemu **"Variables and Secrets"**
4. Klik tombol **"Add"**
5. Pilih **"Secret"** (bukan Variable)
6. Isi kolom **Name** dengan: `WORKER_SECRET`
7. Isi kolom **Value** dengan string random buatan kamu sendiri

   Contoh value yang bagus:
   ```
   arkx_s3cr3t_2024_AbCxYz_789
   ```
   Buat sendiri, jangan pakai contoh ini. Boleh kombinasi huruf, angka, underscore.

8. **⚠️ PENTING: Catat/simpan value ini, akan dipakai nanti di Step 11**
9. Klik **"Encrypt"** lalu klik **"Save"**
10. Klik **"Deploy"** untuk apply perubahan

---

### Step 8: Test Worker Berhasil

1. Buka tab baru di browser
2. Ketik URL ini (ganti dengan URL worker kamu):
   ```
   https://arkx-proxy.namakamu.workers.dev/health
   ```
3. Harus muncul teks seperti ini:
   ```json
   {"ok":true,"service":"ARKX-CF-Proxy","ts":1234567890}
   ```
4. Kalau muncul seperti itu → **Worker berhasil! ✅**
5. Kalau error → ulangi dari Step 3

---

## BAGIAN 2 — Setup Server ARKX di PC

### Step 9: Buat File .env

1. Buka **File Explorer**
2. Pergi ke folder: `D:\arkxv2\`
3. Cari file bernama **`.env.example`**
4. Klik kanan → **Copy**
5. Klik kanan di area kosong → **Paste**
6. Rename file hasil copy dari `.env.example` menjadi **`.env`**
   - Klik kanan → Rename
   - Hapus `.example` di belakang
   - Tekan Enter

---

### Step 10: Edit File .env

1. Klik kanan file **`.env`** yang baru dibuat
2. Pilih **"Open with"** → **Notepad**
3. Cari baris ini:
   ```
   CF_WORKER_URL=https://YOUR_WORKER.workers.dev
   ```
4. Ganti dengan URL worker kamu dari Step 6:
   ```
   CF_WORKER_URL=https://arkx-proxy.namakamu.workers.dev
   ```

---

### Step 11: Isi Worker Secret di .env

1. Masih di file `.env` yang sama
2. Cari baris ini:
   ```
   CF_WORKER_SECRET=GANTI_SECRET_RANDOM_KUAT_DISINI
   ```
3. Ganti dengan secret yang kamu buat di Step 7:
   ```
   CF_WORKER_SECRET=arkx_s3cr3t_2024_AbCxYz_789
   ```
4. Tekan **Ctrl+S** untuk save
5. Tutup Notepad

---

### Step 12: Jalankan Server ARKX

1. Buka **Command Prompt** atau **PowerShell**
   - Tekan **Windows+R** → ketik `cmd` → Enter
2. Ketik perintah ini:
   ```
   cd D:\arkxv2
   ```
   Tekan Enter
3. Ketik:
   ```
   npm start
   ```
   Tekan Enter
4. Tunggu sampai muncul:
   ```
   ⚡ ARKX Motion Pro V2
   🌐 http://localhost:3000
   🔗 CF Worker: https://arkx-proxy.namakamu.workers.dev
   ```
5. Server sudah jalan! ✅

---

### Step 13: Buka di Browser

1. Buka browser di PC
2. Ketik: **http://localhost:3000**
3. Akan muncul splash screen ARKX Motion Pro V2
4. Tunggu loading selesai

**Akses dari HP** (HP dan PC harus 1 WiFi):
1. Di PC, buka Command Prompt
2. Ketik: `ipconfig`
3. Cari **IPv4 Address** (contoh: 192.168.1.5)
4. Di HP, buka browser → ketik: `http://192.168.1.5:3000`

---

## BAGIAN 3 — Tambah API Key & Generate

### Step 14: Tambah API Key Magnific

1. Di app ARKX, klik tab **"Keys"** (ikon 🔑)
2. Di kotak teks besar, paste API key Magnific kamu
   - Satu key per baris
   - Bisa paste banyak sekaligus
3. Klik tombol **"Add Keys"**
4. Akan muncul notifikasi hijau "Ditambahkan X key"
5. Lihat angka di pojok kanan atas berubah (misal: "3 Keys")

---

### Step 15: Generate Video Pertama

1. Klik tab **"Generate"** (ikon 🎬)
2. Pilih mode: **Text → Video** atau **Image → Video**
3. Pilih model (contoh: Kling 2.6 Pro)
4. Isi prompt (deskripsikan video yang kamu mau)
5. Pilih durasi dan rasio
6. Klik tombol **"⚡ Generate Video"**
7. Lihat tab **"Queue"** untuk monitor progress
8. Setelah selesai, video muncul langsung di halaman Generate

---

## ✅ Checklist Sebelum Generate

Pastikan semua ini sudah ✅ sebelum generate:

- [ ] Worker sudah deploy dan URL `/health` bisa diakses
- [ ] File `.env` sudah diisi `CF_WORKER_URL` dan `CF_WORKER_SECRET`
- [ ] Server sudah jalan (`npm start`)
- [ ] Minimal 1 API key sudah ditambahkan
- [ ] Tab Debug → angka "CF Worker" menunjukkan ✅ Configured

---

## ❓ Kalau Ada Error

| Yang Terjadi | Solusi |
|---|---|
| Worker URL `/health` tidak bisa dibuka | Ulangi Step 3-6, pastikan kode ter-paste dengan benar |
| `CF_WORKER_URL belum diset` di app | Cek file `.env`, pastikan tidak ada spasi, restart server |
| `Unauthorized` saat generate | Secret di worker dan `.env` harus **persis sama** |
| `Tidak ada API key aktif` | Tambah key di tab Keys |
| Video tidak muncul setelah lama | Buka tab Debug → lihat Live Logs untuk detail error |
| Server tidak bisa diakses dari HP | Pastikan 1 WiFi, cek IP dengan `ipconfig` |
