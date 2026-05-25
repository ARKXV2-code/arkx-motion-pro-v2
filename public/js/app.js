/**
 * ARKX Motion Pro V2 — Frontend (Auth + Full UI)
 */

// ── State ─────────────────────────────────────────────────────
const S = {
  user: null, token: null,
  mode: 't2v', dur: 5, ratio: '16:9', model: 'kling-2.6-pro',
  imgFile: null,
  batchOn: false, batchCount: 2, batchFiles: {},
  mDur: 5, mModel: 'kling-motion-2.6-std',
  mImgFile: null, mVidFile: null,
  mBatchOn: false, mBatchCount: 2, mBatchImgs: {}, mBatchVids: {},
  models: [], tasks: new Map(),
  ws: null, wsTimer: null,
  currentPage: 'generate',
};

// ── Boot ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  animateSplash([
    [300,  'Checking session…'],
    [800,  'Loading models…'],
    [1400, 'Connecting services…'],
    [1900, 'Ready!'],
  ], async () => {
    hideSplash();
    const saved = localStorage.getItem('arkx_token');
    if (saved) {
      S.token = saved;
      try {
        const r = await api('/api/auth/me');
        if (r.ok) {
          S.user = r.user;
          $('authPage').classList.add('hidden');
          await enterApp();
          return;
        }
      } catch {}
      localStorage.removeItem('arkx_token');
    }
    // Cek apakah ada hash #dashboard (dari redirect setelah login)
    if (window.location.hash === '#dashboard') {
      const token = localStorage.getItem('arkx_token');
      if (token) {
        S.token = token;
        try {
          const r = await api('/api/auth/me');
          if (r.ok) {
            S.user = r.user;
            $('authPage').classList.add('hidden');
            await enterApp();
            return;
          }
        } catch {}
      }
    }
    showAuth();
  });
});

function animateSplash(steps, done) {
  const fill = $('loaderFill'), txt = $('loaderText');
  let i = 0;
  function next() {
    if (i >= steps.length) { setTimeout(done, 200); return; }
    const [pct, label] = steps[i++];
    fill.style.width = pct / 20 * 100 + '%';
    txt.textContent = label;
    setTimeout(next, 400);
  }
  next();
}

function hideSplash() {
  const s = $('splash');
  s.style.opacity = '0';
  setTimeout(() => s.classList.add('hidden'), 600);
}

// ── AUTH ──────────────────────────────────────────────────────
function showAuth() { $('authPage').classList.remove('hidden'); }
function showLogin()    { $('loginForm').classList.remove('hidden'); $('registerForm').classList.add('hidden'); $('pendingCard').classList.add('hidden'); }
function showRegister() { $('registerForm').classList.remove('hidden'); $('loginForm').classList.add('hidden'); $('pendingCard').classList.add('hidden'); }
function togglePass(id) { const i=$(id); i.type = i.type==='password'?'text':'password'; }

async function doLogin() {
  const email = $('loginEmail').value.trim();
  const pass  = $('loginPass').value;
  if (!email||!pass) return showAuthError('loginError','Isi email dan password');
  setAuthLoading('loginBtn','loginBtnTxt',true,'Login...');
  try {
    const r = await api('/api/auth/login','POST',{email,password:pass});
    if (r.ok) {
      S.user = r.user; S.token = r.token;
      localStorage.setItem('arkx_token', r.token);
      // Redirect ke /app dengan hash untuk trigger app load
      window.location.href = '/app#dashboard';
    } else showAuthError('loginError', r.error||'Login gagal');
  } catch(e) {
    showAuthError('loginError', e.message);
  }
  finally { setAuthLoading('loginBtn','loginBtnTxt',false,'Login'); }
}

async function doRegister() {
  const name  = $('regName').value.trim();
  const email = $('regEmail').value.trim();
  const pass  = $('regPass').value;
  if (!name||!email||!pass) return showAuthError('regError','Isi semua field');
  if (pass.length < 6) return showAuthError('regError','Password min 6 karakter');
  setAuthLoading('regBtn','regBtnTxt',true,'Mendaftar...');
  try {
    const r = await api('/api/auth/register','POST',{name,email,password:pass});
    if (r.ok) {
      $('registerForm').classList.add('hidden');
      $('pendingCard').classList.remove('hidden');
    } else showAuthError('regError', r.error||'Gagal daftar');
  } catch(e) { showAuthError('regError', e.message); }
  finally { setAuthLoading('regBtn','regBtnTxt',false,'Daftar'); }
}

function showAuthError(id, msg) {
  const el = $(id); el.textContent = msg; el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}
function setAuthLoading(btnId, txtId, loading, txt) {
  $(btnId).disabled = loading; $(txtId).textContent = txt;
}

function doLogout() {
  S.user = null; S.token = null;
  localStorage.removeItem('arkx_token');
  location.reload();
}

// ── ENTER APP ─────────────────────────────────────────────────
async function enterApp() {
  const mainApp = $('mainApp');
  if (!mainApp) throw new Error('mainApp element not found');
  mainApp.classList.remove('hidden');

  // Set user info — safe access
  const nameEl = $('sbUname'), roleEl = $('sbUrole'), avatarEl = $('sbAvatar');
  if (nameEl)   nameEl.textContent   = S.user?.name || 'User';
  if (roleEl)   roleEl.textContent   = S.user?.plan === 'pro' ? '⭐ Pro' : S.user?.plan === 'enterprise' ? '👑 Enterprise' : S.user?.role || 'user';
  if (avatarEl) avatarEl.textContent = (S.user?.name || 'U')[0].toUpperCase();

  // Show admin menu if admin
  if (S.user?.role === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
  }

  await Promise.all([loadModels(), loadKeys()]);
  wsConnect();
  setInterval(pollQueue, 4000);
  setInterval(pollStats, 10000);
  setInterval(pollActiveTasks, 6000);
  navTo('generate');
  pollStats();
}

// ── WEBSOCKET ─────────────────────────────────────────────────
function wsConnect() {
  const proto = location.protocol==='https:'?'wss:':'ws:';
  S.ws = new WebSocket(`${proto}//${location.host}`);
  S.ws.onopen  = () => { $('wsIndicator').classList.add('on'); addLog('success','🔌 Connected'); };
  S.ws.onclose = () => { $('wsIndicator').classList.remove('on'); clearTimeout(S.wsTimer); S.wsTimer=setTimeout(wsConnect,3000); };
  S.ws.onerror = () => {};
  S.ws.onmessage = e => {
    try {
      const m = JSON.parse(e.data);
      if (m.type==='log')       addLog(m.entry?.type||'info', m.entry?.msg||'');
      if (m.type==='progress')  onProgress(m);
      if (m.type==='completed') onCompleted(m);
      if (m.type==='failed')    onFailed(m);
      if (m.type==='queue')     updateQBadge((m.pending||0)+(m.running||0));
    } catch {}
  };
}

// ── NAVIGATION ────────────────────────────────────────────────
const PAGE_META = {
  generate: { title:'Generate Video', sub:'Buat video AI dengan berbagai model' },
  motion:   { title:'Motion Control', sub:'Transfer gerakan ke karakter dengan referensi video' },
  queue:    { title:'Queue Monitor',  sub:'Pantau semua task yang sedang berjalan' },
  history:  { title:'History',        sub:'Semua video yang pernah dibuat' },
  keys:     { title:'API Keys',       sub:'Kelola Magnific API keys' },
  admin:    { title:'Admin Panel',    sub:'Kelola user dan persetujuan akun' },
  settings: { title:'Settings',       sub:'Konfigurasi worker, ImgBB, dan lainnya' },
  debug:    { title:'Debug Console',  sub:'Monitor realtime logs dan API health' },
};

