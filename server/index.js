// 零依赖 HTTP 服务：API + 静态资源
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { db } from './db.js';
import {
  PASS_SCORE, MOCK_TOTAL, MOCK_SECONDS, activeVersion,
  studentStats, wrongBookList, weakTags, cohortWeakTags, coachStudentProfile,
  shuffleDeterministic, eqArr, questionSnapshot,
} from './services.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');
const PORT = process.env.PORT || 3000;

// ---------------- 简易令牌 ----------------
const tokens = new Map();
function issueToken(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, userId);
  return token;
}
function authUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const userId = tokens.get(token);
  if (!userId) return null;
  return db.find('users', (u) => u.id === userId) || null;
}
function safeUser(u) { return u && { id: u.id, name: u.name, username: u.username, role: u.role }; }

// ---------------- 工具 ----------------
const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 2e6) reject(new Error('body too large')); });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('bad json')); } });
});
function snapshotOfQuestion(qrow) { return questionSnapshot(qrow); }

// ---------------- 会话构建 ----------------
function buildSession(sess) {
  const version = db.find('bankVersions', (v) => v.id === sess.versionId);
  const answers = db.filter('answers', (a) => a.sessionId === sess.id);
  const answeredMap = Object.fromEntries(answers.map((a) => [a.qcode, a]));

  let items = [];
  if (sess.kind === 'wrong') {
    // 错题重做：题目来自错题本快照，保证旧题也能回看/重做
    for (const w of db.filter('wrongBook', (x) => x.userId === sess.userId && x.status === 'open')) {
      const snap = w.lastSnapshot;
      if (!snap) continue;
      items.push({
        qcode: w.qcode, type: snap.type, stem: snap.stem, options: snap.options,
        answer: snap.answer, analysis: snap.analysis, law: snap.law, tags: snap.tags,
        versionCode: snap.versionCode,
        current: !!db.find('questions', (q) => q.qcode === w.qcode && q.versionId === version.id),
      });
    }
  } else {
    const qrows = db.filter('questions', (q) => q.versionId === sess.versionId &&
      (sess.kind === 'mock' || q.chapterId === sess.chapterId));
    let ordered = qrows;
    if (sess.kind === 'mock') ordered = shuffleDeterministic(qrows, sess.id * 9973 + 17);
    else ordered = qrows.sort((a, b) => a.qcode.localeCompare(b.qcode));
    if (sess.kind === 'mock') ordered = ordered.slice(0, MOCK_TOTAL);
    items = ordered.map((q) => snapshotOfQuestion(q));
  }

  const exposeAnswers = sess.kind !== 'mock' || !!sess.finishedAt;
  const questions = items.map((snap) => {
    const a = answeredMap[snap.qcode];
    const base = {
      qcode: snap.qcode, type: snap.type, stem: snap.stem, options: snap.options,
      versionCode: snap.versionCode || sess.versionCode,
      current: snap.current !== undefined ? snap.current : true,
      answered: a ? { picked: a.picked, correct: a.correct, at: a.answeredAt } : null,
    };
    if (a && exposeAnswers) {
      base.answer = snap.answer;
      base.analysis = snap.analysis;
      base.law = snap.law;
      base.tags = snap.tags;
    }
    return base;
  });

  return {
    id: sess.id, kind: sess.kind, chapterId: sess.chapterId,
    versionCode: sess.versionCode, total: questions.length,
    createdAt: sess.createdAt, startedAt: sess.startedAt, finishedAt: sess.finishedAt,
    score: sess.score, correctCount: sess.correctCount,
    wrongCount: sess.wrongCount ?? answers.filter((a) => !a.correct).length,
    answeredCount: answers.length,
    passed: sess.passed,
    deadline: sess.kind === 'mock' && !sess.finishedAt ? new Date(new Date(sess.startedAt).getTime() + MOCK_SECONDS * 1000).toISOString() : null,
    durationSeconds: sess.kind === 'mock' ? MOCK_SECONDS : null,
    questions,
  };
}

function findOpenSession(userId, kind, chapterId) {
  return db.find('sessions', (s) => s.userId === userId && s.kind === kind && !s.finishedAt &&
    (kind !== 'chapter' || s.chapterId === chapterId));
}

