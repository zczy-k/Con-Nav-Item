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
const EventEmitter = require('events');

// ==================== 统一字段生成服务 ====================

/**
 * 核心生成函数：处理单个卡片的指定字段
 * @param {Object} config AI 配置
 * @param {Object} card 卡片对象
 * @param {Array} types 需要生成的字段类型 ['name', 'description', 'tags']
 * @param {Array} existingTags 现有标签列表
 * @param {Object} strategy 生成策略 { mode: 'fill'|'overwrite', style: 'default'|..., customPrompt: '' }
 * @returns {Promise<Object>} 处理结果 { updated: boolean, data: Object, error?: string }
 */
async function generateCardFields(config, card, types, existingTags, strategy = {}) {
  let updated = false;
  const isFillMode = strategy.mode !== 'overwrite';
  const resultData = { name: null, description: null, tags: null };
  const fieldErrors = []; // 记录各字段的错误

  // 1. 过滤出真正需要生成的字段
  const neededTypes = types.filter(type => {
    if (type === 'name') {
      return !(isFillMode && card.title && !card.title.includes('://') && !card.title.startsWith('www.'));
    }
    if (type === 'description') {
      return !(isFillMode && card.desc);
    }
    return true; // tags 总是可以补充
  });

  if (neededTypes.length === 0) return { updated: false, data: resultData };

  // 2. 尝试使用统一 Prompt 处理多字段（效率更高）
  if (neededTypes.length > 1) {
    try {
      const prompt = buildPromptWithStrategy(buildUnifiedPrompt(card, neededTypes, existingTags), strategy);
      const aiResponse = await callAI(config, prompt);
      const parsed = parseUnifiedResponse(aiResponse, neededTypes, existingTags);

      if (parsed.name && parsed.name !== card.title) {
        await db.updateCardName(card.id, parsed.name);
        resultData.name = parsed.name;
        card.title = parsed.name;
        updated = true;
      }
      if (parsed.description && parsed.description !== card.desc) {
        await db.updateCardDescription(card.id, parsed.description);
        resultData.description = parsed.description;
        card.desc = parsed.description;
        updated = true;
      }
      if (parsed.tags && (parsed.tags.tags.length > 0 || parsed.tags.newTags.length > 0)) {
        const allTags = [...parsed.tags.tags, ...parsed.tags.newTags];
        await db.updateCardTags(card.id, allTags);
        resultData.tags = parsed.tags; // 保持 { tags: [], newTags: [] } 格式
        updated = true;
      }
      return { updated, data: resultData };
    } catch (e) {
      console.warn(`Unified prompt failed for card ${card.id}, falling back to individual calls:`, e.message);
    }
  }

  // 3. 逐个字段处理（降级逻辑或单字段请求）
  for (const type of neededTypes) {
    try {
      let prompt, aiResponse, cleaned;
      if (type === 'name') {
        prompt = buildPromptWithStrategy(buildNamePrompt(card), strategy);
        aiResponse = await callAI(config, prompt);
        cleaned = cleanName(aiResponse);
        if (!cleaned) {
          throw new Error('AI 返回内容无效（可能是思考过程文本）');
        }
        if (cleaned !== card.title) {
          await db.updateCardName(card.id, cleaned);
          resultData.name = cleaned;
          card.title = cleaned;
          updated = true;
        }
      } else if (type === 'description') {
        prompt = buildPromptWithStrategy(buildDescriptionPrompt(card), strategy);
        aiResponse = await callAI(config, prompt);
        cleaned = cleanDescription(aiResponse);
        if (!cleaned) {
          throw new Error('AI 返回内容无效（可能是思考过程文本）');
        }
        if (cleaned !== card.desc) {
          await db.updateCardDescription(card.id, cleaned);
          resultData.description = cleaned;
          card.desc = cleaned;
          updated = true;
        }
      } else if (type === 'tags') {
        prompt = buildPromptWithStrategy(buildTagsPrompt(card, existingTags), strategy);
        aiResponse = await callAI(config, prompt);
        const { tags, newTags } = parseTagsResponse(aiResponse, existingTags);
        const allTags = [...tags, ...newTags];
        if (allTags.length > 0) {
          await db.updateCardTags(card.id, allTags);
          // 返回分离的 tags 和 newTags，而不是合并后的数组
          resultData.tags = { tags, newTags };
          updated = true;
        }
      }
    } catch (e) {
      console.error(`Failed to generate field ${type} for card ${card.id}:`, e.message);
      fieldErrors.push({ field: type, error: e.message });
      // 单字段请求时直接抛出错误
      if (neededTypes.length === 1) throw e;
    }
  }

  // 如果有部分字段失败，抛出包含详细信息的错误
  if (fieldErrors.length > 0 && !updated) {
    // 全部失败
    throw new Error(fieldErrors.map(e => `${e.field}: ${e.error}`).join('; '));
  }
  
  // 部分成功：返回结果，但附带警告信息
  if (fieldErrors.length > 0 && updated) {
    return { 
      updated, 
      data: resultData, 
      partialError: fieldErrors.map(e => `${e.field}失败`).join(', ')
    };
  }

  return { updated, data: resultData };
}

