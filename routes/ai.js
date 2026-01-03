/**
 * AI 功能路由
 */
const express = require('express');
const router = express.Router();
const authMiddleware = require('./authMiddleware');
const db = require('../db');
const { AI_PROVIDERS, callAI } = require('../utils/aiProvider');
const { encrypt, decrypt } = require('../utils/crypto');

// 获取 AI 提供商列表
router.get('/providers', (req, res) => {
  const providers = Object.entries(AI_PROVIDERS).map(([key, value]) => ({
    id: key,
    name: value.name,
    defaultModel: value.defaultModel,
    needsApiKey: value.needsApiKey,
    needsBaseUrl: value.needsBaseUrl
  }));
  res.json({ success: true, providers });
});

// 获取 AI 配置（不含敏感信息）
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const config = await db.getAIConfig();
    // 不返回完整的 API Key，只返回是否已配置
    res.json({
      success: true,
      config: {
        provider: config.provider || 'deepseek',
        hasApiKey: !!config.apiKey,
        baseUrl: config.baseUrl || '',
        model: config.model || '',
        requestDelay: config.requestDelay || 1500
      }
    });
  } catch (error) {
    console.error('获取 AI 配置失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 保存 AI 配置
router.post('/config', authMiddleware, async (req, res) => {
  try {
    const { provider, apiKey, baseUrl, model, requestDelay } = req.body;
    
    if (!provider || !AI_PROVIDERS[provider]) {
      return res.status(400).json({ success: false, message: '无效的 AI 提供商' });
    }
    
    const providerConfig = AI_PROVIDERS[provider];
    
    // 验证必填项
    if (providerConfig.needsApiKey && !apiKey) {
      // 检查是否已有保存的 API Key
      const existingConfig = await db.getAIConfig();
      if (!existingConfig.apiKey) {
        return res.status(400).json({ success: false, message: 'API Key 不能为空' });
      }
    }
    
    if (providerConfig.needsBaseUrl && !baseUrl) {
      return res.status(400).json({ success: false, message: 'Base URL 不能为空' });
    }
    
    // 加密 API Key
    let encryptedApiKey = null;
    if (apiKey) {
      const encrypted = encrypt(apiKey);
      encryptedApiKey = JSON.stringify(encrypted);
    }
    
    await db.saveAIConfig({
      provider,
      apiKey: encryptedApiKey,
      baseUrl: baseUrl || '',
      model: model || '',
      requestDelay: requestDelay || 1500
    });
    
    res.json({ success: true, message: 'AI 配置保存成功' });
  } catch (error) {
    console.error('保存 AI 配置失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 测试 AI 连接
router.post('/test', authMiddleware, async (req, res) => {
  try {
    const config = await getDecryptedAIConfig();
    
    if (!config.provider) {
      return res.status(400).json({ success: false, message: '请先配置 AI 服务' });
    }
    
    const messages = [
      { role: 'system', content: '你是一个助手。' },
      { role: 'user', content: '请回复"连接成功"四个字。' }
    ];
    
    const result = await callAI(config, messages);
    
    res.json({ 
      success: true, 
      message: '连接测试成功',
      response: result.substring(0, 100)
    });
  } catch (error) {
    console.error('AI 连接测试失败:', error);
    res.status(500).json({ success: false, message: `连接失败: ${error.message}` });
  }
});

// 生成描述/标签
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { type, card, existingTags } = req.body;
    
    if (!type || !card || !card.url) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    const config = await getDecryptedAIConfig();
    
    if (!config.provider) {
      return res.status(400).json({ success: false, message: '请先配置 AI 服务' });
    }
    
    let result = {};
    
    if (type === 'description' || type === 'both') {
      const descPrompt = buildDescriptionPrompt(card);
      const description = await callAI(config, descPrompt);
      result.description = cleanDescription(description);
    }
    
    if (type === 'tags' || type === 'both') {
      const tagsPrompt = buildTagsPrompt(card, existingTags || []);
      const tagsResponse = await callAI(config, tagsPrompt);
      result.tags = parseTagsResponse(tagsResponse, existingTags || []);
    }
    
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('AI 生成失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取缺少描述/标签的卡片
router.get('/empty-cards', authMiddleware, async (req, res) => {
  try {
    const { type } = req.query; // 'description' | 'tags' | 'both'
    const cards = await db.getCardsNeedingAI(type || 'both');
    res.json({ success: true, cards, total: cards.length });
  } catch (error) {
    console.error('获取待处理卡片失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 批量生成
router.post('/batch-generate', authMiddleware, async (req, res) => {
  try {
    const { type, cardIds } = req.body;
    
    if (!type || !cardIds || !Array.isArray(cardIds) || cardIds.length === 0) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    const config = await getDecryptedAIConfig();
    
    if (!config.provider) {
      return res.status(400).json({ success: false, message: '请先配置 AI 服务' });
    }
    
    // 获取卡片信息
    const cards = await db.getCardsByIds(cardIds);
    const existingTags = type === 'tags' || type === 'both' 
      ? await db.getAllTagNames() 
      : [];
    
    res.json({ 
      success: true, 
      cards: cards,
      existingTags,
      requestDelay: config.requestDelay || 1500
    });
  } catch (error) {
    console.error('批量生成准备失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新卡片描述
router.post('/update-description', authMiddleware, async (req, res) => {
  try {
    const { cardId, description } = req.body;
    
    if (!cardId || typeof description !== 'string') {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    await db.updateCardDescription(cardId, description);
    res.json({ success: true, message: '描述更新成功' });
  } catch (error) {
    console.error('更新描述失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 更新卡片标签
router.post('/update-tags', authMiddleware, async (req, res) => {
  try {
    const { cardId, tags } = req.body;
    
    if (!cardId || !Array.isArray(tags)) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    await db.updateCardTags(cardId, tags);
    res.json({ success: true, message: '标签更新成功' });
  } catch (error) {
    console.error('更新标签失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 辅助函数 ====================

async function getDecryptedAIConfig() {
  const config = await db.getAIConfig();
  
  if (config.apiKey) {
    try {
      const encrypted = JSON.parse(config.apiKey);
      config.apiKey = decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag);
    } catch (e) {
      // 可能是未加密的旧数据
      console.warn('API Key 解密失败，可能是未加密的旧数据');
    }
  }
  
  return config;
}

function buildDescriptionPrompt(card) {
  return [
    {
      role: 'system',
      content: '你是一个专业的网站分析助手，擅长用简洁的中文描述网站功能。请直接返回描述内容，不要任何前缀、引号或额外说明。'
    },
    {
      role: 'user',
      content: `请为以下网站生成一个简洁的中文描述（15-30字）：
网站名称：${card.name || '未知'}
网站地址：${card.url}

要求：
1. 直接返回描述内容，不要"描述："等前缀
2. 准确概括网站的主要功能或特点
3. 语言简洁，避免冗余`
    }
  ];
}

function buildTagsPrompt(card, existingTags) {
  const tagsStr = existingTags.length > 0 
    ? existingTags.join('、') 
    : '暂无';
  
  return [
    {
      role: 'system',
      content: '你是一个专业的网站分类助手。请严格按照 JSON 格式返回结果。'
    },
    {
      role: 'user',
      content: `请为以下网站推荐 2-4 个合适的标签：
网站名称：${card.name || '未知'}
网站地址：${card.url}
网站描述：${card.description || '无'}

现有标签库：${tagsStr}

要求：
1. 优先从现有标签库中选择匹配的标签
2. 如果现有标签不够匹配，可以建议新标签（简短，2-4个字）
3. 严格按以下 JSON 格式返回：{"tags": ["标签1", "标签2"], "newTags": ["新标签"]}
4. 不要返回任何其他内容`
    }
  ];
}

function cleanDescription(text) {
  if (!text) return '';
  // 移除可能的前缀和引号
  return text
    .replace(/^["'「」『』]|["'「」『』]$/g, '')
    .replace(/^(描述[：:]\s*|简介[：:]\s*)/i, '')
    .trim()
    .substring(0, 100);
}

function parseTagsResponse(text, existingTags) {
  try {
    // 尝试提取 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const tags = parsed.tags || [];
      const newTags = parsed.newTags || [];
      return { tags, newTags };
    }
  } catch (e) {
    console.warn('标签 JSON 解析失败:', e);
  }
  
  // 降级处理：尝试提取标签
  const tagMatches = text.match(/["'「」『』]([^"'「」『』]+)["'「」『』]/g);
  if (tagMatches) {
    const tags = tagMatches
      .map(t => t.replace(/["'「」『』]/g, '').trim())
      .filter(t => t.length > 0 && t.length <= 10);
    return { tags, newTags: [] };
  }
  
  return { tags: [], newTags: [] };
}

module.exports = router;
