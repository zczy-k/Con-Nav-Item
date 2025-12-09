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

// 确保目录存在
function ensureDir() {
    if (!fs.existsSync(BOOKMARKS_DIR)) {
        fs.mkdirSync(BOOKMARKS_DIR, { recursive: true });
    }
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
        const files = fs.readdirSync(BOOKMARKS_DIR)
            .filter(f => f.endsWith('.json') && f.includes(deviceName))
            .sort((a, b) => b.localeCompare(a));
        
        if (files.length === 0) return null;
        
        const lastFile = path.join(BOOKMARKS_DIR, files[0]);
        const data = JSON.parse(fs.readFileSync(lastFile, 'utf-8'));
        return data.contentHash || null;
    } catch (e) {
        return null;
    }
}


// 生成备份文件名
function generateBackupFilename(deviceName, type = 'manual') {
    const now = new Date();
    const device = (deviceName || 'unknown').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').slice(0, 20);
    
    // 根据类型生成不同格式的时间戳
    let timestamp;
    switch (type) {
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
    
    return `bookmarks-${device}-${type}-${timestamp}.json`;
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


// 灵活认证中间件
function flexAuthMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
        const token = auth.slice(7);
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            req.user = payload;
            return next();
        } catch (e) {}
    }
    
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
    
    next();
}

// 上传书签备份
router.post('/upload', flexAuthMiddleware, async (req, res) => {
    try {
        const { bookmarks, deviceName, type = 'manual', skipIfSame = true } = req.body;
        
        if (!bookmarks || !Array.isArray(bookmarks)) {
            return res.status(400).json({ success: false, message: '无效的书签数据' });
        }
        
        ensureDir();
        
        // 计算内容哈希
        const contentHash = calculateBookmarkHash(bookmarks);
        
        // 检查是否与上次备份相同
        if (skipIfSame && type !== 'manual') {
            const lastHash = getLastBackupHash(deviceName);
            if (lastHash === contentHash) {
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
        
        if (!filename.endsWith('.json') || filename.includes('..')) {
            return res.status(400).json({ success: false, message: '无效的文件名' });
        }
        
        const filePath = path.join(BOOKMARKS_DIR, filename);
        
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

// 删除书签备份
router.delete('/delete/:filename', flexAuthMiddleware, async (req, res) => {
    try {
        const { filename } = req.params;
        
        if (!filename.endsWith('.json') || filename.includes('..')) {
            return res.status(400).json({ success: false, message: '无效的文件名' });
        }
        
        const filePath = path.join(BOOKMARKS_DIR, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: '备份文件不存在' });
        }
        
        fs.unlinkSync(filePath);
        deleteBookmarkFromWebDAV(filename).catch(() => {});
        
        res.json({ success: true, message: '删除成功' });
        
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

module.exports = router;
