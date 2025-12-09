const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
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

// 确保目录存在
function ensureDir() {
    if (!fs.existsSync(BOOKMARKS_DIR)) {
        fs.mkdirSync(BOOKMARKS_DIR, { recursive: true });
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
        
        if (!webdavConfig) {
            return null;
        }
        
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
        
        // 确保目录存在
        try {
            await client.createDirectory('/Con-Nav-Item-Backups');
        } catch (e) {}
        try {
            await client.createDirectory(WEBDAV_BOOKMARK_DIR);
        } catch (e) {}
        
        // 上传文件
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
        console.log(`[书签备份] 已从WebDAV删除: ${filename}`);
        return true;
    } catch (error) {
        console.error('[书签备份] WebDAV删除失败:', error.message);
        return false;
    }
}

// 灵活认证中间件：支持 JWT token 或密码验证
function flexAuthMiddleware(req, res, next) {
    // 方式1: JWT Token
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
        const token = auth.slice(7);
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            req.user = payload;
            return next();
        } catch (e) {
            // Token无效，继续尝试其他方式
        }
    }
    
    // 方式2: 请求体中的密码
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
    
    // 方式3: 查询参数中的密码（用于GET请求）
    const queryPassword = req.query.password;
    if (queryPassword) {
        db.get('SELECT * FROM users WHERE id = 1', (err, user) => {
            if (err || !user) {
                return res.status(401).json({ success: false, message: '认证失败' });
            }
            bcrypt.compare(queryPassword, user.password, (err, result) => {
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
    
    // 无认证信息，允许访问（仅列表和下载功能）
    // 对于敏感操作（上传、删除）在具体路由中再次验证
    next();
}

// 上传书签备份（需要认证）
router.post('/upload', flexAuthMiddleware, async (req, res) => {
    try {
        const { bookmarks, deviceName } = req.body;
        
        if (!bookmarks || !Array.isArray(bookmarks)) {
            return res.status(400).json({
                success: false,
                message: '无效的书签数据'
            });
        }
        
        ensureDir();
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const device = (deviceName || 'unknown').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_').slice(0, 30);
        const filename = `bookmarks-${device}-${timestamp}.json`;
        const filePath = path.join(BOOKMARKS_DIR, filename);
        
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
            timestamp: new Date().toISOString(),
            deviceName: deviceName || 'unknown',
            stats: { bookmarkCount, folderCount },
            bookmarks
        };
        
        const jsonContent = JSON.stringify(backupData, null, 2);
        fs.writeFileSync(filePath, jsonContent);
        
        // 同步到WebDAV（异步，不阻塞响应）
        syncBookmarkToWebDAV(filename, jsonContent).catch(e => {
            console.error('WebDAV同步失败:', e.message);
        });
        
        res.json({
            success: true,
            message: '书签备份成功',
            backup: {
                filename,
                bookmarkCount,
                folderCount,
                timestamp: backupData.timestamp
            }
        });
        
    } catch (error) {
        console.error('书签备份失败:', error);
        res.status(500).json({
            success: false,
            message: '书签备份失败: ' + error.message
        });
    }
});

// 获取书签备份列表（无需认证）
router.get('/list', async (req, res) => {
    try {
        ensureDir();
        
        const files = fs.readdirSync(BOOKMARKS_DIR)
            .filter(f => f.endsWith('.json'))
            .map(filename => {
                const filePath = path.join(BOOKMARKS_DIR, filename);
                const stats = fs.statSync(filePath);
                
                // 读取备份信息
                let backupInfo = {};
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    backupInfo = {
                        deviceName: data.deviceName,
                        bookmarkCount: data.stats?.bookmarkCount || 0,
                        folderCount: data.stats?.folderCount || 0,
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
        
        res.json({
            success: true,
            backups: files
        });
        
    } catch (error) {
        console.error('获取书签备份列表失败:', error);
        res.status(500).json({
            success: false,
            message: '获取列表失败: ' + error.message
        });
    }
});

// 下载/获取书签备份（无需认证）
router.get('/download/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        
        // 安全验证文件名
        if (!filename.endsWith('.json') || filename.includes('..')) {
            return res.status(400).json({
                success: false,
                message: '无效的文件名'
            });
        }
        
        const filePath = path.join(BOOKMARKS_DIR, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: '备份文件不存在'
            });
        }
        
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        res.json({
            success: true,
            backup: data
        });
        
    } catch (error) {
        console.error('获取书签备份失败:', error);
        res.status(500).json({
            success: false,
            message: '获取备份失败: ' + error.message
        });
    }
});

// 获取最新的书签备份（无需认证）
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
            return res.json({
                success: true,
                backup: null,
                message: '没有书签备份'
            });
        }
        
        const latestFile = files[0].filename;
        const filePath = path.join(BOOKMARKS_DIR, latestFile);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        res.json({
            success: true,
            backup: data
        });
        
    } catch (error) {
        console.error('获取最新书签备份失败:', error);
        res.status(500).json({
            success: false,
            message: '获取备份失败: ' + error.message
        });
    }
});

// 删除书签备份（需要认证）
router.delete('/delete/:filename', flexAuthMiddleware, async (req, res) => {
    try {
        const { filename } = req.params;
        
        if (!filename.endsWith('.json') || filename.includes('..')) {
            return res.status(400).json({
                success: false,
                message: '无效的文件名'
            });
        }
        
        const filePath = path.join(BOOKMARKS_DIR, filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: '备份文件不存在'
            });
        }
        
        fs.unlinkSync(filePath);
        
        // 同时从WebDAV删除（异步，不阻塞响应）
        deleteBookmarkFromWebDAV(filename).catch(e => {
            console.error('WebDAV删除失败:', e.message);
        });
        
        res.json({
            success: true,
            message: '删除成功'
        });
        
    } catch (error) {
        console.error('删除书签备份失败:', error);
        res.status(500).json({
            success: false,
            message: '删除失败: ' + error.message
        });
    }
});

module.exports = router;
