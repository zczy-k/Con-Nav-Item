const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const { createClient } = require('webdav');
const { decryptWebDAVConfig } = require('../utils/crypto');

const JWT_SECRET = config.server.jwtSecret;

// 书签备份存储目录
const BOOKMARKS_DIR = path.join(__dirname, '..', 'backups', 'bookmarks');
const WEBDAV_BOOKMARK_DIR = '/Con-Nav-Item-Backups/bookmarks';

// 备份保留策略
const BACKUP_RETENTION = {
    auto: 10,      // 自动备份保留10个
    daily: 7,      // 每日备份保留7天
    weekly: 4,     // 每周备份保留4周
    monthly: 3,    // 每月备份保留3个月
    manual: 20     // 手动备份保留20个
};

// 允许的备份类型
const ALLOWED_BACKUP_TYPES = ['auto', 'daily', 'weekly', 'monthly', 'manual'];

// 最大书签数量限制（防止恶意大数据攻击）
const MAX_BOOKMARKS = 50000;
const MAX_BOOKMARK_DEPTH = 20;

// 确保目录存在
function ensureDir() {
    if (!fs.existsSync(BOOKMARKS_DIR)) {
        fs.mkdirSync(BOOKMARKS_DIR, { recursive: true });
    }
}

// ==================== 安全验证函数 ====================

// 清理设备名称（严格过滤，只允许安全字符）
function sanitizeDeviceName(name) {
    if (!name || typeof name !== 'string') return 'unknown';
    // 只允许：字母、数字、中文、下划线、连字符
    // 移除所有特殊字符、HTML标签、脚本等
    return name
        .replace(/<[^>]*>/g, '')  // 移除HTML标签
        .replace(/[<>\"\'&;\\\/\`\$\{\}\[\]\(\)]/g, '')  // 移除危险字符
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_\-\s]/g, '_')  // 只保留安全字符
        .replace(/\s+/g, '_')  // 空格转下划线
        .replace(/_+/g, '_')  // 合并多个下划线
        .trim()
        .slice(0, 30) || 'unknown';  // 限制长度
}

// 验证备份类型
function validateBackupType(type) {
    if (!type || typeof type !== 'string') return 'manual';
    return ALLOWED_BACKUP_TYPES.includes(type) ? type : 'manual';
}

// 验证书签数据结构（防止恶意数据注入）
function validateBookmarkData(bookmarks, depth = 0) {
    if (!Array.isArray(bookmarks)) return { valid: false, error: '书签数据必须是数组' };
    if (depth > MAX_BOOKMARK_DEPTH) return { valid: false, error: '书签层级过深' };
    
    let totalCount = 0;
    
    for (const item of bookmarks) {
        if (typeof item !== 'object' || item === null) {
            return { valid: false, error: '书签项格式无效' };
        }
        
        // 验证必要字段类型
        if (item.title !== undefined && typeof item.title !== 'string') {
            return { valid: false, error: '书签标题必须是字符串' };
        }
        if (item.url !== undefined && typeof item.url !== 'string') {
            return { valid: false, error: '书签URL必须是字符串' };
        }
        if (item.id !== undefined && typeof item.id !== 'string') {
            return { valid: false, error: '书签ID必须是字符串' };
        }
        
        // 验证URL格式（如果存在）
        if (item.url) {
            try {
                const url = new URL(item.url);
                // 只允许安全协议
                if (!['http:', 'https:', 'file:', 'ftp:'].includes(url.protocol)) {
                    // 跳过不安全协议的书签，但不阻止整个备份
                    item.url = '';
                }
            } catch (e) {
                // URL格式无效，清空
                item.url = '';
            }
        }
        
        // 清理标题中的潜在XSS
        if (item.title) {
            item.title = item.title
                .replace(/<[^>]*>/g, '')
                .replace(/[<>]/g, '')
                .slice(0, 500);
        }
        
        totalCount++;
        if (totalCount > MAX_BOOKMARKS) {
            return { valid: false, error: `书签数量超过限制（最大${MAX_BOOKMARKS}个）` };
        }
        
        // 递归验证子节点
        if (item.children) {
            if (!Array.isArray(item.children)) {
                return { valid: false, error: '子书签必须是数组' };
            }
            const childResult = validateBookmarkData(item.children, depth + 1);
            if (!childResult.valid) return childResult;
            totalCount += childResult.count;
        }
    }
    
    return { valid: true, count: totalCount };
}