function answerInSession(sess, qcode, picked, user) {
  // 定位题目：优先会话版本
  let qrow = db.find('questions', (q) => q.qcode === qcode && q.versionId === sess.versionId);
  let snapshot;
  if (sess.kind === 'wrong') {
    const w = db.find('wrongBook', (x) => x.userId === user.id && x.qcode === qcode);
    if (w && w.lastSnapshot) snapshot = w.lastSnapshot;
  }
  if (!qrow && !snapshot) {
    // 旧版题（如已淘汰题）：取错题本快照；否则按任意版本查
    qrow = db.find('questions', (q) => q.qcode === qcode);
  }
  if (!snapshot && qrow) snapshot = snapshotOfQuestion(qrow);
  if (!snapshot) throw httpError(404, '题目不存在');

  const correct = eqArr(picked, snapshot.answer);
  let existing = db.find('answers', (a) => a.sessionId === sess.id && a.qcode === qcode);
  if (existing) {
    db.update('answers', existing.id, { picked, correct, answeredAt: new Date().toISOString() });
  } else {
    db.insert('answers', {
      sessionId: sess.id, userId: user.id, qcode,
      versionId: qrow ? qrow.versionId : null, versionCode: snapshot.versionCode,
      chapterId: qrow ? qrow.chapterId : null, picked, correct,
      snapshot, answeredAt: new Date().toISOString(),
    });
  }

  // 错题本维护
  const wb = db.find('wrongBook', (w) => w.userId === user.id && w.qcode === qcode);
  if (sess.kind !== 'mock') {
    if (correct) {
      if (wb && wb.status === 'open') db.update('wrongBook', wb.id, { status: 'mastered', resolvedAt: new Date().toISOString() });
    } else {
      upsertWrong(user, snapshot, sess.kind);
    }
  } else if (!correct) {
    // 模拟考交卷时统一处理
  }
  return { correct, snapshot, picked };
}

function upsertWrong(user, snapshot, source) {
  const wb = db.find('wrongBook', (w) => w.userId === user.id && w.qcode === snapshot.qcode);
  const now = new Date().toISOString();
  if (wb) {
    db.update('wrongBook', wb.id, {
      status: 'open', resolvedAt: null, source, lastAt: now,
      lastVersionId: snapshot.versionId ?? null, lastVersionCode: snapshot.versionCode, lastSnapshot: snapshot,
      attempts: (wb.attempts || 1) + 1,
    });
  } else {
    db.insert('wrongBook', {
      userId: user.id, qcode: snapshot.qcode, status: 'open', source,
      firstAt: now, firstVersionId: snapshot.versionId ?? null,
      firstVersionCode: snapshot.versionCode, firstSnapshot: snapshot,
      lastAt: now, lastVersionId: snapshot.versionId ?? null,
      lastVersionCode: snapshot.versionCode, lastSnapshot: snapshot,
      attempts: 1, resolvedAt: null,
    });
  }
}

function finishMock(sess) {
  const answers = db.filter('answers', (a) => a.sessionId === sess.id);
  const correctCount = answers.filter((a) => a.correct).length;
  // 未答题按答错计，但不入错题本
  const allQcodes = new Set(shuffleDeterministic(db.filter('questions', (q) => q.versionId === sess.versionId), sess.id * 9973 + 17).slice(0, MOCK_TOTAL).map((q) => q.qcode));
  // 实际以 buildSession 抽题一致：重新生成可能随时间变化？seed 固定 sess.id，结果稳定
  for (const a of answers) {
    if (!a.correct) {
      const wb = db.find('wrongBook', (w) => w.userId === sess.userId && w.qcode === a.qcode);
      if (!wb) upsertWrong({ id: sess.userId }, a.snapshot, 'mock');
      else db.update('wrongBook', wb.id, {
        status: 'open', resolvedAt: null, source: 'mock', lastAt: new Date().toISOString(),
        lastVersionId: a.snapshot.versionId ?? null, lastVersionCode: a.snapshot.versionCode, lastSnapshot: a.snapshot,
        attempts: (wb.attempts || 1) + 1,
      });
    }
  }
  const score = correctCount;
  db.update('sessions', sess.id, { finishedAt: new Date().toISOString(), correctCount, score, passed: score >= PASS_SCORE });
  void allQcodes;
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
function httpError(status, msg) { return new HttpError(status, msg); }

// ---------------- 路由 ----------------
const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, pattern, handler, ...opts });