function navTo(page) {
  S.currentPage = page;
  // Update sidebar
  document.querySelectorAll('.sb-item').forEach(b => b.classList.toggle('active', b.dataset.page===page));
  // Update bottom tabs
  document.querySelectorAll('.btab').forEach(b => b.classList.toggle('active', b.dataset.page===page));
  // Update pages
  document.querySelectorAll('.page').forEach(p => {
    const active = p.id === `page-${page}`;
    p.classList.toggle('active', active);
    p.classList.toggle('hidden', !active);
  });
  // Update topbar
  const meta = PAGE_META[page] || {};
  $('pageTitle').textContent = meta.title || page;
  $('pageSub').textContent   = meta.sub   || '';
  // Render page content
  renderPage(page);
  // Close mobile sidebar
  $('sidebar').classList.remove('open');
  $('sbOverlay').classList.add('hidden');
}

function toggleSidebar() {
  const open = $('sidebar').classList.toggle('open');
  $('sbOverlay').classList.toggle('hidden', !open);
}

function renderPage(page) {
  const el = $(`page-${page}`);
  if (!el) return;
  switch(page) {
    case 'generate': renderGenerate(el); break;
    case 'motion':   renderMotion(el);   break;
    case 'queue':    renderQueue(el);    break;
    case 'history':  renderHistoryPage(el); break;
    case 'keys':     renderKeys(el);     break;
    case 'admin':    renderAdmin(el);    break;
    case 'settings': renderSettings(el); break;
    case 'debug':    renderDebug(el);    break;
  }
}

// ── MODELS ────────────────────────────────────────────────────
async function loadModels() {
  try {
    const r = await api('/api/generate/models');
    S.models = r.models || [];
    // Set default model ke yang pertama tersedia
    if (S.models.length && !S.models.find(m => m.id === S.model)) {
      const firstT2V = S.models.find(m => m.t2v && !m.motion);
      const firstI2V = S.models.find(m => m.i2v && !m.motion);
      S.model  = firstT2V?.id || firstI2V?.id || S.models[0]?.id;
      S.mModel = S.models.find(m => m.motion)?.id || S.mModel;
    }
  } catch(e) { addLog('error','Load models: '+e.message); }
}

function modelCards(list, selected, fn) {
  if (!list.length) return '<div class="empty-state"><div class="empty-icon">🤖</div><div class="empty-text">Tidak ada model tersedia</div></div>';
  return list.map(m => {
    const badge = m.motion?'mb-mot':m.provider==='wan'?'mb-wan':m.provider==='seedance'?'mb-seed':m.mode==='pro'?'mb-pro':'mb-std';
    const tag   = m.motion?'Motion':(m.mode||m.provider);
    return `<div class="mcard ${m.id===selected?'sel':''}" onclick="${fn}('${m.id}')">
      <div class="mcard-name">${m.label}</div>
      <div class="mcard-dur">Max ${m.maxDur}s</div>
      <span class="mbadge ${badge}">${tag}</span>
    </div>`;
  }).join('');
}

// ── GENERATE PAGE ─────────────────────────────────────────────
// Helper: durasi buttons sesuai model
function _durButtons(model) {
  const max = model?.maxDur || 10;
  // Pastikan S.dur tidak melebihi max model
  if (S.dur > max) S.dur = max;
  // Kling 3 support 3-15s, model lain 5-10s
  const durs = max >= 15 ? [5, 10, 15] : [5, 10];
  return durs.map(v => `<button class="dur-btn ${S.dur===v?'active':''}" onclick="setDur(${v})">${v}s</button>`).join('');
}

// Helper: rasio options sesuai model
function _ratioOptions(model) {
  const current = S.ratio || '16:9';
  if (model?.provider === 'kling26') {
    // Kling 2.6 Pro hanya support 3 rasio dengan nama berbeda
    const opts = [
      ['16:9','16:9 Landscape'],
      ['9:16','9:16 Portrait'],
      ['1:1', '1:1 Square'],
    ];
    // Reset ke 16:9 kalau rasio tidak support
    if (!opts.find(([v]) => v === current)) S.ratio = '16:9';
    return opts.map(([v,l]) => `<option value="${v}" ${S.ratio===v?'selected':''}>${l}</option>`).join('');
  }
  // Kling 3, WAN, Seedance, Kling 2.1/2.5 — semua support rasio standar
  const allRatios = ['16:9','9:16','1:1','4:3','3:4','21:9'];
  return allRatios.map(r => `<option value="${r}" ${current===r?'selected':''}>${r}</option>`).join('');
}

function renderGenerate(el) {
  const t2vModels = S.models.filter(m => !m.motion && m.t2v);
  const i2vModels = S.models.filter(m => !m.motion && m.i2v);
  const list = S.mode==='t2v' ? t2vModels : i2vModels;
  const selectedModel = S.models.find(m => m.id === S.model);

  el.innerHTML = `
  <div class="mode-toggle">
    <button class="mode-btn ${S.mode==='t2v'?'active':''}" onclick="setMode('t2v')">📝 Text → Video</button>
    <button class="mode-btn ${S.mode==='i2v'?'active':''}" onclick="setMode('i2v')">🖼️ Image → Video</button>
  </div>

  <div class="card">
    <div class="card-title"><span>🤖</span> Model</div>
    <div class="model-grid" id="modelGrid">${modelCards(list,S.model,'pickModel')}</div>
  </div>

  ${S.mode==='i2v'?`
  <div class="card">
    <div class="card-title"><span>🖼️</span> Input Image</div>
    <div class="dropzone" id="imgDrop" onclick="$('imgFile').click()">
      ${S.imgFile
        ? `<img class="dz-preview" src="${URL.createObjectURL(S.imgFile)}">`
        : `<div class="dz-icon">📸</div><div class="dz-title">Tap untuk upload gambar</div><div class="dz-sub">JPG · PNG · WebP · max 50MB</div>`}
    </div>
    <input type="file" id="imgFile" accept="image/*" class="hidden" onchange="onImgUpload(event)">
  </div>`:''}

  <div class="card">
    <div class="card-title"><span>✍️</span> Prompt</div>
    <div class="inp-group">
      <textarea id="prompt" class="ta" rows="3" placeholder="Deskripsikan video kamu…&#10;Contoh: A cinematic ocean wave at golden hour, slow motion, 4K">${''}</textarea>
      <div class="char-hint"><span id="promptLen">0</span>/500</div>
    </div>
    <div class="inp-group">
      <label class="inp-label">Negative Prompt <span style="color:var(--t3);font-weight:400;text-transform:none">(opsional)</span></label>
      <textarea id="negPrompt" class="ta" rows="2" placeholder="Apa yang ingin dihindari…"></textarea>
    </div>
  </div>

  <div class="card">
    <div class="card-title"><span>⚙️</span> Settings</div>
    <div class="inp-group">
      <label class="inp-label">⏱️ Durasi</label>
      <div class="dur-row" id="durRow">
        ${_durButtons(selectedModel)}
      </div>
    </div>
    <div class="inp-group">
      <label class="inp-label">📐 Rasio</label>
      <select id="ratio" class="sel" onchange="S.ratio=this.value">
        ${_ratioOptions(selectedModel)}
      </select>
    </div>
    <div class="inp-group">
      <label class="inp-label">🎚️ CFG Scale: <span class="slider-val" id="cfgVal">0.5</span></label>
      <input type="range" id="cfg" min="0" max="1" step="0.1" value="0.5" class="slider"
        oninput="$('cfgVal').textContent=this.value">
    </div>
  </div>

  <div class="card">
    <div class="card-title"><span>📦</span> Batch Mode</div>
    <div class="batch-toggle-row">
      <span style="font-size:13px;color:var(--t2)">Generate ${S.batchCount} video sekaligus</span>
      <label class="toggle">
        <input type="checkbox" id="batchToggle" ${S.batchOn?'checked':''} onchange="toggleBatch(this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="batch-panel ${S.batchOn?'':'hidden'}" id="batchPanel">
      <div class="batch-info" style="margin-top:12px">Tiap video bisa punya prompt berbeda</div>
      <div class="batch-count-row">
        <span>Jumlah:</span>
        <div class="batch-nums">
          ${[2,3,4,5].map(n=>`<button class="batch-n ${S.batchCount===n?'active':''}" onclick="setBatchCount(${n})">${n}</button>`).join('')}
        </div>
      </div>
      <div id="batchPrompts"></div>
    </div>
  </div>

  <button class="gen-btn" id="genBtn" onclick="doGenerate()">
    <span>⚡</span>
    <span id="genTxt">${S.batchOn?`Generate ${S.batchCount} Video`:'Generate Video'}</span>
  </button>

  <div class="task-list" id="genTasks"></div>`;

  // Re-attach events
  $('prompt')?.addEventListener('input', () => $('promptLen').textContent = $('prompt').value.length);
  setupDrop('imgDrop', f => { S.imgFile=f; renderGenerate(el); });
  if (S.batchOn) renderBatchPrompts();
  renderTaskList('genTasks');
}

