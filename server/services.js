// 业务逻辑：章节进度 / 易错法规聚合 / 预约考试建议规则引擎
import { db } from './db.js';

export const PASS_SCORE = 90;
export const MOCK_TOTAL = 100;
export const MOCK_SECONDS = 45 * 60;

export function activeVersion() {
  return db.find('bankVersions', (v) => v.active) || db.all('bankVersions').at(-1);
}

export function publicQuestion(qrow) {
  // 下发给学员时不带正确答案（交卷/单题反馈时另给）
  return {
    id: qrow.id, qcode: qrow.qcode, versionCode: qrow.versionCode,
    chapterId: qrow.chapterId, type: qrow.type, stem: qrow.stem, options: qrow.options,
  };
}

export function shuffleDeterministic(arr, seed = Date.now()) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const eqArr = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
export { eqArr };

export function questionSnapshot(qrow) {
  return {
    qcode: qrow.qcode, versionCode: qrow.versionCode, versionId: qrow.versionId,
    type: qrow.type, stem: qrow.stem, options: qrow.options, answer: qrow.answer,
    analysis: qrow.analysis, law: qrow.law, tags: qrow.tags,
  };
}

// 学员首页统计
export function studentStats(userId) {
  const sessions = db.filter('sessions', (s) => s.userId === userId);
  const finished = sessions.filter((s) => s.finishedAt);
  const mocks = finished.filter((s) => s.kind === 'mock').sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  const wb = db.filter('wrongBook', (w) => w.userId === userId);
  const open = wb.filter((w) => w.status === 'open');
  const mastered = wb.length - open.length;

  // 章节进度：按现行版题量统计该章练过（去重题）的覆盖率与正确率
  const version = activeVersion();
  const chapterProgress = db.all('chapters').sort((a, b) => a.order - b.order).map((ch) => {
    const total = db.filter('questions', (q) => q.chapterId === ch.id && q.versionId === version.id).length;
    const seen = new Set();
    let correct = 0, answered = 0;
    for (const a of db.filter('answers', (x) => x.userId === userId && x.chapterId === ch.id)) {
      if (a.versionCode !== version.code) continue;
      seen.add(a.qcode);
      answered++;
      if (a.correct) correct++;
    }
    return {
      chapterId: ch.id, code: ch.code, name: ch.name, total, done: seen.size,
      coverage: total ? Math.round((seen.size / total) * 100) : 0,
      accuracy: answered ? Math.round((correct / answered) * 100) : null,
    };
  });

  const last7 = Date.now() - 7 * 864e5;
  const recentAnswers = db.filter('answers', (a) => a.userId === userId && new Date(a.answeredAt).getTime() >= last7);

  return {
    totalAnswered: db.filter('answers', (a) => a.userId === userId).length,
    recent7d: recentAnswers.length,
    wrongOpen: open.length,
    wrongMastered: mastered,
    chapterProgress,
    mockCount: mocks.length,
    latestMock: mocks[0] ? { score: mocks[0].score, passed: mocks[0].passed, at: mocks[0].finishedAt } : null,
    mockHistory: mocks.map((m) => ({ score: m.score, passed: m.passed, at: m.finishedAt })),
  };
}

// 错题本：优先展示最新版快照；已被淘汰/变更的题保留当时快照并打标
export function wrongBookList(userId) {
  const version = activeVersion();
  return db.filter('wrongBook', (w) => w.userId === userId)
    .sort((a, b) => (a.status === b.status ? b.lastAt.localeCompare(a.lastAt) : a.status === 'open' ? -1 : 1))
    .map((w) => {
      const current = db.find('questions', (q) => q.qcode === w.qcode && q.versionId === version.id);
      let state = 'current';
      if (!current) state = 'removed';                       // 现行题库已无此题
      else if (current.stem !== (w.lastSnapshot?.stem || '') && w.lastVersionCode !== version.code) state = 'changed';
      else if (w.lastVersionCode && w.lastVersionCode !== version.code) state = 'updated';
      return {
        id: w.id, qcode: w.qcode, status: w.status, attempts: w.attempts,
        firstAt: w.firstAt, lastAt: w.lastAt, source: w.source,
        answeredVersion: w.lastVersionCode,
        chapterId: w.lastSnapshot ? chapterIdByCode(w.qcode, version) : null,
        snapshot: w.lastSnapshot,           // 答题当时的题目内容（含答案解析）——旧题回看核心
        firstSnapshot: w.firstSnapshot,
        state,                              // current / updated / changed / removed
        currentExists: !!current,
      };
    });
}

// 取现行版章节 id（旧版题若已删除则回退查第一次答错时的快照无法定位章节，用答案记录补）
function chapterIdByCode(qcode, version) {
  const q = db.find('questions', (x) => x.qcode === qcode && x.versionId === version.id);
  if (q) return q.chapterId;
  return null;
}

