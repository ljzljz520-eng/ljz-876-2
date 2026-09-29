const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// 获取错题本（支持按章节筛选）
router.get('/', authRequired, (req, res) => {
  const { chapter_id, mastered } = req.query;
  const userId = req.user.id;
  let where = 'WHERE wq.user_id = ?';
  const params = [userId];
  if (chapter_id) {
    where += ' AND JSON_EXTRACT(wq.question_snapshot, \'$.chapter_id\') = ?';
    params.push(chapter_id);
  }
  if (mastered !== undefined) {
    where += ' AND wq.mastered = ?';
    params.push(mastered === 'true' ? 1 : 0);
  }
  const wrongQuestions = db.prepare(`
    SELECT wq.*, c.name as chapter_name
    FROM wrong_questions wq
    LEFT JOIN chapters c ON JSON_EXTRACT(wq.question_snapshot, '$.chapter_id') = c.id
    ${where}
    ORDER BY wq.last_wrong_at DESC
  `).all(...params);

  // 解析快照
  const result = wrongQuestions.map(wq => ({
    ...wq,
    question: JSON.parse(wq.question_snapshot),
  }));
  res.json({ wrongQuestions: result });
});

// 错题重做 - 标记为已掌握
router.post('/:id/master', authRequired, (req, res) => {
  const userId = req.user.id;
  const wrong = db.prepare('SELECT * FROM wrong_questions WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!wrong) {
    return res.status(404).json({ error: '错题记录不存在' });
  }
  db.prepare('UPDATE wrong_questions SET mastered = 1 WHERE id = ?').run(req.params.id);
  res.json({ message: '已标记为掌握' });
});

// 错题重做 - 取消掌握
router.post('/:id/unmaster', authRequired, (req, res) => {
  const userId = req.user.id;
  const wrong = db.prepare('SELECT * FROM wrong_questions WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!wrong) {
    return res.status(404).json({ error: '错题记录不存在' });
  }
  db.prepare('UPDATE wrong_questions SET mastered = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: '已取消掌握' });
});

// 从错题本移除
router.delete('/:id', authRequired, (req, res) => {
  const userId = req.user.id;
  const wrong = db.prepare('SELECT * FROM wrong_questions WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!wrong) {
    return res.status(404).json({ error: '错题记录不存在' });
  }
  db.prepare('DELETE FROM wrong_questions WHERE id = ?').run(req.params.id);
  res.json({ message: '已从错题本移除' });
});

// 错题重做 - 记录重做结果
router.post('/:id/redo', authRequired, (req, res) => {
  const { is_correct } = req.body;
  const userId = req.user.id;
  const wrong = db.prepare('SELECT * FROM wrong_questions WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!wrong) {
    return res.status(404).json({ error: '错题记录不存在' });
  }
  const snapshot = JSON.parse(wrong.question_snapshot);
  // 记录练习
  db.prepare(`
    INSERT INTO practice_records (user_id, chapter_id, question_id, is_correct)
    VALUES (?, ?, ?, ?)
  `).run(userId, snapshot.chapter_id, wrong.question_id, is_correct ? 1 : 0);

  if (is_correct) {
    // 做对了，标记为掌握
    db.prepare('UPDATE wrong_questions SET mastered = 1 WHERE id = ?').run(req.params.id);
  } else {
    // 又做错了，增加错误次数
    db.prepare(`
      UPDATE wrong_questions
      SET wrong_count = wrong_count + 1, last_wrong_at = datetime('now'), mastered = 0
      WHERE id = ?
    `).run(req.params.id);
  }
  res.json({ message: '已记录' });
});

module.exports = router;