function setMode(m) { S.mode=m; S.imgFile=null; renderPage('generate'); }
function pickModel(id) {
  S.model=id;
  // Reset dur ke max model kalau perlu
  const m = S.models.find(x => x.id === id);
  if (m && S.dur > m.maxDur) S.dur = m.maxDur;
  renderPage('generate');
}
function setDur(v) { S.dur=v; renderPage('generate'); }

function onImgUpload(e) {
  const f=e.target.files[0]; if(!f) return;
  S.imgFile=f; renderPage('generate');
}

// ── MOTION PAGE ───────────────────────────────────────────────
function renderMotion(el) {
  const motionModels = S.models.filter(m => m.motion);
  el.innerHTML = `
  <div class="card">
    <div class="card-title"><span>🤖</span> Motion Model</div>
    <div class="model-grid">${modelCards(motionModels,S.mModel,'pickMModel')}</div>
  </div>

  <div class="card">
    <div class="card-title"><span>🖼️</span> Image Reference <span style="color:var(--red)">*</span></div>
    <div class="dropzone" id="mImgDrop" onclick="$('mImgFile').click()">
      ${S.mImgFile
        ? `<img class="dz-preview" src="${URL.createObjectURL(S.mImgFile)}">`
        : `<div class="dz-icon">📸</div><div class="dz-title">Upload gambar referensi</div><div class="dz-sub">Wajib · JPG PNG WebP · max 50MB</div>`}
    </div>
    <input type="file" id="mImgFile" accept="image/*" class="hidden" onchange="onMImgUpload(event)">
  </div>

  <div class="card">
    <div class="card-title"><span>🎥</span> Video Reference <span style="color:var(--red)">*</span></div>
    <div class="dropzone" id="mVidDrop" onclick="$('mVidFile').click()">
      ${S.mVidFile
        ? `<video class="dz-vid-preview" src="${URL.createObjectURL(S.mVidFile)}" controls></video>`
        : `<div class="dz-icon">🎬</div><div class="dz-title">Upload video referensi</div><div class="dz-sub">Wajib · MP4 WebM · max 50MB</div>`}
    </div>
    <input type="file" id="mVidFile" accept="video/*" class="hidden" onchange="onMVidUpload(event)">
  </div>

  <div class="card">
    <div class="card-title"><span>✍️</span> Motion Prompt <span style="color:var(--t3);font-weight:400;text-transform:none">(opsional)</span></div>
    <textarea id="mPrompt" class="ta" rows="3" placeholder="Deskripsikan gerakan…&#10;Contoh: slow zoom in, camera pan left"></textarea>
  </div>

  <div class="card">
    <div class="card-title"><span>⚙️</span> Settings</div>
    <div class="inp-group">
      <label class="inp-label">⏱️ Durasi (max 30s)</label>
      <div class="dur-row">
        ${[5,10,15,20,30].map(v=>`<button class="dur-btn ${S.mDur===v?'active':''}" onclick="setMDur(${v})">${v}s</button>`).join('')}
      </div>
    </div>
    <div class="inp-group">
      <label class="inp-label">📐 Rasio</label>
      <select id="mRatio" class="sel">
        ${['16:9','9:16','1:1','4:3','3:4'].map(r=>`<option value="${r}">${r}</option>`).join('')}
      </select>
    </div>
    <div class="inp-group">
      <label class="inp-label">💪 Motion Strength: <span class="slider-val" id="mStrVal">0.5</span></label>
      <input type="range" id="mStr" min="0" max="1" step="0.1" value="0.5" class="slider"
        oninput="$('mStrVal').textContent=this.value">
    </div>
  </div>

  <div class="card">
    <div class="card-title"><span>📦</span> Batch Mode</div>
    <div class="batch-toggle-row">
      <span style="font-size:13px;color:var(--t2)">Generate ${S.mBatchCount} motion sekaligus</span>
      <label class="toggle">
        <input type="checkbox" id="mBatchToggle" ${S.mBatchOn?'checked':''} onchange="toggleMBatch(this.checked)">
        <span class="toggle-slider"></span>
      </label>
    </div>
    <div class="batch-panel ${S.mBatchOn?'':'hidden'}" id="mBatchPanel">
      <div class="batch-info" style="margin-top:12px">Tiap motion bisa punya image+video berbeda</div>
      <div class="batch-count-row">
        <span>Jumlah:</span>
        <div class="batch-nums">
          ${[2,3,4,5].map(n=>`<button class="batch-n ${S.mBatchCount===n?'active':''}" onclick="setMBatchCount(${n})">${n}</button>`).join('')}
        </div>
      </div>
      <div id="mBatchItems"></div>
    </div>
  </div>
  <button class="gen-btn motion" id="motionBtn" onclick="doMotion()">
    <span>🎮</span>
    <span id="motionTxt">${S.mBatchOn?`Start ${S.mBatchCount} Motion`:'Start Motion Control'}</span>
  </button>
  <div class="task-list" id="motionTasks"></div>`;

  setupDrop('mImgDrop', f => { S.mImgFile=f; renderPage('motion'); });
  setupDrop('mVidDrop', f => { S.mVidFile=f; renderPage('motion'); });
  if (S.mBatchOn) renderMBatchItems();
  renderTaskList('motionTasks');
}

function pickMModel(id) { S.mModel=id; renderPage('motion'); }
function setMDur(v) { S.mDur=v; renderPage('motion'); }
function onMImgUpload(e) { const f=e.target.files[0]; if(!f) return; S.mImgFile=f; renderPage('motion'); }
function onMVidUpload(e) { const f=e.target.files[0]; if(!f) return; S.mVidFile=f; renderPage('motion'); }

// ── GENERATE ACTIONS ──────────────────────────────────────────
async function doGenerate() {
  if (S.batchOn) return _batchGen();
  const prompt = $('prompt')?.value.trim();
  if (!prompt) return toast('Isi prompt dulu','error');
  if (!S.model) return toast('Pilih model dulu','error');
  if (!(await hasKeys())) return;
  const btn=$('genBtn'); btn.disabled=true; $('genTxt').textContent='Queuing…';
  try {
    let res;
    if (S.mode==='t2v') {
      res = await apiAuth('/api/generate/t2v','POST',{
        modelId:S.model, prompt, negPrompt:$('negPrompt')?.value||'',
        duration:S.dur,
        ratio: $('ratio')?.value || S.ratio || '16:9',
        cfg:parseFloat($('cfg')?.value||0.5)
      });
    } else {
      if (!S.imgFile) return toast('Upload gambar dulu','error');
      const fd=new FormData();
      fd.append('image',S.imgFile); fd.append('modelId',S.model);
      fd.append('prompt',prompt); fd.append('negPrompt',$('negPrompt')?.value||'');
      fd.append('duration',S.dur);
      fd.append('ratio',$('ratio')?.value || S.ratio || '16:9');
      fd.append('cfg',$('cfg')?.value||0.5);
      res = await apiFormAuth('/api/generate/i2v',fd);
    }
    if (res.ok) { toast('✅ Task masuk queue!','success'); addTask(res.queueId,S.model,prompt,S.mode==='t2v'?'T2V':'I2V','genTasks'); }
    else toast(res.error||'Gagal','error');
  } catch(e) { toast(e.message,'error'); }
  finally { btn.disabled=false; $('genTxt').textContent='Generate Video'; }
}