route('POST', /^\/api\/login$/, async (req, res, body) => {
  const user = db.find('users', (u) => u.username === String(body.username || '').trim());
  if (!user) throw new HttpError(401, '用户名不存在，试试 zhangxiaoming / wangxiaowen / wangqiang / coach');
  return { token: issueToken(user.id), user: safeUser(user) };
});

route('GET', /^\/api\/me$/, async (req, res, body, user) => ({ user: safeUser(user) }), { role: 'student' });

route('GET', /^\/api\/student\/home$/, async (req, res, body, user) => {
  if (user.role !== 'student') throw new HttpError(403, '学员专属接口');
  return {
    user: safeUser(user),
    version: activeVersion(),
    stats: studentStats(user.id),
    suggestion: (await import('./services.js')).reservationSuggestion(
      studentStats(user.id), weakTags(user.id)),
    openWrongSession: (() => {
      const s = findOpenSession(user.id, 'wrong', null);
      return s ? { id: s.id, total: db.filter('wrongBook', (w) => w.userId === user.id && w.status === 'open').length } : null;
    })(),
    openMock: (() => { const s = findOpenSession(user.id, 'mock', null); return s ? { id: s.id } : null; })(),
  };
}, { role: 'student' });

route('GET', /^\/api\/chapters$/, async (req, res, body, user) => {
  const stats = studentStats(user.id);
  return {
    version: activeVersion(),
    chapters: db.all('chapters').sort((a, b) => a.order - b.order).map((c) => ({
      ...c, questionCount: db.filter('questions', (q) => q.chapterId === c.id && q.versionId === activeVersion().id).length,
      progress: stats.chapterProgress.find((p) => p.chapterId === c.id),
    })),
  };
}, { role: 'student' });

route('GET', /^\/api\/wrong-book$/, async (req, res, body, user) => ({ items: wrongBookList(user.id) }), { role: 'student' });

// 创建/继续会话
route('POST', /^\/api\/sessions$/, async (req, res, body, user) => {
  const kind = body.kind;
  let sess;
  if (body.resumeId) {
    sess = db.find('sessions', (s) => s.id === body.resumeId && s.userId === user.id);
    if (!sess) throw new HttpError(404, '练习不存在');
  } else if (kind === 'chapter') {
    const ch = db.find('chapters', (c) => c.id === body.chapterId);
    if (!ch) throw new HttpError(400, '请选择章节');
    sess = findOpenSession(user.id, 'chapter', ch.id);
    if (!sess) {
      const version = activeVersion();
      sess = db.insert('sessions', {
        userId: user.id, kind, chapterId: ch.id, versionId: version.id, versionCode: version.code,
        total: db.filter('questions', (q) => q.chapterId === ch.id && q.versionId === version.id).length,
        correctCount: 0, createdAt: new Date().toISOString(), startedAt: new Date().toISOString(),
        finishedAt: null, score: null, passed: null,
      });
    }
  } else if (kind === 'wrong') {
    const openCount = db.filter('wrongBook', (w) => w.userId === user.id && w.status === 'open').length;
    if (!openCount) throw new HttpError(400, '错题本是空的，先去练点题吧～');
    sess = findOpenSession(user.id, 'wrong', null);
    if (!sess) {
      const version = activeVersion();
      sess = db.insert('sessions', {
        userId: user.id, kind, chapterId: null, versionId: version.id, versionCode: version.code,
        total: openCount, correctCount: 0, createdAt: new Date().toISOString(), startedAt: new Date().toISOString(),
        finishedAt: null, score: null, passed: null,
      });
    }
  } else if (kind === 'mock') {
    const version = activeVersion();
    const qn = db.filter('questions', (q) => q.versionId === version.id).length;
    if (qn < MOCK_TOTAL) throw new HttpError(400, `现行题库不足 ${MOCK_TOTAL} 题`);
    sess = db.insert('sessions', {
      userId: user.id, kind, chapterId: null, versionId: version.id, versionCode: version.code,
      total: MOCK_TOTAL, correctCount: 0, createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(), finishedAt: null, score: null, passed: null,
    });
  } else throw new HttpError(400, '未知练习类型');
  return buildSession(sess);
}, { role: 'student' });