// ==================== 自适应并发批量任务管理器 ====================
class BatchTaskManager extends EventEmitter {
  constructor() {
    super();
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
        errors: this.task.errors.slice(-100)
      };
    }

  // 检查是否正在运行
  isRunning() {
    return this.task && this.task.running;
  }

  // 发送更新事件
  emitUpdate() {
    this.emit('update', this.getStatus());
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
      currentCard: '准备启动...',
      startTime: Date.now(),
      errors: [],
      // 自适应并发状态
      concurrency: this.initialConcurrency,
      isRateLimited: false,
      consecutiveSuccesses: 0,
      rateLimitCount: 0
    };

    this.emitUpdate();

    // 异步执行任务
    this.runTask(config, cards).catch(err => {
      console.error('Batch task error:', err);
      if (this.task) {
        this.task.running = false;
        this.task.errors.push({
          cardId: 0,
          cardTitle: '系统任务',
          error: err.message || '任务异常中断',
          time: Date.now()
        });
        this.emitUpdate();
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
      this.task.currentCard = '已停止';
      this.emitUpdate();
    }
    return { stopped: true };
  }

  // 执行任务（自适应并发）
  async runTask(config, cards) {
    const { notifyDataChange } = require('../utils/autoBackup');
    const types = this.task?.types || ['name'];
    const strategy = this.task?.strategy || {};
    
    try {
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
        this.emitUpdate();

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
          if (this.task) this.task.current++;

          if (result.status === 'fulfilled') {
            if (result.value.success) {
              batchSuccess++;
              if (this.task) {
                this.task.successCount++;
                // 如果有部分字段失败，记录警告（但仍算成功）
                if (result.value.partialError) {
                  this.task.errors.push({
                    cardId: card.id,
                    cardTitle: card.title || card.url,
                    error: `部分成功: ${result.value.partialError}`,
                    time: Date.now(),
                    isWarning: true // 标记为警告而非错误
                  });
                }
              }
              notifyDataChange();
            } else if (result.value.rateLimited) {
              hasRateLimit = true;
              batchFail++;
              if (this.task) {
                this.task.failCount++;
                // 记录限流错误
                this.task.errors.push({
                  cardId: card.id,
                  cardTitle: card.title || card.url,
                  error: 'API 请求受限 (Rate Limit)，请稍后再试或降低并发数',
                  time: Date.now()
                });
              }
            } else {
              batchFail++;
              if (this.task) {
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
            }
          } else {
            batchFail++;
            if (this.task) {
              this.task.failCount++;
              this.task.errors.push({
                cardId: card.id,
                cardTitle: card.title || card.url,
                error: result.reason?.message || '未知错误',
                time: Date.now()
              });
            }
          }
        }

        // 自适应调整并发数
        this.adjustConcurrency(batchSuccess, batchFail, hasRateLimit);
        
        this.emitUpdate();

        index += batch.length;

        // 延迟处理
        if (index < totalCards && this.task?.running) {
          const delay = this.calculateDelay(baseDelay, hasRateLimit);
          await this.sleep(delay);
        }
      }
    } catch (err) {
      console.error('runTask internal error:', err);
      if (this.task) {
        this.task.errors.push({ cardId: 0, cardTitle: '系统', error: err.message, time: Date.now() });
      }
      } finally {
        // 任务结束
        if (this.task) {
          // 增加一个极短的延迟确保前端能获取到最后的 100% 状态
          await new Promise(r => setTimeout(r, 500));
          this.task.running = false;
          this.task.currentCard = '';
          this.task.current = this.task.total;
          this.emitUpdate();
          
          // 任务完全结束后，最后触发一次全局数据变更通知
          try {
            notifyDataChange();
          } catch (e) {
            console.warn('Final notifyDataChange failed:', e.message);
          }
        }
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
      const result = await generateCardFields(config, card, types, existingTags, strategy);
      // 部分成功也算成功，但记录警告
      return { 
        success: true, 
        updated: result.updated, 
        rateLimited: false,
        partialError: result.partialError // 可能为 undefined
      };
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

function buildUnifiedPrompt(card, types, existingTags) {
  const domain = extractDomain(card.url);
  const tagsStr = existingTags.length > 0 
    ? existingTags.slice(0, 30).join('、')
    : '暂无';
  
  const currentName = card.title && !card.title.includes('://') && !card.title.startsWith('www.') 
    ? card.title : '';

  const messages = [
    {
      role: 'system',
      content: `你是一个专业的互联网产品分析师和导航站编辑。你的任务是根据网站URL和基本信息，生成高质量的导航卡片元数据。

请严格遵守以下准则：
1. **名称 (name)**:
   - 提取品牌核心名称，如 "GitHub"、"哔哩哔哩"、"Notion"。
   - 严禁包含 "官网"、"首页"、"登录页"、"Official Website" 等冗余词汇。
   - 长度控制：中文 2-8 字，英文/品牌名 2-15 字符。
2. **描述 (description)**:
   - 简洁有力，一句话概括核心功能或独特价值，如 "全球领先的代码托管与协作开发平台"。
   - 避免使用 "这是一个..."、"本网站提供..." 等废话。
   - 长度控制：12-28 个中文字符，确保语义完整且逻辑清晰。
3. **标签 (tags)**:
   - 推荐 2-4 个精准标签。
   - 优先从提供的 "现有标签列表" 中选择完全匹配的标签。
   - 仅在现有标签无法准确覆盖时，才生成 1-2 个新的专业标签（每个 2-4 字）。

输出格式：必须且只能输出合法的 JSON 对象。`
    },
    { role: 'user', content: '网站:github.com 现有标签:开发工具,代码托管,开源,AI,视频' },
    { role: 'assistant', content: '{"name":"GitHub","description":"全球领先的代码托管与开源协作开发平台","tags":["开发工具","代码托管"]}' },
    { role: 'user', content: '网站:bilibili.com 现有标签:视频,弹幕,社区,动漫,游戏' },
    { role: 'assistant', content: '{"name":"哔哩哔哩","description":"国内领先的年轻人文化社区与视频弹幕网站","tags":["视频","社区"]}' },
    { role: 'user', content: `网站:${card.url}${currentName ? ` 当前参考名:${currentName}` : ''} 现有标签:${tagsStr}` }
  ];

  return messages;
}

function buildNamePrompt(card) {
  const domain = extractDomain(card.url);
  const commonRules = '\n注意：严禁输出任何思考过程或解释，直接输出结果。';
  
  return [
    {
      role: 'system',
      content: `你是一个精炼的网站命名专家。
规则：
1. 只输出品牌核心名称，如 "百度" 而不是 "百度一下，你就知道"。
2. 剔除 "官网"、"首页"、"官方网站" 等后缀。
3. 中文 2-8 字，英文 2-15 字符。
4. 优先考虑大众熟知的品牌简称。${commonRules}`
    },
    {
      role: 'user',
      content: `网站地址：${card.url}
当前抓取名：${card.title || '无'}
输出名称：`
    }
  ];
}

function buildDescriptionPrompt(card) {
  const domain = extractDomain(card.url);
  const commonRules = '\n注意：严禁输出任何思考过程或解释，直接输出描述文本。';
  
  return [
    {
      role: 'system',
      content: `你是一个资深的导航站文案编辑。
规则：
1. 用一句话精准描述网站的核心功能和价值。
2. 杜绝 "这是一个"、"旨在提供" 等前缀，直击重点。
3. 字数严格控制在 12-28 个汉字之间。
4. 语言要专业、体面，符合中文阅读习惯。${commonRules}`
    },
    {
      role: 'user',
      content: `网站名称：${card.title || domain}
网站地址：${card.url}
输出描述：`
    }
  ];
}

function buildTagsPrompt(card, existingTags) {
  const domain = extractDomain(card.url);
  const tagsStr = existingTags.length > 0 
    ? existingTags.slice(0, 30).join('、')
    : '暂无';
  
  const commonRules = '\n注意：严禁输出任何思考过程，严格按 JSON 格式输出。';
  
  return [
    {
      role: 'system',
      content: `你是一个专业的互联网资源分类专家。
任务：为网站分配 2-4 个最合适的分类标签。
准则：
1. 优先从下方的 "现有标签" 列表中选择。
2. 如果现有标签不足以准确分类，可补充 1-2 个新标签（每个 2-4 字）。
3. 确保标签具有通用性和检索价值。

输出格式：{"tags":["选中的现有标签"],"newTags":["建议的新标签"]}${commonRules}`
    },
    {
      role: 'user',
      content: `网站名称：${card.title || domain}
网站描述：${card.desc || '暂无'}
现有标签：${tagsStr}
输出JSON：`
    }
  ];
}

function parseUnifiedResponse(text, types, existingTags) {
  const result = { name: '', description: '', tags: { tags: [], newTags: [] } };
  if (!text) return result;

  try {
    // 增强的 JSON 提取逻辑
    const cleanText = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (types.includes('name') && parsed.name) result.name = cleanName(parsed.name);
      if (types.includes('description') && parsed.description) result.description = cleanDescription(parsed.description);
      if (types.includes('tags') && Array.isArray(parsed.tags)) {
        const filteredTags = parsed.tags.filter(t => typeof t === 'string' && t.length > 0 && t.length <= 15);
        // 分离现有标签和新标签
        const existingSet = new Set(existingTags.map(t => t.toLowerCase()));
        const matchedTags = filteredTags.filter(t => existingSet.has(t.toLowerCase()));
        const newTagsList = filteredTags.filter(t => !existingSet.has(t.toLowerCase()));
        result.tags = { tags: matchedTags, newTags: newTagsList };
      }
      return result;
    }
  } catch (e) {
    console.error('Failed to parse unified response:', e.message);
  }

  // 降级：如果 JSON 解析完全失败，尝试正则提取
  if (types.includes('name')) {
    const nameMatch = text.match(/"name":\s*"([^"]+)"/);
    if (nameMatch) result.name = cleanName(nameMatch[1]);
  }
  if (types.includes('description')) {
    const descMatch = text.match(/"description":\s*"([^"]+)"/);
    if (descMatch) result.description = cleanDescription(descMatch[1]);
  }

  return result;
}