async function _batchGen() {
  if (!S.model) return toast('Pilih model dulu','error');
  if (!(await hasKeys())) return;
  const btn=$('genBtn'); btn.disabled=true; $('genTxt').textContent=`Queuing ${S.batchCount}…`;
  const mainPrompt=$('prompt')?.value.trim()||'';
  let queued=0;
  for (let i=0;i<S.batchCount;i++) {
    const prompt=$(`bPrompt${i}`)?.value.trim()||mainPrompt;
    if (!prompt) { toast(`Prompt video ${i+1} kosong`,'error'); continue; }
    try {
      let res;
      if (S.mode==='t2v') {
        res = await apiAuth('/api/generate/t2v','POST',{modelId:S.model,prompt,negPrompt:$('negPrompt')?.value||'',duration:S.dur,ratio:$('ratio')?.value||'16:9',cfg:parseFloat($('cfg')?.value||0.5)});
      } else {
        const imgFile=S.batchFiles[i]||S.imgFile;
        if (!imgFile) { toast(`Upload gambar video ${i+1}`,'error'); continue; }
        const fd=new FormData(); fd.append('image',imgFile); fd.append('modelId',S.model);
        fd.append('prompt',prompt); fd.append('duration',S.dur); fd.append('ratio',$('ratio')?.value||'16:9');
        res = await apiFormAuth('/api/generate/i2v',fd);
      }
      if (res.ok) { addTask(res.queueId,S.model,`[${i+1}/${S.batchCount}] ${prompt}`,S.mode==='t2v'?'T2V':'I2V','genTasks'); queued++; }
    } catch(e) { toast(`Video ${i+1}: ${e.message}`,'error'); }
    if (i<S.batchCount-1) await sleep(500);
  }
  if (queued>0) toast(`✅ ${queued} video masuk queue!`,'success');
  btn.disabled=false; $('genTxt').textContent=`Generate ${S.batchCount} Video`;
}

async function doMotion() {
  if (S.mBatchOn) return _batchMotion();
  if (!S.mImgFile) return toast('Upload gambar referensi dulu','error');
  if (!S.mVidFile) return toast('Upload video referensi dulu','error');
  if (!S.mModel)   return toast('Pilih motion model dulu','error');
  if (!(await hasKeys())) return;
  const btn=$('motionBtn'); btn.disabled=true; $('motionTxt').textContent='Queuing…';
  try {
    const fd=new FormData();
    fd.append('image',S.mImgFile); fd.append('video',S.mVidFile);
    fd.append('modelId',S.mModel); fd.append('prompt',$('mPrompt')?.value||'');
    fd.append('duration',S.mDur); fd.append('ratio',$('mRatio')?.value||'16:9');
    fd.append('strength',$('mStr')?.value||0.5);
    const res=await apiFormAuth('/api/generate/motion',fd);
    if (res.ok) { toast('✅ Motion queued!','success'); addTask(res.queueId,S.mModel,'Motion Control','Motion','motionTasks'); }
    else toast(res.error||'Gagal','error');
  } catch(e) { toast(e.message,'error'); }
  finally { btn.disabled=false; $('motionTxt').textContent='Start Motion Control'; }
}

async function _batchMotion() {
  if (!S.mModel) return toast('Pilih motion model dulu','error');
  if (!(await hasKeys())) return;
  const btn=$('motionBtn'); btn.disabled=true; $('motionTxt').textContent=`Queuing ${S.mBatchCount}…`;
  let queued=0;
  for (let i=0;i<S.mBatchCount;i++) {
    const img=S.mBatchImgs[i]||S.mImgFile, vid=S.mBatchVids[i]||S.mVidFile;
    if (!img) { toast(`Upload image motion ${i+1}`,'error'); continue; }
    if (!vid) { toast(`Upload video motion ${i+1}`,'error'); continue; }
    try {
      const fd=new FormData(); fd.append('image',img); fd.append('video',vid);
      fd.append('modelId',S.mModel); fd.append('prompt',$(`mbPrompt${i}`)?.value||$('mPrompt')?.value||'');
      fd.append('duration',S.mDur); fd.append('ratio',$('mRatio')?.value||'16:9'); fd.append('strength',$('mStr')?.value||0.5);
      const res=await apiFormAuth('/api/generate/motion',fd);
      if (res.ok) { addTask(res.queueId,S.mModel,`[${i+1}/${S.mBatchCount}] Motion`,'Motion','motionTasks'); queued++; }
    } catch(e) { toast(`Motion ${i+1}: ${e.message}`,'error'); }
    if (i<S.mBatchCount-1) await sleep(800);
  }
  if (queued>0) toast(`✅ ${queued} motion masuk queue!`,'success');
  btn.disabled=false; $('motionTxt').textContent=`Start ${S.mBatchCount} Motion`;
}

async function hasKeys() {
  try { const r=await apiAuth('/api/keys/summary'); if(!r.summary||r.summary.active===0){toast('Belum ada API key aktif!','error');return false;} return true; } catch { return true; }
}

// ── TASK MANAGEMENT ───────────────────────────────────────────
function addTask(qId,model,prompt,type,containerId) {
  S.tasks.set(qId,{qId,model,prompt,type,status:'processing',progress:0,videoUrl:null,apiTaskId:null});
  renderTaskList(containerId);
}

function onProgress(m) {
  S.tasks.forEach(t=>{
    if(t.qId===m.taskId || t.qId===m.queueId || t.apiTaskId===m.taskId){
      t.progress = m.progress||0;
      t.status   = m.status||'processing';
      if(!t.apiTaskId && m.taskId !== t.qId) t.apiTaskId = m.taskId;
    }
  });
  renderTaskList('genTasks'); renderTaskList('motionTasks');
}

function onCompleted(m) {
  S.tasks.forEach(t=>{
    if(t.qId===m.taskId || t.qId===m.queueId || t.apiTaskId===m.taskId){
      t.status='done'; t.progress=1; t.videoUrl=m.videoUrl;
    }
  });
  renderTaskList('genTasks'); renderTaskList('motionTasks');
  if(m.videoUrl) toast('🎬 Video siap!','success');
  loadHistoryData();
}

function onFailed(m) {
  S.tasks.forEach(t=>{
    if(t.qId===m.taskId || t.qId===m.queueId || t.apiTaskId===m.taskId){
      // Jangan override kalau sudah ada video
      if (!t.videoUrl) {
        t.status='failed'; t.error=m.error;
      }
    }
  });
  renderTaskList('genTasks'); renderTaskList('motionTasks');
  if (!S.tasks.size || [...S.tasks.values()].every(t => t.videoUrl)) return;
  toast('❌ '+(m.error||'Generate gagal'),'error');
}