// 验证文件名安全性
function isValidFilename(filename) {
    if (!filename || typeof filename !== 'string') return false;
    // 只允许：字母、数字、中文、下划线、连字符、点
    // 禁止路径遍历
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return false;
    }
    return /^[a-zA-Z0-9\u4e00-\u9fa5_\-\.]+\.json$/.test(filename);
}

// 计算书签数据的哈希值（用于去重）
function calculateBookmarkHash(bookmarks) {
    const urls = [];
    function collectUrls(nodes) {
        for (const node of nodes) {
            if (node.children) {
                collectUrls(node.children);
            } else if (node.url) {
                urls.push(node.url);
            }
        }
    }
    collectUrls(bookmarks);
    urls.sort();
    return crypto.createHash('md5').update(urls.join('|')).digest('hex').slice(0, 16);
}

// 获取最近一次备份的哈希值
function getLastBackupHash(deviceName) {
    try {
        ensureDir();
        const safeDeviceName = sanitizeDeviceName(deviceName);
        const files = fs.readdirSync(BOOKMARKS_DIR)
            .filter(f => f.endsWith('.json') && f.includes(`-${safeDeviceName}-`))
            .sort((a, b) => {
                // 按修改时间排序，最新的在前
                const statA = fs.statSync(path.join(BOOKMARKS_DIR, a));
                const statB = fs.statSync(path.join(BOOKMARKS_DIR, b));
                return statB.mtime.getTime() - statA.mtime.getTime();
            });
        
        if (files.length === 0) {
            console.log(`[书签备份] 未找到设备 ${safeDeviceName} 的历史备份`);
            return null;
        }
        
        const lastFile = path.join(BOOKMARKS_DIR, files[0]);
        const data = JSON.parse(fs.readFileSync(lastFile, 'utf-8'));
        console.log(`[书签备份] 上次备份: ${files[0]}, 哈希: ${data.contentHash}`);
        return data.contentHash || null;
    } catch (e) {
        console.error('[书签备份] 获取上次备份哈希失败:', e.message);
        return null;
    }
}


