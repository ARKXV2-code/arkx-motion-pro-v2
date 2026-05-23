# ARKX Motion Pro V2 - Deploy Cloudflare Worker (PowerShell)
# Jalankan: Right-click → Run with PowerShell
# Atau dari terminal: .\cloudflare\deploy.ps1

Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ARKX Motion Pro V2 - Deploy CF Worker" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Pindah ke folder cloudflare
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# Check Node.js
try { $nodeVer = node --version; Write-Host "[OK] Node.js $nodeVer" -ForegroundColor Green }
catch { Write-Host "[ERROR] Node.js tidak ditemukan. Install dari https://nodejs.org" -ForegroundColor Red; Read-Host "Tekan Enter"; exit 1 }

# Install/update wrangler
Write-Host ""
Write-Host "[1/4] Install wrangler..." -ForegroundColor Yellow
npm install -g wrangler 2>&1 | Out-Null
$wVer = npx wrangler --version 2>&1
Write-Host "[OK] $wVer" -ForegroundColor Green

# Login
Write-Host ""
Write-Host "[2/4] Login ke Cloudflare..." -ForegroundColor Yellow
Write-Host "      Browser akan terbuka. Login lalu kembali ke sini." -ForegroundColor Gray
npx wrangler login

# Deploy
Write-Host ""
Write-Host "[3/4] Deploy worker 'arkx-proxy'..." -ForegroundColor Yellow
$deployOut = npx wrangler deploy worker.js --name arkx-proxy --compatibility-date 2024-05-01 2>&1
Write-Host $deployOut

# Extract worker URL dari output
$workerUrl = ($deployOut | Select-String -Pattern "https://\S+\.workers\.dev").Matches.Value
if ($workerUrl) {
    Write-Host ""
    Write-Host "[OK] Worker URL: $workerUrl" -ForegroundColor Green
} else {
    Write-Host "[WARN] Tidak bisa auto-detect URL. Cek output di atas." -ForegroundColor Yellow
}

# Set secret
Write-Host ""
Write-Host "[4/4] Set WORKER_SECRET..." -ForegroundColor Yellow
Write-Host "      Masukkan string secret (contoh: arkx_secret_2024_xyz)" -ForegroundColor Gray
Write-Host "      String ini harus sama dengan CF_WORKER_SECRET di .env" -ForegroundColor Gray
Write-Host ""
npx wrangler secret put WORKER_SECRET

# Update .env otomatis jika bisa
$envFile = Join-Path (Split-Path -Parent $scriptDir) ".env"
if ($workerUrl -and (Test-Path $envFile)) {
    $secret = Read-Host "Masukkan secret yang tadi kamu set (untuk auto-update .env)"
    $envContent = Get-Content $envFile -Raw
    $envContent = $envContent -replace "CF_WORKER_URL=.*", "CF_WORKER_URL=$workerUrl"
    $envContent = $envContent -replace "CF_WORKER_SECRET=.*", "CF_WORKER_SECRET=$secret"
    Set-Content $envFile $envContent
    Write-Host ""
    Write-Host "[OK] File .env sudah diupdate otomatis!" -ForegroundColor Green
} elseif ($workerUrl) {
    Write-Host ""
    Write-Host "Update .env manual:" -ForegroundColor Yellow
    Write-Host "CF_WORKER_URL=$workerUrl" -ForegroundColor White
    Write-Host "CF_WORKER_SECRET=<secret yang tadi kamu masukkan>" -ForegroundColor White
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  SELESAI! Restart server: npm start" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Read-Host "Tekan Enter untuk keluar"
