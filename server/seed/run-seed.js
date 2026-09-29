// 初始化演示数据：题库版本 / 章节 / 账号 / 历史练习记录
// 注意：必须先删库文件，再动态导入 db 模块（静态 import 会先于 rmSync 加载旧数据）
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dbFile = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'db.json');
rmSync(dbFile, { force: true });
const { db } = await import('../db.js?t=seed');
const { questions: seedQuestions } = await import('./questions.js?t=seed');

const V1_CODE = '2021', V2_CODE = '2022';

// ---------- 题库版本 ----------
const v1 = db.insert('bankVersions', { code: V1_CODE, name: '2021版题库', releasedAt: '2021-03-01', active: false });
const v2 = db.insert('bankVersions', { code: V2_CODE, name: '2022版题库（现行）', releasedAt: '2022-04-01', active: true });

// ---------- 章节 ----------
const chapterDefs = [
  { code: 'C1', name: '道路交通安全法律、法规和规章', order: 1 },
  { code: 'C2', name: '交通信号', order: 2 },
  { code: 'C3', name: '安全行车、文明驾驶基础知识', order: 3 },
  { code: 'C4', name: '机动车驾驶操作相关基础知识', order: 4 },
];
const chapters = Object.fromEntries(chapterDefs.map((c) => [c.code, db.insert('chapters', c)]));

// ---------- 题目（按版本展开）----------
const qmap = {}; // `${qcode}|versionCode` -> 题目行
function insertQuestion(sq, version, extra = {}) {
  const row = db.insert('questions', {
    qcode: sq.qcode,
    versionId: version.id,
    versionCode: version.code,
    chapterId: chapters[sq.ch].id,
    type: sq.type,
    stem: sq.stem,
    options: sq.options,
    answer: sq.answer,
    analysis: sq.analysis,
    law: sq.law,
    tags: sq.tags,
    active: version.active,
    ...extra,
  });
  qmap[`${sq.qcode}|${version.code}`] = row;
  return row;
}
for (const sq of seedQuestions) {
  // 现行版：除"仅旧版有"的题之外都收录
  if (!sq.v1Removed) {
    const { v1: _omit, v2Only, v1Removed, ...rest } = sq;
    insertQuestion(rest, v2);
  }
  // 旧版：除"2022新增"的题之外都收录；有 v1 覆写的用旧答案/解析
  if (!sq.v2Only) {
    const { v1: override, v2Only, v1Removed, ...rest } = sq;
    insertQuestion({ ...rest, ...(override || {}) }, v1);
  }
}
db.save();

// ---------- 账号 ----------
db.insert('users', { username: 'coach', name: '李教练', role: 'coach' });
const sZhang = db.insert('users', { username: 'zhangxiaoming', name: '张小明', role: 'student' });
const sWangW = db.insert('users', { username: 'wangxiaowen', name: '王晓雯', role: 'student' });
const sWangQ = db.insert('users', { username: 'wangqiang', name: '王强', role: 'student' });

// ---------- 历史记录工具 ----------
function snapshotOf(qrow) {
  return {
    qcode: qrow.qcode, versionCode: qrow.versionCode, type: qrow.type,
    stem: qrow.stem, options: qrow.options, answer: qrow.answer,
    analysis: qrow.analysis, law: qrow.law, tags: qrow.tags,
  };
}
const eqArr = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function startSession(user, kind, version, at, chapterId = null, total) {
  return db.insert('sessions', {
    userId: user.id, kind, chapterId, versionId: version.id, versionCode: version.code,
    total, correctCount: 0, createdAt: at, startedAt: at, finishedAt: null,
    score: null, passed: null,
  });
}

function answerOne(sess, qcode, picked, at, wrongVersion = null) {
  const verCode = wrongVersion || sess.versionCode;
  const qrow = qmap[`${qcode}|${verCode}`];
  if (!qrow) throw new Error(`缺少题目 ${qcode}|${verCode}`);
  const correct = eqArr(picked, qrow.answer);
  db.insert('answers', {
    sessionId: sess.id, userId: sess.userId, qcode,
    versionId: qrow.versionId, versionCode: qrow.versionCode,
    chapterId: qrow.chapterId, picked, correct,
    snapshot: snapshotOf(qrow), answeredAt: at,
  });
  // 错题本维护
  const wb = db.find('wrongBook', (w) => w.userId === sess.userId && w.qcode === qcode);
  if (correct) {
    if (wb && wb.status === 'open') db.update('wrongBook', wb.id, { status: 'mastered', resolvedAt: at });
  } else {
    const snap = snapshotOf(qrow);
    if (wb) {
      db.update('wrongBook', wb.id, {
        status: 'open', resolvedAt: null, lastAt: at,
        lastVersionId: qrow.versionId, lastVersionCode: qrow.versionCode,
        lastSnapshot: snap, source: sess.kind, attempts: (wb.attempts || 1) + 1,
      });
    } else {
      db.insert('wrongBook', {
        userId: sess.userId, qcode, status: 'open', source: sess.kind,
        firstAt: at, firstVersionId: qrow.versionId, firstVersionCode: qrow.versionCode, firstSnapshot: snap,
        lastAt: at, lastVersionId: qrow.versionId, lastVersionCode: qrow.versionCode, lastSnapshot: snap,
        attempts: 1, resolvedAt: null,
      });
    }
  }
  return correct;
}

