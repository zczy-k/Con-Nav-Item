/**
 * AI 功能路由
 * 提供 AI 配置管理、批量生成任务等功能
 * 支持自适应并发处理策略
 */
const express = require('express');
const router = express.Router();
const authMiddleware = require('./authMiddleware');
const db = require('../db');
const { AI_PROVIDERS, callAI } = require('../utils/aiProvider');
const { encrypt, decrypt } = require('../utils/crypto');

// ==================== 自适应并发批量任务管理器 ====================
class BatchTaskManager {
  constructor() {
    this.task = null;
    this.abortController = null;
    // 并发控制参数
    this.minConcurrency = 1;
    this.maxConcurrency = 5;
    this.initialConcurrency = 3;
  }

  // 获取任务状态
  getStatus() {
    if (!this.task) {
      return { running: false };
    }
    return {
      running: this.task.running,
      types: this.task.types,
      current: this.task.current,
      total: this.task.total,
      successCount: this.task.successCount,
      failCount: this.task.failCount,
      currentCard: this.task.currentCard,
      startTime: this.task.startTime,
      concurrency: this.task.concurrency,
      isRateLimited: this.task.isRateLimited,
      errors: this.task.errors.slice(-5)
    };
  }

  // 检查是否正在运行
  isRunning() {
    return this.task && this.task.running;
  }

  // 启动任务
  async start(config, cards, types, strategy = {}) {
    if (this.isRunning()) {
      throw new Error('已有任务在运行中');
    }

    this.abortController = new AbortController();
    this.task = {
      running: true,
      types: Array.isArray(types) ? types : [types],
      strategy,
      current: 0,
      total: cards.length,
      successCount: 0,
      failCount: 0,
      currentCard: '',
      startTime: Date.now(),
      errors: [],
      // 自适应并发状态
      concurrency: this.initialConcurrency,
      isRateLimited: false,
      consecutiveSuccesses: 0,
      rateLimitCount: 0
    };

    // 异步执行任务
    this.runTask(config, cards).catch(() => {
      if (this.task) {
        this.task.running = false;
      }
    });

    return { total: cards.length };
  }

  // 停止任务
  stop() {
    if (this.abortController) {
      this.abortController.abort();
    }
    if (this.task) {
      this.task.running = false;
    }
    return { stopped: true };
  }


  // 执行任务（自适应并发）
  async runTask(config, cards) {
    const { notifyDataChange } = require('../utils/autoBackup');
    const types = this.task.types || ['name'];
    const strategy = this.task.strategy || {};
    const existingTags = types.includes('tags') ? await db.getAllTagNames() : [];
    const rawConfig = await db.getAIConfig();
    const baseDelay = Math.max(500, Math.min(10000, parseInt(rawConfig.requestDelay) || 1500));

    let index = 0;
    const totalCards = cards.length;

    while (index < totalCards) {
      // 检查是否被中止
      if (this.abortController?.signal.aborted || !this.task?.running) {
        break;
      }

      const currentConcurrency = this.task.concurrency;
      const batch = cards.slice(index, index + currentConcurrency);
      
      // 更新当前处理信息
      this.task.currentCard = batch.map(c => c.title || extractDomain(c.url)).join(', ');

      // 并行处理当前批次
      const results = await Promise.allSettled(
        batch.map(card => this.processCardWithRetry(config, card, types, existingTags, strategy))
      );

      // 分析结果，调整并发策略
      let batchSuccess = 0;
      let batchFail = 0;
      let hasRateLimit = false;

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const card = batch[i];
        this.task.current++;

        if (result.status === 'fulfilled') {
          if (result.value.success) {
            batchSuccess++;
            this.task.successCount++;
            notifyDataChange();
          } else if (result.value.rateLimited) {
            hasRateLimit = true;
            batchFail++;
            this.task.failCount++;
          } else {
            batchFail++;
            this.task.failCount++;
            if (result.value.error) {
              this.task.errors.push({
                cardId: card.id,
                cardTitle: card.title || card.url,
                error: result.value.error,
                time: Date.now()
              });
            }
          }
        } else {
          batchFail++;
          this.task.failCount++;
          this.task.errors.push({
            cardId: card.id,
            cardTitle: card.title || card.url,
            error: result.reason?.message || '未知错误',
            time: Date.now()
          });
        }
      }

      // 自适应调整并发数
      this.adjustConcurrency(batchSuccess, batchFail, hasRateLimit);

      index += batch.length;

      // 延迟处理
      if (index < totalCards && this.task?.running) {
        const delay = this.calculateDelay(baseDelay, hasRateLimit);
        await this.sleep(delay);
      }
    }

