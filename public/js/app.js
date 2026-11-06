const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let csrfToken = null;
let items = [];
let editingId = null;
let chipStatus = 'all';
let currentUser = null;

function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
const typeText = t => t==='movie'?'فیلم':'سریال';
const statusText = s => s==='watched'?'دیده‌شده':s==='watching'?'در حال تماشا':'برای بعد';
function toast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.classList.remove('show'),2200);}

async function api(path, opts={}){
  const headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
  if (csrfToken && opts.method && opts.method!=='GET') headers['X-CSRF-Token']=csrfToken;
  const res = await fetch(path, Object.assign({}, opts, { headers, credentials:'same-origin' }));
  let data = null;
  const ct = res.headers.get('content-type')||'';
  if (ct.includes('application/json')) { try { data = await res.json(); } catch { data=null; } }
  else { data = await res.text(); }
  if (!res.ok) {
    const msg = (data && data.error) ? data.error : ('HTTP '+res.status);
    throw new Error(msg);
  }
  return data;
}

async function ensureCsrf(){
  const data = await api('/api/auth/csrf-token');
  csrfToken = data.csrfToken;
}

// ---------- Auth UI ----------
function showAuth(){
  $('#authScreen').classList.remove('hidden');
  $('#appScreen').classList.add('hidden');
}
function showApp(){
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

$('#loginBtn').onclick = async () => {
  $('#loginError').textContent='';
  try {
    const data = await api('/api/auth/login', {
      method:'POST',
      body: JSON.stringify({ username: $('#loginUsername').value.trim(), password: $('#loginPassword').value })
    });
    currentUser = data.user;
    await loadInitial();
    showApp();
    enterDashboard();
  } catch(e){ $('#loginError').textContent = e.message; }
};
$('#registerBtn').onclick = async () => {
  $('#regError').textContent='';
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
  } catch(e){ $('#regError').textContent = e.message; }
};

$('#logoutBtn').onclick = async () => {
  try { await api('/api/auth/logout', { method:'POST' }); } catch(e){}
  currentUser = null; items = [];
  csrfToken = null;
  await ensureCsrf();
  showAuth();
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
  const data = await api('/api/media?' + params.toString());
  items = data.items || [];
  render();
  await refreshStats();
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
function stats(){ /* now from server; keep local fallback */ }
function current(){ return items; } // filtering done server-side but chip already in fetch; search/type server-side
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
  if(confirm(`«${x.title}» حذف شود؟`)){
    try {
      await api('/api/media/'+encodeURIComponent(id), { method:'DELETE' });
      toast('حذف شد');
      await fetchItems();
    } catch(e){ toast(e.message); }
  }
}
$('#mediaForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const data={
    title:$('#fTitle').value.trim(),type:$('#fType').value,status:$('#fStatus').value,
    year:$('#fYear').value.trim(),rating:$('#fRating').value.trim(),poster:$('#fPoster').value.trim(),
    progress:$('#fProgress').value.trim(),notes:$('#fNotes').value.trim()
  };
  if(!data.title)return;
  try {
    if(editingId){
      await api('/api/media/'+encodeURIComponent(editingId), { method:'PUT', body: JSON.stringify(data) });
      toast('ذخیره شد');
    } else {
      await api('/api/media', { method:'POST', body: JSON.stringify(data) });
      toast('اضافه شد');
    }
    closeModal();
    await fetchItems();
  } catch(err){ toast(err.message); }
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
$('#randomBtn').onclick=()=>{const list=items;if(!list.length){toast('چیزی برای انتخاب نیست');return;}const x=list[Math.floor(Math.random()*list.length)];toast('پیشنهاد: '+x.title)};

// import/export
$('#exportBtn').onclick = async () => {
  try {
    const res = await fetch('/api/export', { credentials:'same-origin' });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'yellowreel.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),500);
    toast('Export آماده شد');
  } catch(e){ toast(e.message); }
};
$('#importBtn').onclick=()=>$('#fileInput').click();
$('#fileInput').addEventListener('change', async e=>{
  const file=e.target.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=async ()=>{
    try {
      const data=JSON.parse(reader.result);
      const res = await api('/api/import', { method:'POST', body: JSON.stringify(data) });
      toast(`Import انجام شد (${res.imported} اضافه, ${res.skipped} تکراری)`);
      await fetchItems();
    } catch(err){ toast(err.message||'فایل معتبر نیست'); }
    e.target.value='';
  };
  reader.readAsText(file);
});

// profile
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
  } catch(e){ toast(e.message); }
}
$('#cpBtn').onclick = async () => {
  $('#cpError').textContent='';
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
    toast('رمز عبور تغییر کرد');
  } catch(e){ $('#cpError').textContent=e.message; }
};

window.openModal=openModal; window.editItem=editItem; window.deleteItem=deleteItem;

// ---------- Boot ----------
(async () => {
  try {
    await ensureCsrf();
    const me = await api('/api/auth/me').catch(()=>null);
    if (me && me.user) {
      currentUser = me.user;
      csrfToken = me.csrfToken || csrfToken;
      $('#welcomeUser').textContent = currentUser.username;
      await fetchItems();
      showApp();
      enterDashboard();
    } else {
      showAuth();
    }
  } catch(e) {
    showAuth();
  }
})();
