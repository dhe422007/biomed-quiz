
/* ==========================================
   臨床検査技師 国家試験：医用工学 問題アプリ (v13)
=========================================== */

const BUILD = '2025-10-19-2';
const STORE_KEY = 'medtechQuiz:v1';
const LOG_KEY = 'medtechQuiz:log';
const DATE_TARGET = '2026-02-18T00:00:00+09:00';

const FIXED_YEARS = ["2017","2018","2019","2020","2021","2022","2023","2024","2025","過去問","original"];
const FIXED_TAGS  = ["センサ・トランスデューサ","医用電子回路","医療情報","生体物性","電気・電子","電気的安全対策"]; // 「全ての分野」は空扱い

const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

const state = {
  screen: 'home',    // 'home' | 'quiz' | 'result'
  all: [],
  filtered: [],
  idx: 0,
  tagFilter: '',
  yearFilter: '',
  store: loadStore(),
  session: null // {startedAt, correct, total}
};

function loadStore(){
  try { const raw = localStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); } catch(e){}
  return { perQ:{}, perTag:{}, last:{screen:'home', tag:'', year:'', idx:0} };
}
function saveStore(){ try { localStorage.setItem(STORE_KEY, JSON.stringify(state.store)); } catch(e){} }

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
function resetAllLogs(){
  try {
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(LOG_KEY);
  } catch(e){}
  location.reload();
}

function startCountdown(){
  const node = $('#countdown');
  const target = new Date(DATE_TARGET);
  function tick(){
    const now = new Date();
    const diff = target - now;
    const days = Math.max(0, Math.ceil(diff/(1000*60*60*24)));
    if (node) node.textContent = `試験日まで残り ${days} 日`;
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
    showFatal(e.message || String(e)); return;
  }
  try {
    initHome(state.all);
    initFilters(state.all);
    bindUI();
    const last = state.store.last || {};
    state.screen = last.screen || 'home';
    setFooterVisibility();
    if (state.screen === 'quiz') {
      if ($('#tagFilter')) $('#tagFilter').value = last.tag || '';
      if ($('#yearFilter')) $('#yearFilter').value = last.year || '';
      state.tagFilter = last.tag || '';
      state.yearFilter = last.year || '';
      applyFilters();
      if (last.idx < state.filtered.length) state.idx = last.idx;
      showQuiz();
      render();
    } else if (state.screen === 'result') {
      showResult();
    } else {
      showHome();
    }
  } catch (e){
    showFatal('初期化に失敗: ' + (e.message || String(e)));
  }
}

function setFooterVisibility(){
  const isHome = state.screen === 'home';
  $('#prevBtn').classList.toggle('hidden', isHome);
  $('#nextBtn').classList.toggle('hidden', isHome);
  $('#progress').classList.toggle('hidden', isHome);
}

function showHome(){
  $('#homeScreen').classList.remove('hidden');
  $('#quizScreen').classList.add('hidden');
  $('#resultScreen').classList.add('hidden');
  state.screen = 'home';
  state.store.last.screen = 'home'; saveStore();
  setFooterVisibility();
}
function showQuiz(){
  $('#homeScreen').classList.add('hidden');
  $('#quizScreen').classList.remove('hidden');
  $('#resultScreen').classList.add('hidden');
  state.screen = 'quiz';
  state.store.last.screen = 'quiz'; saveStore();
  setFooterVisibility();
}
function showResult(){
  $('#homeScreen').classList.add('hidden');
  $('#quizScreen').classList.add('hidden');
  $('#resultScreen').classList.remove('hidden');
  state.screen = 'result';
  state.store.last.screen = 'result'; saveStore();
  setFooterVisibility();
}

function showFatal(msg){
  const main = document.querySelector('main');
  if (!main) return;
  const el = document.createElement('div');
  el.className = 'card';
  el.style.borderColor = 'rgba(239,68,68,.35)';
  el.innerHTML = `<div style="font-weight:700;color:#ef4444;">読み込みエラー</div><div class="muted" style="margin-top:6px;">${escapeHTML(String(msg))}</div>`;
  main.prepend(el);
}