// Poll queue untuk update progress dari server
async function pollActiveTasks() {
  if(S.tasks.size === 0) return;
  try {
    const r = await apiAuth('/api/queue');
    // Update dari recent completed
    const all = [...(r.active||[]), ...(r.queued||[]), ...(r.completed||[])];
    all.forEach(item => {
      S.tasks.forEach(t => {
        if(t.qId === item.id) {
          if(item.status === 'done' && item.result?.taskId) {
            t.apiTaskId = item.result.taskId;
          }
          if(item.status === 'failed') {
            t.status = 'failed';
            t.error  = item.error;
          }
        }
      });
    });
    renderTaskList('genTasks');
    renderTaskList('motionTasks');
  } catch {}
}
function renderTaskList(cId) {
  const el=$(cId); if(!el) return;
  const tasks=[...S.tasks.values()];
  if(!tasks.length){el.innerHTML='';return;}
  el.innerHTML=tasks.map(t=>{
    const pct=Math.round((t.progress||0)*100);
    // Kalau ada videoUrl, paksa status done
    const status = t.videoUrl ? 'done' : t.status;
    const badge = status==='processing'?`⏳ ${pct}%` : status==='done'?'✅ Done':'❌ Failed';
    return `<div class="task-card ${status}">
      <div class="task-hdr"><div class="task-model">${t.model}</div><div class="task-badge ${status}">${badge}</div></div>
      <div class="task-prompt">${t.prompt}</div>
      <div class="task-prog-wrap"><div class="task-prog"><div class="task-prog-fill" style="width:${status==='done'?100:pct}%"></div></div><div class="task-pct">${status==='done'?100:pct}%</div></div>
      ${t.error && status!=='done'?`<div class="task-error">❌ ${t.error}</div>`:''}
      ${t.videoUrl?`
        <video class="task-vid" src="${t.videoUrl}" preload="metadata" playsinline onclick="openVideo('${t.videoUrl}')"></video>
        <div class="task-actions">
          <button class="btn-primary" onclick="openVideo('${t.videoUrl}')">▶️ Play</button>
          <a class="btn-ghost" href="${t.videoUrl}" target="_blank" download="arkx-video.mp4">⬇️ Download</a>
          <button class="btn-sm" onclick="removeTask('${t.qId}')">✕</button>
        </div>`:''}
    </div>`;
  }).join('');
}
function removeTask(id){S.tasks.delete(id);renderTaskList('genTasks');renderTaskList('motionTasks');}
function openVideo(url){$('resultVid').src=url;$('dlBtn').href=url;$('videoModal').classList.remove('hidden');}
function closeVideo(){$('videoModal').classList.add('hidden');$('resultVid').src='';}

// ── BATCH UI ──────────────────────────────────────────────────
function toggleBatch(on){S.batchOn=on;renderPage('generate');}
function setBatchCount(n){S.batchCount=n;renderPage('generate');}
function renderBatchPrompts(){
  const c=$('batchPrompts');if(!c)return;
  c.innerHTML=Array.from({length:S.batchCount},(_,i)=>{
    const f=S.batchFiles[i];
    return `<div class="batch-item">
      <div class="batch-item-hdr"><div class="batch-num-badge">${i+1}</div><div class="batch-item-label">Video ${i+1}</div></div>
      <textarea class="ta" id="bPrompt${i}" rows="2" placeholder="Prompt video ${i+1} (kosong = pakai prompt utama)"></textarea>
      ${S.mode==='i2v'?`<div class="batch-file-row">
        ${f?`<img class="batch-thumb" src="${URL.createObjectURL(f)}">`:`<div class="batch-thumb" style="background:var(--bg3);display:flex;align-items:center;justify-content:center">📸</div>`}
        <label class="batch-file-btn" for="bImg${i}">${f?'✅ '+f.name.slice(0,20):'📸 Upload gambar'}</label>
        <input type="file" id="bImg${i}" accept="image/*" class="hidden" onchange="onBatchImg(event,${i})">
      </div>`:''}
    </div>`;
  }).join('');
}
function onBatchImg(e,i){const f=e.target.files[0];if(!f)return;S.batchFiles[i]=f;renderBatchPrompts();}
function toggleMBatch(on){S.mBatchOn=on;renderPage('motion');}
function setMBatchCount(n){S.mBatchCount=n;renderPage('motion');}
function renderMBatchItems(){
  const c=$('mBatchItems');if(!c)return;
  c.innerHTML=Array.from({length:S.mBatchCount},(_,i)=>{
    const img=S.mBatchImgs[i],vid=S.mBatchVids[i];
    return `<div class="batch-item">
      <div class="batch-item-hdr"><div class="batch-num-badge">${i+1}</div><div class="batch-item-label">Motion ${i+1}</div></div>
      <textarea class="ta" id="mbPrompt${i}" rows="2" placeholder="Prompt motion ${i+1}"></textarea>
      <div class="batch-file-row" style="margin-top:8px">
        ${img?`<img class="batch-thumb" src="${URL.createObjectURL(img)}">`:`<div class="batch-thumb" style="background:var(--bg3);display:flex;align-items:center;justify-content:center">📸</div>`}
        <label class="batch-file-btn" for="mbImg${i}">${img?'✅ '+img.name.slice(0,18):'📸 Image ref *'}</label>
        <input type="file" id="mbImg${i}" accept="image/*" class="hidden" onchange="onMBatchImg(event,${i})">
      </div>
      <div class="batch-file-row" style="margin-top:6px">
        ${vid?`<video class="batch-thumb" src="${URL.createObjectURL(vid)}"></video>`:`<div class="batch-thumb" style="background:var(--bg3);display:flex;align-items:center;justify-content:center">🎬</div>`}
        <label class="batch-file-btn" for="mbVid${i}">${vid?'✅ '+vid.name.slice(0,18):'🎬 Video ref *'}</label>
        <input type="file" id="mbVid${i}" accept="video/*" class="hidden" onchange="onMBatchVid(event,${i})">
      </div>
    </div>`;
  }).join('');
}
function onMBatchImg(e,i){const f=e.target.files[0];if(!f)return;S.mBatchImgs[i]=f;renderMBatchItems();}
function onMBatchVid(e,i){const f=e.target.files[0];if(!f)return;S.mBatchVids[i]=f;renderMBatchItems();}

// ── QUEUE PAGE ────────────────────────────────────────────────
let _queueData = null;
async function renderQueue(el) {
  el.innerHTML = `<div class="stats-grid">
    <div class="stat-card purple"><div class="stat-num" id="qPend">0</div><div class="stat-lbl">Pending</div></div>
    <div class="stat-card yellow" style="--yellow:#ffd166"><div class="stat-num" id="qRun" style="color:var(--yellow)">0</div><div class="stat-lbl">Running</div></div>
    <div class="stat-card green"><div class="stat-num" id="qDone">0</div><div class="stat-lbl">Done</div></div>
    <div class="stat-card red"><div class="stat-num" id="qFail">0</div><div class="stat-lbl">Failed</div></div>
  </div>
  <div id="qList"><div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">Queue kosong</div></div></div>`;
  await pollQueue();
}

