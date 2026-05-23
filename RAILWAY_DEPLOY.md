# Deploy ke Railway — Step by Step

## Step 1: Push ke GitHub

1. Buka https://github.com → New repository → nama: `arkx-motion-pro-v2`
2. Di CMD:
```
D:
cd arkxv2
git init
git add .
git commit -m "ARKX Motion Pro V2"
git branch -M main
git remote add origin https://github.com/USERNAMEKAMU/arkx-motion-pro-v2.git
git push -u origin main
```

## Step 2: Deploy di Railway

1. Buka https://railway.app → Login dengan GitHub
2. Klik **New Project** → **Deploy from GitHub repo**
3. Pilih repo `arkx-motion-pro-v2`
4. Railway otomatis detect Node.js dan deploy

## Step 3: Set Environment Variables

Di Railway dashboard → project → **Variables** → tambahkan:

```
CF_WORKER_URL=https://arkx-proxy.jagoanoutfit515.workers.dev
CF_WORKER_SECRET=arkx_jagoan_2024_XyZ789
IMGBB_API_KEY=3fc18340c0464bc6b1dc3c6556ddebe1
PORT=3000
NODE_ENV=production
```

## Step 4: Set Custom Domain (opsional)

Railway → Settings → Domains → Generate Domain
Dapat URL seperti: `https://arkx-motion-pro-v2.up.railway.app`

## Step 5: Buka App

Buka URL Railway di browser → Login dengan:
- Email: nuallakoko@gmail.com
- Password: admin123 (ganti setelah login pertama!)

---

## Catatan Penting

- Data (keys, history) tersimpan di `/data` folder
- Railway punya persistent storage — data tidak hilang saat redeploy
- Kalau mau backup data, download folder `/data` dari Railway
- Free tier Railway: $5 credit/bulan (cukup untuk ~500 jam)
