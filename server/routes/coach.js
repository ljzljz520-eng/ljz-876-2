const express = require('express');
const db = require('../db');
const { authRequired, coachRequired } = require('../middleware/auth');

const router = express.Router();

// 所有教练接口都需要教练权限
router.use(authRequired, coachRequired);

// 获取所有学员列表（含统计信息）
router.get('/students', (req, res) => {
  const students = db.prepare(`
    SELECT u.id, u.username, u.name, u.phone, u.created_at,
      (SELECT COUNT(*) FROM practice_records pr WHERE pr.user_id = u.id) as total_practiced,
      (SELECT COUNT(*) FROM practice_records pr WHERE pr.user_id = u.id AND pr.is_correct = 1) as total_correct,
      (SELECT COUNT(*) FROM wrong_questions wq WHERE wq.user_id = u.id AND wq.mastered = 0) as wrong_count,
      (SELECT COUNT(*) FROM exam_records er WHERE er.user_id = u.id AND er.finished_at IS NOT NULL) as exam_count,
      (SELECT er.score FROM exam_records er WHERE er.user_id = u.id AND er.finished_at IS NOT NULL ORDER BY er.score DESC LIMIT 1) as best_score,
      (SELECT er.score FROM exam_records er WHERE er.user_id = u.id AND er.finished_at IS NOT NULL ORDER BY er.started_at DESC LIMIT 1) as latest_score
    FROM users u
    WHERE u.role = 'student'
    ORDER BY u.created_at DESC
  `).all();

  const result = students.map(s => ({
    ...s,
    accuracy: s.total_practiced > 0 ? Math.round((s.total_correct / s.total_practiced) * 100) : 0,
  }));
  res.json({ students: result });
});

// 获取学员详细信息（含易错法规分析）
router.get('/students/:id', (req, res) => {
  const student = db.prepare('SELECT id, username, name, phone, created_at FROM users WHERE id = ? AND role = \'student\'').get(req.params.id);
  if (!student) {
    return res.status(404).json({ error: '学员不存在' });
  }

  // 按章节统计错误情况
  const chapterErrors = db.prepare(`
    SELECT c.id, c.name,
      COUNT(pr.id) as total_answered,
      SUM(CASE WHEN pr.is_correct = 1 THEN 1 ELSE 0 END) as correct_count,
      SUM(CASE WHEN pr.is_correct = 0 THEN 1 ELSE 0 END) as wrong_count
    FROM chapters c
    LEFT JOIN practice_records pr ON c.id = pr.chapter_id AND pr.user_id = ?
    GROUP BY c.id
    ORDER BY wrong_count DESC
  `).all(student.id);

  // 按章节统计错题本中的错题数
  const wrongByChapter = db.prepare(`
    SELECT c.id, c.name, COUNT(wq.id) as wrong_count
    FROM chapters c
    LEFT JOIN wrong_questions wq ON JSON_EXTRACT(wq.question_snapshot, '$.chapter_id') = c.id AND wq.user_id = ? AND wq.mastered = 0
    GROUP BY c.id
    ORDER BY wrong_count DESC
  `).all(student.id);

  // 找出最薄弱的章节（错误率最高）
  const weakChapters = chapterErrors
    .filter(c => c.total_answered > 0)
    .map(c => ({
      ...c,
      error_rate: c.total_answered > 0 ? Math.round((c.wrong_count / c.total_answered) * 100) : 0,
    }))
    .sort((a, b) => b.error_rate - a.error_rate);

  // 考试记录
  const examRecords = db.prepare(`
    SELECT id, score, total, passed, duration_seconds, started_at, finished_at
    FROM exam_records
    WHERE user_id = ? AND finished_at IS NOT NULL
    ORDER BY started_at DESC
    LIMIT 10
  `).all(student.id);

  // 统计
  const totalPracticed = db.prepare('SELECT COUNT(*) as c FROM practice_records WHERE user_id = ?').get(student.id).c;
  const totalCorrect = db.prepare('SELECT COUNT(*) as c FROM practice_records WHERE user_id = ? AND is_correct = 1').get(student.id).c;
  const wrongCount = db.prepare('SELECT COUNT(*) as c FROM wrong_questions WHERE user_id = ? AND mastered = 0').get(student.id).c;
  const examCount = examRecords.length;
  const passedCount = examRecords.filter(e => e.passed).length;
  const bestScore = examRecords.length > 0 ? Math.max(...examRecords.map(e => e.score)) : 0;
  const latestScore = examRecords.length > 0 ? examRecords[0].score : 0;

  // 预约考试建议
  const appointmentSuggestion = generateAppointmentSuggestion({
    totalPracticed,
    totalCorrect,
    wrongCount,
    examCount,
    passedCount,
    bestScore,
    latestScore,
    weakChapters,
  });

  res.json({
    student,
    stats: {
      totalPracticed,
      totalCorrect,
      accuracy: totalPracticed > 0 ? Math.round((totalCorrect / totalPracticed) * 100) : 0,
      wrongCount,
      examCount,
      passedCount,
      bestScore,
      latestScore,
    },
    chapterErrors,
    wrongByChapter,
    weakChapters,
    examRecords,
    appointmentSuggestion,
  });
});

