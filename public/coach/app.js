// 教练后台 SPA
const app = document.getElementById('app');
const store = {
  get token() { return localStorage.getItem('km1_coach_token'); },
  set token(v) { v ? localStorage.setItem('km1_coach_token', v) : localStorage.removeItem('km1_coach_token'); },
  get user() { try { return JSON.parse(localStorage.getItem('km1_coach_user')); } catch { return null; } },
  set user(v) { localStorage.setItem('km1_coach_user', JSON.stringify(v)); },
};
const api = async (path, opts = {}) => {
  const res = await fetch(path, { ...opts,
    headers: { 'Content-Type': 'application/json', ...(store.token ? { Authorization: 'Bearer ' + store.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { store.token = null; location.reload(); throw new Error('未登录'); }
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
};
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (s) => s ? new Date(s).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) + ' ' +
  new Date(s).toTimeString().slice(0, 5) : '-';
let toastTimer;
function toast(m) { const el = document.createElement('div'); el.className = 'toast'; el.textContent = m;
  document.body.appendChild(el); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 2500); }

let view = 'dashboard';
let selectedStudent = null;

function shell(inner, nav) {
  app.innerHTML = `<div class="layout">
    <div class="sidebar">
      <div class="brand">🚗 驾校科目一<small>教练管理后台</small></div>
      <div class="nav-item ${view === 'dashboard' ? 'active' : ''}" onclick="go('dashboard')">📊 学员总览</div>
      <div class="nav-item ${view === 'student' ? 'active' : ''}" onclick="openStudentById(null)">👤 学员详情</div>
      <div class="nav-item ${view === 'bank' ? 'active' : ''}" onclick="go('bank')">🗂 题库版本</div>
      <div style="position:absolute;bottom:20px;left:0;width:210px;padding:0 20px">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:8px">${esc(store.user?.name || '')}</div>
        <span class="nav-item" style="padding-left:0" onclick="logout()">↩ 退出登录</span>
      </div>
    </div>
    <div class="main">${inner}</div>
  </div>`;
}
function go(v) { view = v; selectedStudent = null; render(); }

async function renderLogin() {
  app.innerHTML = `<div class="login-wrap"><div class="login-card">
    <h1>🚗 教练后台</h1>
    <p class="muted" style="margin:6px 0 18px;color:#64748b;font-size:13px">查看学员易错法规与预约考试建议</p>
    <input id="lu" placeholder="教练用户名（coach）" value="coach">
    <button class="btn" style="width:100%" onclick="login()">登 录</button>
    <div class="preset" onclick="quick('coach')"><span>⚡ 一键使用演示教练账号</span><b>→</b></div>
    <div style="margin-top:14px;font-size:12.5px"><a href="/" style="color:#2563eb">← 我是学员，去手机端刷题</a></div>
  </div></div>`;
  document.getElementById('lu').onkeydown = (e) => e.key === 'Enter' && login();
}
async function login(u) {
  try {
    const d = await api('/api/login', { method: 'POST', body: { username: u || document.getElementById('lu').value.trim() } });
    if (d.user.role !== 'coach') { toast('这不是教练账号'); return; }
    store.token = d.token; store.user = d.user; render();
  } catch (e) { toast(e.message); }
}
function quick(u) { login(u); }
function logout() { store.token = null; location.reload(); }

// ---------- 总览 ----------
async function renderDashboard() {
  const d = await api('/api/coach/overview');
  const students = d.students;
  const goCnt = students.filter((s) => s.suggestion.level === 'go').length;
  const holdCnt = students.filter((s) => ['hold', 'stop'].includes(s.suggestion.level)).length;
  const avg = Math.round(students.reduce((a, s) => a + (s.latestMock?.score || 0), 0) / Math.max(1, students.filter((s) => s.latestMock).length));
  const openTotal = students.reduce((a, s) => a + s.wrongOpen, 0);

  shell(`<h1>学员总览</h1>
  <div class="sub">现行题库：${esc(d.version.name)} · 共 ${students.length} 名学员 · 数据实时更新</div>
  <div class="grid g4" style="margin-bottom:16px">
    <div class="kpi"><b>${students.length}</b><span>在培学员</span></div>
    <div class="kpi"><b style="color:var(--green)">${goCnt}</b><span>建议尽快约考</span></div>
    <div class="kpi"><b style="color:var(--red)">${holdCnt}</b><span>需继续练习</span></div>
    <div class="kpi"><b>${avg || '—'}</b><span>最近模拟平均分</span></div>
  </div>

  <div class="card">
    <h2>📋 学员名单与预约建议</h2>
    <table>
      <thead><tr><th>学员</th><th>最近模拟</th><th>模拟记录</th><th>未攻克错题</th><th style="width:230px">易错法规 TOP3</th><th style="width:300px">教练系统建议</th></tr></thead>
      <tbody>
        ${students.map((s) => `<tr class="clickable" onclick="openStudent(${s.id})">
          <td><b>${esc(s.name)}</b><div class="muted">@${esc(s.username)}</div></td>
          <td>${s.latestMock ? `<b style="color:${s.latestMock.passed ? 'var(--green)' : 'var(--red)'};font-size:16px">${s.latestMock.score}</b>
            <span class="badge ${s.latestMock.passed ? 'green' : 'red'}">${s.latestMock.passed ? '及格' : '未过'}</span>`
            : '<span class="muted">未考</span>'}</td>
          <td>${s.mockHistory.length ? s.mockHistory.map((m) => `<span class="badge ${m.passed ? 'green' : 'red'}" style="margin-right:3px">${m.score}</span>`).join('') : '—'}</td>
          <td><span class="badge ${s.wrongOpen > 10 ? 'red' : s.wrongOpen > 5 ? 'amber' : 'blue'}">${s.wrongOpen} 题</span></td>
          <td>${(s.weakTags.slice(0, 3)).map((t) => `<span class="tagchip" style="padding:2px 8px;font-size:12px;margin:1px">${esc(t.tag)}<b> ${t.wrong}</b></span>`).join('') || '<span class="muted">—</span>'}</td>
          <td><div class="sug ${s.suggestion.level}"><b style="font-size:13px">${esc(s.suggestion.title)}</b></div></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div class="grid g2">
    <div class="card">
      <h2>🔥 全班普遍易错法规（所有答题记录）</h2>
      <div class="tagbar">
        ${d.cohortWeak.map((t) => `<span class="tagchip">${esc(t.tag)} <b>${t.wrong}</b> 次错 · ${t.students} 人踩坑</span>`).join('')}
      </div>
      <div class="muted" style="margin-top:10px">建议在课堂上针对这些法规集中讲解。</div>
    </div>
    <div class="card">
      <h2>📈 最近模拟考成绩</h2>
      ${students.map((s) => {
        const score = s.latestMock?.score ?? 0;
        return `<div style="margin-bottom:10px">
          <div class="flex-between" style="margin-bottom:3px"><span>${esc(s.name)}</span>
          <span class="muted">${s.latestMock ? s.latestMock.score + ' 分' : '未考'}</span></div>
          <div class="bar" style="width:100%"><i style="width:${score}%;background:${score >= 90 ? 'var(--green)' : score >= 85 ? '#f59e0b' : 'var(--red)'}"></i></div>
        </div>`;
      }).join('')}
      <div class="muted">90 分及格线</div>
    </div>
  </div>`, 'dashboard');
}

// ---------- 学员详情 ----------
async function openStudent(id) {
  if (id) selectedStudent = id;
  if (!selectedStudent) { renderDashboard(); toast('请在名单中点击一名学员'); return; }
  view = 'student';
  render();
}
function openStudentById() { if (!selectedStudent) { renderDashboard(); toast('请在名单中点击一名学员'); return; } view = 'student'; render(); }

async function renderStudent() {
  const id = selectedStudent;
  const [detail, wrongData] = await Promise.all([
    api('/api/coach/students/' + id),
    api('/api/coach/students/' + id + '/wrong'),
  ]);
  const s = detail.profile, sug = s.suggestion, mocks = detail.mocks;
  const maxScore = 100;
  const openWrongs = wrongData.items.filter((w) => w.status === 'open');
  const archived = wrongData.items.filter((w) => w.state === 'removed' || w.state === 'updated' || w.state === 'changed');

  shell(`<span class="back-link" onclick="go('dashboard')">← 返回学员总览</span>
  <h1>${esc(s.name)} 的学习画像</h1>
  <div class="sub">@${esc(s.username)} · 累计答题 ${s.totalAnswered} · 近7天 ${s.recent7d} 题</div>

  <div class="sug ${sug.level}" style="margin-bottom:16px">
    <b style="font-size:16px">📌 ${esc(sug.title)}</b>
    <div>${esc(sug.detail)}</div>
    ${sug.actions?.length ? `<ul>${sug.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    <div style="margin-top:8px"><button class="btn sm" onclick="toast('已通知学员（演示）')">📨 一键发送复习建议</button></div>
  </div>

  <div class="grid g4" style="margin-bottom:16px">
    <div class="kpi"><b style="color:${s.latestMock?.passed ? 'var(--green)' : 'var(--red)'}">${s.latestMock?.score ?? '—'}</b><span>最近模拟成绩</span></div>
    <div class="kpi"><b>${s.mockCount}</b><span>模拟次数</span></div>
    <div class="kpi"><b style="color:var(--red)">${s.wrongOpen}</b><span>未攻克错题</span></div>
    <div class="kpi"><b style="color:var(--green)">${s.wrongMastered}</b><span>已攻克错题</span></div>
  </div>

  <div class="grid g2">
    <div class="card">
      <h2>⚠ 个人易错法规（按踩坑次数）</h2>
      ${s.weakTags.length ? s.weakTags.map((t) => `
        <div style="margin-bottom:10px">
          <div class="flex-between" style="margin-bottom:3px"><span>${esc(t.tag)}</span>
            <span class="muted">错 ${t.wrong} 次 · 错误率 ${t.rate}%</span></div>
          <div class="bar" style="width:100%"><i style="width:${t.rate}%;background:${t.rate >= 60 ? 'var(--red)' : '#f59e0b'}"></i></div>
        </div>`).join('') : '<div class="muted">暂无错误记录</div>'}
    </div>
    <div class="card">
      <h2>🎯 模拟考成绩曲线</h2>
      ${mocks.length ? `<div class="chart-bars">
        ${mocks.map((m) => `<div class="col">
          <i style="height:${m.score}%;background:${m.passed ? 'var(--green)' : 'var(--red)'}" title="${m.score}分"></i>
          <b style="font-size:13px;color:${m.passed ? 'var(--green)' : 'var(--red)'}">${m.score}</b>
          <span>${fmt(m.at).slice(5, 10)}</span></div>`).join('')}
      </div><div class="muted" style="margin-top:8px">纵轴：分数（满分100，90分及格）</div>` : '<div class="muted">还没参加过模拟考</div>'}
      <h2 style="margin-top:18px">📚 章节练习进度</h2>
      ${s.chapterProgress.map((c) => `<div style="margin-bottom:8px">
        <div class="flex-between" style="font-size:12.5px;margin-bottom:2px"><span>${esc(c.name)}</span>
        <span class="muted">覆盖${c.coverage}% · 正确率${c.accuracy ?? '—'}%</span></div>
        <div class="bar" style="width:100%"><i style="width:${c.coverage}%"></i></div></div>`).join('')}
    </div>
  </div>

  <div class="card">
    <h2>❌ 未攻克错题明细（${openWrongs.length}）</h2>
    ${openWrongs.length ? `<table><thead><tr><th>题</th><th style="width:90px">法规标签</th><th style="width:110px">题库版本</th><th style="width:90px">错误次数</th><th style="width:140px">最近答错</th></tr></thead>
      <tbody>${openWrongs.map((w) => `<tr>
        <td><div class="q-stem">${esc(w.snapshot.stem)}</div>
          <div class="muted">正确答案：${w.snapshot.answer.map((i) => 'ABCD'[i]).join('')} · ${esc(w.snapshot.analysis)}</div>
          ${w.state !== 'current' ? `<div class="archived" style="margin-top:6px">📚 ${w.state === 'removed' ? '该题在现行题库中已被淘汰，此为学员答题当时的旧版快照' : '该题相关法规在新版题库中已更新'}</div>` : ''}
        </td>
        <td>${(w.snapshot.tags || []).map((t) => `<span class="tagchip" style="font-size:11.5px;padding:1px 7px;margin:1px">${esc(t)}</span>`).join('')}</td>
        <td>${w.state === 'removed' ? `<span class="badge gray">${esc(w.answeredVersion)}版(旧)</span>` :
            w.answeredVersion !== '2022' ? `<span class="badge amber">${esc(w.answeredVersion)}版</span>` : '<span class="badge blue">2022现行</span>'}</td>
        <td><span class="badge ${w.attempts >= 3 ? 'red' : 'amber'}">${w.attempts} 次</span></td>
        <td>${fmt(w.lastAt)}</td></tr>`).join('')}
      </tbody></table>` : '<div class="muted">🎉 没有未攻克错题</div>'}
    ${archived.length ? `<div class="archived" style="margin-top:12px">其中 ${archived.length} 道题涉及题库版本变更，系统保留了学员作答当时的题干、答案与讲解，便于追溯。</div>` : ''}
  </div>`);
}

// ---------- 题库版本管理 ----------
async function renderBank() {
  const d = await api('/api/admin/versions');
  shell(`<h1>题库版本管理</h1>
  <div class="sub">题库更新发布后，学员旧错题仍然保留当时快照，随时可回看</div>
  <div class="card">
    <h2>版本列表</h2>
    <table><thead><tr><th>版本</th><th>名称</th><th>发布日期</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>${d.versions.map((v) => `<tr>
        <td><b>${esc(v.code)}版</b></td>
        <td>${esc(v.name)}</td>
        <td>${esc(v.releasedAt)}</td>
        <td>${v.active ? '<span class="badge green">现行版本</span>' : '<span class="badge gray">历史版本</span>'}</td>
        <td>${v.active ? '—' : `<button class="btn sm" onclick="activate(${v.id},'${v.code}')">切换为现行版本</button>`}</td>
      </tr>`).join('')}</tbody></table>
    <div class="muted" style="margin-top:12px">演示：可切回 2021 旧版，再到学员「王强」的错题本里看到 Q105 等旧题依然完整可查。</div>
  </div>
  <div class="card">
    <h2>为什么旧题不会丢？</h2>
    <p class="muted">学员每次答错，系统都会把<strong>当时那道题的完整快照</strong>（题干、选项、正确答案、讲人话解析、法规依据、版本号）存进错题本。
    题库更新后，错题本展示的仍是他做错那天看到的内容，并标注「旧版已淘汰 / 法规已更新」；重做旧错题时也按旧版答案判分。</p>
  </div>`);
}
async function activate(id, code) {
  if (!confirm(`确定将现行题库切换为 ${code} 版？学员练习将立即使用该版本。`)) return;
  try { await api('/api/admin/activate-version', { method: 'POST', body: { versionId: id } });
    toast('已切换到 ' + code + ' 版'); render(); } catch (e) { toast(e.message); }
}

function render() {
  if (!store.token) return renderLogin();
  if (view === 'dashboard') return renderDashboard();
  if (view === 'student') return selectedStudent ? renderStudent() : renderDashboard();
  if (view === 'bank') return renderBank();
}
window.openStudent = (id) => { selectedStudent = id; view = 'student'; render(); };
window.go = go; window.login = login; window.quick = quick; window.logout = logout;
window.openStudentById = openStudentById; window.activate = activate;
render();
