const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let csrfToken = null;
let items = [];
let editingId = null;
let chipStatus = 'all';
let currentUser = null;
let importing = false;
let lastImportReport = null;

function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
const typeText = t => t==='movie'?'فیلم':'سریال';
const statusText = s => s==='watched'?'دیده‌شده':s==='watching'?'در حال تماشا':'برای بعد';

// ---------- Toast system ----------
const toastIcons = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
function notify(type, message, duration = 3500){
  const container = $('#toastContainer');
  if(!container) return;
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.innerHTML = `<span class="toast-icon">${toastIcons[type]||'ℹ'}</span><span class="toast-msg">${esc(message)}</span><button class="toast-close" aria-label="بستن">×</button>`;
  container.appendChild(el);
  requestAnimationFrame(()=>{ el.classList.add('show'); });
  let closed = false;
  const close = () => {
    if(closed) return; closed = true;
    el.classList.remove('show');
    setTimeout(()=>el.remove(), 220);
  };
  el.querySelector('.toast-close').addEventListener('click', close);
  setTimeout(close, duration);
  return close;
}

// ---------- API ----------
function friendlyMessage(status, data){
  const backend = (data && (data.error || data.message)) ? (data.error || data.message) : '';
  if(status === 401) return 'نشست شما منقضی شده است. لطفاً دوباره وارد شوید.';
  if(status === 403) return backend || 'دسترسی غیرمجاز یا توکن امنیتی نامعتبر است.';
  if(status === 404) return backend || 'مورد درخواستی یافت نشد.';
  if(status === 413) return 'حجم فایل یا داده ارسالی بیش از حد مجاز است.';
  if(status === 429) return 'درخواست‌های زیادی ارسال شده است. لطفاً کمی صبر کنید.';
  if(status >= 500) return 'خطای داخلی سرور رخ داد. لطفاً بعداً تلاش کنید.';
  return backend || 'عملیات انجام نشد.';
}

async function api(path, opts={}){
  const headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
  if (csrfToken && opts.method && opts.method!=='GET') headers['X-CSRF-Token']=csrfToken;
  let res;
  try {
    res = await fetch(path, Object.assign({}, opts, { headers, credentials:'same-origin' }));
  } catch(e){
    const err = new Error('ارتباط با سرور برقرار نشد.');
    err.status = 0;
    throw err;
  }
  const ct = res.headers.get('content-type')||'';
  let data = null;
  if (ct.includes('application/json')) { try { data = await res.json(); } catch { data=null; } }
  else if (ct.includes('ndjson') || ct.includes('text/plain')) {
    // streaming handled by caller; return response
    return res;
  } else { try { data = await res.text(); } catch { data=null; } }
  if (!res.ok) {
    const err = new Error(friendlyMessage(res.status, data));
    err.status = res.status;
    err.data = data;
    err.backend = (data && (data.error||data.message)) ? (data.error||data.message) : '';
    throw err;
  }
  // update csrf if provided
  if (data && data.csrfToken) csrfToken = data.csrfToken;
  return data;
}

async function ensureCsrf(){
  const data = await api('/api/auth/csrf-token');
  csrfToken = data.csrfToken;
}

// ---------- Auth UI ----------
let authState = 'loading';
function showLoading(){
  authState = 'loading';
  $('#loadingScreen').classList.remove('hidden');
  $('#authScreen').classList.add('hidden');
  $('#appScreen').classList.add('hidden');
}
function showAuth(){
  authState = 'unauthenticated';
  $('#loadingScreen').classList.add('hidden');
  $('#authScreen').classList.remove('hidden');
  $('#appScreen').classList.add('hidden');
}
function showApp(){
  authState = 'authenticated';
  $('#loadingScreen').classList.add('hidden');
  $('#authScreen').classList.add('hidden');
  $('#appScreen').classList.remove('hidden');
}