function buildNamePrompt(card) {
  const domain = extractDomain(card.url);
  
  const commonRules = '\n注意：严禁输出任何思考过程、内心独白或“我无法访问”等反馈，直接输出结果。';
  
  return [
    {
      role: 'system',
      content: `你是网站命名专家。为导航站卡片生成简洁名称。

规则：
- 直接输出名称，无前缀/引号/标点
- 中文 2-8 字，英文/品牌名 2-15 字符
- 优先使用官方品牌名或简称
- 知名网站用大众熟知的名称
- 不加"官网"、"首页"等后缀${commonRules}`
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
  
  const commonRules = '\n注意：严禁输出任何思考过程、内心独白或“我无法访问”等反馈，直接输出描述。';
  
  return [
    {
      role: 'system',
      content: `你是网站分析专家。为导航站生成简洁描述。

规则：
- 直接输出描述，无前缀/引号
- 10-25 个中文字符
- 突出核心功能或独特价值${commonRules}`
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
  
  const commonRules = '\n注意：严禁输出任何思考过程、内心独白或“我无法访问”等反馈，严格按 JSON 格式输出结果。';
  
  return [
    {
      role: 'system',
      content: `你是网站分类专家。推荐 2-4 个标签。

规则：
1. 优先用现有标签（完全匹配）
2. 必要时才建议新标签（2-4字）
3. 严格按 JSON 格式输出

格式：{"tags":["现有标签"],"newTags":["新标签"]}${commonRules}`
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

// AI 思考过程的特征模式（需要过滤掉）
const AI_THINKING_PATTERNS = [
  /(我需要|让我|由于我|首先|接下来|根据|分析|查看|访问|了解|无法|我将|我无法).{0,50}(网站|内容|信息|功能|特点|地址|链接|URL)/,
  /^(我需要|让我|由于我|首先|接下来|根据|分析|查看|访问|了解|无法|好的|没问题)/,
  /^(This|I need|Let me|Since I|First|Based on|According to|Okay|Sure).{0,50}/i,
  /无法(直接)?访问/,
  /外部(网站|链接|地址)/,
  /请提供(更多|详细)/,
  /核心功能是什么/
];

function isAIThinkingText(text) {
  if (!text || text.length < 5) return false;
  
  // 移除常见的标签和代码块标记再检查
  const clean = text.replace(/<[^>]+>/g, '').trim();
  
  return AI_THINKING_PATTERNS.some(pattern => pattern.test(clean));
}

function stripThoughtTags(text) {
  if (!text) return '';
  return text
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/【思考】[\s\S]*?【\/思考】/g, '')
    .trim();
}

function cleanName(text) {
  if (!text) return '';
  
  let processed = stripThoughtTags(text);
  
  // 检测是否为 AI 思考过程文本
  if (isAIThinkingText(processed)) {
    console.warn('Detected AI thinking text in name, rejecting:', processed.substring(0, 50));
    return '';
  }
  
  return processed
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^["'「」『』""'']+|["'「」『』""'']+$/g, '')
    .replace(/^(名称[：:]\s*|网站名[：:]\s*|Name[：:]\s*)/i, '')
    .replace(/[\r\n]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/(官网|首页|官方网站|Official|Home)$/i, (match, p1) => {
      return processed.length <= 4 ? match : '';
    })
    .trim()
    .substring(0, 20);
}

function cleanDescription(text) {
  if (!text) return '';
  
  let processed = stripThoughtTags(text);
  
  // 检测是否为 AI 思考过程文本
  if (isAIThinkingText(processed)) {
    console.warn('Detected AI thinking text in description, rejecting:', processed.substring(0, 50));
    return '';
  }
  
  let cleaned = processed
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
          autoGenerate: config.autoGenerate === 'true' || config.autoGenerate === true,
          lastTestedOk: config.lastTestedOk === 'true' || config.lastTestedOk === true
        }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取配置失败' });
  }
});

// 验证 AI 配置（用于备份恢复后检查加密密钥是否一致）
router.get('/config/verify', authMiddleware, async (req, res) => {
  try {
    const config = await db.getAIConfig();
    if (!config.apiKey) {
      return res.json({ success: true, status: 'not_configured' });
    }
    
    try {
      const encrypted = JSON.parse(config.apiKey);
      const decrypted = decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag);
      if (decrypted) {
        return res.json({ success: true, status: 'ok' });
      }
    } catch (e) {
      return res.json({ success: true, status: 'decrypt_failed', message: 'API Key 解密失败' });
    }
    
    res.json({ success: true, status: 'decrypt_failed' });
  } catch (error) {
    res.status(500).json({ success: false, message: '验证配置失败' });
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
    
    let encryptedApiKey = undefined; // 使用 undefined 触发 db.saveAIConfig 的跳过逻辑
    if (apiKey && apiKey !== '••••••') {
      const encrypted = encrypt(apiKey);
      encryptedApiKey = JSON.stringify(encrypted);
    }
    
    await db.saveAIConfig({
      provider,
      apiKey: encryptedApiKey,
      baseUrl: baseUrl || '',
      model: model || '',
      requestDelay: Math.max(500, Math.min(10000, requestDelay || 1500)),
      autoGenerate: autoGenerate ? 'true' : 'false',
      lastTestedOk: 'false'
    });
    
    res.json({ success: true, message: '配置保存成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '保存配置失败' });
  }
});

// 测试 AI 连接
router.post('/test', authMiddleware, async (req, res) => {
  try {
    const { provider, apiKey, baseUrl, model } = req.body;
    
    // 1. 获取基础配置
    let config;
    if (provider) {
      // 如果提供了 provider，说明用户可能在尝试新配置
      const savedConfig = await db.getAIConfig();
      
      // 处理 API Key
      let actualApiKey = apiKey;
      if (!apiKey || apiKey === '••••••') {
        // 如果未提供新 Key 或提供的是掩码，且 provider 没变，则使用数据库中的 Key
        if (provider === savedConfig.provider && savedConfig.apiKey) {
          try {
            const encrypted = JSON.parse(savedConfig.apiKey);
            actualApiKey = decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag);
          } catch (e) {
            actualApiKey = savedConfig.apiKey; // 兼容旧数据
          }
        }
      }

      config = {
        provider,
        apiKey: actualApiKey,
        baseUrl: baseUrl || '',
        model: model || ''
      };
    } else {
      // 否则使用已保存的完整配置
      config = await getDecryptedAIConfig();
    }

    // 2. 验证配置
    const validation = validateAIConfig(config);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }
    
    // 3. 执行测试请求
    const messages = [
      { role: 'system', content: 'You are a helpful assistant. Response with "OK" only.' }, 
      { role: 'user', content: 'Connection test. Respond with OK.' }
    ];
    
    const startTime = Date.now();
    const aiResponse = await callAI(config, messages);
    const responseTime = Date.now() - startTime;

    if (!aiResponse) {
      throw new Error('AI 未返回任何内容');
    }

    // 测试成功，持久化状态
    await db.saveAIConfig({ lastTestedOk: 'true' });

    res.json({ 
      success: true, 
      responseTime: `${responseTime}ms`,
      preview: aiResponse.substring(0, 100) + (aiResponse.length > 100 ? '...' : '')
    });
  } catch (error) {
    console.error('AI Test Connection Error:', error);
    // 测试失败，持久化状态
    await db.saveAIConfig({ lastTestedOk: 'false' });
    res.status(500).json({ 
      success: false, 
      message: error.message || '连接失败' 
    });
  }
});

// 获取所有统计信息 (优化后的接口)
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const [nameCards, descCards, tagCards, allCards] = await Promise.all([
      db.getCardsNeedingAI('name'),
      db.getCardsNeedingAI('description'),
      db.getCardsNeedingAI('tags'),
      db.getAllCards()
    ]);
    res.json({
      success: true,
      stats: {
        emptyName: nameCards.length,
        emptyDesc: descCards.length,
        emptyTags: tagCards.length,
        total: allCards.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取统计失败' });
  }
});

// 旧版统计接口 (兼容)
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
    res.status(500).json({ success: false, message: '筛选失败' });
  }
});

