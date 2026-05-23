# ⚡ ARKX Motion Pro V2 — Setup Guide

## Arsitektur
```
HP Browser → Node.js Server → Cloudflare Worker → Magnific API
                ↑ file upload (image/video disimpan sementara di /tmp)
```

---

## Step 1: Deploy Cloudflare Worker (5 menit)

### Cara A — Via Dashboard (paling mudah)
1. Buka https://dash.cloudflare.com
2. **Workers & Pages** → **Create Worker**
3. Klik **Edit Code**
4. Hapus semua kode default, paste isi file `cloudflare/worker.js`
5. Klik **Save & Deploy**
6. Copy URL worker (contoh: `https://arkx-proxy.namakamu.workers.dev`)
7. Buka **Settings** → **Variables** → **Add variable**
   - Name: `WORKER_SECRET`
   - Value: buat string random panjang (misal: `arkx_s3cr3t_2024_xyz`)
   - Klik **Encrypt** lalu **Save**

### Cara B — Via CLI (wrangler)
```bash
npm install -g wrangler
wrangler login
wrangler deploy cloudflare/worker.js --name arkx-proxy
wrangler secret put WORKER_SECRET
# masukkan nilai secret kamu
```

---

## Step 2: Setup Node.js Server

```bash
# Install dependencies
npm install

# Copy env file
copy .env.example .env
```

Edit file `.env`:
```env
CF_WORKER_URL=https://arkx-proxy.namakamu.workers.dev
CF_WORKER_SECRET=nilai_secret_yang_sama_dengan_di_worker
PORT=3000
```

---

## Step 3: Jalankan Server

```bash
npm start
```

Buka browser: **http://localhost:3000**

---

## Step 4: Tambah API Keys

1. Buka tab **Keys**
2. Paste API key Magnific (satu per baris)
3. Klik **Add Keys**

---

## Akses dari HP

Pastikan HP dan PC di jaringan WiFi yang sama, lalu buka:
```
http://[IP-PC-kamu]:3000
```

Cari IP PC: `ipconfig` → IPv4 Address

---

## Supabase (opsional — untuk history cloud)

1. Buat project di https://supabase.com
2. Jalankan `supabase/schema.sql` di SQL Editor
3. Tambahkan ke `.env`:
   ```env
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_KEY=your_service_key
   ```

---

## Telegram Bot (opsional)

1. Chat @BotFather → `/newbot`
2. Copy token
3. Buka Settings di app → Telegram Bot → paste token → Connect

---

## Troubleshooting

| Error | Solusi |
|-------|--------|
| `CF_WORKER_URL belum diset` | Isi `.env` lalu restart server |
| `Tidak ada API key aktif` | Tambah key di tab Keys |
| `Worker Unauthorized` | Pastikan `CF_WORKER_SECRET` sama di worker dan `.env` |
| `Upload gagal` | Cek ukuran file (max 50MB) |
| Video tidak muncul | Cek tab Debug → Live Logs |