$('#tabLogin').onclick = () => {
  $('#tabLogin').classList.add('active'); $('#tabRegister').classList.remove('active');
  $('#loginForm').classList.remove('hidden'); $('#registerForm').classList.add('hidden');
};
$('#tabRegister').onclick = () => {
  $('#tabRegister').classList.add('active'); $('#tabLogin').classList.remove('active');
  $('#registerForm').classList.remove('hidden'); $('#loginForm').classList.add('hidden');
};

function setLoading(btn, loading, text){
  if(!btn) return;
  if(loading){ btn.dataset.orig = btn.textContent; btn.disabled = true; btn.textContent = text || 'در حال پردازش...'; }
  else { btn.disabled = false; if(btn.dataset.orig) btn.textContent = btn.dataset.orig; }
}

$('#loginBtn').onclick = async () => {
  $('#loginError').textContent='';
  const btn = $('#loginBtn');
  setLoading(btn, true, 'در حال ورود...');
  try {
    const data = await api('/api/auth/login', {
      method:'POST',
      body: JSON.stringify({ username: $('#loginUsername').value.trim(), password: $('#loginPassword').value })
    });
    currentUser = data.user;
    await loadInitial();
    showApp();
    enterDashboard();
    notify('success', 'با موفقیت وارد حساب کاربری شدی.');
  } catch(e){
    if(e.status === 401) { $('#loginError').textContent = 'نام کاربری یا رمز عبور اشتباه است.'; notify('error', 'نام کاربری یا رمز عبور اشتباه است.'); }
    else if(e.status === 0) { $('#loginError').textContent = 'ارتباط با سرور برقرار نشد.'; notify('error', 'ارتباط با سرور برقرار نشد.'); }
    else { $('#loginError').textContent = e.message; notify('error', e.message); }
  } finally { setLoading(btn, false); }
};
$('#registerBtn').onclick = async () => {
  $('#regError').textContent='';
  const btn = $('#registerBtn');
  setLoading(btn, true, 'در حال ثبت‌نام...');
  try {
    const data = await api('/api/auth/register', {
      method:'POST',
      body: JSON.stringify({
        username: $('#regUsername').value.trim(),
        password: $('#regPassword').value,
        confirmPassword: $('#regConfirm').value
      })
    });
    currentUser = data.user;
    await loadInitial();
    showApp();
    enterDashboard();
    notify('success', 'حساب کاربری با موفقیت ساخته شد.');
  } catch(e){
    if(e.status === 409){ $('#regError').textContent = 'این نام کاربری قبلاً ثبت شده است.'; notify('error', 'این نام کاربری قبلاً ثبت شده است.'); }
    else if(e.status === 0){ $('#regError').textContent='ارتباط با سرور برقرار نشد.'; notify('error','ارتباط با سرور برقرار نشد.'); }
    else { $('#regError').textContent = e.message; notify('error', e.message); }
  } finally { setLoading(btn, false); }
};

$('#logoutBtn').onclick = async () => {
  const btn = $('#logoutBtn');
  setLoading(btn, true, '...');
  try {
    await api('/api/auth/logout', { method:'POST' });
  } catch(e){}
  currentUser = null; items = [];
  csrfToken = null;
  try { await ensureCsrf(); } catch(e){}
  showAuth();
  notify('success', 'با موفقیت از حساب خارج شدی.');
  setLoading(btn, false);
};

// ---------- Navigation ----------
function enterDashboard(){
  $('#dashboardView').classList.remove('hidden');
  $('#profileView').classList.add('hidden');
  $('#navDashboard').classList.add('active');
  $('#navProfile').classList.remove('active');
  render();
}
function enterProfile(){
  $('#dashboardView').classList.add('hidden');
  $('#profileView').classList.remove('hidden');
  $('#navProfile').classList.add('active');
  $('#navDashboard').classList.remove('active');
  loadProfile();
}
$('#navDashboard').onclick = enterDashboard;
$('#navProfile').onclick = enterProfile;

