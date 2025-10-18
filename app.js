
/* =========================
   医用工学 問題アプリ core (v10)
   - 複数解答対応（完全一致／部分一致表示）
   - 分野別成績・弱点レポート
   - エラーハンドリング強化 & キャッシュ対策
   ========================= */

const BUILD = '2025-10-18-1';
const STORE_KEY = 'medtechQuiz:v1';
const LOG_KEY = 'medtechQuiz:log';
const DATE_TARGET = '2026-02-18T00:00:00+09:00';

const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

const state = {
  all: [],
  filtered: [],
  idx: 0,
  order: 'seq',
  tagFilter: '',
  yearFilter: '',
  store: loadStore(),
};

function showFatal(msg){
  const main = document.querySelector('main');
  if (!main) return;
  const el = document.createElement('div');
  el.className = 'card';
  el.style.borderColor = 'rgba(239,68,68,.35)';
  el.innerHTML = `<div style="font-weight:700;color:#ef4444;">読み込みエラー</div><div class="muted" style="margin-top:6px;">${escapeHTML(String(msg))}</div>`;
  main.prepend(el);
}

window.addEventListener('error', (e)=> showFatal(e.message||'不明なエラー'));
window.addEventListener('unhandledrejection', (e)=> showFatal(e.reason?.message || 'データ取得に失敗しました'));

function loadStore(){
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e){}
  return { perQ:{}, perTag:{}, last:{tag:'', year:'', order:'seq', idx:0} };
}
function saveStore(){
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state.store)); } catch(e){}
}
function pushLog(entry){
  try {
    const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    logs.unshift({...entry, t: Date.now()});
    while (logs.length > 200) logs.pop();
    localStorage.setItem(LOG_KEY, JSON.stringify(logs));
  } catch(e){}
}
function readLogs(limit=50){
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]').slice(0,limit); } catch(e){ return []; }
}

function startCountdown(){
  const node = $('#countdown');
  const target = new Date(DATE_TARGET);
  function tick(){
    const now = new Date();
    const diff = target - now;
    const days = Math.max(0, Math.ceil(diff/(1000*60*60*24)));
    if (node) node.textContent = `残り ${days} 日`;
  }
  tick(); setInterval(tick, 60*1000);
}

