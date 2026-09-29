const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// 获取章节练习题目（按顺序，可指定数量）
router.get('/chapter/:chapterId', authRequired, (req, res) => {
  const { chapterId } = req.params;
  const { limit = 20, offset = 0 } = req.query;
  const questions = db.prepare(`
    SELECT q.*, c.name as chapter_name
    FROM questions q
    LEFT JOIN chapters c ON q.chapter_id = c.id
    WHERE q.chapter_id = ? AND q.is_active = 1
    ORDER BY q.id
    LIMIT ? OFFSET ?
  `).all(chapterId, parseInt(limit), parseInt(offset));
  const total = db.prepare('SELECT COUNT(*) as c FROM questions WHERE chapter_id = ? AND is_active = 1').get(chapterId).c;
  // Parse options
  questions.forEach(q => { q.options = JSON.parse(q.options); });
  res.json({ questions, total });
});

// 记录练习答题结果
router.post('/answer', authRequired, (req, res) => {
  const { question_id, chapter_id, is_correct } = req.body;
  if (question_id === undefined || chapter_id === undefined || is_correct === undefined) {
    return res.status(400).json({ error: '参数不完整' });
  }
  const userId = req.user.id;

  // 记录练习历史
  db.prepare(`
    INSERT INTO practice_records (user_id, chapter_id, question_id, is_correct)
    VALUES (?, ?, ?, ?)
  `).run(userId, chapter_id, question_id, is_correct ? 1 : 0);

  // 如果答错了，加入错题本（带快照）
  if (!is_correct) {
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(question_id);
    if (question) {
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
      const existing = db.prepare('SELECT * FROM wrong_questions WHERE user_id = ? AND question_id = ?').get(userId, question_id);
      if (existing) {
        db.prepare(`
          UPDATE wrong_questions
          SET wrong_count = wrong_count + 1,
              last_wrong_at = datetime('now'),
              mastered = 0,
              question_snapshot = ?
          WHERE user_id = ? AND question_id = ?
        `).run(snapshot, userId, question_id);
      } else {
        db.prepare(`
          INSERT INTO wrong_questions (user_id, question_id, question_snapshot, wrong_count, last_wrong_at, mastered)
          VALUES (?, ?, ?, 1, datetime('now'), 0)
        `).run(userId, question_id, snapshot);
      }
    }
  }

  res.json({ message: '已记录' });
});

// 获取练习统计
router.get('/stats', authRequired, (req, res) => {
  const userId = req.user.id;
  const totalPracticed = db.prepare('SELECT COUNT(*) as c FROM practice_records WHERE user_id = ?').get(userId).c;
  const totalCorrect = db.prepare('SELECT COUNT(*) as c FROM practice_records WHERE user_id = ? AND is_correct = 1').get(userId).c;
  const wrongCount = db.prepare('SELECT COUNT(*) as c FROM wrong_questions WHERE user_id = ? AND mastered = 0').get(userId).c;
  const masteredCount = db.prepare('SELECT COUNT(*) as c FROM wrong_questions WHERE user_id = ? AND mastered = 1').get(userId).c;
  const chapterStats = db.prepare(`
    SELECT c.id, c.name,
      COUNT(pr.id) as practiced_count,
      SUM(CASE WHEN pr.is_correct = 1 THEN 1 ELSE 0 END) as correct_count
    FROM chapters c
    LEFT JOIN practice_records pr ON c.id = pr.chapter_id AND pr.user_id = ?
    GROUP BY c.id
    ORDER BY c.sort_order
  `).all(userId);
  res.json({
    totalPracticed,
    totalCorrect,
    accuracy: totalPracticed > 0 ? Math.round((totalCorrect / totalPracticed) * 100) : 0,
    wrongCount,
    masteredCount,
    chapterStats,
  });
});

module.exports = router;