// ---------- Data ----------
async function loadInitial(){
  await ensureCsrf();
  const me = await api('/api/auth/me');
  currentUser = me.user;
  csrfToken = me.csrfToken || csrfToken;
  $('#welcomeUser').textContent = currentUser.username;
  await fetchItems();
}
async function fetchItems(){
  const params = new URLSearchParams();
  params.set('search', $('#search').value.trim());
  params.set('type', $('#typeFilter').value);
  params.set('status', chipStatus);
  params.set('sort', $('#sort').value);
  try {
    const data = await api('/api/media?' + params.toString());
    items = data.items || [];
    render();
    await refreshStats();
  } catch(e){
    if(e.status === 401){ showAuth(); notify('error','نشست شما منقضی شده است. لطفاً دوباره وارد شوید.'); }
    else notify('error', e.message);
  }
}
async function refreshStats(){
  try {
    const s = await api('/api/media/stats');
    $('#totalStat').textContent = s.total;
    $('#movieStat').textContent = s.movies;
    $('#seriesStat').textContent = s.series;
    $('#avgStat').textContent = s.avgRating==null?'—':s.avgRating.toFixed(1);
  } catch(e){}
}

// ---------- Render ----------
function render(){
  const list = items;
  const grid = $('#grid');
  if(!list.length){
    grid.innerHTML='<div class="empty"><strong>هنوز چیزی اینجا نیست</strong><p>اولین فیلم یا سریالت را اضافه کن.</p><button class="btn btn-primary" onclick="openModal()">＋ افزودن عنوان</button></div>';
    return;
  }
  grid.innerHTML = list.map(x=>{
    const isSeries = x.type==='series';
    const progress = isSeries && x.progress ? esc(x.progress) : '';
    return `<article class="card">
      <div class="poster">
        ${x.poster?`<img loading="lazy" src="${esc(x.poster)}" alt="${esc(x.title)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">`:''}
        <div class="poster-placeholder" style="display:${x.poster?'none':'grid'}">${esc(x.title)}</div>
        <div class="overlay"></div>
        <div class="tag">${typeText(x.type)} · ${statusText(x.status)}</div>
        ${x.rating!==null && x.rating!=='' && x.rating!=null?`<div class="rating">★ ${esc(x.rating)}</div>`:''}
        <div class="card-actions"><button class="action" onclick="editItem('${x.id}')">ویرایش</button><button class="action danger" onclick="deleteItem('${x.id}')">حذف</button></div>
      </div>
      <div class="card-info">
        <h3 class="card-title" title="${esc(x.title)}">${esc(x.title)}</h3>
        <div class="card-meta"><span>${esc(x.year||'—')}</span>${progress?`<span class="dot"></span><span>${progress}</span>`:''}</div>
        ${isSeries&&x.status==='watching'&&x.progress?'<div class="progress-line"><span style="width:35%"></span></div>':''}
      </div>
    </article>`;
  }).join('');
}