// 个人易错法规标签聚合（基于现行版未攻克错题 + 近期错误记录）
export function weakTags(userId, { days = 45 } = {}) {
  const since = Date.now() - days * 864e5;
  const tally = new Map(); // tag -> {wrong, total}
  const bump = (tags, correct) => {
    for (const t of tags || []) {
      if (!tally.has(t)) tally.set(t, { tag: t, wrong: 0, total: 0 });
      const row = tally.get(t);
      row.total++;
      if (!correct) row.wrong++;
    }
  };
  for (const a of db.filter('answers', (x) => x.userId === userId && new Date(x.answeredAt).getTime() >= since)) {
    bump(a.snapshot?.tags, a.correct);
  }
  // 未攻克错题即使发生较早也计入
  for (const w of db.filter('wrongBook', (x) => x.userId === userId && x.status === 'open')) {
    if (!w.lastSnapshot) continue;
    for (const t of w.lastSnapshot.tags || []) {
      if (!tally.has(t)) tally.set(t, { tag: t, wrong: 0, total: 0 });
    }
  }
  return [...tally.values()]
    .filter((t) => t.wrong > 0)
    .map((t) => ({ ...t, rate: t.total ? Math.round((t.wrong / t.total) * 100) : 100 }))
    .sort((a, b) => b.wrong - a.wrong || b.rate - a.rate);
}

// 教练班内"大家普遍错"的法规
export function cohortWeakTags() {
  const tally = new Map();
  for (const a of db.all('answers')) {
    if (a.correct) continue;
    for (const t of a.snapshot?.tags || []) {
      if (!tally.has(t)) tally.set(t, { tag: t, wrong: 0, students: new Set() });
      const row = tally.get(t);
      row.wrong++;
      row.students.add(a.userId);
    }
  }
  return [...tally.values()]
    .map((t) => ({ tag: t.tag, wrong: t.wrong, students: t.students.size }))
    .sort((a, b) => b.wrong - a.wrong);
}

// 教练视角：学员完整画像 + 预约建议
export function coachStudentProfile(user) {
  const stats = studentStats(user.id);
  const weak = weakTags(user.id);
  const suggestion = reservationSuggestion(stats, weak);
  return {
    id: user.id, name: user.name, username: user.username,
    ...stats,
    weakTags: weak.slice(0, 8),
    suggestion,
  };
}

// —— 预约考试建议规则引擎（讲人话、给出依据）——
export function reservationSuggestion(stats, weak) {
  const mocks = stats.mockHistory;
  const latest = mocks[0];
  const passCount = mocks.filter((m) => m.passed).length;
  const recentTwo = mocks.slice(0, 2);
  const recentAvg = recentTwo.length ? Math.round(recentTwo.reduce((s, m) => s + m.score, 0) / recentTwo.length) : null;
  const openCount = stats.wrongOpen;
  const coverageAll = stats.chapterProgress.every((c) => c.coverage >= 80);
  const weakTop = weak.slice(0, 3).map((w) => w.tag);

  // 1) 最近一次≥90 且近两次平均≥90 且开放错题≤5
  if (latest && latest.passed && recentAvg >= 90 && openCount <= 5) {
    return {
      level: 'go',
      title: '建议近期预约考试',
      detail: `最近模拟考 ${latest.score} 分，近两次平均 ${recentAvg} 分，错题本只剩 ${openCount} 道未攻克，状态稳定。可按考场排期尽快预约。`,
      actions: openCount ? [`考前把剩下的 ${openCount} 道错题再过一遍`] : ['保持每天 1 套题维持手感'],
    };
  }
  // 2) 最近一次及格但整体不稳
  if (latest && latest.passed) {
    return {
      level: 'watch',
      title: '可以预约，但建议再稳一稳',
      detail: `最近模拟考 ${latest.score} 分已过线，但仍有 ${openCount} 道错题未攻克，成绩可能波动。`,
      actions: [`针对薄弱法规（${weakTop.join('、') || '错题本'}）再练 2-3 天`, '把错题全部重做至正确后再约考'],
    };
  }
  // 3) 85-89 临界冲刺
  if (latest && latest.score >= 85) {
    return {
      level: 'hold',
      title: '临近及格，建议再冲刺 3-5 天后预约',
      detail: `最近模拟考 ${latest.score} 分，距 90 分及格线还差 ${90 - latest.score} 分，主要栽在「${weakTop.join('、')}」。把这些章节的题刷穿，提升空间很大。`,
      actions: [`集中攻克 ${openCount} 道未掌握错题`, `重点重练：${weakTop.join('、')}`, '连续 2 套模拟考稳定 90+ 再预约'],
    };
  }
  // 4) 差距较大
  if (latest) {
    return {
      level: 'stop',
      title: '暂不建议预约，先系统复习',
      detail: `最近模拟考仅 ${latest.score} 分，未掌握错题 ${openCount} 道，基础还不牢，现在约考大概率挂科（浪费一次考试机会）。`,
      actions: [coverageAll ? '' : '先按章节把题刷完一遍（当前有章节覆盖率不足 80%）',
        `优先补「${weakTop.join('、')}」相关法规`, '错题反复重做，连续 2 套模拟 90 分以上再约'].filter(Boolean),
    };
  }
  // 5) 还没考过模拟
  return {
    level: 'none',
    title: '尚未参加全真模拟',
    detail: coverageAll ? '章节练习已基本覆盖，建议尽快做一次 45 分钟全真模拟，看看真实水平。'
      : '章节练习还没刷完，先完成各章节练习再做全真模拟。',
    actions: ['完成一次 100 题全真模拟'],
  };
}
