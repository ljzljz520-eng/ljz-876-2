const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 静态文件
app.use(express.static(path.join(__dirname, '..', 'public')));

// API 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/chapters', require('./routes/chapters'));
app.use('/api/questions', require('./routes/questions'));
app.use('/api/practice', require('./routes/practice'));
app.use('/api/exam', require('./routes/exam'));
app.use('/api/wrong', require('./routes/wrong'));
app.use('/api/coach', require('./routes/coach'));

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 前端路由（SPA 回退）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误' });
});

// 启动时自动执行种子数据
const seedPath = path.join(__dirname, 'seed.js');
if (fs.existsSync(seedPath)) {
  try {
    require('./seed');
  } catch (err) {
    console.error('Seed error:', err.message);
  }
}

app.listen(PORT, () => {
  console.log(`驾校科目一模拟考试系统运行在 http://localhost:${PORT}`);
});

module.exports = app;