// 生成预约考试建议
function generateAppointmentSuggestion(data) {
  const { totalPracticed, totalCorrect, wrongCount, examCount, passedCount, bestScore, latestScore, weakChapters } = data;
  const accuracy = totalPracticed > 0 ? (totalCorrect / totalPracticed) * 100 : 0;

  let level = 'not_ready';
  let suggestion = '';
  let recommendedDate = null;

  if (examCount === 0) {
    level = 'not_started';
    suggestion = '该学员还未参加过模拟考试，建议先完成章节练习，再进行模拟考试。';
  } else if (passedCount > 0 && latestScore >= 95) {
    level = 'ready';
    suggestion = '该学员已通过模拟考试且成绩优秀，可以预约正式考试。建议继续保持，考前再复习一遍错题。';
    // 建议7天后
    const date = new Date();
    date.setDate(date.getDate() + 7);
    recommendedDate = date.toISOString().split('T')[0];
  } else if (passedCount > 0 && latestScore >= 90) {
    level = 'likely_ready';
    suggestion = '该学员已通过模拟考试，成绩达到合格线。建议再巩固薄弱章节，然后预约考试。';
    const date = new Date();
    date.setDate(date.getDate() + 10);
    recommendedDate = date.toISOString().split('T')[0];
  } else if (bestScore >= 80) {
    level = 'needs_practice';
    suggestion = '该学员模拟考试成绩接近合格线，需要重点复习薄弱章节和错题，建议加强练习后再预约考试。';
    const date = new Date();
    date.setDate(date.getDate() + 14);
    recommendedDate = date.toISOString().split('T')[0];
  } else {
    level = 'not_ready';
    suggestion = '该学员模拟考试成绩不理想，建议系统复习所有章节，重点攻克错题，暂不建议预约考试。';
    const date = new Date();
    date.setDate(date.getDate() + 30);
    recommendedDate = date.toISOString().split('T')[0];
  }

  // 薄弱章节提醒
  const weakNames = weakChapters.filter(c => c.error_rate >= 30).slice(0, 3).map(c => c.name);
  if (weakNames.length > 0) {
    suggestion += ` 重点薄弱章节：${weakNames.join('、')}。`;
  }

  return { level, suggestion, recommendedDate };
}

// 获取学员的错题详情（带快照）
router.get('/students/:id/wrong-questions', (req, res) => {
  const student = db.prepare('SELECT id FROM users WHERE id = ? AND role = \'student\'').get(req.params.id);
  if (!student) {
    return res.status(404).json({ error: '学员不存在' });
  }
  const wrongQuestions = db.prepare(`
    SELECT wq.*, c.name as chapter_name
    FROM wrong_questions wq
    LEFT JOIN chapters c ON JSON_EXTRACT(wq.question_snapshot, '$.chapter_id') = c.id
    WHERE wq.user_id = ?
    ORDER BY wq.last_wrong_at DESC
  `).all(student.id);
  const result = wrongQuestions.map(wq => ({
    ...wq,
    question: JSON.parse(wq.question_snapshot),
  }));
  res.json({ wrongQuestions: result });
});