function finishSession(sess, at, { exam } = {}) {
  const ans = db.filter('answers', (a) => a.sessionId === sess.id);
  const correctCount = ans.filter((a) => a.correct).length;
  const patch = { finishedAt: at, correctCount, score: correctCount };
  if (exam) patch.passed = correctCount >= 90;
  db.update('sessions', sess.id, patch);
}

function wrongPick(qrow) {
  const c = qrow.answer[0];
  return [(c + 1) % qrow.options.length];
}

// 确定性洗牌
function shuffle(arr, seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function mockExam(user, seed, wrongQcodes, minCorrect, startAt, minutes) {
  const pool = db.filter('questions', (q) => q.versionCode === V2_CODE).map((q) => q.qcode);
  const shuffledPool = shuffle(pool, seed + 3);
  // 强制错题先全部放入；不足的错题名额从随机池里补，保证恰好 100-minCorrect 道答错
  const forced = [...new Set(wrongQcodes)];
  const needWrong = 100 - minCorrect;
  const fillerWrong = shuffledPool.filter((qc) => !forced.includes(qc)).slice(0, Math.max(0, needWrong - forced.length));
  const wrongSet = [...forced, ...fillerWrong];
  const correctSet = shuffledPool.filter((qc) => !wrongSet.includes(qc)).slice(0, minCorrect);
  const finalPick = shuffle([...wrongSet, ...correctSet], seed + 7);
  const sess = startSession(user, 'mock', v2, startAt, null, 100);
  const t0 = new Date(startAt).getTime();
  finalPick.forEach((qc, i) => {
    const qrow = qmap[`${qc}|${V2_CODE}`];
    const isWrong = wrongSet.includes(qc);
    const p = isWrong ? wrongPick(qrow) : qrow.answer;
    answerOne(sess, qc, p, new Date(t0 + i * 26000).toISOString());
  });
  finishSession(sess, new Date(t0 + minutes * 60000).toISOString(), { exam: true });
}

// ============================================================
// 张小明：练习扎实，模拟考 95 分 → 教练建议可预约
// ============================================================
{
  const u = sZhang;
  let s = startSession(u, 'chapter', v2, '2026-09-08T10:00:00Z', chapters.C1.id, 12);
  ['Q001','Q002','Q003','Q004','Q005','Q006','Q007','Q008','Q009','Q010','Q011','Q012']
    .forEach((qc, i) => { const q = qmap[`${qc}|${V2_CODE}`]; const wrong = ['Q005','Q008'].includes(qc);
      answerOne(s, qc, wrong ? wrongPick(q) : q.answer, `2026-09-08T10:${String(i).padStart(2,'0')}:00Z`); });
  finishSession(s, '2026-09-08T10:20:00Z');

  s = startSession(u, 'chapter', v2, '2026-09-10T19:00:00Z', chapters.C2.id, 12);
  ['Q029','Q030','Q031','Q032','Q033','Q034','Q035','Q036','Q037','Q038','Q039','Q040']
    .forEach((qc, i) => { const q = qmap[`${qc}|${V2_CODE}`]; const wrong = qc === 'Q033';
      answerOne(s, qc, wrong ? wrongPick(q) : q.answer, `2026-09-10T19:${String(i).padStart(2,'0')}:00Z`); });
  finishSession(s, '2026-09-10T19:20:00Z');

  // 错题重做：全部攻克
  s = startSession(u, 'wrong', v2, '2026-09-14T20:00:00Z', null, 3);
  [['Q005',0],['Q008',0],['Q033',0]].forEach(([qc], i) => {
    const q = qmap[`${qc}|${V2_CODE}`]; answerOne(s, qc, q.answer, `2026-09-14T20:0${i}:00Z`); });
  finishSession(s, '2026-09-14T20:05:00Z');

  mockExam(u, 101, ['Q008','Q058','Q072','Q033','Q041'], 95, '2026-09-20T13:00:00Z', 32);

  // 考后错题重做：攻克两题，Q072 仍错
  s = startSession(u, 'wrong', v2, '2026-09-25T20:00:00Z', null, 5);
  [['Q058',1],['Q008',1],['Q033',1],['Q041',1],['Q072',0]].forEach(([qc, ok], i) => {
    const q = qmap[`${qc}|${V2_CODE}`];
    answerOne(s, qc, ok ? q.answer : wrongPick(q), `2026-09-25T20:0${i}:00Z`); });
  finishSession(s, '2026-09-25T20:06:00Z');
}

// ============================================================
// 王晓雯：模拟考 76，错题集中在记分/高速/急救 → 暂不建议预约
// ============================================================
{
  const u = sWangW;
  let s = startSession(u, 'chapter', v2, '2026-09-15T12:00:00Z', chapters.C1.id, 12);
  ['Q001','Q003','Q005','Q007','Q008','Q013','Q019','Q022','Q023','Q025','Q027','Q028']
    .forEach((qc, i) => { const q = qmap[`${qc}|${V2_CODE}`]; const wrong = ['Q005','Q007','Q019','Q022'].includes(qc);
      answerOne(s, qc, wrong ? wrongPick(q) : q.answer, `2026-09-15T12:${String(i).padStart(2,'0')}:00Z`); });
  finishSession(s, '2026-09-15T12:22:00Z');

  s = startSession(u, 'chapter', v2, '2026-09-18T12:00:00Z', chapters.C3.id, 10);
  ['Q053','Q056','Q058','Q065','Q067','Q068','Q069','Q071','Q072','Q073']
    .forEach((qc, i) => { const q = qmap[`${qc}|${V2_CODE}`]; const wrong = ['Q056','Q067','Q069','Q072'].includes(qc);
      answerOne(s, qc, wrong ? wrongPick(q) : q.answer, `2026-09-18T12:${String(i).padStart(2,'0')}:00Z`); });
  finishSession(s, '2026-09-18T12:18:00Z');

  const wrongs = ['Q005','Q007','Q008','Q019','Q022','Q056','Q057','Q058','Q071','Q072',
    'Q067','Q068','Q069','Q053','Q055','Q075','Q076','Q033','Q041','Q061','Q065','Q083','Q089','Q094'];
  mockExam(u, 202, wrongs, 76, '2026-09-22T13:00:00Z', 41);

  // 错题重做：只攻克 6 题
  s = startSession(u, 'wrong', v2, '2026-09-26T12:00:00Z', null, 6);
  ['Q005','Q056','Q067','Q033','Q075','Q061'].forEach((qc, i) => {
    const q = qmap[`${qc}|${V2_CODE}`]; answerOne(s, qc, q.answer, `2026-09-26T12:0${i}:00Z`); });
  finishSession(s, '2026-09-26T12:08:00Z');
}

// ============================================================
// 王强：含 2021 旧版时期的错题（Q004/Q013 答案随新规变化、Q105 已被淘汰）
// 最近两次模拟 86/88 → 临界，教练建议再冲刺
// ============================================================
{
  const u = sWangQ;
  // 2022-03 旧版章节练习（那时现行的是 2021 版）
  let s = startSession(u, 'chapter', v1, '2022-03-10T11:00:00Z', chapters.C1.id, 10);
  ['Q001','Q002','Q003','Q004','Q005','Q006','Q007','Q008','Q013','Q105']
    .forEach((qc, i) => { const q = qmap[`${qc}|${V1_CODE}`]; const wrong = ['Q004','Q013','Q105'].includes(qc);
      answerOne(s, qc, wrong ? wrongPick(q) : q.answer, `2022-03-10T11:${String(i).padStart(2,'0')}:00Z`, V1_CODE); });
  finishSession(s, '2022-03-10T11:20:00Z');

  // 2022新规后重新练 C1：Q004/Q013 按新答案又错了，错题本快照更新到 2022 版；Q105 仍停留旧版
  s = startSession(u, 'chapter', v2, '2026-09-12T11:00:00Z', chapters.C1.id, 10);
  ['Q001','Q003','Q004','Q005','Q007','Q013','Q019','Q022','Q025','Q028']
    .forEach((qc, i) => { const q = qmap[`${qc}|${V2_CODE}`]; const wrong = ['Q004','Q007','Q013'].includes(qc);
      answerOne(s, qc, wrong ? wrongPick(q) : q.answer, `2026-09-12T11:${String(i).padStart(2,'0')}:00Z`); });
  finishSession(s, '2026-09-12T11:18:00Z');

  mockExam(u, 303, ['Q004','Q007','Q013','Q023','Q058','Q060','Q072','Q073','Q065','Q069','Q033','Q041','Q093','Q102'],
    86, '2026-09-18T13:00:00Z', 40);
  mockExam(u, 404, ['Q004','Q013','Q057','Q058','Q072','Q063','Q069','Q022','Q025','Q073','Q097','Q102'],
    88, '2026-09-27T13:00:00Z', 37);

  // 错题重做：攻克 7 题
  s = startSession(u, 'wrong', v2, '2026-09-28T19:00:00Z', null, 7);
  ['Q007','Q060','Q065','Q033','Q041','Q093','Q097'].forEach((qc, i) => {
    const q = qmap[`${qc}|${V2_CODE}`]; answerOne(s, qc, q.answer, `2026-09-28T19:0${i}:00Z`); });
  finishSession(s, '2026-09-28T19:10:00Z');
}

db.save();
console.log('种子数据完成：');
console.log('  账号: coach / zhangxiaoming / wangxiaowen / wangqiang（免密演示登录）');
console.log('  题目:', db.all('questions').length, '道（含旧版）；错题本记录:', db.all('wrongBook').length, '条');
