const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// 开始模拟考试（随机抽取100题）
router.post('/start', authRequired, (req, res) => {
  const userId = req.user.id;
  // 随机抽取100道题（科目一考试100题）
  const questions = db.prepare(`
    SELECT q.*, c.name as chapter_name
    FROM questions q
    LEFT JOIN chapters c ON q.chapter_id = c.id
    WHERE q.is_active = 1
    ORDER BY RANDOM()
    LIMIT 100
  `).all();

  if (questions.length === 0) {
    return res.status(400).json({ error: '题库为空，无法开始考试' });
  }

  // 解析选项
  questions.forEach(q => { q.options = JSON.parse(q.options); });

  // 创建考试记录
  const result = db.prepare(`
    INSERT INTO exam_records (user_id, score, total, passed, started_at)
    VALUES (?, 0, ?, 0, datetime('now'))
  `).run(userId, questions.length);

  res.json({
    examId: result.lastInsertRowid,
    questions,
    total: questions.length,
    duration: 45 * 60, // 45分钟
  });
});

// 提交模拟考试
router.post('/:id/submit', authRequired, (req, res) => {
  const { answers, duration_seconds } = req.body;
  const examId = req.params.id;
  const userId = req.user.id;

  const exam = db.prepare('SELECT * FROM exam_records WHERE id = ? AND user_id = ?').get(examId, userId);
  if (!exam) {
    return res.status(404).json({ error: '考试记录不存在' });
  }
  if (exam.finished_at) {
    return res.status(400).json({ error: '考试已提交' });
  }

  // 计算得分
  let score = 0;
  const answerDetails = [];
  for (const [questionId, userAnswer] of Object.entries(answers)) {
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId);
    if (!question) continue;
    const isCorrect = question.answer === userAnswer;
    if (isCorrect) score++;
    answerDetails.push({
      question_id: parseInt(questionId),
      user_answer: userAnswer,
      correct_answer: question.answer,
      is_correct: isCorrect,
    });

    // 记录到练习记录
    db.prepare(`
      INSERT INTO practice_records (user_id, chapter_id, question_id, is_correct)
      VALUES (?, ?, ?, ?)
    `).run(userId, question.chapter_id, questionId, isCorrect ? 1 : 0);

    // 错题加入错题本
    if (!isCorrect) {
      const snapshot = JSON.stringify({
        id: question.id,
        chapter_id: question.chapter_id,
        type: question.type,
        content: question.content,
        options: JSON.parse(question.options),
        answer: question.answer,
        explanation: question.explanation,
        explanation_plain: question.explanation_plain,
        version: question.version,
      });
      const existing = db.prepare('SELECT * FROM wrong_questions WHERE user_id = ? AND question_id = ?').get(userId, questionId);
      if (existing) {
        db.prepare(`
          UPDATE wrong_questions
          SET wrong_count = wrong_count + 1, last_wrong_at = datetime('now'), mastered = 0, question_snapshot = ?
          WHERE user_id = ? AND question_id = ?
        `).run(snapshot, userId, questionId);
      } else {
        db.prepare(`
          INSERT INTO wrong_questions (user_id, question_id, question_snapshot, wrong_count, last_wrong_at, mastered)
          VALUES (?, ?, ?, 1, datetime('now'), 0)
        `).run(userId, questionId, snapshot);
      }
    }
  }

  const passed = score >= 90 ? 1 : 0;
  db.prepare(`
    UPDATE exam_records
    SET score = ?, passed = ?, duration_seconds = ?, answers = ?, finished_at = datetime('now')
    WHERE id = ?
  `).run(score, passed, duration_seconds || null, JSON.stringify(answerDetails), examId);

  res.json({
    score,
    total: exam.total,
    passed: !!passed,
    duration_seconds,
    answerDetails,
  });
});

// 获取考试记录列表
router.get('/records', authRequired, (req, res) => {
  const userId = req.user.id;
  const records = db.prepare(`
    SELECT id, score, total, passed, duration_seconds, started_at, finished_at
    FROM exam_records
    WHERE user_id = ?
    ORDER BY started_at DESC
  `).all(userId);
  res.json({ records });
});

// 获取单次考试详情
router.get('/:id', authRequired, (req, res) => {
  const exam = db.prepare('SELECT * FROM exam_records WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!exam) {
    return res.status(404).json({ error: '考试记录不存在' });
  }
  let answerDetails = [];
  if (exam.answers) {
    answerDetails = JSON.parse(exam.answers);
    // 补充题目详情
    answerDetails = answerDetails.map(a => {
      const q = db.prepare('SELECT q.*, c.name as chapter_name FROM questions q LEFT JOIN chapters c ON q.chapter_id = c.id WHERE q.id = ?').get(a.question_id);
      if (q) {
        q.options = JSON.parse(q.options);
        return { ...a, question: q };
      }
      return a;
    });
  }
  res.json({ exam: { ...exam, answers: answerDetails } });
});

module.exports = router;