/* ---------- Home (fixed lists) ---------- */
function initHome(all){
  const ysel = $('#homeYearSel'), tsel = $('#homeTagSel');
  // 固定の年度
  FIXED_YEARS.forEach(y => ysel.insertAdjacentHTML('beforeend', `<option value="${escapeAttr(y)}">${escapeHTML(y)}</option>`));
  // 固定の分野（セレクト；先頭には既に「全ての分野」）
  FIXED_TAGS.forEach(t => tsel.insertAdjacentHTML('beforeend', `<option value="${escapeAttr(t)}">${escapeHTML(t)}</option>`));

  function updateCount(){
    const year = ysel.value;
    const tag = tsel.value;
    const count = estimateCount(all, {year, tag});
    $('#homeCount').textContent = `該当 ${count} 問`;
  }
  ysel.addEventListener('change', updateCount);
  tsel.addEventListener('change', updateCount);

  // タイル（年度）
  const yNode = $('#homeYears'); yNode.innerHTML = '';
  FIXED_YEARS.forEach(y => {
    const c = estimateCount(all, {year:y, tag:tsel.value});
    const div = document.createElement('div');
    div.className = 'tile';
    div.innerHTML = `<h3>${escapeHTML(y)}</h3><div class="muted">${c}問</div>`;
    div.addEventListener('click', () => { ysel.value = y; updateCount(); });
    yNode.appendChild(div);
  });

  // タイル（分野）：先頭に「全ての分野」
  const tNode = $('#homeTags'); tNode.innerHTML = '';
  const allDiv = document.createElement('div');
  allDiv.className = 'tile';
  allDiv.innerHTML = `<h3>全ての分野</h3><div class="muted">${all.length}問</div>`;
  allDiv.addEventListener('click', () => { tsel.value = ''; updateCount(); });
  tNode.appendChild(allDiv);

  FIXED_TAGS.forEach(t => {
    const c = estimateCount(all, {year:ysel.value, tag:t});
    const div = document.createElement('div');
    div.className = 'tile';
    div.innerHTML = `<h3>${escapeHTML(t)}</h3><div class="muted">${c}問</div>`;
    div.addEventListener('click', () => { tsel.value = t; updateCount(); });
    tNode.appendChild(div);
  });

  // 初期カウント
  updateCount();

  // スタート
  $('#homeStartBtn').addEventListener('click', () => {
    const year = ysel.value;
    const tag = tsel.value;
    startFromHome({year, tag});
  });
}

function estimateCount(all, {year='', tag=''}){
  return all.filter(q => {
    const tags = (q.tags||[]).map(String);
    const yearish = tags.filter(t => /^\\d{4}$/.test(t) || t === 'original' || t === '過去問');
    const matchYear = !year || yearish.includes(String(year));
    const matchTag = !tag || tags.includes(String(tag));
    return matchYear && matchTag;
  }).length;
}

function startFromHome({year='', tag=''}={}){
  if ($('#yearFilter')) $('#yearFilter').value = year;
  if ($('#tagFilter')) $('#tagFilter').value = tag;
  state.yearFilter = year;
  state.tagFilter = tag;
  applyFilters();
  state.idx = 0;
  state.session = { startedAt: Date.now(), correct: 0, total: state.filtered.length };
  state.store.last = {screen:'quiz', tag: state.tagFilter, year: state.yearFilter, idx: 0};
  saveStore();
  showQuiz();
  render();
}

/* ---------- Filters (quiz) ---------- */
function initFilters(all){
  const tagSel = $('#tagFilter'), yearSel = $('#yearFilter');
  if (!tagSel || !yearSel) return;
  // 分野セレクトは固定候補＋空(すべて)
  FIXED_TAGS.forEach(t => tagSel.insertAdjacentHTML('beforeend', `<option value="${escapeAttr(t)}">${escapeHTML(t)}</option>`));
  // 年度セレクトは固定候補
  FIXED_YEARS.forEach(y => yearSel.insertAdjacentHTML('beforeend', `<option value="${escapeAttr(y)}">${escapeHTML(y)}</option>`));
}

