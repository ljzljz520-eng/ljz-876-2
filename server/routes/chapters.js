const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// 获取所有章节（含题目数量和已练习数量）
router.get('/', authRequired, (req, res) => {
  const chapters = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM questions q WHERE q.chapter_id = c.id AND q.is_active = 1) as question_count,
      (SELECT COUNT(DISTINCT pr.question_id) FROM practice_records pr WHERE pr.chapter_id = c.id AND pr.user_id = ?) as practiced_count,
      (SELECT COUNT(DISTINCT wq.question_id) FROM wrong_questions wq WHERE JSON_EXTRACT(wq.question_snapshot, '$.chapter_id') = c.id AND wq.user_id = ? AND wq.mastered = 0) as wrong_count
    FROM chapters c
    ORDER BY c.sort_order
  `).all(req.user.id, req.user.id);
  res.json({ chapters });
});

// 获取章节详情
router.get('/:id', authRequired, (req, res) => {
  const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(req.params.id);
  if (!chapter) {
    return res.status(404).json({ error: '章节不存在' });
  }
  res.json({ chapter });
});

module.exports = router;
