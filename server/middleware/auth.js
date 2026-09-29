const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'driving-school-secret-key-2024';

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

function coachRequired(req, res, next) {
  if (req.user.role !== 'coach') {
    return res.status(403).json({ error: '需要教练权限' });
  }
  next();
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { authRequired, coachRequired, signToken, JWT_SECRET };