// ---------- Modal ----------
function resetForm(){
  editingId=null;
  $('#modalTitle').textContent='افزودن عنوان';
  $('#mediaForm').reset();
  $('#fType').value='movie';
  $('#fStatus').value='watched';
  toggleProgress();
  updateRatingHint();
}
function toggleProgress(){
  const show=$('#fType').value==='series';
  $('#progressGroup').style.display=show?'flex':'none';
}
function openModal(id=null){
  $('#modalWrap').classList.add('open');
  if(id){
    const x=items.find(i=>i.id===id); if(!x)return;
    editingId=id;
    $('#modalTitle').textContent='ویرایش عنوان';
    $('#fTitle').value=x.title??'';
    $('#fType').value=x.type??'movie';
    $('#fStatus').value=x.status??'watched';
    $('#fYear').value=x.year??'';
    $('#fRating').value=x.rating==null?'':x.rating;
    $('#fPoster').value=x.poster??'';
    $('#fProgress').value=x.progress??'';
    $('#fNotes').value=x.notes??'';
    toggleProgress();
    updateRatingHint();
  }else resetForm();
  setTimeout(()=>$('#fTitle').focus(),50);
}
function closeModal(){$('#modalWrap').classList.remove('open');}
function editItem(id){openModal(id)}
async function deleteItem(id){
  const x=items.find(i=>i.id===id);if(!x)return;
  if(!confirm(`«${x.title}» حذف شود؟`)) return;
  const btns = document.querySelectorAll('.card-actions .action');
  try {
    await api('/api/media/'+encodeURIComponent(id), { method:'DELETE' });
    notify('success', 'عنوان حذف شد.');
    await fetchItems();
  } catch(e){ notify('error', e.message); }
}
$('#mediaForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const data={
    title:$('#fTitle').value.trim(),type:$('#fType').value,status:$('#fStatus').value,
    year:$('#fYear').value.trim(),rating:$('#fRating').value.trim(),poster:$('#fPoster').value.trim(),
    progress:$('#fProgress').value.trim(),notes:$('#fNotes').value.trim()
  };
  if(!data.title){ notify('warning','نام عنوان الزامی است.'); return; }
  const submitBtn = $('#mediaForm button[type="submit"]');
  setLoading(submitBtn, true, 'در حال ذخیره...');
  try {
    if(editingId){
      await api('/api/media/'+encodeURIComponent(editingId), { method:'PUT', body: JSON.stringify(data) });
      notify('success', 'عنوان با موفقیت ویرایش شد.');
    } else {
      await api('/api/media', { method:'POST', body: JSON.stringify(data) });
      notify('success', 'عنوان با موفقیت اضافه شد.');
    }
    closeModal();
    await fetchItems();
  } catch(err){ notify('error', err.message); }
  finally { setLoading(submitBtn, false); }
});
$('#fType').addEventListener('change',toggleProgress);
$('#fStatus').addEventListener('change',updateRatingHint);
function updateRatingHint(){
  const watching=$('#fStatus').value==='watching';
  $('#ratingLabel').innerHTML=watching?'امتیاز من <span class="optional">بعداً هم می‌تونی ثبتش کنی</span>':'امتیاز من <span class="optional">اختیاری</span>';
  $('#fRating').placeholder=watching?'فعلاً خالی بگذار':'مثلاً 8.5';
}
updateRatingHint();
$('#closeModal').onclick=closeModal;
$('#cancelBtn').onclick=closeModal;
$('#modalWrap').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()});
$('#addBtn').onclick=()=>openModal();

// filters & search
['search','typeFilter','sort'].forEach(id=>$('#'+id).addEventListener('input',()=>{ fetchItems(); }));
$$('.filter').forEach(btn=>btn.addEventListener('click',()=>{$$('.filter').forEach(b=>b.classList.remove('active'));btn.classList.add('active');chipStatus=btn.dataset.chip;fetchItems();}));
$('#randomBtn').onclick=()=>{const list=items;if(!list.length){notify('info','چیزی برای انتخاب نیست');return;}const x=list[Math.floor(Math.random()*list.length)];notify('info','پیشنهاد: '+x.title)}

// ---------- Import ----------
const importBtn = $('#importBtn');
const fileInput = $('#fileInput');

function openImportModal(){ $('#importModalWrap').classList.add('open'); resetImportModal(); }
function closeImportModal(){ if(importing) return; $('#importModalWrap').classList.remove('open'); }
function resetImportModal(){
  $('#importStepOptions').classList.remove('hidden');
  $('#importStepProgress').classList.add('hidden');
  $('#importStepResult').classList.add('hidden');
  $('#replaceWarning').classList.add('hidden');
  $('#importCounts').classList.add('hidden');
  $('#importTotal').textContent='0';
  $('#importProcessed').textContent='0';
  $('#importStageText').textContent='در حال آماده‌سازی...';
  lastImportReport = null;
}
$('#closeImportModal').onclick = closeImportModal;
$('#cancelImportBtn').onclick = closeImportModal;
$('#importModalWrap').addEventListener('click',e=>{if(e.target===e.currentTarget)closeImportModal()});

$$('input[name="importMode"]').forEach(r=>r.addEventListener('change',()=>{
  if(document.querySelector('input[name="importMode"]:checked').value==='replace') $('#replaceWarning').classList.remove('hidden');
  else $('#replaceWarning').classList.add('hidden');
}));