// 创建/更新预约考试建议
router.post('/students/:id/appointment', (req, res) => {
  const { suggested_date, coach_note, status } = req.body;
  const student = db.prepare('SELECT id FROM users WHERE id = ? AND role = \'student\'').get(req.params.id);
  if (!student) {
    return res.status(404).json({ error: '学员不存在' });
  }
  const existing = db.prepare('SELECT * FROM exam_appointments WHERE user_id = ? AND status != \'cancelled\' ORDER BY created_at DESC LIMIT 1').get(student.id);
  if (existing) {
    db.prepare(`
      UPDATE exam_appointments
      SET suggested_date = ?, coach_note = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(suggested_date || null, coach_note || null, status || 'suggested', existing.id);
    res.json({ message: '预约建议已更新', id: existing.id });
  } else {
    const result = db.prepare(`
      INSERT INTO exam_appointments (user_id, status, suggested_date, coach_note)
      VALUES (?, ?, ?, ?)
    `).run(student.id, status || 'suggested', suggested_date || null, coach_note || null);
    res.json({ message: '预约建议已创建', id: result.lastInsertRowid });
  }
});

// 获取所有预约列表
router.get('/appointments', (req, res) => {
  const appointments = db.prepare(`
    SELECT ea.*, u.name as student_name, u.phone as student_phone
    FROM exam_appointments ea
    LEFT JOIN users u ON ea.user_id = u.id
    ORDER BY ea.created_at DESC
  `).all();
  res.json({ appointments });
});

// 更新预约状态
router.put('/appointments/:id', (req, res) => {
  const { status, student_note } = req.body;
  const appointment = db.prepare('SELECT * FROM exam_appointments WHERE id = ?').get(req.params.id);
  if (!appointment) {
    return res.status(404).json({ error: '预约不存在' });
  }
  db.prepare(`
    UPDATE exam_appointments
    SET status = COALESCE(?, status), student_note = COALESCE(?, student_note), updated_at = datetime('now')
    WHERE id = ?
  `).run(status || null, student_note || null, req.params.id);
  res.json({ message: '预约已更新' });
});

// 获取全局统计（仪表盘）
router.get('/stats/overview', (req, res) => {
  const totalStudents = db.prepare('SELECT COUNT(*) as c FROM users WHERE role = \'student\'').get().c;
  const totalQuestions = db.prepare('SELECT COUNT(*) as c FROM questions WHERE is_active = 1').get().c;
  const totalExams = db.prepare('SELECT COUNT(*) as c FROM exam_records WHERE finished_at IS NOT NULL').get().c;
  const passedExams = db.prepare('SELECT COUNT(*) as c FROM exam_records WHERE passed = 1 AND finished_at IS NOT NULL').get().c;
  const avgScore = db.prepare('SELECT AVG(score) as avg FROM exam_records WHERE finished_at IS NOT NULL').get().avg;
  const totalWrong = db.prepare('SELECT COUNT(*) as c FROM wrong_questions WHERE mastered = 0').get().c;

  // 各章节错误率统计
  const chapterErrorRates = db.prepare(`
    SELECT c.id, c.name,
      COUNT(pr.id) as total_answered,
      SUM(CASE WHEN pr.is_correct = 0 THEN 1 ELSE 0 END) as wrong_count
    FROM chapters c
    LEFT JOIN practice_records pr ON c.id = pr.chapter_id
    GROUP BY c.id
    ORDER BY wrong_count DESC
  `).all();

  res.json({
    totalStudents,
    totalQuestions,
    totalExams,
    passedExams,
    passRate: totalExams > 0 ? Math.round((passedExams / totalExams) * 100) : 0,
    avgScore: avgScore ? Math.round(avgScore) : 0,
    totalWrong,
    chapterErrorRates,
  });
});

module.exports = router;