route('GET', /^\/api\/sessions\/(\d+)$/, async (req, res, body, user, m) => {
  const sess = db.find('sessions', (s) => s.id === Number(m[1]) && s.userId === user.id);
  if (!sess) throw new HttpError(404, '练习不存在');
  // 模拟考超时自动交卷
  if (sess.kind === 'mock' && !sess.finishedAt &&
    Date.now() > new Date(sess.startedAt).getTime() + MOCK_SECONDS * 1000) {
    finishMock(sess);
  }
  return buildSession(sess);
}, { role: 'student' });

route('GET', /^\/api\/sessions$/, async (req, res, body, user) => ({
  sessions: db.filter('sessions', (s) => s.userId === user.id && s.finishedAt)
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .map((s) => ({ id: s.id, kind: s.kind, chapterId: s.chapterId, versionCode: s.versionCode,
      score: s.score, correctCount: s.correctCount, total: s.total, passed: s.passed, finishedAt: s.finishedAt })),
}), { role: 'student' });

// 答题：章节/错题立即返回对错与解析；模拟考只确认，不暴露答案
route('POST', /^\/api\/sessions\/(\d+)\/answers$/, async (req, res, body, user, m) => {
  const sess = db.find('sessions', (s) => s.id === Number(m[1]) && s.userId === user.id);
  if (!sess) throw new HttpError(404, '练习不存在');
  if (sess.finishedAt) throw new HttpError(400, '本次练习已结束');
  const picked = body.picked;
  if (!Array.isArray(picked) || !picked.every((x) => Number.isInteger(x))) throw new HttpError(400, '答案格式不正确');
  const result = answerInSession(sess, body.qcode, picked, user);
  if (sess.kind === 'mock') {
    // 超时保护
    if (Date.now() > new Date(sess.startedAt).getTime() + MOCK_SECONDS * 1000) {
      finishMock(sess);
      return { finished: true, correct: null, session: buildSession(sess) };
    }
    return { finished: false, correct: null };
  }
  return {
    finished: false, correct: result.correct, picked,
    answer: result.snapshot.answer, analysis: result.snapshot.analysis, law: result.snapshot.law,
  };
}, { role: 'student' });

route('POST', /^\/api\/sessions\/(\d+)\/finish$/, async (req, res, body, user, m) => {
  const sess = db.find('sessions', (s) => s.id === Number(m[1]) && s.userId === user.id);
  if (!sess) throw new HttpError(404, '练习不存在');
  if (sess.finishedAt) return buildSession(sess);
  if (sess.kind === 'mock') finishMock(sess);
  else {
    const answers = db.filter('answers', (a) => a.sessionId === sess.id);
    const correctCount = answers.filter((a) => a.correct).length;
    const wrongCount = answers.length - correctCount;
    db.update('sessions', sess.id, {
      finishedAt: new Date().toISOString(), correctCount, wrongCount,
      score: answers.length ? Math.round((correctCount / answers.length) * 100) : 0, passed: null,
    });
  }
  return buildSession(sess);
}, { role: 'student' });

// 手动标记错题已掌握
route('POST', /^\/api\/wrong-book\/(\d+)\/master$/, async (req, res, body, user, m) => {
  const w = db.find('wrongBook', (x) => x.id === Number(m[1]) && x.userId === user.id);
  if (!w) throw new HttpError(404, '错题不存在');
  db.update('wrongBook', w.id, { status: 'mastered', resolvedAt: new Date().toISOString() });
  return { ok: true };
}, { role: 'student' });

// ---------------- 教练后台 ----------------
route('GET', /^\/api\/coach\/overview$/, async () => {
  const students = db.filter('users', (u) => u.role === 'student');
  const profiles = students.map((u) => coachStudentProfile(u));
  return {
    students: profiles,
    cohortWeak: cohortWeakTags().slice(0, 10),
    version: activeVersion(),
  };
}, { role: 'coach' });

