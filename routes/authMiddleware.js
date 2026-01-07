const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

const JWT_SECRET = config.server.jwtSecret;

function authMiddleware(req, res, next) {
  let token = null;
  const auth = req.headers.authorization;
  
  if (auth && auth.startsWith('Bearer ')) {
    token = auth.slice(7);
  } else if (req.query && req.query.token) {
    // 允许通过查询参数传递 token，主要用于 SSE (EventSource)
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: '未授权' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    
    // 如果Token包含tokenVersion，验证是否与数据库中的一致
    if (payload.tokenVersion !== undefined) {
      db.get('SELECT token_version FROM users WHERE id = ?', [payload.id], (err, user) => {
        if (err || !user) {
          return res.status(401).json({ error: '用户不存在' });
        }
        
        const currentVersion = parseInt(user.token_version, 10) || 1;
        const tokenVersion = parseInt(payload.tokenVersion, 10) || 1;
        
        if (tokenVersion !== currentVersion) {
          return res.status(401).json({ error: '密码已更改，请重新验证' });
        }
        
        req.user = payload;
        next();
      });
    } else {
      // 旧Token没有tokenVersion，直接通过（向后兼容）
      // 但为了安全，建议用户重新登录
      req.user = payload;
      next();
    }
  } catch (e) {
    return res.status(401).json({ error: '无效token' });
  }
}

module.exports = authMiddleware;
