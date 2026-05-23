@echo off
echo.
echo ========================================
echo  ARKX Motion Pro V2 - Deploy CF Worker
echo ========================================
echo.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js tidak ditemukan. Install dari https://nodejs.org
    pause
    exit /b 1
)

:: Install wrangler jika belum ada
echo [1/4] Mengecek wrangler...
call npx wrangler --version >nul 2>&1
if errorlevel 1 (
    echo [1/4] Install wrangler...
    call npm install -g wrangler
)
echo [1/4] Wrangler OK

:: Login ke Cloudflare
echo.
echo [2/4] Login ke Cloudflare...
echo      Browser akan terbuka untuk login.
echo      Setelah login, kembali ke sini.
echo.
call npx wrangler login

:: Deploy worker
echo.
echo [3/4] Deploy worker ke Cloudflare...
call npx wrangler deploy worker.js --name arkx-proxy --compatibility-date 2024-05-01

if errorlevel 1 (
    echo [ERROR] Deploy gagal. Cek error di atas.
    pause
    exit /b 1
)

:: Set secret
echo.
echo [4/4] Set WORKER_SECRET...
echo      Masukkan string secret yang kuat (contoh: arkx_secret_2024_xyz)
echo      String ini harus sama dengan CF_WORKER_SECRET di file .env ARKX
echo.
call npx wrangler secret put WORKER_SECRET

echo.
echo ========================================
echo  SELESAI! Worker berhasil di-deploy.
echo ========================================
echo.
echo Langkah selanjutnya:
echo 1. Copy URL worker dari output di atas
echo    (contoh: https://arkx-proxy.namakamu.workers.dev)
echo 2. Buka file .env di folder ARKX
echo 3. Isi CF_WORKER_URL=https://arkx-proxy.namakamu.workers.dev
echo 4. Isi CF_WORKER_SECRET=secret_yang_tadi_kamu_masukkan
echo 5. Restart server: npm start
echo.
pause
