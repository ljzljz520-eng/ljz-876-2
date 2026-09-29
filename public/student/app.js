// 科目一学员端 SPA（移动端优先，适合碎片时间刷题）
const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');

const store = {
  get token() { return localStorage.getItem('km1_token'); },
  set token(v) { v ? localStorage.setItem('km1_token', v) : localStorage.removeItem('km1_token'); },
  get user() { try { return JSON.parse(localStorage.getItem('km1_user')); } catch { return null; } },
  set user(v) { v ? localStorage.setItem('km1_user', JSON.stringify(v)) : localStorage.removeItem('km1_user'); },
};

const api = async (path, opts = {}) => {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(store.token ? { Authorization: `Bearer ${store.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
};

let toastTimer;
function toast(msg) {
  $('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2200);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (s) => s ? new Date(s).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const OPT_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ============ 状态：练习运行时 ============
let RT = null; // {data, idx, mode: 'chapter'|'wrong'|'mock', locked:{}, examDone}

function logout() { store.token = null; store.user = null; location.hash = '#/login'; }

function topbar(title, opts = {}) {
  return `<div class="topbar">
    <div style="display:flex;align-items:center;gap:4px">
      ${opts.back !== false ? `<span class="back" onclick="location.hash='${opts.backHref || '#/home'}${opts.backHash||''}'">‹</span>` : ''}
      <div><h1>${esc(title)}</h1>${opts.sub ? `<div class="sub">${esc(opts.sub)}</div>` : ''}</div>
    </div>
    ${opts.right || ''}
  </div>`;
}

function tabbar(active) {
  return `<div class="tabbar">
    <div class="tab ${active === 'home' ? 'active' : ''}" onclick="location.hash='#/home'"><span class="ic">🏠</span>首页</div>
    <div class="tab ${active === 'chapter' ? 'active' : ''}" onclick="location.hash='#/chapters'"><span class="ic">📖</span>章节</div>
    <div class="tab ${active === 'wrong' ? 'active' : ''}" onclick="location.hash='#/wrong'"><span class="ic">📝</span>错题本</div>
    <div class="tab ${active === 'me' ? 'active' : ''}" onclick="location.hash='#/me'"><span class="ic">👤</span> ${esc(store.user?.name || '我')}</div>
  </div>`;
}

// ============ 登录页 ============
async function renderLogin() {
  if (store.token) { location.hash = '#/home'; return; }
  app.innerHTML = `<div class="login-wrap">
    <div class="login-card">
      <h1>🚗 科目一模拟考试</h1>
      <p class="muted" style="margin:4px 0 18px">章节练题 · 错题重做 · 全真模拟</p>
      <input id="li-user" class="inp" placeholder="输入用户名" style="width:100%;padding:12px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:15px;margin-bottom:12px">
      <button class="btn" id="li-btn">登录 / 注册演示账号</button>
      <div style="margin-top:16px" class="muted">演示账号（点一下直接进）：</div>
      <div class="preset" data-u="zhangxiaoming"><div class="who"><b>张小明</b><span>学员 · 95 分种子选手</span></div><span>→</span></div>
      <div class="preset" data-u="wangxiaowen"><div class="who"><b>王晓雯</b><span>学员 · 76 分待加强</span></div><span>→</span></div>
      <div class="preset" data-u="wangqiang"><div><div class="who"><b>王强</b><span>学员 · 含旧版错题</span></div></div><span>→</span></div>
      <div class="preset" data-u="coach"><div class="who"><b>李教练</b><span>教练后台 → 新页面打开</span></div><span>→</span></div>
    </div>
  </div>`;
  const doLogin = async (username) => {
    try {
      const d = await api('/api/login', { method: 'POST', body: { username } });
      store.token = d.token; store.user = d.user;
      if (d.user.role === 'coach') { location.href = '/coach'; return; }
      location.hash = '#/home';
    } catch (e) { toast(e.message); }
  };
  $('#li-btn').onclick = () => doLogin($('#li-user').value.trim());
  $('#li-user').onkeydown = (e) => e.key === 'Enter' && doLogin(e.target.value.trim());
  document.querySelectorAll('.preset').forEach((p) => p.onclick = () => doLogin(p.dataset.u));
}

// ============ 首页 ============
async function renderHome() {
  const d = await api('/api/student/home');
  const s = d.stats, sug = d.suggestion;
  const sugCls = { go: 'go', watch: 'watch', hold: 'hold', stop: 'stop', none: 'none' }[sug.level];
  app.innerHTML = topbar('科目一刷题', { back: false, sub: `现行题库：${esc(d.version.name)}`,
      right: `<span class="badge gray" style="background:rgba(255,255,255,.2);color:#fff">👤 ${esc(store.user.name)}</span>` })
    + `<div class="page">
      <div class="suggest ${sugCls}">
        <div class="ttl">📌 ${esc(sug.title)}</div>
        <div style="font-size:13px;line-height:1.55">${esc(sug.detail)}</div>
      </div>
      <div class="grid grid-3" style="margin-bottom:12px">
        <div class="stat"><b>${s.totalAnswered}</b><span>累计答题</span></div>
        <div class="stat"><b style="color:var(--red)">${s.wrongOpen}</b><span>未攻克错题</span></div>
        <div class="stat"><b style="color:var(--green)">${s.latestMock ? s.latestMock.score : '—'}</b><span>最近模拟</span></div>
      </div>
      <div class="entry blue" onclick="location.hash='#/chapters'">
        <div class="icon">📖</div><div><div class="t">按章节练题</div><div class="d">四大章节 · 即时讲解 · 碎片时间刷一刷</div></div>
      </div>
      <div class="entry orange" onclick="location.hash='#/wrong'">
        <div class="icon">📝</div><div><div class="t">错题重做</div><div class="d">${s.wrongOpen} 道待攻克，做对自动移出错题本</div></div>
      </div>
      <div class="entry purple" onclick="location.hash='#/exam-intro'">
        <div class="icon">🎯</div><div><div class="t">全真模拟</div><div class="d">100 题 / 45 分钟 / 90 分及格，和真考一样</div></div>
      </div>
      ${d.openMock ? `<div class="card" style="border:1.5px solid #f59e0b"><div class="row">
        <div><b>有一套模拟考未交卷</b><div class="muted">计时不会停，继续做完吧</div></div>
        <button class="btn amber sm" onclick="location.hash='#/exam-run/${d.openMock.id}'">继续考试</button></div></div>` : ''}
      <div class="card">
        <h2 style="margin-bottom:8px">近 7 天活跃度</h2>
        <div class="row"><span class="muted">最近 7 天答了</span><b>${s.recent7d} 题</b></div>
        <div class="row" style="margin-top:6px"><span class="muted">历史模拟次数</span><b>${s.mockCount} 次</b></div>
      </div>
    </div>` + tabbar('home');
}

// ============ 章节列表 ============
async function renderChapters() {
  const d = await api('/api/chapters');
  app.innerHTML = topbar('按章节练题') + `<div class="page">
    <div class="muted" style="margin-bottom:10px">做错的题自动进错题本，每题都有大白话讲解。</div>
    ${d.chapters.map((c) => {
      const p = c.progress || {};
      const cov = p.coverage || 0, acc = p.accuracy;
      return `<div class="card" onclick="startChapter(${c.id})" style="cursor:pointer">
        <div class="chapter">
          <div class="num">${c.order}</div>
          <div style="flex:1;min-width:0">
            <div class="row"><b>${esc(c.name)}</b><span class="muted">${c.questionCount} 题</span></div>
            <div class="progress-bar"><i style="width:${cov}%"></i></div>
            <div style="margin-top:6px">
              <span class="badge blue">已练 ${p.done || 0}/${c.questionCount}</span>
              ${acc != null ? `<span class="badge ${acc >= 80 ? 'green' : acc >= 60 ? 'amber' : 'red'}">正确率 ${acc}%</span>` : ''}
            </div>
          </div>
          <div style="color:var(--muted)">›</div>
        </div>
      </div>`;
    }).join('')}
  </div>` + tabbar('chapter');
}
async function startChapter(chapterId) {
  const d = await api('/api/sessions', { method: 'POST', body: { kind: 'chapter', chapterId } });
  RT = { data: d, idx: 0, mode: 'chapter' };
  location.hash = '#/practice';
}

// ============ 错题本列表 ============
async function renderWrongList() {
  const d = await api('/api/wrong-book');
  const open = d.items.filter((x) => x.status === 'open');
  const mastered = d.items.filter((x) => x.status === 'mastered');
  const stateBadge = (w) => w.state === 'removed'
    ? '<span class="badge gray">旧版已淘汰</span>'
    : w.state === 'updated' || w.state === 'changed'
      ? '<span class="badge amber">⚠ 法规已更新</span>' : '';
  const itemCard = (w) => `<div class="card">
    <div class="row" style="align-items:flex-start">
      <div style="flex:1;min-width:0">
        <div style="margin-bottom:4px"><span class="chip">${esc(w.snapshot.tags?.[0] || '科目一')}</span>${stateBadge(w)}</div>
        <div style="font-weight:600">${esc(w.snapshot.stem)}</div>
        <div class="muted" style="margin-top:6px">
          最近答错：${fmtDate(w.lastAt)} · 错 ${w.attempts} 次
          ${w.answeredVersion && w.answeredVersion !== '2022' ? `· <span style="color:#b45309">当时题库版本：${esc(w.answeredVersion)}版</span>` : ''}
        </div>
      </div>
    </div>
    <div class="row" style="margin-top:10px">
      <button class="btn ghost sm" onclick="viewWrong(${w.id})">回看讲解</button>
      <button class="btn gray sm" onclick="markMastered(${w.id})">我已掌握</button>
    </div>
  </div>`;
  app.innerHTML = topbar('错题本') + `<div class="page">
    ${open.length ? `<button class="btn orange" style="margin-bottom:12px" onclick="startWrong()">🔁 错题重做（${open.length} 题）</button>`
      : `<div class="card" style="text-align:center;color:var(--green);font-weight:600">🎉 错题本清空啦，去模拟考检验一下！</div>`}
    <h2 style="font-size:15px;margin:4px 2px 8px">待攻克（${open.length}）</h2>
    ${open.map(itemCard).join('') || '<div class="empty"><div class="big">✅</div>没有未攻克的错题</div>'}
    ${mastered.length ? `<h2 style="font-size:15px;margin:18px 2px 8px">已掌握（${mastered.length}）</h2>${mastered.map(itemCard).join('')}` : ''}
  </div>` + tabbar('wrong');
}

async function viewWrong(id) {
  const d = await api('/api/wrong-book');
  const w = d.items.find((x) => x.id === id);
  RT = { data: { questions: [{ ...w.snapshot, answered: null, current: w.currentExists, archived: w.state === 'removed' }] },
    idx: 0, mode: 'view', meta: w };
  location.hash = '#/practice';
}
async function markMastered(id) {
  await api(`/api/wrong-book/${id}/master`, { method: 'POST' });
  toast('已标记为掌握'); renderWrongList();
}
async function startWrong() {
  try {
    const d = await api('/api/sessions', { method: 'POST', body: { kind: 'wrong' } });
    RT = { data: d, idx: 0, mode: 'wrong' };
    location.hash = '#/practice';
  } catch (e) { toast(e.message); }
}

// ============ 模拟考介绍 ============
function renderExamIntro(openMock) {
  app.innerHTML = topbar('全真模拟') + `<div class="page">
    <div class="card" style="text-align:center;padding:30px 18px">
      <div style="font-size:52px">🎯</div>
      <h2>100 题 · 45 分钟 · 90 分及格</h2>
      <p class="muted">题目从现行题库随机抽取，考试中不显示答案、不计时暂停；交卷后才能看解析，和真实科目一完全一致。</p>
      <div class="grid grid-3" style="margin:16px 0">
        <div class="stat"><b>100</b><span>道题</span></div>
        <div class="stat"><b>45'</b><span>分钟</span></div>
        <div class="stat"><b>90</b><span>及格分</span></div>
      </div>
      ${openMock ? '<div class="muted" style="color:#b45309;margin-bottom:10px">你有一场正在进行的考试</div>' : ''}
      <button class="btn purple" style="background:#7c3aed" onclick="startMock(${openMock?.id || 'null'})">
        ${openMock ? '继续上次考试' : '开始模拟考试'}
      </button>
      <div style="height:10px"></div>
      <button class="btn ghost" onclick="location.hash='#/mock-history'">查看历史成绩</button>
    </div>
  </div>`;
}
async function enterExamIntro() {
  const home = await api('/api/student/home');
  renderExamIntro(home.openMock);
}
async function startMock(resumeId) {
  let d;
  if (resumeId) d = await api(`/api/sessions/${resumeId}`);
  else d = await api('/api/sessions', { method: 'POST', body: { kind: 'mock' } });
  RT = { data: d, idx: 0, mode: 'mock' };
  location.hash = '#/exam-run/' + d.id;
}

// ============ 章节练习 / 错题重做 运行页 ============
function renderPractice() {
  if (!RT) { location.hash = '#/home'; return; }
  const { data, idx, mode } = RT;
  const q = data.questions[idx];
  const total = data.questions.length;
  const isView = mode === 'view';
  const titleMap = { chapter: '章节练习', wrong: '错题重做', view: '错题回看' };
  const archived = q.archived || q.current === false || (q.versionCode && q.versionCode !== '2022' && mode === 'wrong');
  app.innerHTML = topbar(titleMap[mode] || '练习', { backHref: mode === 'wrong' ? '#/wrong' : mode === 'view' ? '#/wrong' : '#/chapters' })
    + `<div class="page">
      <div class="q-head">
        <span>第 ${idx + 1} / ${total} 题</span>
        <span class="badge gray">${q.versionCode ? q.versionCode + '版' : ''}</span>
      </div>
      ${archived ? `<div class="archived-banner">📚 这是<strong>旧版题库</strong>里的题（${esc(q.versionCode || '旧')}版），题库更新后仍为你保留当时的题干和讲解。</div>` : ''}
      <div class="card">
        <div class="q-stem">${esc(q.stem)}</div>
        <div id="opts">${q.options.map((o, i) => `
          <div class="opt" data-i="${i}" onclick="pickOption(${i})">
            <span class="key">${OPT_KEYS[i]}</span><span>${esc(o)}</span>
          </div>`).join('')}</div>
        <div id="explain"></div>
      </div>
      <div class="row" style="gap:10px">
        ${idx > 0 ? '<button class="btn gray" onclick="prevQ()">上一题</button>' : '<span></span>'}
        <button class="btn" id="next-btn" onclick="nextQ()" ${isView ? 'style="visibility:hidden"' : ''}>
          ${idx === total - 1 ? '完成练习' : '下一题'}</button>
      </div>
    </div>`;
  if (q.answered) {
    lockQuestion(q, q.answered.picked);
  }
}
function pickOption(i) {
  if (!RT) return;
  const q = RT.data.questions[RT.idx];
  if (q.answered || RT.mode === 'view') return;
  submitAnswer(q, i);
}
async function submitAnswer(q, i) {
  const opts = document.querySelectorAll('#opts .opt');
  opts.forEach((o) => o.classList.add('locked'));
  opts[i].classList.add('selected');
  try {
    const r = await api(`/api/sessions/${RT.data.id}/answers`, { method: 'POST', body: { qcode: q.qcode, picked: [i] } });
    q.answered = { picked: [i], correct: r.correct };
    q.answer = r.answer; q.analysis = r.analysis; q.law = r.law;
    lockQuestion(q, [i], r);
  } catch (e) { toast(e.message); opts.forEach((o) => o.classList.remove('locked')); }
}
function lockQuestion(q, picked, r) {
  const correctIdx = (r?.answer ?? q.answer) || [];
  const isCorrect = r ? r.correct : q.answered?.correct;
  document.querySelectorAll('#opts .opt').forEach((o) => {
    const i = Number(o.dataset.i);
    o.classList.add('locked');
    o.classList.remove('selected');
    if (correctIdx.includes(i)) o.classList.add('correct');
    if (picked.includes(i) && !correctIdx.includes(i)) o.classList.add('wrong');
  });
  const analysis = r?.analysis ?? q.analysis;
  const law = r?.law ?? q.law;
  $('#explain').innerHTML = `<div class="explain ${isCorrect ? 'ok' : 'bad'}">
    <div class="verdict">${isCorrect ? '✅ 回答正确' : '❌ 回答错误'}</div>
    <div>${esc(analysis)}</div>
    ${law ? `<div class="law">📖 依据：${esc(law)}</div>` : ''}
  </div>`;
}
function prevQ() { if (RT.idx > 0) { RT.idx--; renderPractice(); window.scrollTo(0, 0); } }
function nextQ() {
  if (!RT) return;
  if (RT.idx === RT.data.questions.length - 1) { finishPractice(); return; }
  RT.idx++; renderPractice(); window.scrollTo(0, 0);
}
async function finishPractice() {
  if (RT.mode === 'view') { history.back(); return; }
  const d = await api(`/api/sessions/${RT.data.id}/finish`, { method: 'POST' });
  RT = null;
  const wrong = d.wrongCount ?? 0;
  const answered = d.answeredCount ?? d.correctCount + wrong;
  const skipped = d.total - answered;
  app.innerHTML = topbar('练习结果') + `<div class="page">
    <div class="card score-hero ${wrong === 0 ? 'pass' : ''}">
      <b style="color:${wrong === 0 ? 'var(--green)' : 'var(--amber)'}">${d.score}<span style="font-size:24px">分</span></b>
      <div class="muted">本次正确率（按已答 ${answered} 题计）</div>
    </div>
    <div class="card">
      <div class="row"><span>本次答对</span><b style="color:var(--green)">${d.correctCount} 题</b></div>
      <div class="row" style="margin-top:8px"><span>本次答错</span><b style="color:var(--red)">${wrong} 题</b></div>
      ${skipped > 0 ? `<div class="row" style="margin-top:8px"><span>还没做</span><b style="color:var(--muted)">${skipped} 题（随时回来继续）</b></div>` : ''}
      <div class="muted" style="margin-top:8px">答错的题已自动收入错题本（模拟考除外，模拟考交卷统一收录）。</div>
    </div>
    <button class="btn" onclick="location.hash='#/wrong'">去错题本看看</button>
    <div style="height:10px"></div>
    <button class="btn ghost" onclick="location.hash='#/home'">返回首页</button>
  </div>`;
}

// ============ 模拟考运行页 ============
let examTimer;
async function renderExamRun(id) {
  const d = await api(`/api/sessions/${id}`);
  if (d.finishedAt) { showExamResult(d); return; }
  RT = { data: d, idx: 0, mode: 'mock' };
  drawExam();
  if (examTimer) clearInterval(examTimer);
  examTimer = setInterval(() => {
    const left = deadlineLeft();
    const el = $('#timer');
    if (!el) { clearInterval(examTimer); return; }
    el.textContent = '⏱ ' + fmtMMSS(left);
    el.classList.toggle('danger', left < 5 * 60);
    if (left <= 0) { clearInterval(examTimer); autoSubmit(); }
  }, 1000);
}
function deadlineLeft() {
  return Math.max(0, Math.floor((new Date(RT.data.deadline) - Date.now()) / 1000));
}
const fmtMMSS = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

function drawExam() {
  const { data, idx } = RT;
  const q = data.questions[idx];
  const answeredCount = data.questions.filter((x) => x.answered).length;
  app.innerHTML = topbar('全真模拟', { back: false })
    + `<div class="exam-bar">
        <span>第 <b>${idx + 1}</b>/${data.total} 题 · 已答 ${answeredCount}</span>
        <span class="timer" id="timer">⏱ ${fmtMMSS(deadlineLeft())}</span>
      </div>
      <div class="page">
        <div class="q-head"><span>单选题</span><span class="badge blue">模拟考进行中</span></div>
        <div class="card">
          <div class="q-stem">${esc(q.stem)}</div>
          <div id="opts">${q.options.map((o, i) => `
            <div class="opt ${q.answered && q.answered.picked.includes(i) ? 'selected' : ''}" data-i="${i}" onclick="mockPick(${i})">
              <span class="key">${OPT_KEYS[i]}</span><span>${esc(o)}</span>
            </div>`).join('')}</div>
        </div>
        <div class="row" style="gap:10px">
          <button class="btn gray" onclick="openSheet()">答题卡</button>
          <button class="btn" onclick="mockNext()">${idx === data.questions.length - 1 ? '检查并交卷' : '下一题'}</button>
        </div>
      </div>`;
}
async function mockPick(i) {
  const q = RT.data.questions[RT.idx];
  q.answered = { picked: [i] };
  const opts = document.querySelectorAll('#opts .opt');
  opts.forEach((o) => { o.classList.toggle('selected', Number(o.dataset.i) === i); });
  await api(`/api/sessions/${RT.data.id}/answers`, { method: 'POST', body: { qcode: q.qcode, picked: [i] } }).catch(() => {});
  drawExam();
}
function mockNext() {
  if (RT.idx < RT.data.questions.length - 1) { RT.idx++; drawExam(); window.scrollTo(0, 0); }
  else openSheet(true);
}
function openSheet(askSubmit = false) {
  const qs = RT.data.questions;
  const done = qs.filter((q) => q.answered).length;
  const mask = document.createElement('div');
  mask.className = 'sheet-mask';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.innerHTML = `<h3>答题卡（已答 ${done}/${qs.length}）</h3>
    <div class="qdots">${qs.map((q, i) => `<i class="${q.answered ? 'done' : ''} ${i === RT.idx ? 'cur' : ''}"
      onclick="jumpQ(${i});this.closest('.sheet')?.previousElementSibling?.remove();this.closest('.sheet')?.remove()">${i + 1}</i>`).join('')}</div>
    <div style="height:14px"></div>
    <button class="btn" onclick="confirmSubmit(${done})">交卷${done < qs.length ? `（还有 ${qs.length - done} 题未答，按错计）` : ''}</button>
    <div style="height:8px"></div>
    <button class="btn gray" onclick="this.closest('.sheet').previousElementSibling.remove();this.closest('.sheet').remove()">继续答题</button>`;
  document.body.append(mask, sheet);
  mask.onclick = () => { mask.remove(); sheet.remove(); };
  if (askSubmit) { /* 末题点下一题：只打开答题卡 */ }
}
function jumpQ(i) { RT.idx = i; drawExam(); }
function confirmSubmit(done) {
  if (done < RT.data.questions.length) {
    if (!confirm(`还有 ${RT.data.questions.length - done} 道题没作答，未答题按答错处理，确定交卷吗？`)) return;
  }
  autoSubmit();
}
async function autoSubmit() {
  if (examTimer) clearInterval(examTimer);
  const d = await api(`/api/sessions/${RT.data.id}/finish`, { method: 'POST' });
  showExamResult(d);
}
function showExamResult(d) {
  RT = { data: d, idx: 0, mode: 'mock-result' };
  const pass = d.passed;
  const wrongQs = d.questions.filter((q) => !q.answered || !q.answered.correct);
  app.innerHTML = topbar('模拟考成绩单') + `<div class="page">
    <div class="card score-hero ${pass ? 'pass' : 'fail'}">
      <b>${d.score}</b><div>${pass ? '🎉 成绩合格（90分及以上）' : '未达 90 分及格线，继续加油'}</div>
    </div>
    <div class="grid grid-2">
      <div class="stat"><b style="color:var(--green)">${d.correctCount}</b><span>答对</span></div>
      <div class="stat"><b style="color:var(--red)">${d.total - d.correctCount}</b><span>答错/未答</span></div>
    </div>
    <div class="card" style="margin-top:12px">
      <h2>${pass ? '下一步' : '错题解析'}</h2>
      <div class="muted">${wrongQs.length} 道题已收入错题本，逐题看讲解、搞懂为止。</div>
      <div style="height:10px"></div>
      <button class="btn" onclick="location.hash='#/wrong'">去错题本攻克错题</button>
      <div style="height:8px"></div>
      <button class="btn ghost" onclick="location.hash='#/exam-review'">查看本次答题与解析</button>
    </div>
    <button class="btn gray" onclick="location.hash='#/home'">返回首页</button>
  </div>`;
}

// 模拟考结果逐题回顾
function renderExamReview() {
  if (!RT || RT.mode !== 'mock-result') { location.hash = '#/home'; return; }
  const d = RT.data;
  app.innerHTML = topbar('答题回顾', { backHref: '#/home' }) + `<div class="page">
    ${d.questions.map((q, i) => {
      const picked = q.answered?.picked ?? [];
      const ok = q.answered?.correct;
      return `<div class="card">
        <div class="q-head"><span>第 ${i + 1} 题</span>
          <span class="badge ${ok ? 'green' : 'red'}">${ok ? '答对' : q.answered ? '答错' : '未答'}</span></div>
        <div style="font-weight:600;margin-bottom:10px">${esc(q.stem)}</div>
        ${q.options.map((o, oi) => `<div class="opt locked ${q.answer.includes(oi) ? 'correct' : ''} ${picked.includes(oi) && !q.answer.includes(oi) ? 'wrong' : ''}">
          <span class="key">${OPT_KEYS[oi]}</span><span>${esc(o)}</span></div>`).join('')}
        <div class="explain ${ok ? 'ok' : 'bad'}">
          <div class="verdict">${ok ? '✅ 正确' : '❌ ' + (q.answered ? '回答错误' : '未作答')}</div>
          <div>${esc(q.analysis)}</div>
          <div class="law">📖 依据：${esc(q.law)}</div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// 历史成绩
async function renderMockHistory() {
  const d = await api('/api/sessions');
  const mocks = d.sessions.filter((s) => s.kind === 'mock');
  app.innerHTML = topbar('模拟考历史') + `<div class="page">
    ${mocks.length ? mocks.map((m) => `<div class="card row">
      <div><b style="font-size:20px;color:${m.passed ? 'var(--green)' : 'var(--red)'}">${m.score}</b>
      <span class="muted">分 · ${fmtDate(m.finishedAt)}</span></div>
      <span class="badge ${m.passed ? 'green' : 'red'}">${m.passed ? '及格' : '未过'}</span>
    </div>`).join('') : '<div class="empty"><div class="big">🎯</div>还没参加过模拟考</div>'}
  </div>`;
}

// 个人中心
async function renderMe() {
  const d = await api('/api/student/home');
  const s = d.stats;
  app.innerHTML = topbar('我的', { back: false }) + `<div class="page">
    <div class="card row"><div><b style="font-size:18px">${esc(store.user.name)}</b>
      <div class="muted">@${esc(store.user.username)}</div></div>
      <span class="badge blue">${esc(d.version.name)}</span></div>
    <div class="card">
      <h2>章节掌握情况</h2>
      ${s.chapterProgress.map((c) => `<div style="margin-bottom:12px">
        <div class="row" style="font-size:13.5px"><span>${esc(c.name)}</span>
          <span class="muted">${c.done}/${c.total} · 正确率 ${c.accuracy ?? '—'}%</span></div>
        <div class="progress-bar"><i style="width:${c.coverage}%"></i></div></div>`).join('')}
    </div>
    <div class="grid grid-3">
      <div class="stat"><b>${s.totalAnswered}</b><span>累计答题</span></div>
      <div class="stat"><b style="color:var(--green)">${s.wrongMastered}</b><span>已攻克</span></div>
      <div class="stat"><b>${s.mockCount}</b><span>模拟次数</span></div>
    </div>
    <div style="height:14px"></div>
    <button class="btn gray" onclick="logout()">退出登录</button>
    <div class="muted" style="text-align:center;margin-top:14px">教练后台入口：<a href="/coach" style="color:var(--primary)">/coach</a></div>
  </div>` + tabbar('me');
}

// ============ 路由 ============
const routes = [
  [/^#\/login$/, renderLogin],
  [/^#\/home$/, renderHome],
  [/^#\/chapters$/, renderChapters],
  [/^#\/wrong$/, renderWrongList],
  [/^#\/practice$/, renderPractice],
  [/^#\/exam-intro$/, enterExamIntro],
  [/^#\/exam-run\/(\d+)$/, (m) => renderExamRun(Number(m[1]))],
  [/^#\/exam-review$/, renderExamReview],
  [/^#\/mock-history$/, renderMockHistory],
  [/^#\/me$/, renderMe],
];

async function router() {
  if (examTimer && !location.hash.startsWith('#/exam-run')) { clearInterval(examTimer); }
  if (!store.token && location.hash !== '#/login') { location.hash = '#/login'; return; }
  if (store.token && (!location.hash || location.hash === '#/')) { location.hash = '#/home'; return; }
  for (const [re, fn] of routes) {
    const m = location.hash.match(re);
    if (m) { try { await fn(m); } catch (e) { toast(e.message); console.error(e); } return; }
  }
  location.hash = store.token ? '#/home' : '#/login';
}
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
router();

// 暴露给 onclick
Object.assign(window, { startChapter, startWrong, viewWrong, markMastered, startMock,
  pickOption, prevQ, nextQ, mockPick, mockNext, openSheet, jumpQ, confirmSubmit, logout });