function applyFilters(){
  const tag = ($('#tagFilter')?.value ?? state.tagFilter) || '';
  const year = ($('#yearFilter')?.value ?? state.yearFilter) || '';

  let list = state.all.filter(q => {
    const tags = (q.tags||[]).map(String);
    const yearish = tags.filter(t => /^\\d{4}$/.test(t) || t === 'original' || t === '過去問');
    const matchYear = !year || yearish.includes(String(year));
    const matchTag = !tag || tags.includes(String(tag));
    return matchYear && matchTag;
  });

  state.filtered = list;
  state.idx = 0;
  state.tagFilter = tag;
  state.yearFilter = year;
  state.store.last = {screen: state.screen, tag, year, idx: 0};
  saveStore();
}

/* ---------- Render (quiz) ---------- */
function render(){
  if (state.screen !== 'quiz') return;
  const total = state.filtered.length;
  const qtext = $('#qtext'), choices = $('#choices'), qimg = $('#qimage'), explain = $('#explain');
  if (!qtext || !choices || !qimg || !explain) return;

  if (!total){
    qtext.textContent = '該当する問題がありません。トップページまたはフィルタを変更してください。';
    choices.innerHTML = '';
    qimg.classList.add('hidden');
    explain.classList.add('hidden');
    $('#progress').textContent = '';
    $('#qmeta').textContent = '';
    $('#nextBtn').disabled = true;
    return;
  }

  const q = state.filtered[state.idx];
  $('#qtext').textContent = q.question || '';
  $('#qmeta').innerHTML = renderTags(q.tags || []);
  renderImage(q);
  renderChoices(q);
  explain.classList.add('hidden'); explain.innerHTML='';

  $('#progress').textContent = `${state.idx+1} / ${total}`;
  updateNextButtonAvailability(q);
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
  const n = (q.choices || []).length;
  const order = Array.from({length:n}, (_,i)=>i);
  shuffle(order);
  order.forEach((origIdx) => {
    const text = q.choices[origIdx];
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.setAttribute('data-idx', String(origIdx));
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = escapeHTML(String(text));
    btn.addEventListener('click', () => {
      if (multi){
        btn.classList.toggle('selected');
        btn.setAttribute('aria-pressed', String(btn.classList.contains('selected')));
      } else {
        $$('#choices .choice').forEach(el => { el.classList.remove('selected'); el.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('selected');
        btn.setAttribute('aria-pressed','true');
      }
      updateNextButtonAvailability(q);
    });
    wrap.appendChild(btn);
  });
  $('#nextBtn').textContent = '解答する';
}

function updateNextButtonAvailability(q){
  const selected = $$('#choices .choice.selected');
  const nextBtn = $('#nextBtn');
  if (!nextBtn) return;
  if (Array.isArray(q.answerIndex)){
    const need = q.answerIndex.length;
    nextBtn.disabled = (selected.length !== need);
    nextBtn.title = selected.length !== need ? `この問題は ${need} 個選んでください` : '';
  } else {
    nextBtn.disabled = (selected.length !== 1);
    nextBtn.title = selected.length !== 1 ? '選択肢を1つ選んでください' : '';
  }
}

/* ---------- Grade / Flow ---------- */
function grade(){
  if (state.screen !== 'quiz') return;
  const q = state.filtered[state.idx];
  if (!q) return;
  const selectedNodes = $$('#choices .choice.selected');
  if (!selectedNodes.length) { updateNextButtonAvailability(q); return; }
  if (Array.isArray(q.answerIndex) && selectedNodes.length !== q.answerIndex.length) { updateNextButtonAvailability(q); return; }

  const selected = selectedNodes.map(el => Number(el.getAttribute('data-idx')));
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
  if (state.session){ if (result.ok) state.session.correct += 1; }

  if (state.idx >= state.filtered.length - 1){
    $('#nextBtn').textContent = '結果を見る';
  } else {
    $('#nextBtn').textContent = '次へ';
  }
  $('#nextBtn').disabled = false;
}

function bumpScore(q, ok, selected){
  const id = q.id ?? `idx:${state.idx}`;
  const pq = state.store.perQ[id] || {attempts:0, correct:0};
  pq.attempts += 1; if (ok) pq.correct += 1;
  state.store.perQ[id] = pq;

  const tags = Array.from(new Set((q.tags || [])));
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

/* ---------- Navigation ---------- */
function next(){
  if (state.screen === 'home') return;
  if (state.screen === 'result'){ showHome(); return; }
  const btn = $('#nextBtn');
  if (btn.textContent.includes('解答')) { grade(); return; }
  if (btn.textContent.includes('結果')) { renderResult(); showResult(); return; }
  if (state.idx < state.filtered.length - 1) state.idx += 1;
  state.store.last.idx = state.idx; saveStore();
  render();
}
function prev(){
  if (state.screen !== 'quiz') return;
  if (state.idx > 0) state.idx -= 1;
  state.store.last.idx = state.idx; saveStore();
  render();
}

/* ---------- Result ---------- */
function renderResult(){
  const s = state.session || {startedAt: Date.now(), correct: 0, total: state.filtered.length};
  const finishedAt = new Date();
  const startedAt = new Date(s.startedAt);
  const rate = s.total ? (s.correct / s.total) : 0;

  const rows = [
    `<div>解答日時：${finishedAt.toLocaleString('ja-JP')}</div>`,
    `<div>成績：${s.correct} / ${s.total}（正答率 ${(rate*100).toFixed(1)}%）</div>`,
    `<div>所要時間：約 ${Math.max(1, Math.round((finishedAt - startedAt)/60000))} 分</div>`,
    `<div>ポジティブな明るいアドバイス：${makePositiveAdvice(rate)}</div>`
  ].join('');
  $('#resultSummary').innerHTML = rows;
  $('#resultAdvice').textContent = '';
}

function makePositiveAdvice(rate){
  if (rate < 0.4) return 'ここから伸びしろがたっぷり！解説を手掛かりに要点を押さえれば必ず伸びます。';
  if (rate < 0.7) return '良いペースです！間違えた分野を重点的に回せば合格圏が見えてきます。';
  if (rate < 0.9) return 'かなり仕上がっています！弱点の最終チェックで得点を安定させましょう。';
  return '最高の出来！自信を持って本番に臨めるレベルです。';
}

/* ---------- Stats Dialog ---------- */
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
  const weakTags = rows.filter(r => r.attempts>=5).sort((a,b)=> a.rate - b.rate).slice(0,10);
  weakTags.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>タグ: ${escapeHTML(r.tag)}</td><td>${r.correct}</td><td>${r.attempts}</td><td>${(r.rate*100).toFixed(1)}%</td>`;
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

/* ---------- Bind ---------- */
function bindUI(){
  $('#homeBtn')?.addEventListener('click', showHome);
  $('#statsBtn')?.addEventListener('click', openStats);
  $('#resetStats')?.addEventListener('click', resetAllLogs);
  $('#closeStats')?.addEventListener('click', () => $('#statsDlg').close());

  $('#tagFilter')?.addEventListener('change', () => { applyFilters(); render(); });
  $('#yearFilter')?.addEventListener('change', () => { applyFilters(); render(); });

  $('#nextBtn')?.addEventListener('click', next);
  $('#prevBtn')?.addEventListener('click', prev);

  $('#resultToHome')?.addEventListener('click', showHome);
  $('#resultRestart')?.addEventListener('click', () => startFromHome({year: state.yearFilter, tag: state.tagFilter}));
}

/* ---------- Utils ---------- */
function shuffle(a){ for (let i=a.length-1; i>0; i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function escapeHTML(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function escapeAttr(s){ return escapeHTML(String(s)).replace(/"/g,'&quot;'); }

window.addEventListener('DOMContentLoaded', boot);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