// AI 预览生成（不保存，仅展示 AI 将生成的内容）
router.post('/preview', authMiddleware, async (req, res) => {
  try {
    const { cardIds, types = ['name', 'description', 'tags'], strategy = {} } = req.body;
    if (!cardIds?.length) return res.status(400).json({ success: false, message: '请选择卡片' });
    
    const config = await getDecryptedAIConfig();
    const validation = validateAIConfig(config);
    if (!validation.valid) return res.status(400).json({ success: false, message: validation.message });
    
    const cards = await db.getCardsByIds(cardIds);
    const existingTags = types.includes('tags') ? await db.getAllTagNames() : [];
    const previews = [];
    
    for (const card of cards) {
      const preview = { cardId: card.id, title: card.title, url: card.url, fields: {} };
      
      // 预览时强制使用 overwrite 模式，确保总是展示 AI 将生成的内容
      const previewStrategy = { ...strategy, mode: 'overwrite' };
      
      for (const type of types) {
        try {
          // 直接调用 AI 生成，但不保存到数据库
          let generated = null;
          
          if (type === 'name') {
            const prompt = buildPromptWithStrategy(buildNamePrompt(card), previewStrategy);
            const aiResponse = await callAI(config, prompt);
            generated = cleanName(aiResponse);
            preview.fields.name = { original: card.title || '', generated };
          } else if (type === 'description') {
            const prompt = buildPromptWithStrategy(buildDescriptionPrompt(card), previewStrategy);
            const aiResponse = await callAI(config, prompt);
            generated = cleanDescription(aiResponse);
            preview.fields.description = { original: card.desc || '', generated };
          } else if (type === 'tags') {
            const prompt = buildPromptWithStrategy(buildTagsPrompt(card, existingTags), previewStrategy);
            const aiResponse = await callAI(config, prompt);
            const { tags, newTags } = parseTagsResponse(aiResponse, existingTags);
            generated = [...tags, ...newTags];
            preview.fields.tags = { original: [], generated };
          }
        } catch (e) {
          preview.fields[type] = { original: '', generated: '', error: e.message };
        }
      }
      previews.push(preview);
    }
    res.json({ success: true, previews });
  } catch (error) {
    res.status(500).json({ success: false, message: '预览失败: ' + error.message });
  }
});