async function boot(){
  startCountdown();
  try {
    const res = await fetch(`./questions.json?v=${encodeURIComponent(BUILD)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`questions.json の取得に失敗（${res.status}）`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('questions.json が配列ではありません');
    state.all = data;
  } catch (e) {
    showFatal(e.message || String(e));
    return;
  }

  try {
    initFilters(state.all);
    if (state.store.last) {
      const last = state.store.last;
      if ($('#tagFilter')) $('#tagFilter').value = last.tag || '';
      if ($('#yearFilter')) $('#yearFilter').value = last.year || '';
      if ($('#orderSel')) $('#orderSel').value = last.order || 'seq';
    }
    applyFilters();
    if (state.store.last && state.store.last.idx < state.filtered.length){
      state.idx = state.store.last.idx;
    }
    render();
    bindUI();
  } catch (e){
    showFatal('UI初期化に失敗: ' + (e.message || String(e)));
  }
}

function initFilters(all){
  const tagSel = $('#tagFilter'), yearSel = $('#yearFilter');
  if (!tagSel || !yearSel) return;
  const tags = new Set(), years = new Set();
  for (const q of all){
    for (const t of (q.tags || [])){
      if (/^\d{4}$/.test(String(t))) years.add(String(t));
      else tags.add(String(t));
    }
  }
  [...tags].sort().forEach(t => tagSel.insertAdjacentHTML('beforeend', `<option value="${escapeAttr(t)}">${escapeHTML(t)}</option>`));
  [...years].sort().forEach(y => yearSel.insertAdjacentHTML('beforeend', `<option value="${escapeAttr(y)}">${escapeHTML(y)}</option>`));
}

function applyFilters(){
  const tag = $('#tagFilter')?.value || '';
  const year = $('#yearFilter')?.value || '';
  const order = $('#orderSel')?.value || 'seq';

  let list = state.all.filter(q => {
    const tags = (q.tags||[]).map(String);
    const matchYear = !year || tags.includes(String(year));
    const matchTag = !tag || tags.includes(String(tag));
    return matchYear && matchTag;
  });

  if (order === 'shuffle'){
    list = shuffle([...list]);
  } else if (order === 'wrong'){
    list.sort((a,b)=>scoreOf(a.id)-scoreOf(b.id));
  }

  state.filtered = list;
  state.idx = 0;
  state.order = order;
  state.tagFilter = tag;
  state.yearFilter = year;
  state.store.last = {tag, year, order, idx:0};
  saveStore();
}

function scoreOf(id){
  const rec = state.store.perQ[id];
  if (!rec || !rec.attempts) return 0.5;
  return rec.correct/rec.attempts;
}

function render(){
  const total = state.filtered.length;
  const qtext = $('#qtext'), choices = $('#choices'), qimg = $('#qimage'), explain = $('#explain');
  if (!qtext || !choices || !qimg || !explain) return;

  if (!total){
    qtext.textContent = '該当する問題がありません。フィルタを変更してください。';
    choices.innerHTML = '';
    qimg.classList.add('hidden');
    explain.classList.add('hidden');
    $('#progress').textContent = '';
    $('#qmeta').textContent = '';
    $('#nextBtn').disabled = true;
    return;
  }
  $('#nextBtn').disabled = false;

  const q = state.filtered[state.idx];
  $('#qtext').textContent = q.question || '';
  $('#qmeta').innerHTML = renderTags(q.tags || []);
  renderImage(q);
  renderChoices(q);
  explain.classList.add('hidden'); explain.innerHTML='';
  $('#progress').textContent = `${state.idx+1} / ${total}`;
}

function renderTags(tags){
  if (!tags || !tags.length) return '';
  return tags.map(t => `<span class="tag">${escapeHTML(String(t))}</span>`).join('');
}

function renderImage(q){
  const node = $('#qimage');
  if (!node) return;
  if (q.image){
    node.classList.remove('hidden');
    node.innerHTML = `<img src="${escapeAttr(q.image)}" alt="${escapeAttr(q.imageAlt || '問題図')}" style="max-width:100%;border-radius:12px;border:1px solid rgba(15,23,42,.1);">`;
  } else {
    node.classList.add('hidden');
    node.innerHTML = '';
  }
}

function renderChoices(q){
  const wrap = $('#choices'); if (!wrap) return;
  wrap.innerHTML = '';
  const multi = Array.isArray(q.answerIndex);
  (q.choices || []).forEach((text, idx) => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.setAttribute('data-idx', String(idx));
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = (multi ? '□ ' : '○ ') + escapeHTML(String(text));
    btn.addEventListener('click', () => {
      if (multi){
        btn.classList.toggle('selected');
        btn.setAttribute('aria-pressed', String(btn.classList.contains('selected')));
      } else {
        $$('#choices .choice').forEach(el => { el.classList.remove('selected'); el.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('selected');
        btn.setAttribute('aria-pressed','true');
      }
    });
    wrap.appendChild(btn);
  });
  if ($('#nextBtn')) $('#nextBtn').textContent = '解答する';
}

function grade(){
  const q = state.filtered[state.idx];
  if (!q) return;
  const selected = $$('#choices .choice.selected').map(el => Number(el.getAttribute('data-idx')));
  const result = isCorrectAnswer(selected, q.answerIndex);
  const correctSet = toSet(q.answerIndex);

  $$('#choices .choice').forEach(el => {
    const idx = Number(el.getAttribute('data-idx'));
    if (correctSet.has(idx)) el.classList.add('correct');
    if (selected.includes(idx) && !correctSet.has(idx)) el.classList.add('incorrect');
  });

  const explain = $('#explain');
  const multi = Array.isArray(q.answerIndex);
  const feedback = result.ok
    ? (multi ? `🎉 全て正解です（${result.total}/${result.total}）` : '🎉 正解です')
    : (multi ? `▲ 部分正解：${result.partial}/${result.total}。残りの選択肢も確認しましょう。` : `✕ 不正解。もう一度見直しましょう。`);
  explain.classList.remove('hidden');
  explain.innerHTML = `<div>${feedback}</div>${q.explanation ? `<div style="margin-top:6px;">${escapeHTML(q.explanation)}</div>` : ''}`;

  bumpScore(q, result.ok, selected);
  $('#nextBtn').textContent = '次へ';
}

function bumpScore(q, ok, selected){
  const id = q.id ?? `idx:${state.idx}`;
  const pq = state.store.perQ[id] || {attempts:0, correct:0};
  pq.attempts += 1; if (ok) pq.correct += 1;
  state.store.perQ[id] = pq;

  const tags = Array.from(new Set(q.tags || []));
  for (const t of tags){
    const rec = state.store.perTag[t] || {attempts:0, correct:0};
    rec.attempts += 1; if (ok) rec.correct += 1;
    state.store.perTag[t] = rec;
  }
  pushLog({ id, ok, selected, answerIndex: q.answerIndex, tags });
  saveStore();
}

function isCorrectAnswer(userSelectedIndices, answerIndex){
  if (Array.isArray(answerIndex)){
    const correct = [...answerIndex].sort((a,b)=>a-b);
    const user = [...new Set(userSelectedIndices)].sort((a,b)=>a-b);
    const partial = intersectCount(user, correct);
    if (correct.length !== user.length) return { ok:false, partial, total: correct.length };
    const ok = correct.every((v,i)=>v===user[i]);
    return { ok, partial: ok ? correct.length : partial, total: correct.length };
  } else {
    const ok = userSelectedIndices.length === 1 && userSelectedIndices[0] === answerIndex;
    const partial = ok ? 1 : (userSelectedIndices.includes(answerIndex) ? 1 : 0);
    return { ok, partial, total:1 };
  }
}
function intersectCount(a, b){ let i=0,j=0,c=0; while(i<a.length&&j<b.length){ if(a[i]===b[j]){c++;i++;j++;} else if(a[i]<b[j]) i++; else j++; } return c; }
function toSet(ans){ return new Set(Array.isArray(ans) ? ans : [ans]); }

function next(){
  if ($('#nextBtn').textContent.includes('解答')) { grade(); return; }
  if (state.idx < state.filtered.length - 1) state.idx += 1;
  state.store.last.idx = state.idx; saveStore();
  render();
}
function prev(){
  if (state.idx > 0) state.idx -= 1;
  state.store.last.idx = state.idx; saveStore();
  render();
}

function openStats(){
  const dlg = $('#statsDlg'); if (!dlg) return;
  const tbody = $('#tagTable tbody'); tbody.innerHTML='';
  const rows = Object.entries(state.store.perTag).map(([tag, rec]) => {
    const rate = rec.attempts ? (rec.correct/rec.attempts) : 0;
    return {tag, ...rec, rate};
  }).sort((a,b)=> b.rate - a.rate || b.attempts - a.attempts);
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHTML(r.tag)}</td><td>${r.correct}</td><td>${r.attempts}</td><td>${(r.rate*100).toFixed(1)}%</td>`;
    tbody.appendChild(tr);
  });

  const weakTbody = $('#weakTable tbody'); weakTbody.innerHTML='';
  const weakTags = rows.filter(r => r.attempts>=5).sort((a,b)=> a.rate - b.rate).slice(0,8);
  weakTags.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>タグ: ${escapeHTML(r.tag)}</td><td>${r.correct}</td><td>${r.attempts}</td><td>${(r.rate*100).toFixed(1)}%</td>`;
    weakTbody.appendChild(tr);
  });
  const weakQ = Object.entries(state.store.perQ).map(([id, rec]) => ({id, ...rec, rate: rec.attempts? rec.correct/rec.attempts : 0}))
                  .filter(r => r.attempts>=3).sort((a,b)=> a.rate - b.rate).slice(0,8);
  weakQ.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>問題: ${escapeHTML(r.id)}</td><td>${r.correct}</td><td>${r.attempts}</td><td>${(r.rate*100).toFixed(1)}%</td>`;
    weakTbody.appendChild(tr);
  });

  const logs = readLogs(50);
  const logNode = $('#logList'); logNode.innerHTML = logs.map(L => {
    const dt = new Date(L.t).toLocaleString('ja-JP');
    const ans = Array.isArray(L.answerIndex) ? `[${L.answerIndex.join(',')}]` : String(L.answerIndex);
    const sel = Array.isArray(L.selected) ? `[${L.selected.join(',')}]` : String(L.selected);
    const tagStr = (L.tags||[]).map(t => `<span class="tag">${escapeHTML(String(t))}</span>`).join('');
    return `<div style="padding:8px 0; border-bottom:1px dashed rgba(15,23,42,.1);">
      <div class="muted">${dt}</div>
      <div>${L.ok ? '✅ 正解' : '❌ 不正解'} / 問題ID: ${escapeHTML(String(L.id))}</div>
      <div class="muted">選択: ${sel} / 正解: ${ans}</div>
      <div>${tagStr}</div>
    </div>`;
  }).join('');

  dlg.showModal();
}