importBtn.onclick = () => fileInput.click();
fileInput.addEventListener('change', async e=>{
  const file=e.target.files[0]; if(!file)return;
  e.target.value='';
  // size limit 5MB
  if(file.size > 5*1024*1024){ notify('error','حجم فایل بیش از ۵ مگابایت است.'); return; }
  openImportModal();
  // store selected file
  window.__importFile = file;
});

$('#confirmImportBtn').onclick = async () => {
  const file = window.__importFile;
  if(!file){ notify('warning','ابتدا یک فایل انتخاب کنید.'); return; }
  if(importing) return;
  importing = true;
  importBtn.disabled = true;
  const mode = document.querySelector('input[name="importMode"]:checked').value;
  if(mode === 'replace'){
    if(!confirm('با جایگزینی کامل، تمام عنوان‌های فعلی حذف می‌شوند. ادامه می‌دهید؟')) { importing=false; importBtn.disabled=false; return; }
  }

  $('#importStepOptions').classList.add('hidden');
  $('#importStepProgress').classList.remove('hidden');
  $('#importStageText').textContent = 'در حال خواندن فایل پشتیبان...';

  let reader;
  try {
    // stage 1 read
    const text = await file.text();
    $('#importStageText').textContent = 'در حال بررسی ساختار و اطلاعات فایل...';
    let data;
    try { data = JSON.parse(text); }
    catch(err){ throw new Error('فایل JSON معتبر نیست.'); }

    const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : null);
    if(!items) throw new Error('ساختار پشتیبان نامعتبر است: آرایه items یافت نشد.');

    if(!Array.isArray(data) && data.app && data.app !== 'YELLOWREEL') throw new Error('فایل پشتیبان YELLOWREEL نیست.');
    if(!Array.isArray(data) && data.version && data.version !== 2) throw new Error('نسخه پشتیبان پشتیبانی نمی‌شود. فقط نسخه ۲.');

    $('#importStageText').textContent = 'در حال بررسی عنوان‌های تکراری...';
    // client-side duplicate id check
    const seen = new Set();
    for(const it of items){
      if(it && it.id){ if(seen.has(it.id)) throw new Error('شناسه تکراری در پشتیبان: '+it.id); seen.add(it.id); }
    }
    if(items.length === 0) throw new Error('پشتیبان خالی است.');
    if(items.length > 5000) throw new Error('تعداد عنوان‌ها بیش از حد مجاز (۵۰۰۰) است.');

    $('#importCounts').classList.remove('hidden');
    $('#importTotal').textContent = items.length;
    $('#importProcessed').textContent = '0';

    $('#importStageText').textContent = 'در حال ارسال اطلاعات به سرور...';
    // stream
    const res = await fetch('/api/import', {
      method:'POST',
      credentials:'same-origin',
      headers: { 'Content-Type':'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ app:'YELLOWREEL', version:2, exportedAt: data.exportedAt || new Date().toISOString(), items, mode })
    });

    if(!res.ok){
      let msg = 'Import انجام نشد.';
      try { const j = await res.json(); msg = (j && (j.error||j.message)) ? (j.error||j.message) : msg; } catch{}
      throw new Error(msg);
    }

    // read stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;
    while(true){
      const {done, value} = await reader.read();
      if(done) break;
      buffer += decoder.decode(value, {stream:true});
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for(const line of lines){
        if(!line.trim()) continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }
        if(obj.error){ throw new Error(obj.error); }
        if(obj.stage){
          if(obj.stage === 'validating') $('#importStageText').textContent = 'در حال بررسی اطلاعات در سرور...';
          else if(obj.stage === 'saving') {
            $('#importStageText').textContent = 'در حال ذخیره اطلاعات در دیتابیس...';
            if(obj.processed != null) $('#importProcessed').textContent = obj.processed;
            if(obj.total != null) $('#importTotal').textContent = obj.total;
          } else if(obj.stage === 'done') {
            $('#importStageText').textContent = 'Import با موفقیت انجام شد.';
          }
        }
        if(obj.result){ result = obj.result; }
      }
    }
    if(buffer.trim()){
      try { const obj = JSON.parse(buffer); if(obj.result) result = obj.result; if(obj.error) throw new Error(obj.error); } catch{}
    }

    if(!result) throw new Error('پاسخ نامعتبر از سرور.');

    lastImportReport = result;
    // show result
    $('#importStepProgress').classList.add('hidden');
    $('#importStepResult').classList.remove('hidden');
    const failed = result.failed || 0;
    const imported = result.imported || 0;
    const skipped = result.skipped || 0;
    const total = result.total || items.length;
    $('#importResultText').textContent = failed > 0 ? 'Import با خطا به پایان رسید.' : 'عملیات Import به پایان رسید.';
    $('#importResultCounts').innerHTML = `
      <div class="import-count"><strong>${total}</strong><span>تعداد کل عنوان‌ها</span></div>
      <div class="import-count"><strong>${imported}</strong><span>واردشده</span></div>
      <div class="import-count"><strong>${skipped}</strong><span>تکراری و ردشده</span></div>
      <div class="import-count"><strong>${failed}</strong><span>ناموفق</span></div>`;
    if(result.errors && result.errors.length){
      $('#importReport').classList.remove('hidden');
      $('#importReport').innerHTML = result.errors.map(e=>`<div>• ${esc(e.id||'')} ${esc(e.title||'')} — ${esc(e.reason)}</div>`).join('');
    } else {
      $('#importReport').classList.add('hidden');
    }

    await fetchItems();
    if(failed === 0) notify('success', 'Import با موفقیت انجام شد.');
    else notify('warning', 'Import با برخی خطاها به پایان رسید.');

  } catch(err){
    $('#importStepProgress').classList.add('hidden');
    $('#importStepResult').classList.remove('hidden');
    $('#importResultText').textContent = 'Import انجام نشد.';
    $('#importResultCounts').innerHTML = '';
    $('#importReport').classList.remove('hidden');
    $('#importReport').textContent = err.message;
    notify('error', err.message);
  } finally {
    importing = false;
    importBtn.disabled = false;
  }
};

