const express = require('express');
const path = require('path');
const fs = require('fs');
const { wallpaperLimiter } = require('../middleware/security');
const router = express.Router();

// 内置背景图片列表（存放在 public/backgrounds/ 目录）
const BUILTIN_BACKGROUNDS = [
  { id: 1, name: '默认', file: 'background.webp' },
  { id: 2, name: '山峦', file: 'bg-mountain.webp' },
  { id: 3, name: '海洋', file: 'bg-ocean.webp' },
  { id: 4, name: '森林', file: 'bg-forest.webp' },
  { id: 5, name: '星空', file: 'bg-stars.webp' },
  { id: 6, name: '城市', file: 'bg-city.webp' },
  { id: 7, name: '日落', file: 'bg-sunset.webp' },
  { id: 8, name: '极光', file: 'bg-aurora.webp' }
];

// 在线壁纸源（picsum.photos 精选风景图片ID）
const ONLINE_SOURCES = [
  10, 11, 15, 16, 17, 18, 19, 20, 22, 24, 27, 28, 29, 37, 39, 40, 41, 42, 47, 48,
  49, 50, 53, 54, 55, 56, 57, 58, 59, 60, 62, 63, 64, 66, 67, 68, 69, 71, 73, 74,
  76, 77, 78, 79, 82, 83, 84, 85, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98
];

// 记录最近使用的图片，避免连续重复
let recentIds = [];
const MAX_RECENT = 10;

// 获取背景文件目录（统一方法）
function getBackgroundsDir() {
  const distDir = path.join(__dirname, '../web/dist/backgrounds');
  const publicDir = path.join(__dirname, '../public/backgrounds');
  return fs.existsSync(distDir) ? distDir : publicDir;
}

// 获取可用的内置背景列表
function getAvailableBackgrounds() {
  const bgDir = getBackgroundsDir();
  const available = BUILTIN_BACKGROUNDS.filter(bg => {
    return fs.existsSync(path.join(bgDir, bg.file));
  });
  
  // 如果没有找到任何背景文件，返回默认背景
  if (available.length === 0) {
    return [{ id: 1, name: '默认', file: 'background.webp', url: '/background.webp' }];
  }
  
  return available.map(bg => ({
    ...bg,
    url: `/backgrounds/${bg.file}`
  }));
}

// 获取内置背景列表
router.get('/builtin', (req, res) => {
  const backgrounds = getAvailableBackgrounds();
  res.json({ success: true, backgrounds });
});

// 获取随机壁纸（支持本地和在线两种模式）
router.get('/random', wallpaperLimiter, (req, res) => {
  const source = req.query.source || 'auto';
  
  if (source === 'local') {
    return getLocalBackground(res);
  }
  
  if (source === 'online') {
    return getOnlineBackground(res);
  }
  
  // 自动模式：优先在线，失败时降级到本地
  getOnlineBackground(res, true);
});

// 获取本地背景
function getLocalBackground(res) {
  const available = getAvailableBackgrounds();
  
  // 过滤掉最近使用过的
  let candidates = available.filter(bg => !recentIds.includes(`local_${bg.id}`));
  if (candidates.length === 0) {
    recentIds = recentIds.filter(id => !id.startsWith('local_'));
    candidates = available;
  }
  
  // 随机选择
  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  
  // 记录使用
  recentIds.push(`local_${selected.id}`);
  if (recentIds.length > MAX_RECENT) recentIds.shift();
  
  res.json({
    success: true,
    source: 'local',
    url: selected.url,
    name: selected.name
  });
}

// 获取在线背景
function getOnlineBackground(res, fallbackToLocal = false) {
  try {
    // 过滤掉最近使用过的
    let available = ONLINE_SOURCES.filter(id => !recentIds.includes(`online_${id}`));
    if (available.length < 5) {
      recentIds = recentIds.filter(id => !id.startsWith('online_'));
      available = ONLINE_SOURCES;
    }
    
    // 随机选择
    const selectedId = available[Math.floor(Math.random() * available.length)];
    
    // 记录使用
    recentIds.push(`online_${selectedId}`);
    if (recentIds.length > MAX_RECENT) recentIds.shift();
    
    res.json({
      success: true,
      source: 'online',
      url: `https://picsum.photos/id/${selectedId}/1920/1080?_t=${Date.now()}`,
      id: selectedId
    });
  } catch (error) {
    if (fallbackToLocal) {
      return getLocalBackground(res);
    }
    res.status(500).json({ success: false, error: '获取在线壁纸失败' });
  }
}

module.exports = router;