    // 任务完成
    if (this.task) {
      this.task.running = false;
      this.task.currentCard = '';
    }
  }

  // 自适应调整并发数
  adjustConcurrency(successCount, failCount, hasRateLimit) {
    if (!this.task) return;

    if (hasRateLimit) {
      // 触发限流，降低并发
      this.task.rateLimitCount++;
      this.task.consecutiveSuccesses = 0;
      this.task.isRateLimited = true;
      
      // 每次限流降低一半并发，最低为1
      this.task.concurrency = Math.max(
        this.minConcurrency,
        Math.floor(this.task.concurrency / 2)
      );
    } else if (successCount > 0 && failCount === 0) {
      // 全部成功，尝试增加并发
      this.task.consecutiveSuccesses++;
      this.task.isRateLimited = false;
      
      // 连续3批成功后尝试增加并发
      if (this.task.consecutiveSuccesses >= 3 && this.task.concurrency < this.maxConcurrency) {
        this.task.concurrency = Math.min(this.maxConcurrency, this.task.concurrency + 1);
        this.task.consecutiveSuccesses = 0;
      }
    } else {
      // 有失败但非限流，保持当前并发
      this.task.consecutiveSuccesses = 0;
    }
  }

  // 计算延迟时间
  calculateDelay(baseDelay, hasRateLimit) {
    if (!this.task) return baseDelay;

    if (hasRateLimit) {
      // 限流时增加延迟：基础延迟 * (2 ^ 限流次数)，最大30秒
      const multiplier = Math.pow(2, Math.min(this.task.rateLimitCount, 4));
      return Math.min(baseDelay * multiplier, 30000);
    }

    if (this.task.concurrency === 1) {
      // 串行模式，使用基础延迟
      return baseDelay;
    }

    // 并行模式，延迟可以稍短
    return Math.max(200, baseDelay / 2);
  }


  // 带重试的卡片处理
  async processCardWithRetry(config, card, types, existingTags, strategy = {}, retryCount = 0) {
    const maxRetries = 2;
    
    try {
      const updated = await this.processCard(config, card, types, existingTags, strategy);
      return { success: updated, rateLimited: false };
    } catch (error) {
      const isRateLimit = this.isRateLimitError(error);
      
      if (isRateLimit && retryCount < maxRetries) {
        // 限流错误，等待后重试
        const retryDelay = Math.pow(2, retryCount + 1) * 1000; // 2s, 4s
        await this.sleep(retryDelay);
        return this.processCardWithRetry(config, card, types, existingTags, strategy, retryCount + 1);
      }
      
      return { 
        success: false, 
        rateLimited: isRateLimit,
        error: error.message 
      };
    }
  }

  // 检测是否为限流错误
  isRateLimitError(error) {
    if (!error) return false;
    const message = error.message || '';
    const status = error.status || error.statusCode;
    
    // HTTP 429 或包含限流关键词
    return status === 429 || 
           message.includes('429') ||
           message.includes('rate limit') ||
           message.includes('Rate limit') ||
           message.includes('too many requests') ||
           message.includes('Too Many Requests') ||
           message.includes('quota exceeded') ||
           message.includes('请求过于频繁');
  }

  // 处理单个卡片（支持多类型和策略）
  async processCard(config, card, types, existingTags, strategy = {}) {
    let updated = false;
    const isFillMode = strategy.mode !== 'overwrite';

    for (const type of types) {
      switch (type) {
        case 'name': {
          // fill 模式下跳过已有名称的卡片
          if (isFillMode && card.title && !card.title.includes('://') && !card.title.startsWith('www.')) {
            continue;
          }
          const prompt = buildPromptWithStrategy(buildNamePrompt(card), strategy);
          const result = await callAI(config, prompt);
          const name = cleanName(result);
          if (name && name !== card.title) {
            await db.updateCardName(card.id, name);
            card.title = name; // 更新本地引用，供后续类型使用
            updated = true;
          }
          break;
        }
        case 'description': {
          if (isFillMode && card.desc) {
            continue;
          }
          const prompt = buildPromptWithStrategy(buildDescriptionPrompt(card), strategy);
          const result = await callAI(config, prompt);
          const desc = cleanDescription(result);
          if (desc && desc !== card.desc) {
            await db.updateCardDescription(card.id, desc);
            card.desc = desc;
            updated = true;
          }
          break;
        }
        case 'tags': {
          // tags 总是可以补充
          const prompt = buildPromptWithStrategy(buildTagsPrompt(card, existingTags), strategy);
          const result = await callAI(config, prompt);
          const { tags, newTags } = parseTagsResponse(result, existingTags);
          const allTags = [...tags, ...newTags];
          if (allTags.length > 0) {
            await db.updateCardTags(card.id, allTags);
            updated = true;
          }
          break;
        }
      }
    }

    return updated;
  }

  // 延迟函数
  sleep(ms) {
    return new Promise(resolve => {
      const timer = setTimeout(resolve, ms);
      this.abortController?.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

// 全局任务管理器实例
const taskManager = new BatchTaskManager();

// ==================== 辅助函数 ====================

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

async function getDecryptedAIConfig() {
  const config = await db.getAIConfig();
  
  if (config.apiKey) {
    try {
      const encrypted = JSON.parse(config.apiKey);
      config.apiKey = decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag);
    } catch {
      // 可能是未加密的旧数据
    }
  }
  
  return config;
}

function validateAIConfig(config) {
  if (!config.provider) {
    return { valid: false, message: '请先配置 AI 服务' };
  }
  
  const providerConfig = AI_PROVIDERS[config.provider];
  if (!providerConfig) {
    return { valid: false, message: `不支持的提供商: ${config.provider}` };
  }
  
  if (providerConfig.needsApiKey && !config.apiKey) {
    return { valid: false, message: '请先配置 API Key' };
  }
  
  if (providerConfig.needsBaseUrl && !config.baseUrl) {
    return { valid: false, message: '请先配置 Base URL' };
  }
  
  return { valid: true };
}


// ==================== Prompt 构建函数 ====================

function buildNamePrompt(card) {
  const domain = extractDomain(card.url);
  
  return [
    {
      role: 'system',
      content: `你是网站命名专家。为导航站卡片生成简洁名称。

规则：
- 直接输出名称，无前缀/引号/标点
- 中文 2-8 字，英文/品牌名 2-15 字符
- 优先使用官方品牌名或简称
- 知名网站用大众熟知的名称
- 不加"官网"、"首页"等后缀`
    },
    {
      role: 'user',
      content: `网站：${domain}
地址：${card.url}
当前名：${card.title || '无'}

示例：github.com→GitHub, baidu.com→百度, bilibili.com→B站

输出名称：`
    }
  ];
}

function buildDescriptionPrompt(card) {
  const domain = extractDomain(card.url);
  
  return [
    {
      role: 'system',
      content: `你是网站分析专家。为导航站生成简洁描述。

规则：
- 直接输出描述，无前缀/引号
- 10-25 个中文字符
- 突出核心功能或独特价值`
    },
    {
      role: 'user',
      content: `网站：${card.title || domain}
地址：${card.url}

示例：GitHub→全球最大的代码托管和协作平台

输出描述：`
    }
  ];
}

function buildTagsPrompt(card, existingTags) {
  const domain = extractDomain(card.url);
  const tagsStr = existingTags.length > 0 
    ? existingTags.slice(0, 25).join('、')
    : '暂无';
  
  return [
    {
      role: 'system',
      content: `你是网站分类专家。推荐 2-4 个标签。

规则：
1. 优先用现有标签（完全匹配）
2. 必要时才建议新标签（2-4字）
3. 严格按 JSON 格式输出

格式：{"tags":["现有标签"],"newTags":["新标签"]}`
    },
    {
      role: 'user',
      content: `网站：${card.title || domain}
描述：${card.desc || '无'}
现有标签：${tagsStr}

输出JSON：`
    }
  ];
}

// ==================== 响应清理函数 ====================

function cleanName(text) {
  if (!text) return '';
  
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^["'「」『』""'']+|["'「」『』""'']+$/g, '')
    .replace(/^(名称[：:]\s*|网站名[：:]\s*|Name[：:]\s*)/i, '')
    .replace(/[\r\n]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(官网|首页|官方网站|Official|Home)$/i, '')
    .trim()
    .substring(0, 20);
}

function cleanDescription(text) {
  if (!text) return '';
  
  let cleaned = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^["'「」『』""'']+|["'「」『』""'']+$/g, '')
    .replace(/^(描述[：:]\s*|简介[：:]\s*|网站描述[：:]\s*|Description[：:]\s*)/i, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[。.]+$/, '');
  
  return cleaned.length > 80 ? cleaned.substring(0, 80) + '...' : cleaned;
}

function parseTagsResponse(text, existingTags) {
  if (!text) return { tags: [], newTags: [] };
  
  try {
    const cleanText = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const tags = Array.isArray(parsed.tags) 
        ? parsed.tags.filter(t => typeof t === 'string' && t.length > 0 && t.length <= 15)
        : [];
      const newTags = Array.isArray(parsed.newTags) 
        ? parsed.newTags.filter(t => typeof t === 'string' && t.length > 0 && t.length <= 10)
        : [];
      return { tags, newTags };
    }
  } catch {
    // JSON 解析失败
  }
  
  // 降级处理
  const tagMatches = text.match(/["'「」『』""'']([^"'「」『』""'']+)["'「」『』""'']/g);
  if (tagMatches?.length > 0) {
    const tags = tagMatches
      .map(t => t.replace(/["'「」『』""'']/g, '').trim())
      .filter(t => t.length > 0 && t.length <= 15);
    
    const existingSet = new Set(existingTags.map(t => t.toLowerCase()));
    const matchedTags = tags.filter(t => existingSet.has(t.toLowerCase()));
    const newTagsList = tags.filter(t => !existingSet.has(t.toLowerCase()));
    
    return { 
      tags: matchedTags.length > 0 ? matchedTags : tags.slice(0, 3), 
      newTags: newTagsList.slice(0, 2) 
    };
  }
  
  return { tags: [], newTags: [] };
}


// ==================== API 路由 ====================

// 获取 AI 配置
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const config = await db.getAIConfig();
    res.json({
      success: true,
      config: {
        provider: config.provider || 'deepseek',
        hasApiKey: !!config.apiKey,
        baseUrl: config.baseUrl || '',
        model: config.model || '',
        requestDelay: parseInt(config.requestDelay) || 1500,
        autoGenerate: config.autoGenerate === 'true' || config.autoGenerate === true
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取配置失败' });
  }
});

// 验证 AI 配置是否可用（用于备份恢复后检查）
router.get('/config/verify', authMiddleware, async (req, res) => {
  try {
    const config = await db.getAIConfig();
    
    // 检查是否有配置
    if (!config.provider) {
      return res.json({
        success: true,
        status: 'not_configured',
        message: '未配置 AI 服务'
      });
    }
    
    // 检查是否有 API Key
    if (!config.apiKey) {
      return res.json({
        success: true,
        status: 'no_api_key',
        message: '未配置 API Key',
        provider: config.provider
      });
    }
    
    // 尝试解密 API Key
    try {
      const encrypted = JSON.parse(config.apiKey);
      const decrypted = decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag);
      
      if (!decrypted) {
        return res.json({
          success: true,
          status: 'decrypt_failed',
          message: 'API Key 解密失败，可能需要重新配置',
          provider: config.provider
        });
      }
      
      // 解密成功
      return res.json({
        success: true,
        status: 'ok',
        message: 'AI 配置正常',
        provider: config.provider,
        hasValidKey: true
      });
    } catch (e) {
      // 可能是未加密的旧数据
      return res.json({
        success: true,
        status: 'ok',
        message: 'AI 配置正常（旧格式）',
        provider: config.provider,
        hasValidKey: true
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: '验证配置失败: ' + error.message });
  }
});

// 保存 AI 配置
router.post('/config', authMiddleware, async (req, res) => {
  try {
    const { provider, apiKey, baseUrl, model, requestDelay, autoGenerate } = req.body;
    
    if (!provider || !AI_PROVIDERS[provider]) {
      return res.status(400).json({ success: false, message: '无效的 AI 提供商' });
    }
    
    const providerConfig = AI_PROVIDERS[provider];
    
    if (providerConfig.needsApiKey && !apiKey) {
      const existingConfig = await db.getAIConfig();
      if (!existingConfig.apiKey) {
        return res.status(400).json({ success: false, message: 'API Key 不能为空' });
      }
    }
    
    if (providerConfig.needsBaseUrl && !baseUrl) {
      return res.status(400).json({ success: false, message: 'Base URL 不能为空' });
    }
    
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
      requestDelay: Math.max(500, Math.min(10000, requestDelay || 1500)),
      autoGenerate: autoGenerate ? 'true' : 'false'
    });
    
    res.json({ success: true, message: '配置保存成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '保存配置失败' });
  }
});

// 测试 AI 连接
router.post('/test', authMiddleware, async (req, res) => {
  try {
    const config = await getDecryptedAIConfig();
    const validation = validateAIConfig(config);
    
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }
    
    const messages = [
      { role: 'system', content: '你是助手。' },
      { role: 'user', content: '回复"OK"两个字母。' }
    ];
    
    const startTime = Date.now();
    const result = await callAI(config, messages);
    const responseTime = Date.now() - startTime;
    
    res.json({ 
      success: true, 
      message: '连接成功',
      response: result ? result.substring(0, 50) : '(空响应)',
      responseTime: `${responseTime}ms`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: `连接失败: ${error.message}` });
  }
});

// 获取统计信息
router.get('/empty-cards', authMiddleware, async (req, res) => {
  try {
    const { type, mode } = req.query;
    
    if (mode === 'all') {
      const cards = await db.getAllCards();
      return res.json({ success: true, cards, total: cards.length });
    }
    
    const cards = await db.getCardsNeedingAI(type || 'both');
    res.json({ success: true, cards, total: cards.length });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取数据失败' });
  }
});

// 高级筛选卡片
router.post('/filter-cards', authMiddleware, async (req, res) => {
  try {
    const { status = [], menuIds = [], subMenuIds = [], tagIds = [], excludeTagIds = [] } = req.body;
    const cards = await db.filterCardsForAI({ status, menuIds, subMenuIds, tagIds, excludeTagIds });
    res.json({ success: true, cards, total: cards.length });
  } catch (error) {
    res.status(500).json({ success: false, message: '筛选失败: ' + error.message });
  }
});

// AI 预览生成（不保存）
router.post('/preview', authMiddleware, async (req, res) => {
  try {
    const { cardIds, types = ['name', 'description', 'tags'], strategy = {} } = req.body;
    
    if (!cardIds || cardIds.length === 0) {
      return res.status(400).json({ success: false, message: '请选择要预览的卡片' });
    }
    
    const config = await getDecryptedAIConfig();
    const validation = validateAIConfig(config);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }
    
    const cards = await db.getCardsByIds(cardIds);
    const existingTags = types.includes('tags') ? await db.getAllTagNames() : [];
    const previews = [];
    
    for (const card of cards) {
      const preview = { cardId: card.id, title: card.title, url: card.url, fields: {} };
      
      for (const type of types) {
        const shouldGenerate = strategy.mode === 'overwrite' || 
          (type === 'name' && (!card.title || card.title.includes('://') || card.title.startsWith('www.'))) ||
          (type === 'description' && !card.desc) ||
          (type === 'tags');
        
        if (!shouldGenerate) continue;
        
        try {
          let prompt, result, cleaned;
          if (type === 'name') {
            prompt = buildPromptWithStrategy(buildNamePrompt(card), strategy);
            result = await callAI(config, prompt);
            cleaned = cleanName(result);
            preview.fields.name = { original: card.title, generated: cleaned };
          } else if (type === 'description') {
            prompt = buildPromptWithStrategy(buildDescriptionPrompt(card), strategy);
            result = await callAI(config, prompt);
            cleaned = cleanDescription(result);
            preview.fields.description = { original: card.desc, generated: cleaned };
          } else if (type === 'tags') {
            prompt = buildPromptWithStrategy(buildTagsPrompt(card, existingTags), strategy);
            result = await callAI(config, prompt);
            const parsed = parseTagsResponse(result, existingTags);
            preview.fields.tags = { original: [], generated: [...parsed.tags, ...parsed.newTags] };
          }
        } catch (e) {
          preview.fields[type] = { error: e.message };
        }
      }
      previews.push(preview);
    }
    
    res.json({ success: true, previews });
  } catch (error) {
    res.status(500).json({ success: false, message: '预览失败: ' + error.message });
  }
});

// 根据策略调整 Prompt
function buildPromptWithStrategy(basePrompt, strategy = {}) {
  if (!strategy.style || strategy.style === 'default') return basePrompt;
  
  const styleHints = {
    concise: '请尽量简洁，用最少的字表达。',
    professional: '请使用专业、正式的语言风格。',
    friendly: '请使用友好、轻松的语言风格。',
    seo: '请优化关键词，便于搜索引擎收录。'
  };
  
  if (styleHints[strategy.style] && basePrompt[0]?.role === 'system') {
    basePrompt[0].content += '\n' + styleHints[strategy.style];
  }
  
  if (strategy.customPrompt && basePrompt[0]?.role === 'system') {
    basePrompt[0].content += '\n用户要求：' + strategy.customPrompt;
  }
  
  return basePrompt;
}

// 单个卡片生成
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { type, card, existingTags } = req.body;
    
    if (!type || !card?.url) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    const config = await getDecryptedAIConfig();
    const validation = validateAIConfig(config);
    
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }
    
    const result = {};
    
    if (type === 'name' || type === 'all') {
      const prompt = buildNamePrompt(card);
      const name = await callAI(config, prompt);
      result.name = cleanName(name);
    }
    
    if (type === 'description' || type === 'both' || type === 'all') {
      const prompt = buildDescriptionPrompt(card);
      const desc = await callAI(config, prompt);
      result.description = cleanDescription(desc);
    }
    
    if (type === 'tags' || type === 'both' || type === 'all') {
      const prompt = buildTagsPrompt(card, existingTags || []);
      const tagsResult = await callAI(config, prompt);
      result.tags = parseTagsResponse(tagsResult, existingTags || []);
    }
    
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// ==================== 批量任务 API ====================

// 获取任务状态
router.get('/batch-task/status', authMiddleware, (req, res) => {
  res.json({ success: true, ...taskManager.getStatus() });
});

// 启动批量任务（支持高级模式）
router.post('/batch-task/start', authMiddleware, async (req, res) => {
  try {
    const { type, mode, cardIds, types, strategy } = req.body;
    
    if (taskManager.isRunning()) {
      return res.status(409).json({ success: false, message: '已有任务在运行中' });
    }
    
    const config = await getDecryptedAIConfig();
    const validation = validateAIConfig(config);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }
    
    let cards;
    let taskTypes;
    let taskStrategy = strategy || {};
    
    // 高级模式：指定 cardIds 和 types
    if (cardIds && Array.isArray(cardIds) && cardIds.length > 0) {
      cards = await db.getCardsByIds(cardIds);
      taskTypes = types || ['name', 'description', 'tags'];
      taskStrategy.mode = taskStrategy.mode || 'fill';
    } 
    // 兼容旧模式
    else if (type && mode) {
      if (!['name', 'description', 'tags'].includes(type)) {
        return res.status(400).json({ success: false, message: '无效的任务类型' });
      }
      if (!['empty', 'all'].includes(mode)) {
        return res.status(400).json({ success: false, message: '无效的任务模式' });
      }
      cards = mode === 'all' ? await db.getAllCards() : await db.getCardsNeedingAI(type);
      taskTypes = [type];
      taskStrategy.mode = mode === 'all' ? 'overwrite' : 'fill';
    } else {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    if (!cards || cards.length === 0) {
      return res.json({ success: true, message: '没有需要处理的卡片', total: 0 });
    }
    
    const result = await taskManager.start(config, cards, taskTypes, taskStrategy);
    
    res.json({ 
      success: true, 
      message: '任务已启动',
      total: result.total,
      types: taskTypes
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 停止批量任务
router.post('/batch-task/stop', authMiddleware, (req, res) => {
  if (!taskManager.isRunning()) {
    return res.json({ success: true, message: '没有运行中的任务' });
  }
  
  taskManager.stop();
  res.json({ success: true, message: '正在停止任务' });
});

// ==================== 更新 API ====================

router.post('/update-name', authMiddleware, async (req, res) => {
  try {
    const { cardId, name } = req.body;
    if (!cardId || typeof name !== 'string') {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    await db.updateCardName(cardId, name);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/update-description', authMiddleware, async (req, res) => {
  try {
    const { cardId, description } = req.body;
    if (!cardId || typeof description !== 'string') {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    await db.updateCardDescription(cardId, description);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/update-tags', authMiddleware, async (req, res) => {
  try {
    const { cardId, tags } = req.body;
    if (!cardId || !Array.isArray(tags)) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    await db.updateCardTags(cardId, tags);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 自动生成（供其他模块调用） ====================

async function autoGenerateForCards(cardIds) {
  const { triggerDebouncedBackup } = require('../utils/autoBackup');
  
  try {
    const rawConfig = await db.getAIConfig();
    if (rawConfig.autoGenerate !== 'true') return;
    
    const config = await getDecryptedAIConfig();
    const validation = validateAIConfig(config);
    if (!validation.valid) return;
    
    const existingTags = await db.getAllTagNames();
    const delay = Math.max(500, parseInt(rawConfig.requestDelay) || 1500);
    let hasUpdates = false;
    
    for (let i = 0; i < cardIds.length; i++) {
      const cardId = cardIds[i];
      
      try {
        const cards = await db.getCardsByIds([cardId]);
        if (!cards?.length) continue;
        
        const card = cards[0];
        let updatedTitle = null;
        let updatedDesc = null;
        
        try {
          const prompt = buildNamePrompt(card);
          const result = await callAI(config, prompt);
          updatedTitle = cleanName(result);
        } catch { /* 忽略 */ }
        
        try {
          const prompt = buildDescriptionPrompt({ ...card, title: updatedTitle || card.title });
          const result = await callAI(config, prompt);
          updatedDesc = cleanDescription(result);
        } catch { /* 忽略 */ }
        
        if (updatedTitle || updatedDesc) {
          await db.updateCardNameAndDescription(cardId, updatedTitle, updatedDesc);
          hasUpdates = true;
        }
        
        try {
          const prompt = buildTagsPrompt({ 
            ...card, 
            title: updatedTitle || card.title,
            desc: updatedDesc || card.desc 
          }, existingTags);
          const result = await callAI(config, prompt);
          const { tags, newTags } = parseTagsResponse(result, existingTags);
          const allTags = [...tags, ...newTags];
          if (allTags.length > 0) {
            await db.updateCardTags(cardId, allTags);
            hasUpdates = true;
          }
        } catch { /* 忽略 */ }
        
        if (i < cardIds.length - 1) {
          await new Promise(r => setTimeout(r, delay));
        }
      } catch { /* 忽略单个卡片错误 */ }
    }
    
    if (hasUpdates) {
      triggerDebouncedBackup();
    }
  } catch { /* 静默处理 */ }
}

module.exports = router;
module.exports.autoGenerateForCards = autoGenerateForCards;