route('GET', /^\/api\/coach\/students\/(\d+)$/, async (req, res, body, user, m) => {
  const stu = db.find('users', (u) => u.id === Number(m[1]) && u.role === 'student');
  if (!stu) throw new HttpError(404, '学员不存在');
  const profile = coachStudentProfile(stu);
  const mocks = db.filter('sessions', (s) => s.userId === stu.id && s.kind === 'mock' && s.finishedAt)
    .sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))
    .map((s) => ({ at: s.finishedAt, score: s.score, passed: s.passed }));
  const chapterWrong = {};
  for (const w of db.filter('wrongBook', (x) => x.userId === stu.id && x.status === 'open')) {
    const cid = w.lastSnapshot && null;
    void cid;
    const qrow = db.find('questions', (q) => q.qcode === w.qcode);
    const chId = qrow ? qrow.chapterId : null;
    chapterWrong[chId || 'archived'] = (chapterWrong[chId || 'archived'] || 0) + 1;
  }
  return { profile, mocks, chapterWrong };
}, { role: 'coach' });

// 学员错题明细（含旧版快照）
route('GET', /^\/api\/coach\/students\/(\d+)\/wrong$/, async (req, res, body, user, m) => {
  const stuId = Number(m[1]);
  return { items: wrongBookList(stuId) };
}, { role: 'coach' });

// ---------------- 后台：题库版本管理（管理员/教练均可操作，演示用）----------------
route('GET', /^\/api\/admin\/versions$/, async () => ({
  versions: db.all('bankVersions').sort((a, b) => a.id - b.id),
}), { role: 'coach' });

// 切换现行版本（题库"更新发布"）
route('POST', /^\/api\/admin\/activate-version$/, async (req, res, body) => {
  const ver = db.find('bankVersions', (v) => v.id === body.versionId || v.code === body.code);
  if (!ver) throw new HttpError(404, '版本不存在');
  for (const v of db.all('bankVersions')) db.update('bankVersions', v.id, { active: v.id === ver.id });
  for (const q of db.all('questions')) db.update('questions', q.id, { active: q.versionId === ver.id });
  return { ok: true, activeVersion: activeVersion() };
}, { role: 'coach' });

route('GET', /^\/api\/time$/, async () => ({ now: new Date().toISOString() }));

// ---------------- HTTP 主循环 ----------------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      let body = {};
      if (req.method === 'POST') body = await readBody(req);
      const user = authUser(req);
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = url.pathname.match(r.pattern);
        if (!m) continue;
        if (r.role) {
          if (!user) return json(res, 401, { error: '请先登录' });
          if (r.role === 'coach' && user.role !== 'coach') return json(res, 403, { error: '需要教练权限' });
          if (r.role === 'student' && user.role !== 'student') return json(res, 403, { error: '需要学员账号' });
        }
        const data = await r.handler(req, res, body, user, m);
        return json(res, 200, data);
      }
      return json(res, 404, { error: '接口不存在' });
    }
    return serveStatic(url.pathname, res);
  } catch (err) {
    if (err instanceof HttpError) return json(res, err.status, { error: err.message });
    console.error(err);
    return json(res, 500, { error: '服务器内部错误' });
  }
});

// ---------------- 静态资源 ----------------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

async function serveStatic(pathname, res) {
  let path = pathname === '/' ? '/student/index.html' : pathname;
  // /coach 与 /student 目录
  if (path === '/coach') path = '/coach/index.html';
  const filePath = normalize(join(PUBLIC, path));
  if (!filePath.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  const target = existsSync(filePath) ? filePath : (() => {
    // SPA 回退
    if (pathname.startsWith('/coach')) return join(PUBLIC, 'coach/index.html');
    if (pathname.startsWith('/student')) return join(PUBLIC, 'student/index.html');
    return join(PUBLIC, 'student/index.html');
  })();
  try {
    const content = await readFile(target);
    res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}

server.listen(PORT, () => {
  console.log(`科目一模拟考试系统已启动：`);
  console.log(`  学员端(移动)  http://localhost:${PORT}/`);
  console.log(`  教练后台      http://localhost:${PORT}/coach`);
});
