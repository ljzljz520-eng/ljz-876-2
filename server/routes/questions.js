const express = require('express');
const db = require('../db');
const { authRequired, coachRequired } = require('../middleware/auth');

const router = express.Router();

// 获取题目列表（支持按章节、类型筛选）
router.get('/', authRequired, (req, res) => {
  const { chapter_id, type, page = 1, pageSize = 20 } = req.query;
  let where = 'WHERE q.is_active = 1';
  const params = [];
  if (chapter_id) {
    where += ' AND q.chapter_id = ?';
    params.push(chapter_id);
  }
  if (type) {
    where += ' AND q.type = ?';
    params.push(type);
  }
  const total = db.prepare(`SELECT COUNT(*) as c FROM questions q ${where}`).get(...params).c;
  const offset = (page - 1) * pageSize;
  const questions = db.prepare(`
    SELECT q.*, c.name as chapter_name
    FROM questions q
    LEFT JOIN chapters c ON q.chapter_id = c.id
    ${where}
    ORDER BY q.chapter_id, q.id
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(pageSize), offset);
  res.json({ questions, total, page: parseInt(page), pageSize: parseInt(pageSize) });
});

// 获取单道题目
router.get('/:id', authRequired, (req, res) => {
  const question = db.prepare(`
    SELECT q.*, c.name as chapter_name
    FROM questions q
    LEFT JOIN chapters c ON q.chapter_id = c.id
    WHERE q.id = ?
  `).get(req.params.id);
  if (!question) {
    return res.status(404).json({ error: '题目不存在' });
  }
  question.options = JSON.parse(question.options);
  res.json({ question });
});

// 创建题目（教练/管理员）
router.post('/', authRequired, coachRequired, (req, res) => {
  const { chapter_id, type, content, options, answer, explanation, explanation_plain } = req.body;
  if (!chapter_id || !content || !options || !answer) {
    return res.status(400).json({ error: '章节、题目内容、选项和答案不能为空' });
  }
  const optionsStr = JSON.stringify(options);
  const result = db.prepare(`
    INSERT INTO questions (chapter_id, type, content, options, answer, explanation, explanation_plain, version, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
  `).run(chapter_id, type || 'single', content, optionsStr, answer, explanation || null, explanation_plain || null);
  const questionId = result.lastInsertRowid;
  const snapshot = JSON.stringify({
    id: questionId, chapter_id, type: type || 'single', content,
    options, answer, explanation, explanation_plain, version: 1,
  });
  db.prepare(`
    INSERT INTO question_versions (question_id, version, content, options, answer, explanation, explanation_plain, snapshot)
    VALUES (?, 1, ?, ?, ?, ?, ?, ?)
  `).run(questionId, content, optionsStr, answer, explanation || null, explanation_plain || null, snapshot);
  res.json({ id: questionId, message: '题目创建成功' });
});

// 更新题目（创建新版本，保留历史）
router.put('/:id', authRequired, coachRequired, (req, res) => {
  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  if (!question) {
    return res.status(404).json({ error: '题目不存在' });
  }
  const { chapter_id, type, content, options, answer, explanation, explanation_plain } = req.body;
  const newChapterId = chapter_id || question.chapter_id;
  const newType = type || question.type;
  const newContent = content || question.content;
  const newOptions = options ? JSON.stringify(options) : question.options;
  const newAnswer = answer || question.answer;
  const newExplanation = explanation !== undefined ? explanation : question.explanation;
  const newExplanationPlain = explanation_plain !== undefined ? explanation_plain : question.explanation_plain;
  const newVersion = question.version + 1;

  const update = db.transaction(() => {
    db.prepare(`
      UPDATE questions
      SET chapter_id = ?, type = ?, content = ?, options = ?, answer = ?,
          explanation = ?, explanation_plain = ?, version = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newChapterId, newType, newContent, newOptions, newAnswer, newExplanation, newExplanationPlain, newVersion, question.id);

    const parsedOptions = options || JSON.parse(question.options);
    const snapshot = JSON.stringify({
      id: question.id, chapter_id: newChapterId, type: newType, content: newContent,
      options: parsedOptions, answer: newAnswer, explanation: newExplanation,
      explanation_plain: newExplanationPlain, version: newVersion,
    });
    db.prepare(`
      INSERT INTO question_versions (question_id, version, content, options, answer, explanation, explanation_plain, snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(question.id, newVersion, newContent, newOptions, newAnswer, newExplanation, newExplanationPlain, snapshot);
  });
  update();

  res.json({ message: '题目已更新，旧版本已保存', version: newVersion });
});

// 删除题目（软删除）
router.delete('/:id', authRequired, coachRequired, (req, res) => {
  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  if (!question) {
    return res.status(404).json({ error: '题目不存在' });
  }
  db.prepare('UPDATE questions SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
  res.json({ message: '题目已删除' });
});

// 获取题目版本历史
router.get('/:id/versions', authRequired, (req, res) => {
  const versions = db.prepare(`
    SELECT id, version, content, answer, created_at
    FROM question_versions
    WHERE question_id = ?
    ORDER BY version DESC
  `).all(req.params.id);
  res.json({ versions });
});

module.exports = router;