async function pollQueue() {
  try {
    const r = await apiAuth('/api/queue');
    if ($('qPend')) $('qPend').textContent = r.pending||0;
    if ($('qRun'))  $('qRun').textContent  = r.running||0;
    if ($('qDone')) $('qDone').textContent = r.completed?.filter(c=>c.status==='done').length||0;
    if ($('qFail')) $('qFail').textContent = r.completed?.filter(c=>c.status==='failed').length||0;
    updateQBadge((r.pending||0)+(r.running||0));
    const all=[...(r.active||[]),...(r.queued||[]),...(r.completed||[]).slice(0,15)];
    const el=$('qList'); if(!el) return;
    if(!all.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">Queue kosong</div></div>';return;}
    el.innerHTML=all.map(t=>`<div class="q-item">
      <div class="q-dot ${t.status}"></div>
      <div class="q-info"><div class="q-type">${t.meta?.type||'generate'} — ${t.meta?.model||''}</div><div class="q-meta">${t.meta?.prompt||''}</div></div>
      <div class="q-time">${relTime(t.createdAt)}</div>
    </div>`).join('');
  } catch {}
}
function updateQBadge(n){
  const b=$('sbQBadge');if(b){b.textContent=n;b.classList.toggle('hidden',n===0);}
  const bt=$('btabQBadge');if(bt){bt.textContent=n;bt.classList.toggle('hidden',n===0);}
}

// ── HISTORY PAGE ──────────────────────────────────────────────
let _histItems = [];
async function renderHistoryPage(el) {
  el.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
    <select id="histFilter" class="sel" style="width:auto;min-width:160px" onchange="loadHistoryData()">
      <option value="">Semua Tipe</option>
      <option value="t2v">Text→Video</option>
      <option value="i2v">Image→Video</option>
      <option value="motion">Motion</option>
    </select>
    <button class="btn-danger" onclick="clearHistory()">🗑️ Hapus Semua</button>
  </div>
  <div id="histList"><div class="empty-state"><div class="empty-icon">📁</div><div class="empty-text">Belum ada history</div></div></div>`;
  await loadHistoryData();
}

async function loadHistoryData() {
  try {
    const type=$('histFilter')?.value||'';
    const r=await apiAuth(`/api/history?limit=40${type?'&type='+type:''}`);
    _histItems=r.items||[];
    const el=$('histList'); if(!el) return;
    if(!_histItems.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">📁</div><div class="empty-text">Belum ada history</div></div>';return;}
    el.innerHTML=_histItems.map(h=>`
    <div class="hist-item" style="overflow:hidden">
      ${h.videoUrl ? `
      <video class="hist-thumb-vid" src="${h.videoUrl}" preload="metadata" muted playsinline
        onclick="openVideo('${h.videoUrl}')"
        style="width:80px;height:52px;object-fit:cover;border-radius:8px;cursor:pointer;float:right;margin-left:12px;border:1px solid rgba(255,255,255,.1)">
      </video>` : ''}
      <div class="hist-hdr">
        <div class="hist-model">${h.model}</div>
        <div class="hist-type">${h.type}</div>
      </div>
      <div class="hist-prompt">${h.prompt||'—'}</div>
      <div class="hist-meta">
        <span>${h.status==='done'?'✅':h.status==='failed'?'❌':'⏳'} ${h.status}</span>
        <span>${h.params?.duration||'?'}s · ${h.params?.ratio||''}</span>
        <span>${relTime(h.createdAt)}</span>
      </div>
      ${h.videoUrl?`<div class="hist-actions">
        <button class="btn-primary" onclick="openVideo('${h.videoUrl}')">▶️ Play</button>
        <a class="btn-ghost" href="${h.videoUrl}" target="_blank" download="arkx-video.mp4">⬇️ Download</a>
      </div><div style="clear:both"></div>`:h.status==='processing'?`<div style="font-size:12px;color:var(--t3);margin-top:8px">⏳ Masih diproses…</div>`:'<div style="clear:both"></div>'}
    </div>`).join('');
  } catch {}
}
async function clearHistory(){if(!confirm('Hapus semua history?'))return;await apiAuth('/api/history','DELETE');loadHistoryData();}

// ── KEYS PAGE ─────────────────────────────────────────────────
let _keysData = [];
async function renderKeys(el) {
  el.innerHTML = `<div class="stats-grid" id="keyStats">
    <div class="stat-card green"><div class="stat-num" id="kActive">0</div><div class="stat-lbl">Aktif</div></div>
    <div class="stat-card red"><div class="stat-num" id="kDead">0</div><div class="stat-lbl">Mati</div></div>
    <div class="stat-card blue"><div class="stat-num" id="kTotal">0</div><div class="stat-lbl">Total</div></div>
    <div class="stat-card purple"><div class="stat-num" id="kReq">0</div><div class="stat-lbl">Requests</div></div>
  </div>
  <div class="card">
    <div class="card-title"><span>➕</span> Tambah API Keys</div>
    <textarea id="newKeys" class="ta" rows="5" placeholder="Paste API keys Magnific (satu per baris)&#10;&#10;sk-xxxxxxxxxxxx&#10;sk-yyyyyyyyyyyy"></textarea>
    <div class="btn-row">
      <button class="btn-primary" onclick="addKeys()">➕ Add Keys</button>
      <label class="btn-ghost" for="keyFile">📁 Upload File</label>
      <input type="file" id="keyFile" accept=".txt,.csv" class="hidden" onchange="uploadKeyFile(event)">
      <button class="btn-ghost" onclick="healthCheckAll()">🔍 Health Check</button>
      <button class="btn-ghost" onclick="loadKeysData()">🔄 Refresh</button>
      <button class="btn-danger" onclick="deleteAllKeys()">🗑️ Hapus Semua</button>
    </div>
  </div>
  <div id="keysList"></div>`;
  await loadKeysData();
}

async function loadKeysData() {
  try {
    const r=await apiAuth('/api/keys');
    _keysData=r.keys||[];
    const s=r.summary||{};
    if($('kActive')) $('kActive').textContent=s.active||0;
    if($('kDead'))   $('kDead').textContent=s.dead||0;
    if($('kTotal'))  $('kTotal').textContent=s.total||0;
    if($('kReq'))    $('kReq').textContent=s.totalReq||0;
    $('keyCount').textContent=`${s.active||0} Keys`;
    $('keyChipTxt').textContent=`${s.active||0} Keys`;
    const el=$('keysList'); if(!el) return;
    if(!_keysData.length){el.innerHTML='<div class="empty-state"><div class="empty-icon">🔑</div><div class="empty-text">Belum ada API key</div></div>';return;}
    el.innerHTML=_keysData.map(k=>{
      const s=k.stats||{};
      const avg=s.latency?.length?Math.round(s.latency.reduce((a,b)=>a+b,0)/s.latency.length):null;
      return `<div class="key-item ${k.status==='dead'?'dead':''}">
        <div class="key-hdr"><div class="key-id">${k.key_masked}</div><span class="key-status ${k.status||'active'}">${k.status||'active'}</span></div>
        <div class="key-stats"><span>✅ ${s.ok||0}</span><span>❌ ${s.err||0}</span><span>📊 ${s.req||0} req</span>${avg?`<span>⚡ ${avg}ms</span>`:''}</div>
        <div class="key-actions">
          <button class="btn-sm" onclick="toggleKey('${k.id}')">${k.active?'⏸ Disable':'▶ Enable'}</button>
          ${k.status==='dead'?`<button class="btn-sm" onclick="reviveKey('${k.id}')">🔄 Revive</button>`:''}
          <button class="btn-sm" style="color:var(--red)" onclick="deleteKey('${k.id}')">🗑 Hapus</button>
        </div>
      </div>`;
    }).join('');
  } catch(e){addLog('error','Load keys: '+e.message);}
}

async function loadKeys() { await loadKeysData(); }
async function addKeys(){const raw=$('newKeys')?.value.trim();if(!raw)return toast('Isi API key dulu','error');try{const r=await apiAuth('/api/keys/add','POST',{keys:raw});if(r.ok){toast(`✅ ${r.added} key ditambahkan`,'success');$('newKeys').value='';await loadKeysData();}else toast(r.error||'Gagal','error');}catch(e){toast(e.message,'error');}}
async function uploadKeyFile(e){const f=e.target.files[0];if(!f)return;const fd=new FormData();fd.append('file',f);try{const r=await apiFormAuth('/api/keys/upload',fd);if(r.ok){toast(`✅ ${r.added} key diupload`,'success');await loadKeysData();}else toast(r.error||'Gagal','error');}catch(e){toast(e.message,'error');}}
async function deleteKey(id){if(!confirm('Hapus key ini?'))return;await apiAuth(`/api/keys/${id}`,'DELETE');await loadKeysData();}
async function toggleKey(id){await apiAuth(`/api/keys/${id}/toggle`,'PATCH');await loadKeysData();}
async function reviveKey(id){await apiAuth(`/api/keys/${id}/revive`,'PATCH');toast('Key diaktifkan','success');await loadKeysData();}
async function healthCheckAll(){toast('🔍 Health check...','info');try{const r=await apiAuth('/api/keys/health-check','POST');toast(`${r.results?.filter(x=>x.alive).length||0}/${r.results?.length||0} key aktif`,'success');await loadKeysData();}catch(e){toast(e.message,'error');}}

async function deleteAllKeys() {
  if (!confirm(`Hapus SEMUA ${_keysData.length} API key?\nTindakan ini tidak bisa dibatalkan.`)) return;
  try {
    const r = await apiAuth('/api/keys', 'DELETE');
    toast(`✅ ${r.deleted} key dihapus`, 'success');
    await loadKeysData();
  } catch(e) { toast(e.message, 'error'); }
}

// ── ADMIN PAGE ────────────────────────────────────────────────
async function renderAdmin(el) {
  el.innerHTML = `<div id="adminContent"><div class="empty-state"><div class="empty-icon">👑</div><div class="empty-text">Loading...</div></div></div>`;
  await loadAdminData();
}

async function loadAdminData() {
  try {
    const r = await apiAuth('/api/auth/users');
    const users = r.users || [];
    const pending = users.filter(u => u.status === 'pending');
    const el = $('adminContent'); if (!el) return;
    el.innerHTML = `
    ${pending.length ? `<div class="pending-badge">⏳ ${pending.length} akun menunggu persetujuan</div>` : ''}
    <div class="card">
      <div class="card-title"><span>⏳</span> Menunggu Persetujuan (${pending.length})</div>
      ${pending.length ? pending.map(u => userCard(u, true)).join('') : '<div style="color:var(--t3);font-size:13px">Tidak ada akun pending</div>'}
    </div>
    <div class="card">
      <div class="card-title"><span>👥</span> Semua User (${users.length})</div>
      ${users.map(u => userCard(u, false)).join('')}
    </div>`;
  } catch(e) { addLog('error', 'Load admin: '+e.message); }
}

function userCard(u, showApprove) {
  const initials = u.name ? u.name[0].toUpperCase() : 'U';
  return `<div class="user-item">
    <div class="user-avatar">${initials}</div>
    <div class="user-info">
      <div class="user-name">${u.name}</div>
      <div class="user-email">${u.email} ${u.role==='admin'?'👑':''}</div>
    </div>
    <span class="user-status ${u.status}">${u.status}</span>
    <div class="user-actions">
      ${showApprove ? `
        <button class="btn-primary" style="padding:6px 12px;font-size:12px" onclick="approveUser('${u.id}')">✅ Approve</button>
        <button class="btn-danger" style="padding:6px 12px;font-size:12px" onclick="rejectUser('${u.id}')">❌ Reject</button>
      ` : u.role !== 'admin' ? `
        ${u.status==='approved'?`<button class="btn-sm" onclick="banUser('${u.id}')">🚫 Ban</button>`:''}
        ${u.status==='banned'?`<button class="btn-sm" onclick="approveUser('${u.id}')">✅ Unban</button>`:''}
        <button class="btn-sm" style="color:var(--red)" onclick="deleteUser('${u.id}')">🗑</button>
      ` : ''}
    </div>
  </div>`;
}

async function approveUser(id){try{await apiAuth(`/api/auth/users/${id}/approve`,'POST');toast('✅ User disetujui','success');await loadAdminData();}catch(e){toast(e.message,'error');}}
async function rejectUser(id){try{await apiAuth(`/api/auth/users/${id}/reject`,'POST');toast('User ditolak','info');await loadAdminData();}catch(e){toast(e.message,'error');}}
async function banUser(id){try{await apiAuth(`/api/auth/users/${id}/ban`,'POST');toast('User dibanned','warn');await loadAdminData();}catch(e){toast(e.message,'error');}}
async function deleteUser(id){if(!confirm('Hapus user ini?'))return;try{await apiAuth(`/api/auth/users/${id}`,'DELETE');await loadAdminData();}catch(e){toast(e.message,'error');}}

// ── SETTINGS PAGE ─────────────────────────────────────────────
async function renderSettings(el) {
  let cfg = {};
  try { cfg = await apiAuth('/api/settings'); } catch {}

  const badge = (ok, okTxt, noTxt) =>
    ok ? `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(0,200,100,.12);color:#00c864;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;border:1px solid rgba(0,200,100,.25)">✅ ${okTxt}</span>`
       : `<span style="display:inline-flex;align-items:center;gap:5px;background:rgba(255,180,0,.1);color:#ffb400;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;border:1px solid rgba(255,180,0,.25)">⚠️ ${noTxt}</span>`;

  el.innerHTML = `
  <div class="card">
    <div class="card-title" style="justify-content:space-between">
      <span><span>☁️</span> Cloudflare Worker</span>
      ${badge(cfg.workerSet, 'Configured', 'Not set')}
    </div>
    <div class="inp-group">
      <label class="inp-label">Worker URL</label>
      <input id="cfUrl" class="inp" value="${cfg.workerUrl||''}" placeholder="https://arkx-proxy.namakamu.workers.dev" type="url">
    </div>
    <div class="inp-group">
      <label class="inp-label">Worker Secret</label>
      <input id="cfSecret" class="inp" placeholder="Secret yang sama dengan di Worker" type="password">
    </div>
    <div class="btn-row">
      <button class="btn-primary" onclick="saveWorker()">💾 Simpan</button>
      <button class="btn-ghost" onclick="testWorker()">🔗 Test Worker</button>
    </div>
  </div>

  <div class="card">
    <div class="card-title" style="justify-content:space-between">
      <span><span>🖼️</span> ImgBB API Key</span>
      ${badge(cfg.imgbbSet, cfg.imgbbKey ? 'Aktif ('+cfg.imgbbKey+')' : 'Aktif', 'Not set')}
    </div>
    <div class="inp-group">
      <label class="inp-label">API Key</label>
      <input id="imgbbKey" class="inp" placeholder="Paste ImgBB API key..." type="password">
    </div>
    <div class="btn-row">
      <button class="btn-primary" onclick="saveImgbb()">💾 Simpan Key</button>
    </div>
    <div class="info-box" style="margin-top:12px">
      Daftar gratis di <a href="https://imgbb.com" target="_blank" style="color:var(--p)">imgbb.com</a> → Login → Nama profil → API
    </div>
  </div>

  <div class="card">
    <div class="card-title" style="justify-content:space-between">
      <span><span>🤖</span> Telegram Bot</span>
      ${badge(cfg.telegramSet, 'Terhubung', 'Not set')}
    </div>
    <div class="inp-group">
      <label class="inp-label">Bot Token</label>
      <input id="tgToken" class="inp" placeholder="Token dari @BotFather" type="password">
    </div>
    <div class="btn-row">
      <button class="btn-primary" onclick="saveTelegram()">🔗 Connect Bot</button>
    </div>
  </div>

  <div class="card">
    <div class="card-title"><span>🔐</span> Ganti Password</div>
    <div class="inp-group">
      <label class="inp-label">Password Lama</label>
      <input id="oldPass" class="inp" type="password" placeholder="••••••••">
    </div>
    <div class="inp-group">
      <label class="inp-label">Password Baru</label>
      <input id="newPass" class="inp" type="password" placeholder="Min. 6 karakter">
    </div>
    <button class="btn-primary mt12" onclick="changePass()">🔐 Ganti Password</button>
  </div>

  <div class="card">
    <div class="card-title"><span>ℹ️</span> Tentang</div>
    <div style="font-size:14px">
      <div style="font-weight:800;font-size:18px;background:linear-gradient(135deg,var(--p),var(--pink));-webkit-background-clip:text;-webkit-text-fill-color:transparent">ARKX Motion Pro V2</div>
      <div style="color:var(--t3);margin-top:6px">AI Video Generation Platform</div>
      <div style="color:var(--t3)">Powered by Cloudflare Worker Proxy</div>
      <div style="margin-top:12px;display:inline-block;background:var(--p);color:#fff;font-size:11px;padding:4px 12px;border-radius:20px;font-weight:700">v2.0.0</div>
    </div>
  </div>`;
}

async function saveWorker(){const url=$('cfUrl')?.value.trim(),secret=$('cfSecret')?.value.trim();if(!url)return toast('Isi Worker URL','error');try{const r=await apiAuth('/api/settings/worker','POST',{url,secret});if(r.ok){toast('✅ Worker settings disimpan','success');renderPage('settings');}else toast(r.error,'error');}catch(e){toast(e.message,'error');}}
async function testWorker(){const url=$('cfUrl')?.value.trim()||'';if(!url)return toast('Isi Worker URL dulu','error');try{const r=await fetch(`${url}/health`);const j=await r.json();toast(j.ok?'✅ Worker OK! '+j.service:'Worker error','success');}catch(e){toast('Tidak bisa reach worker: '+e.message,'error');}}
async function saveImgbb(){const key=$('imgbbKey')?.value.trim();if(!key)return toast('Isi ImgBB key','error');try{const r=await apiAuth('/api/settings/imgbb','POST',{key});if(r.ok){toast('✅ ImgBB key disimpan','success');renderPage('settings');}else toast(r.error,'error');}catch(e){toast(e.message,'error');}}
async function saveTelegram(){const token=$('tgToken')?.value.trim();if(!token)return toast('Isi token','error');try{const r=await apiAuth('/api/settings/telegram','POST',{token});if(r.ok){toast('✅ Telegram connected','success');renderPage('settings');}else toast(r.error,'error');}catch(e){toast(e.message,'error');}}
async function changePass(){const o=$('oldPass')?.value,n=$('newPass')?.value;if(!o||!n)return toast('Isi semua field','error');try{const r=await apiAuth('/api/auth/change-password','POST',{oldPassword:o,newPassword:n});if(r.ok){toast('✅ Password berhasil diubah','success');$('oldPass').value='';$('newPass').value='';}else toast(r.error,'error');}catch(e){toast(e.message,'error');}}

// ── DEBUG PAGE ────────────────────────────────────────────────
async function renderDebug(el) {
  el.innerHTML = `
  <div class="card">
    <div class="card-title"><span>🏥</span> API Health</div>
    <div id="healthRows">
      <div class="health-row">
        <div class="h-dot idle" id="magDot"></div>
        <div><div class="h-name">Magnific API</div><div class="h-status" id="magStatus">Checking…</div></div>
        <div class="h-latency" id="magLatency">—</div>
      </div>
      <div class="health-row">
        <div class="h-dot ${S.user?'ok':'idle'}" id="cfDot"></div>
        <div><div class="h-name">Server</div><div class="h-status" id="cfStatus">Connected</div></div>
        <div class="h-latency" id="cfLatency">—</div>
      </div>
    </div>
    <button class="btn-sm mt12" onclick="checkMagnificHealth()">🔍 Test Koneksi Magnific</button>
  </div>

  <div class="card">
    <div class="card-title"><span>📊</span> Statistik</div>
    <div id="statRows"></div>
  </div>

  <div class="card" style="height:auto">
    <div class="card-title" style="justify-content:space-between;display:flex">
      <span><span>📝</span> Live Logs</span>
      <div style="display:flex;gap:6px">
        <button class="btn-sm" onclick="clearLogs()">Clear</button>
        <button class="btn-sm" onclick="loadLogs()">Refresh</button>
      </div>
    </div>
    <div id="logConsole" class="log-console">
      <div class="log-entry info">🚀 ARKX Motion Pro V2 initialized</div>
    </div>
  </div>`;
  await pollStats();
  await loadLogs();
  await checkMagnificHealth();
}

async function pollStats() {
  try {
    const r = await apiAuth('/api/health');
    const sEl = $('statRows');
    if (sEl) sEl.innerHTML = `
      <div class="stat-row"><span>Total Requests</span><span>${r.keys?.totalReq||0}</span></div>
      <div class="stat-row"><span>Success</span><span class="val-green">${r.keys?.totalOk||0}</span></div>
      <div class="stat-row"><span>Errors</span><span class="val-red">${r.keys?.totalErr||0}</span></div>
      <div class="stat-row"><span>Queue Pending</span><span>${r.queue?.pending||0}</span></div>
      <div class="stat-row"><span>Uptime</span><span class="val-mono">${fmtUptime(r.uptime||0)}</span></div>
      <div class="stat-row"><span>Keys Aktif</span><span class="val-green">${r.keys?.active||0}/${r.keys?.total||0}</span></div>`;
    const wChip = $('workerChip');
    if (wChip) {
      wChip.querySelector('.chip-dot').className = `chip-dot ${r.workerConfigured?'green':''}`;
      $('workerChipTxt').textContent = r.workerConfigured ? 'Worker OK' : 'Worker';
    }
  } catch {}
}

async function checkMagnificHealth() {
  const dot = $('magDot'), status = $('magStatus'), latency = $('magLatency');
  if (!dot) return;
  dot.className = 'h-dot idle';
  if (status) status.textContent = 'Checking…';
  try {
    const r = await apiAuth('/api/health/magnific');
    if (r.ipBlocked) {
      dot.className = 'h-dot err';
      if (status) status.textContent = '⛔ IP diblokir Magnific!';
      if (latency) latency.textContent = `${r.latency}ms`;
      toast('⛔ IP Railway diblokir Magnific!', 'error');
    } else if (r.reachable) {
      dot.className = 'h-dot ok';
      if (status) status.textContent = '✅ IP OK — dapat diakses';
      if (latency) latency.textContent = `${r.latency}ms`;
    } else {
      dot.className = 'h-dot err';
      if (status) status.textContent = '❌ Tidak bisa reach Magnific';
      if (latency) latency.textContent = '—';
    }
  } catch {
    dot.className = 'h-dot err';
    if (status) status.textContent = '❌ Check gagal';
  }
}

async function loadLogs() {
  try {
    const r = await apiAuth('/api/settings/logs?limit=80');
    const el = $('logConsole'); if (!el) return;
    el.innerHTML = '';
    (r.logs||[]).forEach(l => {
      const d = document.createElement('div');
      d.className = `log-entry ${l.type}`;
      d.innerHTML = `<span class="log-time">${new Date(l.ts).toLocaleTimeString()}</span>${l.msg}`;
      el.appendChild(d);
    });
  } catch {}
}

function addLog(type, msg) {
  const el = $('logConsole'); if (!el) return;
  const d = document.createElement('div');
  d.className = `log-entry ${type}`;
  d.innerHTML = `<span class="log-time">${new Date().toLocaleTimeString()}</span>${msg}`;
  el.insertBefore(d, el.firstChild);
  while (el.children.length > 200) el.removeChild(el.lastChild);
}
function clearLogs() { const el=$('logConsole'); if(el) el.innerHTML=''; }

// ── UTILITIES ─────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

async function apiAuth(url, method='GET', body=null) {
  const opts = { method, headers: { 'Content-Type':'application/json', ...(S.token?{'x-auth-token':S.token}:{}) } };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  const json = await res.json().catch(() => ({ ok:false, error:res.statusText }));
  if (res.status === 401) { doLogout(); throw new Error('Session expired'); }
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// Keep backward compat
const api = (url, method, body) => apiAuth(url, method, body);

async function apiFormAuth(url, fd) {
  const res  = await fetch(url, { method:'POST', body:fd, headers: S.token?{'x-auth-token':S.token}:{} });
  const json = await res.json().catch(() => ({ ok:false, error:res.statusText }));
  if (res.status === 401) { doLogout(); throw new Error('Session expired'); }
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function setupDrop(zoneId, onFile) {
  const z = $(zoneId); if (!z) return;
  z.addEventListener('dragover',  e => { e.preventDefault(); z.classList.add('over'); });
  z.addEventListener('dragleave', () => z.classList.remove('over'));
  z.addEventListener('drop', e => {
    e.preventDefault(); z.classList.remove('over');
    const f = e.dataTransfer.files[0]; if (f) onFile(f);
  });
}

function toast(msg, type='info') {
  const el = $('toast');
  el.textContent = msg; el.className = `toast ${type}`;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 3500);
}

function relTime(iso) {
  if (!iso) return '';
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000)    return 'baru saja';
  if (d < 3600000)  return `${Math.floor(d/60000)}m lalu`;
  if (d < 86400000) return `${Math.floor(d/3600000)}j lalu`;
  return new Date(iso).toLocaleDateString('id');
}

function fmtUptime(s) {
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=Math.floor(s%60);
  return `${h}j ${m}m ${ss}d`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