// 单个卡片生成并保存
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { type, card, existingTags } = req.body;
    if (!type || !card?.url) return res.status(400).json({ success: false, message: '参数不完整' });
    
    const config = await getDecryptedAIConfig();
    const validation = validateAIConfig(config);
    if (!validation.valid) return res.status(400).json({ success: false, message: validation.message });
    
    const types = type === 'all' ? ['name', 'description', 'tags'] : type === 'both' ? ['name', 'description'] : [type];
    const { updated, data } = await generateCardFields(config, card, types, existingTags || [], { mode: 'overwrite' });
    
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== 批量任务 API ====================

router.get('/batch-task/status', authMiddleware, (req, res) => {
  res.json({ success: true, ...taskManager.getStatus() });
});

router.get('/batch-task/stream', authMiddleware, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(taskManager.getStatus())}\n\n`);
  if (res.flush) res.flush();

  const onUpdate = (status) => {
    res.write(`data: ${JSON.stringify(status)}\n\n`);
    if (res.flush) res.flush();
  };
  taskManager.on('update', onUpdate);
  req.on('close', () => taskManager.removeListener('update', onUpdate));
});

router.post('/batch-task/start', authMiddleware, async (req, res) => {
  try {
    const { type, mode, cardIds, types, strategy } = req.body;
    if (taskManager.isRunning()) return res.status(409).json({ success: false, message: '已有任务运行中' });
    
    const config = await getDecryptedAIConfig();
    const validation = validateAIConfig(config);
    if (!validation.valid) return res.status(400).json({ success: false, message: validation.message });
    
    let cards;
    let taskTypes;
    let taskStrategy = strategy || {};
    
    if (cardIds?.length) {
      cards = await db.getCardsByIds(cardIds);
      taskTypes = types || ['name', 'description', 'tags'];
      taskStrategy.mode = taskStrategy.mode || 'fill';
    } else if (type && mode) {
      taskTypes = type === 'all' ? ['name', 'description', 'tags'] : [type];
      cards = mode === 'all' ? await db.getAllCards() : await db.getCardsNeedingAI(type === 'all' ? 'both' : type);
      taskStrategy.mode = mode === 'all' ? 'overwrite' : 'fill';
    } else {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }
    
    if (!cards?.length) return res.json({ success: true, message: '没有卡片', total: 0 });
    const result = await taskManager.start(config, cards, taskTypes, taskStrategy);
    res.json({ success: true, total: result.total, types: taskTypes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/batch-task/stop', authMiddleware, (req, res) => {
  taskManager.stop();
  res.json({ success: true });
});

// ==================== 辅助逻辑 ====================

function buildPromptWithStrategy(basePrompt, strategy = {}) {
  if (!strategy.style || strategy.style === 'default') return basePrompt;
  const styleHints = { concise: '简洁', professional: '专业', friendly: '友好', seo: 'SEO 优化' };
  if (styleHints[strategy.style] && basePrompt[0]?.role === 'system') {
    basePrompt[0].content += `\n风格要求：${styleHints[strategy.style]}`;
  }
  if (strategy.customPrompt && basePrompt[0]?.role === 'system') {
    basePrompt[0].content += `\n额外要求：${strategy.customPrompt}`;
  }
  return basePrompt;
}

// 自动生成供外部调用
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
      const cards = await db.getCardsByIds([cardIds[i]]);
      if (!cards?.length) continue;
      
      const card = cards[0];
      let cardUpdated = false;
      
      // 智能策略：根据需要生成的字段数量选择方案
      const needsName = !card.title || card.title.includes('://') || card.title.startsWith('www.');
      const needsDesc = !card.desc;
      
      // Token优化策略：
      // - 需要 name + desc + tags (3个): 统一生成 (~350 tokens)
      // - 需要 name + desc (2个): 统一生成 name+desc，然后单独生成tags (~400 tokens)
      // - 只需要 name 或 desc (1个): 单字段生成 + tags (~300 tokens)
      // - 只需要 tags: 单独生成 (~200 tokens)
      
      if (needsName && needsDesc) {
        // 情况1: 需要name和desc，统一生成所有字段（最省token）
        try {
          const { updated } = await generateCardFields(config, card, ['name', 'description', 'tags'], existingTags, { mode: 'fill' });
          if (updated) cardUpdated = true;
        } catch (e) {
          console.warn(`Auto-generate failed for card ${card.id}, falling back:`, e.message);
          // 失败时降级：先生成name+desc，再生成tags
          try {
            const { updated: updated1 } = await generateCardFields(config, card, ['name', 'description'], existingTags, { mode: 'fill' });
            if (updated1) cardUpdated = true;
            await new Promise(r => setTimeout(r, delay / 2));
            const { updated: updated2 } = await generateCardFields(config, card, ['tags'], existingTags, { mode: 'fill' });
            if (updated2) cardUpdated = true;
          } catch (e2) {
            console.warn(`Fallback generation also failed for card ${card.id}`);
          }
        }
      } else if (needsName || needsDesc) {
        // 情况2: 只需要name或desc其中之一，单独生成该字段
        const fieldType = needsName ? 'name' : 'description';
        try {
          const { updated } = await generateCardFields(config, card, [fieldType], existingTags, { mode: 'overwrite' });
          if (updated) cardUpdated = true;
          await new Promise(r => setTimeout(r, delay / 2));
        } catch (e) {
          console.warn(`Auto-generate ${fieldType} failed for card ${card.id}:`, e.message);
        }
        
        // 然后生成tags
        try {
          const { updated } = await generateCardFields(config, card, ['tags'], existingTags, { mode: 'fill' });
          if (updated) cardUpdated = true;
        } catch (e) {
          console.warn(`Auto-generate tags failed for card ${card.id}:`, e.message);
        }
      } else {
        // 情况3: name和desc都有，只生成tags
        try {
          const { updated } = await generateCardFields(config, card, ['tags'], existingTags, { mode: 'fill' });
          if (updated) cardUpdated = true;
        } catch (e) {
          console.warn(`Auto-generate tags failed for card ${card.id}:`, e.message);
        }
      }
      
      if (cardUpdated) hasUpdates = true;
      
      // 卡片间延迟
      if (i < cardIds.length - 1) await new Promise(r => setTimeout(r, delay));
    }
    if (hasUpdates) triggerDebouncedBackup();
  } catch {}
}

module.exports = router;
module.exports.autoGenerateForCards = autoGenerateForCards;
