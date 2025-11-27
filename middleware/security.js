const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const sanitizeHtml = require('sanitize-html');

// 通用限流器
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 500, // 限制500个请求（放宽限制）
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // 跳过GET请求的限流（仅限制POST/PUT/DELETE等修改操作）
    return req.method === 'GET';
  },
});

// 登录限流器（更严格）
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 限制5次登录尝试
  message: { error: '登录尝试次数过多，请15分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // 成功的请求不计入
});

// 备份操作限流器
const backupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 10, // 限制10次备份操作
  message: { error: '备份操作过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 文件上传限流器
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 50, // 限制50次上传
  message: { error: '上传过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 壁纸切换限流器
const wallpaperLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 6, // 限制6次切换
  message: { 
    success: false,
    error: '壁纸切换过于频繁，请稍后再试（每分钟最多6次）' 
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Helmet安全配置
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Vue需要
      imgSrc: ["'self'", "data:", "https:", "http:", "blob:"],
      connectSrc: ["'self'", "https:", "http:"], // 允许所有 HTTP/HTTPS 连接
      fontSrc: ["'self'", "data:", "https:"], // 允许加载 CDN 字体
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      frameAncestors: ["'self'", "chrome-extension:", "moz-extension:"], // 允许浏览器扩展嵌入
      upgradeInsecureRequests: null, // 禁止自动升级到 HTTPS
    },
  },
  crossOriginEmbedderPolicy: false, // 允许跨域嵌入
  crossOriginOpenerPolicy: false,   // 禁用COOP（需要HTTPS）
  crossOriginResourcePolicy: { policy: "cross-origin" },
  originAgentCluster: false,        // 禁用Origin-Agent-Cluster（避免HTTP警告）
  // 完全禁用 HSTS (仅保留一个配置)
  strictTransportSecurity: false,
  // 禁用 frameguard，允许所有来源嵌入（包括浏览器扩展）
  // 对于导航站风险很小，因为：
  // 1. 前台是公开的导航页，无敏感操作
  // 2. 后台管理需要 JWT token 认证
  // 3. 所有修改操作都有 CSRF 保护
  frameguard: false,
});

// HTML清理函数
function sanitizeInput(input) {
  if (typeof input === 'string') {
    return sanitizeHtml(input, {
      allowedTags: [], // 不允许任何HTML标签
      allowedAttributes: {},
    }).trim();
  }
  return input;
}

// 递归清理对象中的所有字符串
function sanitizeObject(obj, skipFields = []) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitized = Array.isArray(obj) ? [] : {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      // 跳过指定字段的清理
      if (skipFields.includes(key)) {
        sanitized[key] = value;
      } else if (typeof value === 'string') {
        sanitized[key] = sanitizeInput(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value, skipFields);
      } else {
        sanitized[key] = value;
      }
    }
  }
  
  return sanitized;
}

// 输入清理中间件
const sanitizeMiddleware = (req, res, next) => {
  // 跳过清理的字段
  const skipFields = [];
  
  if (req.body) {
    req.body = sanitizeObject(req.body, skipFields);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query, skipFields);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params, skipFields);
  }
  next();
};

// 密码强度验证
function validatePasswordStrength(password) {
  if (!password || password.length < 8) {
    return { valid: false, message: '密码长度至少8位' };
  }
  if (password.length > 128) {
    return { valid: false, message: '密码长度不能超过128位' };
  }
  
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\;'/`~]/.test(password);
  
  const strength = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar].filter(Boolean).length;
  
  if (strength < 3) {
    return {
      valid: false,
      message: '密码必须包含以下至少3种：大写字母、小写字母、数字、特殊字符'
    };
  }
  
  return { valid: true };
}

// 用户名验证
function validateUsername(username) {
  if (!username || username.length < 3 || username.length > 20) {
    return { valid: false, message: '用户名长度必须在3-20位之间' };
  }
  
  // 只允许字母、数字、下划线
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { valid: false, message: '用户名只能包含字母、数字和下划线' };
  }
  
  return { valid: true };
}

// URL验证
function validateUrl(url) {
  if (!url) return { valid: false, message: 'URL不能为空' };
  
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, message: 'URL必须是http或https协议' };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, message: 'URL格式无效' };
  }
}

module.exports = {
  generalLimiter,
  loginLimiter,
  backupLimiter,
  uploadLimiter,
  wallpaperLimiter,
  helmetConfig,
  sanitizeMiddleware,
  validatePasswordStrength,
  validateUsername,
  validateUrl,
  sanitizeInput,
};
