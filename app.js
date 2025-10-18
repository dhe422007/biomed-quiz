/* ===============================
   臨床検査技師 国家試験：医用工学 問題アプリ (v14)
   - 年度/分野が選べない・進めない・日数が消える不具合を修正
   - 年度フィルタは「2017」「2017年」「…2017…」に対応
================================= */

const BUILD = '2025-10-19-4';
const STORE_KEY = 'medtechQuiz:v1';
const LOG_KEY = 'medtechQuiz:log';
const DATE_TARGET = '2026-02-18T00:00:00+09:00'; // 試験日

// 固定の選択肢
const FIXED_YEARS = ["2017","2018","2019","2020","2021","2022","2023","2024","2025","過去問","original"];
const FIXED_TAGS  = ["センサ・トランスデューサ","医用電子回路","医療情報","生体物性","電気・電子","電気的安全対策"]; // 「全ての分野」は空扱い（=未指定）

const $ = (q) => document.querySelector(q);
const $$ = (q) => Array.from(document.querySelectorAll(q));

// 状態
const state = {
  screen: 'home',
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

// カウントダウン（試験日まで残り N 日）
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

// 起動
window.addEventListener('DOMContentLoaded', boot);
async function boot(){
  startCountdown();
  try {
    const res = await fetch(`./questions.json?v=${encodeURIComponent(BUILD)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`questions.json の取得に失敗（${res.status}）`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('questions.json が配列ではありません');
    state.all = data;
  } catch (e) {
    console.error(e);
    alert('questions.json を読み込めませんでした。');
    return;
  }

  try {
    initHome();
    initFilters();
    bindUI();
    state.screen = 'home';
    setFooterVisibility();
    showHome();
  } catch (e){
    console.error(e);
    alert('初期化に失敗しました。');
  }
}

// フッターのボタン表示制御（トップでは非表示）
function setFooterVisibility(){
  const isHome = state.screen === 'home';
  $('#prevBtn').classList.toggle('hidden', isHome);
  $('#nextBtn').classList.toggle('hidden', isHome);
  $('#progress').classList.toggle('hidden', isHome);
}

/* ---------- Home ---------- */
function initHome(){
  const ysel = $('#homeYearSel'), tsel = $('#homeTagSel');
  // 年度
  FIXED_YEARS.forEach(y => ysel.insertAdjacentHTML('beforeend', `<option value="${escapeAttr(y)}">${escapeHTML(y)}</option>`));
  // 分野（先頭は「全ての分野」＝空）
  FIXED_TAGS.forEach(t => tsel.insertAdjacentHTML('beforeend', `<option value="${escapeAttr(t)}">${escapeHTML(t)}</option>`));

  const updateCount = () => {
    const count = estimateCount({year: ysel.value, tag: tsel.value});
    $('#homeCount').textContent = `該当 ${count} 問`;
  };
  ysel.addEventListener('change', updateCount);
  tsel.addEventListener('change', updateCount);

  // 年度タイル
  const yNode = $('#homeYears'); yNode.innerHTML = '';
  FIXED_YEARS.forEach(y => {
    const c = estimateCount({year:y, tag: tsel.value});
    const div = document.createElement('div');
    div.className = 'tile';
    div.innerHTML = `<h3>${escapeHTML(y)}</h3><div class="muted">${c}問</div>`;
    div.addEventListener('click', () => { ysel.value = y; updateCount(); });
    yNode.appendChild(div);
  });

  // 分野タイル（先頭に「全ての分野」）
  const tNode = $('#homeTags'); tNode.innerHTML = '';
  const allDiv = document.createElement('div');
  allDiv.className = 'tile';
  allDiv.innerHTML = `<h3>全ての分野</h3><div class="muted">${state.all.length}問</div>`;
  allDiv.addEventListener('click', () => { tsel.value = ''; updateCount(); });
  tNode.appendChild(allDiv);

  FIXED_TAGS.forEach(t => {
    const c = estimateCount({year: ysel.value, tag: t});
    const div = document.createElement('div');
    div.className = 'tile';
    div.innerHTML = `<h3>${escapeHTML(t)}</h3><div class="muted">${c}問</div>`;
    div.addEventListener('click', () => { tsel.value = t; updateCount(); });
    tNode.appendChild(div);
  });

  // スタート
  $('#homeStartBtn').addEventListener('click', () => {
    startFromHome({year: ysel.value, tag: tsel.value});
  });

  updateCount();
}

function estimateCount({year='', tag=''}){
  return state.all.filter(q => {
    const tags = (q.tags||[]).map(String);
    const matchYear = matchYearTag(tags, year);
    const matchTag = !tag || tags.includes(String(tag));
    return matchYear && matchTag;
  }).length;
}

function startFromHome({year='', tag=''}={}){
  // クイズ用セレクトにも反映
  $('#yearFilter').value = year;
  $('#tagFilter').value = tag;
  state.yearFilter = year;
  state.tagFilter = tag;
  applyFilters();
  state.idx = 0;
  state.session = { startedAt: Date.now(), correct: 0, total: state.filtered.length };
  showQuiz();
  render();
}

/* ---------- Filters (quiz) ---------- */
function initFilters(){
  const tagSel = $('#tagFilter'), yearSel = $('#yearFilter');
  FIXED_TAGS.forEach(t => tagSel.insertAdjacentHTML('beforeend', `<option value="${escapeAttr(t)}">${escapeHTML(t)}</option>`));
  FIXED_YEARS.forEach(y => yearSel.insertAdjacentHTML('beforeend', `<option value="${escapeAttr(y)}">${escapeHTML(y)}</option>`));
}

function applyFilters(){
  const tag = ($('#tagFilter')?.value ?? state.tagFilter) || '';
  const year = ($('#yearFilter')?.value ?? state.yearFilter) || '';

  state.filtered = state.all.filter(q => {
    const tags = (q.tags||[]).map(String);
    const matchYear = matchYearTag(tags, year);
    const matchTag = !tag || tags.includes(String(tag));
    return matchYear && matchTag;
  });

  state.idx = 0;
  state.tagFilter = tag;
  state.yearFilter = year;
}

/* 年度タグのマッチング（2017/2017年/…2017…、original/過去問は厳密一致） */
function matchYearTag(tagsArr, year){
  if (!year) return true;
  const y = String(year);
  return tagsArr.some(s0 => {
    const s = String(s0);
    if (y === 'original' || y === '過去問') return s === y;
    if (s === 'original' || s === '過去問') return false;
    // 4桁年なら部分一致も許容（2017年, 2017-xx, text2017 など）
    if (/^\d{4}$/.test(y)) {
      return s === y || s.includes(y) || s.replace(/年$/,'') === y;
    }
    return s === y;
  });
}

/* ---------- クイズ描画 ---------- */
function showHome(){
  $('#homeScreen').classList.remove('hidden');
  $('#quizScreen').classList.add('hidden');
  $('#resultScreen').classList.add('hidden');
  state.screen = 'home';
  setFooterVisibility();
}
function showQuiz(){
  $('#homeScreen').classList.add('hidden');
  $('#quizScreen').classList.remove('hidden');
  $('#resultScreen').classList.add('hidden');
  state.screen = 'quiz';
  setFooterVisibility();
}
function showResult(){
  $('#homeScreen').classList.add('hidden');
  $('#quizScreen').classList.add('hidden');
  $('#resultScreen').classList.remove('hidden');
  state.screen = 'result';
  setFooterVisibility();
}

function render(){
  if (state.screen !== 'quiz') return;
  const total = state.filtered.length;
  const qtext = $('#qtext'), choices = $('#choices'), qimg = $('#qimage'), explain = $('#explain');
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
  if (q.image){
    node.classList.remove('hidden');
    node.innerHTML = `<img src="${escapeAttr(q.image)}" alt="${escapeAttr(q.imageAlt || '問題図')}" style="max-width:100%;border-radius:12px;border:1px solid rgba(15,23,42,.1);">`;
  } else {
    node.classList.add('hidden');
    node.innerHTML = '';
  }
}

function renderChoices(q){
  const wrap = $('#choices'); wrap.innerHTML = '';
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
  if (Array.isArray(q.answerIndex)){
    const need = q.answerIndex.length;
    nextBtn.disabled = (selected.length !== need);
    nextBtn.title = selected.length !== need ? `この問題は ${need} 個選んでください` : '';
  } else {
    nextBtn.disabled = (selected.length !== 1);
    nextBtn.title = selected.length !== 1 ? '選択肢を1つ選んでください' : '';
  }
}

/* ---------- 採点・遷移 ---------- */
function grade(){
  const q = state.filtered[state.idx];
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

function next(){
  if (state.screen === 'home') return;
  if (state.screen === 'result'){ showHome(); return; }
  const btn = $('#nextBtn');
  if (btn.textContent.includes('解答')) { grade(); return; }
  if (btn.textContent.includes('結果')) { renderResult(); showResult(); return; }
  if (state.idx < state.filtered.length - 1) state.idx += 1;
  render();
}
function prev(){
  if (state.screen !== 'quiz') return;
  if (state.idx > 0) state.idx -= 1;
  render();
}

/* ---------- 結果 ---------- */
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

/* ---------- 成績・弱点 ---------- */
function openStats(){
  const dlg = $('#statsDlg'); if (!dlg) return;
  const tbody = $('#tagTable tbody'); tbody.innerHTML='';
  const rows = Object.entries(state.store.perTag || {}).map(([tag, rec]) => {
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

/* ---------- スコア記録 ---------- */
function bumpScore(q, ok, selected){
  const id = q.id ?? `idx:${state.idx}`;
  const pq = state.store.perQ?.[id] || {attempts:0, correct:0};
  pq.attempts += 1; if (ok) pq.correct += 1;
  state.store.perQ = state.store.perQ || {}; state.store.perQ[id] = pq;

  const tags = Array.from(new Set((q.tags || [])));
  state.store.perTag = state.store.perTag || {};
  for (const t of tags){
    const rec = state.store.perTag[t] || {attempts:0, correct:0};
    rec.attempts += 1; if (ok) rec.correct += 1;
    state.store.perTag[t] = rec;
  }
  pushLog({ id, ok, selected, answerIndex: q.answerIndex, tags });
  saveStore();
}

/* ---------- バインド ---------- */
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

/* ---------- ユーティリティ ---------- */
function shuffle(a){ for (let i=a.length-1; i>0; i--){ const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function escapeHTML(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#39;' }[m])); }
function escapeAttr(s){ return escapeHTML(String(s)).replace(/"/g,'&quot;'); }

// 採点ヘルパ
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

// SW
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