$('#closeImportResultBtn').onclick = () => { closeImportModal(); };
$('#downloadReportBtn').onclick = () => {
  if(!lastImportReport) return;
  const blob = new Blob([JSON.stringify(lastImportReport, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'import-report.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),500);
};

// ---------- Export ----------
$('#exportBtn').onclick = async () => {
  const btn = $('#exportBtn');
  setLoading(btn, true, 'در حال ساخت...');
  try {
    const st = await api('/api/media/stats');
    if (st.total === 0) { notify('info', 'آرشیو شما هنوز خالی است.'); return; }
    const res = await fetch('/api/export', { credentials:'same-origin' });
    if (!res.ok) throw new Error('ساخت فایل پشتیبان انجام نشد.');
    const blob = await res.blob();
    if(blob.size === 0) throw new Error('ساخت فایل پشتیبان انجام نشد.');
    // check empty? server returns items; if 0 maybe still file. We'll notify empty if content indicates? Keep success.
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'yellowreel.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),500);
    notify('success', 'فایل پشتیبان آماده شد.');
  } catch(e){ notify('error', e.message || 'ساخت فایل پشتیبان انجام نشد.'); }
  finally { setLoading(btn, false); }
};

// ---------- Profile ----------
async function loadProfile(){
  try {
    const data = await api('/api/profile');
    const u = data.user;
    $('#profileUsername').textContent = u.username;
    $('#avatar').textContent = (u.username||'Y').charAt(0).toUpperCase();
    $('#profileCreated').textContent = 'عضویت: ' + new Date(u.createdAt).toLocaleDateString();
    $('#pMovies').textContent = data.stats.movies;
    $('#pSeries').textContent = data.stats.series;
    $('#pWatched').textContent = data.stats.watched;
    $('#pAvg').textContent = data.stats.avgRating==null?'—':data.stats.avgRating.toFixed(1);
  } catch(e){ notify('error', e.message); }
}
$('#cpBtn').onclick = async () => {
  $('#cpError').textContent='';
  const btn = $('#cpBtn');
  setLoading(btn, true, 'در حال ذخیره...');
  try {
    await api('/api/auth/change-password', {
      method:'POST',
      body: JSON.stringify({
        currentPassword: $('#cpCurrent').value,
        newPassword: $('#cpNew').value,
        confirmPassword: $('#cpConfirm').value
      })
    });
    $('#cpCurrent').value=''; $('#cpNew').value=''; $('#cpConfirm').value='';
    notify('success', 'رمز عبور با موفقیت تغییر کرد.');
  } catch(e){
    if(e.backend === 'Current password is incorrect.') $('#cpError').textContent='رمز عبور فعلی اشتباه است.';
    else $('#cpError').textContent = e.message;
    notify('error', e.message);
  } finally { setLoading(btn, false); }
};

// ---------- Mobile hamburger menu ----------
const hamburgerBtn = $('#hamburgerBtn');
const mobileMenu = $('#mobileMenu');
const mobileMenuBackdrop = mobileMenu ? mobileMenu.querySelector('.mobile-menu-backdrop') : null;
function openMobileMenu(){ if(!mobileMenu) return; mobileMenu.classList.remove('hidden'); mobileMenu.classList.add('open'); document.body.style.overflow='hidden'; }
function closeMobileMenu(){ if(!mobileMenu) return; mobileMenu.classList.remove('open'); setTimeout(()=>mobileMenu.classList.add('hidden'), 220); document.body.style.overflow=''; }
if(hamburgerBtn) hamburgerBtn.addEventListener('click', openMobileMenu);
if(mobileMenuBackdrop) mobileMenuBackdrop.addEventListener('click', closeMobileMenu);
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeMobileMenu(); });
if(mobileMenu){
  mobileMenu.querySelectorAll('.mobile-menu-item').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const action = btn.dataset.action;
      closeMobileMenu();
      setTimeout(()=>{
        if(action==='dashboard') enterDashboard();
        else if(action==='profile') enterProfile();
        else if(action==='import') $('#importBtn').click();
        else if(action==='export') $('#exportBtn').click();
        else if(action==='logout') $('#logoutBtn').click();
      }, 220);
    });
  });
}