// 生成备份文件名
function generateBackupFilename(deviceName, type = 'manual') {
    const now = new Date();
    // 使用安全的设备名称（已经过sanitizeDeviceName处理）
    const device = sanitizeDeviceName(deviceName).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').slice(0, 20) || 'unknown';
    // 验证备份类型
    const safeType = validateBackupType(type);
    
    // 根据类型生成不同格式的时间戳
    let timestamp;
    switch (safeType) {
        case 'daily':
            timestamp = now.toISOString().slice(0, 10); // 2024-12-09
            break;
        case 'weekly':
            const weekNum = getWeekNumber(now);
            timestamp = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`; // 2024-W50
            break;
        case 'monthly':
            timestamp = now.toISOString().slice(0, 7); // 2024-12
            break;
        default: // auto, manual
            timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16); // 2024-12-09T14-30
    }
    
    return `bookmarks-${device}-${safeType}-${timestamp}.json`;
}

// 获取周数
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// 清理过期备份
async function cleanOldBackups(deviceName, type) {
    try {
        ensureDir();
        const keepCount = BACKUP_RETENTION[type] || 10;
        const device = (deviceName || 'unknown').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').slice(0, 20);
        
        const files = fs.readdirSync(BOOKMARKS_DIR)
            .filter(f => f.endsWith('.json') && f.includes(device) && f.includes(`-${type}-`))
            .sort((a, b) => b.localeCompare(a)); // 按文件名倒序（新的在前）
        
        const toDelete = files.slice(keepCount);
        for (const file of toDelete) {
            const filePath = path.join(BOOKMARKS_DIR, file);
            fs.unlinkSync(filePath);
            // 同时从WebDAV删除
            deleteBookmarkFromWebDAV(file).catch(() => {});
            console.log(`[书签备份] 已清理过期备份: ${file}`);
        }
        
        return toDelete.length;
    } catch (e) {
        console.error('[书签备份] 清理失败:', e.message);
        return 0;
    }
}

// 获取WebDAV客户端
async function getWebDAVClient() {
    const webdavConfigPath = path.join(__dirname, '..', 'config', '.webdav-config.json');
    if (!fs.existsSync(webdavConfigPath)) {
        return null;
    }
    
    try {
        const encryptedConfig = JSON.parse(fs.readFileSync(webdavConfigPath, 'utf-8'));
        const webdavConfig = decryptWebDAVConfig(encryptedConfig);
        
        if (!webdavConfig) return null;
        
        return createClient(webdavConfig.url, {
            username: webdavConfig.username,
            password: webdavConfig.password
        });
    } catch (e) {
        console.error('WebDAV客户端创建失败:', e.message);
        return null;
    }
}

// 同步书签备份到WebDAV
async function syncBookmarkToWebDAV(filename, content) {
    try {
        const client = await getWebDAVClient();
        if (!client) return false;
        
        try { await client.createDirectory('/Con-Nav-Item-Backups'); } catch (e) {}
        try { await client.createDirectory(WEBDAV_BOOKMARK_DIR); } catch (e) {}
        
        const remotePath = `${WEBDAV_BOOKMARK_DIR}/${filename}`;
        await client.putFileContents(remotePath, content);
        console.log(`[书签备份] 已同步到WebDAV: ${filename}`);
        return true;
    } catch (error) {
        console.error('[书签备份] WebDAV同步失败:', error.message);
        return false;
    }
}

// 从WebDAV删除书签备份
async function deleteBookmarkFromWebDAV(filename) {
    try {
        const client = await getWebDAVClient();
        if (!client) return false;
        
        const remotePath = `${WEBDAV_BOOKMARK_DIR}/${filename}`;
        await client.deleteFile(remotePath);
        return true;
    } catch (error) {
        return false;
    }
}


// 灵活认证中间件（支持扩展Token和密码认证）
function flexAuthMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    
    // 优先使用Bearer Token认证
    if (auth && auth.startsWith('Bearer ')) {
        const token = auth.slice(7);
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            
            // 如果是扩展Token，需要验证token_version
            if (payload.type === 'extension') {
                db.get('SELECT token_version FROM users WHERE id = ?', [payload.id], (err, user) => {
                    if (err || !user) {
                        return res.status(401).json({ success: false, message: '用户不存在' });
                    }
                    
                    const currentVersion = user.token_version || 1;
                    if (payload.tokenVersion !== currentVersion) {
                        return res.status(401).json({ 
                            success: false, 
                            message: '密码已更改，请重新验证',
                            reason: 'token_invalid'
                        });
                    }
                    
                    req.user = payload;
                    next();
                });
                return;
            }
            
            // 普通JWT Token
            req.user = payload;
            return next();
        } catch (e) {
            if (e.name === 'TokenExpiredError') {
                return res.status(401).json({ success: false, message: 'Token已过期', reason: 'token_expired' });
            }
            // Token无效，继续尝试密码认证
        }
    }
    
    // 密码认证（兼容旧版本，但不推荐）
    const { password } = req.body;
    if (password) {
        db.get('SELECT * FROM users WHERE id = 1', (err, user) => {
            if (err || !user) {
                return res.status(401).json({ success: false, message: '认证失败' });
            }
            bcrypt.compare(password, user.password, (err, result) => {
                if (result) {
                    req.user = { id: user.id, username: user.username };
                    next();
                } else {
                    res.status(401).json({ success: false, message: '密码错误' });
                }
            });
        });
        return;
    }
    
    // 没有提供任何认证信息，拒绝访问
    return res.status(401).json({ success: false, message: '请先授权登录' });
}

// 上传书签备份
router.post('/upload', flexAuthMiddleware, async (req, res) => {
    try {
        const { bookmarks, skipIfSame = true } = req.body;
        
        // 安全验证：清理和验证输入
        const deviceName = sanitizeDeviceName(req.body.deviceName);
        const type = validateBackupType(req.body.type);
        
        if (!bookmarks || !Array.isArray(bookmarks)) {
            return res.status(400).json({ success: false, message: '无效的书签数据' });
        }
        
        // 验证书签数据结构
        const validation = validateBookmarkData(bookmarks);
        if (!validation.valid) {
            return res.status(400).json({ success: false, message: validation.error });
        }
        
        ensureDir();
        
        // 计算内容哈希
        const contentHash = calculateBookmarkHash(bookmarks);
        console.log(`[书签备份] 当前内容哈希: ${contentHash}, 类型: ${type}, skipIfSame: ${skipIfSame}`);
        
        // 检查是否与上次备份相同
        if (skipIfSame && type !== 'manual') {
            const lastHash = getLastBackupHash(deviceName);
            console.log(`[书签备份] 对比哈希 - 当前: ${contentHash}, 上次: ${lastHash}`);
            if (lastHash && lastHash === contentHash) {
                console.log('[书签备份] 内容无变化，跳过备份');
                return res.json({
                    success: true,
                    message: '书签无变化，跳过备份',
                    skipped: true
                });
            }
        }
        
        // 生成文件名
        const filename = generateBackupFilename(deviceName, type);
        const filePath = path.join(BOOKMARKS_DIR, filename);
        
        // 检查同名文件是否存在（同一时间段的备份）
        if (fs.existsSync(filePath) && type !== 'manual') {
            // 更新现有文件而不是创建新文件
            console.log(`[书签备份] 更新现有备份: ${filename}`);
        }
        
        // 统计书签数量
        let bookmarkCount = 0;
        let folderCount = 0;
        function countItems(nodes) {
            for (const node of nodes) {
                if (node.children) {
                    folderCount++;
                    countItems(node.children);
                } else if (node.url) {
                    bookmarkCount++;
                }
            }
        }
        countItems(bookmarks);
        
        // 保存书签数据
        const backupData = {
            version: '1.0',
            type,
            timestamp: new Date().toISOString(),
            deviceName: deviceName || 'unknown',
            contentHash,
            stats: { bookmarkCount, folderCount },
            bookmarks
        };
        
        const jsonContent = JSON.stringify(backupData, null, 2);
        fs.writeFileSync(filePath, jsonContent);
        
        // 同步到WebDAV
        syncBookmarkToWebDAV(filename, jsonContent).catch(() => {});
        
        // 清理过期备份
        const cleaned = await cleanOldBackups(deviceName, type);
        
        res.json({
            success: true,
            message: '书签备份成功',
            backup: {
                filename,
                type,
                bookmarkCount,
                folderCount,
                contentHash,
                timestamp: backupData.timestamp
            },
            cleaned
        });
        
    } catch (error) {
        console.error('书签备份失败:', error);
        res.status(500).json({ success: false, message: '书签备份失败: ' + error.message });
    }
});


// 获取书签备份列表
router.get('/list', async (req, res) => {
    try {
        ensureDir();
        
        const files = fs.readdirSync(BOOKMARKS_DIR)
            .filter(f => f.endsWith('.json'))
            .map(filename => {
                const filePath = path.join(BOOKMARKS_DIR, filename);
                const stats = fs.statSync(filePath);
                
                let backupInfo = {};
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    backupInfo = {
                        type: data.type || 'manual',
                        deviceName: data.deviceName,
                        bookmarkCount: data.stats?.bookmarkCount || 0,
                        folderCount: data.stats?.folderCount || 0,
                        contentHash: data.contentHash,
                        backupTime: data.timestamp
                    };
                } catch (e) {}
                
                return {
                    filename,
                    size: `${(stats.size / 1024).toFixed(2)} KB`,
                    created: stats.birthtime.toISOString(),
                    ...backupInfo
                };
            })
            .sort((a, b) => new Date(b.created) - new Date(a.created));
        
        res.json({ success: true, backups: files });
        
    } catch (error) {
        console.error('获取书签备份列表失败:', error);
        res.status(500).json({ success: false, message: '获取列表失败: ' + error.message });
    }
});

// 下载/获取书签备份
router.get('/download/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        
        // 安全验证：检查文件名
        if (!isValidFilename(filename)) {
            return res.status(400).json({ success: false, message: '无效的文件名' });
        }
        
        const filePath = path.join(BOOKMARKS_DIR, filename);
        
        // 二次验证：确保路径在备份目录内（防止路径遍历）
        const resolvedPath = path.resolve(filePath);
        const resolvedDir = path.resolve(BOOKMARKS_DIR);
        if (!resolvedPath.startsWith(resolvedDir)) {
            return res.status(403).json({ success: false, message: '禁止访问' });
        }
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: '备份文件不存在' });
        }
        
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json({ success: true, backup: data });
        
    } catch (error) {
        console.error('获取书签备份失败:', error);
        res.status(500).json({ success: false, message: '获取备份失败: ' + error.message });
    }
});

// 获取最新的书签备份
router.get('/latest', async (req, res) => {
    try {
        ensureDir();
        
        const files = fs.readdirSync(BOOKMARKS_DIR)
            .filter(f => f.endsWith('.json'))
            .map(filename => ({
                filename,
                mtime: fs.statSync(path.join(BOOKMARKS_DIR, filename)).mtime
            }))
            .sort((a, b) => b.mtime - a.mtime);
        
        if (files.length === 0) {
            return res.json({ success: true, backup: null, message: '没有书签备份' });
        }
        
        const latestFile = files[0].filename;
        const filePath = path.join(BOOKMARKS_DIR, latestFile);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        res.json({ success: true, backup: data });
        
    } catch (error) {
        console.error('获取最新书签备份失败:', error);
        res.status(500).json({ success: false, message: '获取备份失败: ' + error.message });
    }
});

// 删除书签备份（手动删除不同步WebDAV，保留云端备份作为容灾）
router.delete('/delete/:filename', flexAuthMiddleware, async (req, res) => {
    try {
        const { filename } = req.params;
        
        // 安全验证：检查文件名
        if (!isValidFilename(filename)) {
            return res.status(400).json({ success: false, message: '无效的文件名' });
        }
        
        const filePath = path.join(BOOKMARKS_DIR, filename);
        
        // 二次验证：确保路径在备份目录内（防止路径遍历）
        const resolvedPath = path.resolve(filePath);
        const resolvedDir = path.resolve(BOOKMARKS_DIR);
        if (!resolvedPath.startsWith(resolvedDir)) {
            return res.status(403).json({ success: false, message: '禁止访问' });
        }
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: '备份文件不存在' });
        }
        
        fs.unlinkSync(filePath);
        // 注意：手动删除不同步删除WebDAV，保留云端备份作为容灾
        // WebDAV上的备份需要用户在WebDAV标签页单独删除
        
        res.json({ success: true, message: '删除成功（WebDAV备份已保留）' });
        
    } catch (error) {
        console.error('删除书签备份失败:', error);
        res.status(500).json({ success: false, message: '删除失败: ' + error.message });
    }
});

// 获取备份统计信息
router.get('/stats', async (req, res) => {
    try {
        ensureDir();

        const files = fs.readdirSync(BOOKMARKS_DIR).filter(f => f.endsWith('.json'));
        const stats = { auto: 0, daily: 0, weekly: 0, monthly: 0, manual: 0, total: 0, totalSize: 0 };

        for (const file of files) {
            const filePath = path.join(BOOKMARKS_DIR, file);
            const fileStats = fs.statSync(filePath);
            stats.totalSize += fileStats.size;
            stats.total++;

            // 从文件名解析类型
            if (file.includes('-auto-')) stats.auto++;
            else if (file.includes('-daily-')) stats.daily++;
            else if (file.includes('-weekly-')) stats.weekly++;
            else if (file.includes('-monthly-')) stats.monthly++;
            else stats.manual++;
        }

        stats.totalSize = `${(stats.totalSize / 1024).toFixed(2)} KB`;
        stats.retention = BACKUP_RETENTION;

        res.json({ success: true, stats });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== WebDAV独立备份功能 ====================

// 获取WebDAV上的书签备份列表
router.get('/webdav/list', async (req, res) => {
    try {
        const client = await getWebDAVClient();
        if (!client) {
            return res.json({ success: false, message: 'WebDAV未配置', backups: [] });
        }

        // 检查目录是否存在
        let dirExists = false;
        try {
            dirExists = await client.exists(WEBDAV_BOOKMARK_DIR);
        } catch (e) {
            dirExists = false;
        }

        if (!dirExists) {
            return res.json({ success: true, backups: [], message: 'WebDAV上暂无书签备份' });
        }

        // 获取文件列表
        const contents = await client.getDirectoryContents(WEBDAV_BOOKMARK_DIR);
        const backups = contents
            .filter(item => item.type === 'file' && item.basename.endsWith('.json'))
            .map(item => {
                // 从文件名解析信息
                const filename = item.basename;
                let type = 'manual';
                let deviceName = 'unknown';

                // 解析文件名: bookmarks-设备名-类型-时间戳.json
                const match = filename.match(/^bookmarks-(.+?)-(auto|daily|weekly|monthly|manual)-/);
                if (match) {
                    deviceName = match[1];
                    type = match[2];
                }

                return {
                    filename,
                    size: `${(item.size / 1024).toFixed(2)} KB`,
                    lastmod: item.lastmod,
                    type,
                    deviceName,
                    source: 'webdav'
                };
            })
            .sort((a, b) => new Date(b.lastmod) - new Date(a.lastmod));

        res.json({ success: true, backups });

    } catch (error) {
        console.error('获取WebDAV书签备份列表失败:', error);
        res.status(500).json({ success: false, message: error.message, backups: [] });
    }
});

// 从WebDAV下载书签备份
router.get('/webdav/download/:filename', async (req, res) => {
    try {
        const { filename } = req.params;

        // 安全验证：检查文件名
        if (!isValidFilename(filename)) {
            return res.status(400).json({ success: false, message: '无效的文件名' });
        }

        const client = await getWebDAVClient();
        if (!client) {
            return res.status(400).json({ success: false, message: 'WebDAV未配置' });
        }

        // 构建安全的远程路径（不允许路径遍历）
        const safeFilename = path.basename(filename);
        const remotePath = `${WEBDAV_BOOKMARK_DIR}/${safeFilename}`;

        // 检查文件是否存在
        const exists = await client.exists(remotePath);
        if (!exists) {
            return res.status(404).json({ success: false, message: 'WebDAV上不存在该备份' });
        }

        // 下载文件内容
        const content = await client.getFileContents(remotePath, { format: 'text' });
        const data = JSON.parse(content);

        res.json({ success: true, backup: data, source: 'webdav' });

    } catch (error) {
        console.error('从WebDAV下载书签备份失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 从WebDAV删除书签备份
router.delete('/webdav/delete/:filename', flexAuthMiddleware, async (req, res) => {
    try {
        const { filename } = req.params;

        // 安全验证：检查文件名
        if (!isValidFilename(filename)) {
            return res.status(400).json({ success: false, message: '无效的文件名' });
        }

        const client = await getWebDAVClient();
        if (!client) {
            return res.status(400).json({ success: false, message: 'WebDAV未配置' });
        }

        const remotePath = `${WEBDAV_BOOKMARK_DIR}/${filename}`;
        await client.deleteFile(remotePath);

        res.json({ success: true, message: '删除成功' });

    } catch (error) {
        console.error('从WebDAV删除书签备份失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 从WebDAV同步备份到本地
router.post('/webdav/sync-to-local', flexAuthMiddleware, async (req, res) => {
    try {
        const client = await getWebDAVClient();
        if (!client) {
            return res.status(400).json({ success: false, message: 'WebDAV未配置' });
        }

        ensureDir();

        // 获取WebDAV上的文件列表
        let dirExists = false;
        try {
            dirExists = await client.exists(WEBDAV_BOOKMARK_DIR);
        } catch (e) {
            dirExists = false;
        }

        if (!dirExists) {
            return res.json({ success: true, synced: 0, message: 'WebDAV上暂无书签备份' });
        }

        const contents = await client.getDirectoryContents(WEBDAV_BOOKMARK_DIR);
        const remoteFiles = contents
            .filter(item => item.type === 'file' && item.basename.endsWith('.json'))
            .map(item => item.basename);

        // 获取本地文件列表
        const localFiles = fs.readdirSync(BOOKMARKS_DIR).filter(f => f.endsWith('.json'));

        // 找出本地没有的文件
        const toSync = remoteFiles.filter(f => !localFiles.includes(f));

        let synced = 0;
        for (const filename of toSync) {
            try {
                const remotePath = `${WEBDAV_BOOKMARK_DIR}/${filename}`;
                const content = await client.getFileContents(remotePath, { format: 'text' });
                const localPath = path.join(BOOKMARKS_DIR, filename);
                fs.writeFileSync(localPath, content);
                synced++;
                console.log(`[书签备份] 从WebDAV同步: ${filename}`);
            } catch (e) {
                console.error(`[书签备份] 同步失败: ${filename}`, e.message);
            }
        }

        res.json({
            success: true,
            synced,
            total: remoteFiles.length,
            message: synced > 0 ? `已从WebDAV同步 ${synced} 个备份` : '本地已是最新'
        });

    } catch (error) {
        console.error('从WebDAV同步备份失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 同步本地备份到WebDAV
router.post('/webdav/sync-to-webdav', flexAuthMiddleware, async (req, res) => {
    try {
        const client = await getWebDAVClient();
        if (!client) {
            return res.status(400).json({ success: false, message: 'WebDAV未配置' });
        }

        ensureDir();

        // 确保WebDAV目录存在
        try { await client.createDirectory('/Con-Nav-Item-Backups'); } catch (e) {}
        try { await client.createDirectory(WEBDAV_BOOKMARK_DIR); } catch (e) {}

        // 获取本地文件列表
        const localFiles = fs.readdirSync(BOOKMARKS_DIR).filter(f => f.endsWith('.json'));

        if (localFiles.length === 0) {
            return res.json({ success: true, synced: 0, message: '本地暂无备份文件' });
        }

        // 获取WebDAV上的文件列表
        let remoteFiles = [];
        try {
            const contents = await client.getDirectoryContents(WEBDAV_BOOKMARK_DIR);
            remoteFiles = contents
                .filter(item => item.type === 'file' && item.basename.endsWith('.json'))
                .map(item => item.basename);
        } catch (e) {}

        // 找出WebDAV上没有的文件
        const toSync = localFiles.filter(f => !remoteFiles.includes(f));

        let synced = 0;
        for (const filename of toSync) {
            try {
                const localPath = path.join(BOOKMARKS_DIR, filename);
                const content = fs.readFileSync(localPath, 'utf-8');
                const remotePath = `${WEBDAV_BOOKMARK_DIR}/${filename}`;
                await client.putFileContents(remotePath, content);
                synced++;
            } catch (e) {
                console.error(`[书签备份] 同步到WebDAV失败: ${filename}`, e.message);
            }
        }

        res.json({
            success: true,
            synced,
            total: localFiles.length,
            message: synced > 0 ? `已同步 ${synced} 个备份到WebDAV` : 'WebDAV已是最新'
        });

    } catch (error) {
        console.error('同步到WebDAV失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 检查WebDAV配置状态
router.get('/webdav/status', async (req, res) => {
    try {
        const client = await getWebDAVClient();
        if (!client) {
            return res.json({ success: true, configured: false, message: 'WebDAV未配置' });
        }

        // 测试连接
        try {
            await client.exists('/');
            return res.json({ success: true, configured: true, connected: true });
        } catch (e) {
            return res.json({ success: true, configured: true, connected: false, message: '连接失败: ' + e.message });
        }

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
