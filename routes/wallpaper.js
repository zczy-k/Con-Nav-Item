const express = require('express');
const axios = require('axios');
const { wallpaperLimiter } = require('../middleware/security');
const router = express.Router();

// 自然风景类壁纸的 Unsplash 关键词
const NATURE_KEYWORDS = 'nature,landscape,mountain,forest,lake,ocean,sunset,sunrise,sky,waterfall';

// 备用的自然风景图片 ID 列表（来自 picsum.photos 的风景图）
const NATURE_PHOTO_IDS = [
  10, 11, 15, 16, 17, 18, 19, 20, 22, 24, 27, 28, 29, 37, 39, 40, 41, 42, 47, 48,
  49, 50, 53, 54, 55, 56, 57, 58, 59, 60, 62, 63, 64, 66, 67, 68, 69, 71, 73, 74,
  76, 77, 78, 79, 82, 83, 84, 85, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98,
  100, 101, 102, 103, 104, 106, 107, 108, 109, 110, 111, 112, 114, 115, 116, 117,
  118, 119, 120, 122, 123, 124, 125, 126, 127, 128, 129, 131, 132, 133, 134, 135,
  136, 137, 139, 140, 141, 142, 143, 144, 145, 146, 147, 149, 150, 151, 152, 153
];

// 获取随机壁纸（每分钟最多15次）- 限制为自然风景类
router.get('/random', wallpaperLimiter, async (req, res) => {
  try {
    // 使用 Unsplash 获取自然风景壁纸
    const response = await axios.get(`https://source.unsplash.com/random/1920x1080?${NATURE_KEYWORDS}`, {
      maxRedirects: 0,
      validateStatus: (status) => status === 302 || status === 200,
      timeout: 8000,
    });

    const imageUrl = response.headers.location;

    if (imageUrl) {
      res.json({ 
        success: true,
        url: imageUrl 
      });
    } else {
      throw new Error('Unsplash did not provide a redirect location.');
    }

  } catch (error) {
    try {
      // 备用方案：从预选的自然风景图片 ID 中随机选择
      const randomId = NATURE_PHOTO_IDS[Math.floor(Math.random() * NATURE_PHOTO_IDS.length)];
      const fallbackUrl = `https://picsum.photos/id/${randomId}/1920/1080`;
      
      res.json({ 
        success: true,
        url: fallbackUrl 
      });
    } catch (e) {
      // 最后的备用：返回预选列表中的第一张
      res.json({ 
        success: true,
        url: `https://picsum.photos/id/${NATURE_PHOTO_IDS[0]}/1920/1080` 
      });
    }
  }
});

module.exports = router;