// ---------- Move Add button on mobile ----------
const mobileAddSlot = $('#mobileAddSlot');
const headerActions = document.querySelector('.header-actions');
const addBtn = $('#addBtn');
function placeAddButton(){
  if(!addBtn || !mobileAddSlot || !headerActions) return;
  if(window.innerWidth <= 600){
    if(addBtn.parentElement !== mobileAddSlot){
      mobileAddSlot.appendChild(addBtn);
      addBtn.classList.add('mobile-add-btn');
      addBtn.classList.remove('btn-primary');
      addBtn.classList.add('btn-primary');
    }
    mobileAddSlot.classList.remove('hidden');
  } else {
    if(addBtn.parentElement !== headerActions){
      headerActions.appendChild(addBtn);
      addBtn.classList.remove('mobile-add-btn');
    }
    mobileAddSlot.classList.add('hidden');
  }
}
placeAddButton();
window.addEventListener('resize', placeAddButton);

window.openModal=openModal; window.editItem=editItem; window.deleteItem=deleteItem;

// ---------- Boot ----------
(async () => {
  showLoading();
  try {
    const me = await api('/api/auth/me');
    if (me && me.user) {
      currentUser = me.user;
      csrfToken = me.csrfToken || csrfToken;
      $('#welcomeUser').textContent = currentUser.username;
      await fetchItems();
      showApp();
      enterDashboard();
      return;
    }
    // no user -> unauthenticated
    await ensureCsrf().catch(()=>{});
    showAuth();
  } catch(e) {
    if (e.status === 401) {
      await ensureCsrf().catch(()=>{});
      showAuth();
      return;
    }
    // server/network error: show auth with retry option
    await ensureCsrf().catch(()=>{});
    showAuth();
    notify('error', e.status === 0 ? 'ارتباط با سرور برقرار نشد.' : 'خطا در بررسی نشست کاربری. دوباره تلاش کنید.');
  }
})();