function bindUI(){
  $('#orderSel')?.addEventListener('change', () => { applyFilters(); render(); });
  $('#tagFilter')?.addEventListener('change', () => { applyFilters(); render(); });
  $('#yearFilter')?.addEventListener('change', () => { applyFilters(); render(); });
  $('#nextBtn')?.addEventListener('click', next);
  $('#prevBtn')?.addEventListener('click', prev);
  $('#statsBtn')?.addEventListener('click', openStats);
  $('#closeStats')?.addEventListener('click', () => $('#statsDlg').close());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter'){ e.preventDefault(); next(); }
    else if (e.key === 'ArrowRight'){ e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft'){ prev(); }
    else if (/^[1-5]$/.test(e.key)){
      const idx = Number(e.key)-1;
      const btn = document.querySelector(`#choices .choice[data-idx="${idx}"]`);
      if (!btn) return;
      const q = state.filtered[state.idx];
      const multi = Array.isArray(q.answerIndex);
      if (multi) btn.click();
      else {
        $$('#choices .choice').forEach(el => el.classList.remove('selected'));
        btn.classList.add('selected');
        btn.setAttribute('aria-pressed','true');
      }
    }
  });
}

function shuffle(a){ for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function escapeHTML(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function escapeAttr(s){ return escapeHTML(String(s)).replace(/"/g,'&quot;'); }

window.addEventListener('DOMContentLoaded', boot);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
