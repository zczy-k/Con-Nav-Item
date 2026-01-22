/**
 * AI 功能路由
 * 提供 AI 配置管理、批量生成任务等功能
 * 支持自适应并发处理策略
 */
const express = require('express');
const router = express.Router();
const authMiddleware = require('./authMiddleware');
const db = require('../db');
const { AI_PROVIDERS, callAI, probeBaseUrl } = require('../utils/aiProvider');
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
  const unchanged = {}; // 记录哪些字段生成成功但与原值相同
  const fieldErrors = []; // 记录各字段的错误

  // 1. 过滤出真正需要生成的字段
  const neededTypes = types.filter(type => {
    if (type === 'name') {
      return !(isFillMode && !checkIsDirtyName(card.title, card.url));
    }
    if (type === 'description') {
      return !(isFillMode && !checkIsDirtyDesc(card.desc, card.title, card.url));
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
          } else {
            unchanged.name = true;
            resultData.name = cleaned;
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
          } else {
            unchanged.description = true;
            resultData.description = cleaned;
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
  if (fieldErrors.length > 0 && !updated && Object.keys(unchanged).length === 0) {
    // 全部失败
    throw new Error(fieldErrors.map(e => `${e.field}: ${e.error}`).join('; '));
  }
  
  // 部分成功：返回结果，但附带警告信息
  if (fieldErrors.length > 0 && (updated || Object.keys(unchanged).length > 0)) {
    return { 
      updated, 
      data: resultData,
      unchanged: Object.keys(unchanged).length > 0 ? unchanged : undefined,
      partialError: fieldErrors.map(e => `${e.field}失败`).join(', ')
    };
  }

  return { updated, data: resultData, unchanged: Object.keys(unchanged).length > 0 ? unchanged : undefined };
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
    // 限流重试配置
    this.maxAutoRetries = 3;
    this.rateLimitBaseDelay = 5000;
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
      retryQueueSize: this.task.retryQueue?.length || 0,
      autoRetryRound: this.task.autoRetryRound || 0,
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
      rateLimitCount: 0,
      // 自动重试队列
      retryQueue: [],
      autoRetryRound: 0,
      processedCardIds: new Set()
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

  // 执行任务（自适应并发 + 自动重试队列）
  async runTask(config, cards) {
    const { notifyDataChange } = require('../utils/autoBackup');
    const types = this.task?.types || ['name'];
    const strategy = this.task?.strategy || {};
    
    try {
      const existingTags = types.includes('tags') ? await db.getAllTagNames() : [];
      const rawConfig = await db.getAIConfig();
      const baseDelay = Math.max(500, Math.min(10000, parseInt(rawConfig.requestDelay) || 1500));

      // 第一轮：处理所有卡片
      await this.processBatch(config, cards, types, existingTags, strategy, baseDelay);

      // 自动重试轮次：处理限流失败的卡片
      while (
        this.task?.retryQueue?.length > 0 && 
        this.task.autoRetryRound < this.maxAutoRetries &&
        this.task?.running &&
        !this.abortController?.signal.aborted
      ) {
        this.task.autoRetryRound++;
        const retryCards = [...this.task.retryQueue];
        this.task.retryQueue = [];
        
        // 重试前增加等待时间（指数退避）
        const retryWaitTime = this.rateLimitBaseDelay * Math.pow(2, this.task.autoRetryRound - 1);
        this.task.currentCard = `⏳ 限流等待中 (${Math.round(retryWaitTime/1000)}秒后重试 ${retryCards.length} 个)...`;
        this.task.isRateLimited = true;
        this.emitUpdate();
        
        await this.sleep(retryWaitTime);
        
        if (!this.task?.running || this.abortController?.signal.aborted) break;
        
        // 重试时降低并发
        this.task.concurrency = Math.max(1, Math.floor(this.task.concurrency / 2));
        this.task.currentCard = `🔄 自动重试第 ${this.task.autoRetryRound} 轮 (${retryCards.length} 个)`;
        this.task.isRateLimited = false;
        this.emitUpdate();
        
        // 从错误列表中移除即将重试的卡片
        const retryCardIds = new Set(retryCards.map(c => c.id));
        this.task.errors = this.task.errors.filter(e => !retryCardIds.has(e.cardId) || e.isWarning);
        // 重试的卡片失败计数减少
        this.task.failCount = Math.max(0, this.task.failCount - retryCards.length);
        
        await this.processBatch(config, retryCards, types, existingTags, strategy, baseDelay * 2);
      }

    } catch (err) {
      console.error('runTask internal error:', err);
      if (this.task) {
        this.task.errors.push({ cardId: 0, cardTitle: '系统', error: err.message, time: Date.now() });
      }
    } finally {
      // 任务结束
      if (this.task) {
        await new Promise(r => setTimeout(r, 500));
        this.task.running = false;
        this.task.currentCard = '';
        this.emitUpdate();
        
        try {
          notifyDataChange();
        } catch (e) {
          console.warn('Final notifyDataChange failed:', e.message);
        }
      }
    }
  }

  // 处理一批卡片
  async processBatch(config, cards, types, existingTags, strategy, baseDelay) {
    const { notifyDataChange } = require('../utils/autoBackup');
    let index = 0;
    const totalCards = cards.length;

    while (index < totalCards) {
      if (this.abortController?.signal.aborted || !this.task?.running) {
        break;
      }

      const currentConcurrency = this.task.concurrency;
      const batch = cards.slice(index, index + currentConcurrency);
      
      this.task.currentCard = batch.map(c => c.title || extractDomain(c.url)).join(', ');
      this.emitUpdate();

      const results = await Promise.allSettled(
        batch.map(card => this.processCardWithRetry(config, card, types, existingTags, strategy))
      );

      let batchSuccess = 0;
      let batchFail = 0;
      let hasRateLimit = false;

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const card = batch[i];
        
        // 只有首次处理才增加 current
        if (!this.task.processedCardIds.has(card.id)) {
          this.task.current++;
          this.task.processedCardIds.add(card.id);
        }

        if (result.status === 'fulfilled') {
          if (result.value.success) {
            batchSuccess++;
            this.task.successCount++;
            if (result.value.partialError) {
              this.task.errors.push({
                cardId: card.id,
                cardTitle: card.title || card.url,
                error: `部分成功: ${result.value.partialError}`,
                time: Date.now(),
                isWarning: true
              });
            }
            notifyDataChange();
          } else if (result.value.rateLimited) {
            hasRateLimit = true;
            batchFail++;
            this.task.failCount++;
            // 加入重试队列
            if (!this.task.retryQueue.some(c => c.id === card.id)) {
              this.task.retryQueue.push(card);
            }
            this.task.errors.push({
              cardId: card.id,
              cardTitle: card.title || card.url,
              error: `API 请求受限，已加入自动重试队列 (第${this.task.autoRetryRound + 1}轮)`,
              time: Date.now(),
              isRateLimited: true
            });
          } else {
            batchFail++;
            this.task.failCount++;
            this.task.errors.push({
              cardId: card.id,
              cardTitle: card.title || card.url,
              error: result.value.error || '未知错误',
              time: Date.now()
            });
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

      this.adjustConcurrency(batchSuccess, batchFail, hasRateLimit);
      this.emitUpdate();

      index += batch.length;

      if (index < totalCards && this.task?.running) {
        const delay = this.calculateDelay(baseDelay, hasRateLimit);
        await this.sleep(delay);
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

/**
 * 检查名称是否为"脏数据"（低质量数据，需要 AI 优化）
 * 核心原则：宁可多优化，也不遗漏——AI 的价值在于智能提炼，不是简单清洗
 */
function checkIsDirtyName(title, url) {
  if (!title) return true;
  const domain = extractDomain(url);
  const lowerTitle = title.toLowerCase();
  const lowerDomain = domain.toLowerCase();

  // 1. 基础垃圾特征（必须优化）
  const hasGarbage = (
    title.includes('://') || 
    title.startsWith('www.') ||
    /[\|\-\_·–—]{1,}/.test(title) // 包含任何分隔符（通常是 SEO 拼接）
  );

  // 2. 纯功能性词汇（无品牌信息）
  const isPureFunctional = /^(首页|官网|Home|Official|Login|Signin|Sign in|Welcome|欢迎光临|未命名|新建卡片|Dashboard|Console)$/i.test(title.trim());

  // 3. 包含需要清洗的词汇
  const needsCleaning = /首页|官网|官方网站|Home|Official|Login|Signin|Sign in|Welcome|欢迎|Documentation|Docs/i.test(title);

  // 4. 标题过长（超过15字通常包含冗余信息，需要 AI 提炼精简）
  const isTooLong = title.length > 15;

  // 5. 看起来像完整的 HTML title（通常包含品牌名 + 页面描述的组合）
  const looksLikeHtmlTitle = (
    /[·\|:\-–—]/.test(title) || // 包含常见的 title 分隔符
    title.includes(' - ') ||
    title.includes(' | ') ||
    title.includes(' · ')
  );

  // 6. 纯域名或域名简写
  const isDomainOnly = (
    (lowerTitle === lowerDomain) ||
    (lowerDomain.includes(lowerTitle) && title.length < 4)
  );

  return (
    hasGarbage || 
    isPureFunctional ||
    needsCleaning ||
    isTooLong ||
    looksLikeHtmlTitle ||
    isDomainOnly
  );
}

/**
 * 检查描述是否为"脏数据"（需要 AI 优化）
 * 核心原则：导航站描述应该精炼、有价值，而非网页原始 meta description
 */
function checkIsDirtyDesc(desc, title, url) {
  if (!desc) return true;
  const domain = extractDomain(url);
  
  // 1. 扩展生成的低质量描述
  const isExtensionGenerated = title && (desc.includes(title) && desc.includes(domain));
  
  // 2. SEO 关键词堆砌
  const isSEOSpam = (desc.match(/,|，|\|/g) || []).length > 3;
  
  // 3. 无意义的描述模式
  const isGenericDesc = /请提供|无法访问|描述如下|网站介绍|站点简介|本页面|该网站|点击访问|欢迎访问|欢迎来到|最新|最好|最全|一站式/i.test(desc);
  
  // 4. 过短（信息量不足）或过长（需要精炼）
  const isBadLength = desc.length < 15 || desc.length > 80;
  
  // 5. 看起来像原始 meta description（通常包含品牌名重复、网址、或营销语言）
  const looksLikeMeta = (
    desc.includes(domain) ||
    desc.includes('http') ||
    /官方|官网|正版|权威|领先|专业的|优质的|最大的/i.test(desc)
  );

  return (
    isExtensionGenerated ||
    isSEOSpam ||
    isGenericDesc ||
    isBadLength ||
    looksLikeMeta
  );
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


// ==================== 智能页面类型分析系统 ====================

/**
 * 分析 URL 并返回详细的页面类型信息
 * @param {string} url 网站地址
 * @param {string} title 页面标题（可选）
 * @returns {Object} 页面类型分析结果
 */
function analyzePageType(url, title = '') {
  const result = {
    type: 'homepage',       // homepage | subpage | functional | content | special
    category: '',           // docs | blog | login | dashboard | tool | product | download | api | forum | ...
    brand: '',              // 从域名或URL提取的品牌名
    hints: [],              // 给AI的提示信息
    confidence: 'low'       // low | medium | high
  };

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');
    const pathname = urlObj.pathname;
    const search = urlObj.search;
    const pathParts = pathname.split('/').filter(p => p.length > 0);

    // 1. 提取品牌名（从域名）
    const domainParts = hostname.split('.');
    if (domainParts.length >= 2) {
      // 处理子域名情况（如 docs.example.com, api.example.com）
      if (['docs', 'api', 'app', 'blog', 'help', 'support', 'status', 'dev', 'auth', 'login', 'console', 'dashboard', 'admin'].includes(domainParts[0])) {
        result.brand = domainParts[1];
        result.category = domainParts[0];
        result.type = 'subpage';
        result.hints.push(`子域名表明这是 ${domainParts[0]} 类型页面`);
      } else {
        result.brand = domainParts[0];
      }
    }

    // 2. 分析路径模式
      const pathPatterns = {
        docs: ['/docs', '/documentation', '/guide', '/guides', '/manual', '/wiki', '/reference', '/api-docs', '/api-reference', '/git-guides', '/docs-v', '/docs/v', '/learn', '/tutorial', '/handbook', '/getting-started'],
        blog: ['/blog', '/posts', '/post/', '/articles', '/article/', '/news', '/updates', '/changelog', '/release-notes', '/p/', '/notes/', '/stories', '/archive'],
        login: ['/login', '/signin', '/sign-in', '/auth', '/authenticate', '/sso', '/oauth', '/register', '/signup', '/sign-up', '/account/login', '/join', '/onboarding'],
        dashboard: ['/dashboard', '/console', '/admin', '/panel', '/manage', '/workspace', '/hub', '/portal', '/overview', '/analytics'],
        tool: ['/tool', '/tools', '/app', '/editor', '/generator', '/converter', '/calculator', '/playground', '/workbench', '/studio', '/sandbox', '/demo'],
        product: ['/product', '/products', '/pricing', '/plans', '/features', '/solutions', '/enterprise', '/about', '/tour', '/showcase', '/case-studies'],
        download: ['/download', '/downloads', '/release', '/releases', '/install', '/get-started', '/setup'],
        api: ['/api/', '/v1/', '/v2/', '/v3/', '/graphql', '/rest/', '/endpoints', '/developers', '/developer'],
        forum: ['/forum', '/community', '/discuss', '/discussions', '/questions', '/question/', '/answers', '/threads', '/topic/', '/issues', '/r/', '/t/'],
        support: ['/support', '/help', '/faq', '/contact', '/feedback', '/tickets', '/kb', '/knowledge-base'],
        legal: ['/terms', '/privacy', '/legal', '/policy', '/cookies', '/gdpr', '/tos', '/eula', '/license'],
        profile: ['/profile', '/user/', '/account', '/settings', '/preferences', '/u/', '/@', '/me', '/my'],
        video: ['/video/', '/watch', '/play/', '/v/', '/shorts/', '/live', '/stream'],
        shop: ['/shop', '/store', '/cart', '/checkout', '/order', '/buy', '/purchase', '/item/', '/goods'],
        search: ['/search', '/explore', '/discover', '/browse', '/find'],
        i18n: ['/en/', '/zh/', '/zh-cn/', '/zh-tw/', '/ja/', '/ko/', '/fr/', '/de/', '/es/', '/pt/', '/ru/', '/ar/']
      };


    for (const [category, patterns] of Object.entries(pathPatterns)) {
      if (patterns.some(p => pathname.toLowerCase().includes(p))) {
        result.category = category;
        result.type = ['login', 'dashboard', 'profile'].includes(category) ? 'functional' : 
                      ['docs', 'blog', 'forum', 'video'].includes(category) ? 'content' : 
                      ['shop', 'search'].includes(category) ? 'functional' :
                      category === 'i18n' ? result.type : 'subpage';
        if (category !== 'i18n') {
          result.confidence = 'high';
          result.hints.push(`路径包含 ${category} 相关关键词`);
        }
        break;
      }
    }

    // 3. 分析 URL 参数特征
    if (search) {
      const paramPatterns = {
        redirect: ['continueUrl', 'redirect', 'returnUrl', 'next', 'callback', 'return_to', 'redirect_uri'],
        search: ['q', 'query', 'search', 'keyword', 'keywords', 's'],
        session: ['session', 'token', 'sid', 'csesidx', 'wiffid'],
        pagination: ['page', 'offset', 'limit', 'cursor']
      };

      for (const [type, params] of Object.entries(paramPatterns)) {
        if (params.some(p => search.toLowerCase().includes(p + '='))) {
          if (type === 'redirect' || type === 'session') {
            result.type = 'functional';
            result.category = result.category || 'login';
            result.hints.push('URL 参数表明这是登录/认证流程页面');
            result.confidence = 'high';
          } else if (type === 'search') {
            result.type = 'functional';
            result.category = 'search';
            result.hints.push('这是搜索结果页面');
          }
          break;
        }
      }
    }

    // 4. 分析路径深度和结构
    if (pathParts.length === 0 && !search) {
      result.type = 'homepage';
      result.confidence = 'high';
      result.hints.push('根路径，极可能是网站首页');
    } else if (pathParts.length > 3) {
      result.type = result.type === 'homepage' ? 'content' : result.type;
      result.hints.push('路径层级较深，可能是具体内容页');
    }

    // 5. 分析标题特征（如果有）
    if (title) {
      const titlePatterns = {
        login: /login|sign.?in|登录|登入|注册|sign.?up/i,
        docs: /documentation|docs|指南|教程|文档|manual|guide|tutorial/i,
        blog: /blog|post|article|文章|博客|新闻/i,
        error: /404|not.?found|error|错误|找不到/i,
        welcome: /welcome|欢迎|首页|home/i
      };

      for (const [type, pattern] of Object.entries(titlePatterns)) {
        if (pattern.test(title)) {
          if (type === 'login' && result.category !== 'login') {
            result.category = 'login';
            result.type = 'functional';
          } else if (type === 'docs' && !result.category) {
            result.category = 'docs';
            result.type = 'content';
          }
          result.hints.push(`标题包含 ${type} 相关关键词`);
          break;
        }
      }
    }

    // 6. 特殊域名识别
    const knownPlatforms = {
      // 代码托管
      'github.com': { brand: 'GitHub', defaultCategory: 'code' },
      'gitlab.com': { brand: 'GitLab', defaultCategory: 'code' },
      'gitee.com': { brand: 'Gitee', defaultCategory: 'code' },
      'bitbucket.org': { brand: 'Bitbucket', defaultCategory: 'code' },
      'codeberg.org': { brand: 'Codeberg', defaultCategory: 'code' },
      // 云服务与部署
      'vercel.com': { brand: 'Vercel', defaultCategory: 'deploy' },
      'netlify.com': { brand: 'Netlify', defaultCategory: 'deploy' },
      'heroku.com': { brand: 'Heroku', defaultCategory: 'deploy' },
      'railway.app': { brand: 'Railway', defaultCategory: 'deploy' },
      'render.com': { brand: 'Render', defaultCategory: 'deploy' },
      'fly.io': { brand: 'Fly.io', defaultCategory: 'deploy' },
      'aws.amazon.com': { brand: 'AWS', defaultCategory: 'cloud' },
      'cloud.google.com': { brand: 'Google Cloud', defaultCategory: 'cloud' },
      'azure.microsoft.com': { brand: 'Azure', defaultCategory: 'cloud' },
      'cloudflare.com': { brand: 'Cloudflare', defaultCategory: 'network' },
      // 数据库
      'supabase.com': { brand: 'Supabase', defaultCategory: 'database' },
      'firebase.google.com': { brand: 'Firebase', defaultCategory: 'database' },
      'planetscale.com': { brand: 'PlanetScale', defaultCategory: 'database' },
      'mongodb.com': { brand: 'MongoDB', defaultCategory: 'database' },
      'neon.tech': { brand: 'Neon', defaultCategory: 'database' },
      // 设计工具
      'figma.com': { brand: 'Figma', defaultCategory: 'design' },
      'canva.com': { brand: 'Canva', defaultCategory: 'design' },
      'sketch.com': { brand: 'Sketch', defaultCategory: 'design' },
      'dribbble.com': { brand: 'Dribbble', defaultCategory: 'design' },
      'behance.net': { brand: 'Behance', defaultCategory: 'design' },
      // 生产力工具
      'notion.so': { brand: 'Notion', defaultCategory: 'productivity' },
      'airtable.com': { brand: 'Airtable', defaultCategory: 'productivity' },
      'coda.io': { brand: 'Coda', defaultCategory: 'productivity' },
      'clickup.com': { brand: 'ClickUp', defaultCategory: 'productivity' },
      'monday.com': { brand: 'Monday', defaultCategory: 'productivity' },
      'trello.com': { brand: 'Trello', defaultCategory: 'productivity' },
      'asana.com': { brand: 'Asana', defaultCategory: 'productivity' },
      'linear.app': { brand: 'Linear', defaultCategory: 'productivity' },
      // 搜索与AI
      'google.com': { brand: 'Google', defaultCategory: 'search' },
      'bing.com': { brand: 'Bing', defaultCategory: 'search' },
      'baidu.com': { brand: '百度', defaultCategory: 'search' },
      'openai.com': { brand: 'OpenAI', defaultCategory: 'ai' },
      'anthropic.com': { brand: 'Anthropic', defaultCategory: 'ai' },
      'gemini.google': { brand: 'Gemini', defaultCategory: 'ai' },
      'claude.ai': { brand: 'Claude', defaultCategory: 'ai' },
      'chat.openai.com': { brand: 'ChatGPT', defaultCategory: 'ai' },
      'huggingface.co': { brand: 'Hugging Face', defaultCategory: 'ai' },
      'midjourney.com': { brand: 'Midjourney', defaultCategory: 'ai' },
      'stability.ai': { brand: 'Stability AI', defaultCategory: 'ai' },
      // 视频平台
      'youtube.com': { brand: 'YouTube', defaultCategory: 'video' },
      'bilibili.com': { brand: '哔哩哔哩', defaultCategory: 'video' },
      'vimeo.com': { brand: 'Vimeo', defaultCategory: 'video' },
      'twitch.tv': { brand: 'Twitch', defaultCategory: 'video' },
      'douyin.com': { brand: '抖音', defaultCategory: 'video' },
      'ixigua.com': { brand: '西瓜视频', defaultCategory: 'video' },
      // 社交平台
      'twitter.com': { brand: 'Twitter', defaultCategory: 'social' },
      'x.com': { brand: 'X', defaultCategory: 'social' },
      'linkedin.com': { brand: 'LinkedIn', defaultCategory: 'social' },
      'facebook.com': { brand: 'Facebook', defaultCategory: 'social' },
      'instagram.com': { brand: 'Instagram', defaultCategory: 'social' },
      'tiktok.com': { brand: 'TikTok', defaultCategory: 'social' },
      'weibo.com': { brand: '微博', defaultCategory: 'social' },
      'xiaohongshu.com': { brand: '小红书', defaultCategory: 'social' },
      // 论坛与问答
      'reddit.com': { brand: 'Reddit', defaultCategory: 'forum' },
      'zhihu.com': { brand: '知乎', defaultCategory: 'qa' },
      'quora.com': { brand: 'Quora', defaultCategory: 'qa' },
      'stackoverflow.com': { brand: 'Stack Overflow', defaultCategory: 'tech-qa' },
      'segmentfault.com': { brand: 'SegmentFault', defaultCategory: 'tech-qa' },
      'v2ex.com': { brand: 'V2EX', defaultCategory: 'tech-forum' },
      // 博客与内容
      'medium.com': { brand: 'Medium', defaultCategory: 'blog' },
      'dev.to': { brand: 'DEV Community', defaultCategory: 'tech-blog' },
      'hashnode.dev': { brand: 'Hashnode', defaultCategory: 'tech-blog' },
      'juejin.cn': { brand: '掘金', defaultCategory: 'tech-blog' },
      'csdn.net': { brand: 'CSDN', defaultCategory: 'tech-blog' },
      'cnblogs.com': { brand: '博客园', defaultCategory: 'tech-blog' },
      'jianshu.com': { brand: '简书', defaultCategory: 'blog' },
      'substack.com': { brand: 'Substack', defaultCategory: 'newsletter' },
      // 沟通协作
      'discord.com': { brand: 'Discord', defaultCategory: 'community' },
      'slack.com': { brand: 'Slack', defaultCategory: 'communication' },
      'telegram.org': { brand: 'Telegram', defaultCategory: 'communication' },
      'zoom.us': { brand: 'Zoom', defaultCategory: 'communication' },
      'teams.microsoft.com': { brand: 'Microsoft Teams', defaultCategory: 'communication' },
      'feishu.cn': { brand: '飞书', defaultCategory: 'communication' },
      'dingtalk.com': { brand: '钉钉', defaultCategory: 'communication' },
      'weixin.qq.com': { brand: '微信', defaultCategory: 'communication' },
      // 包管理
      'npmjs.com': { brand: 'npm', defaultCategory: 'package' },
      'pypi.org': { brand: 'PyPI', defaultCategory: 'package' },
      'crates.io': { brand: 'crates.io', defaultCategory: 'package' },
      'pkg.go.dev': { brand: 'Go Packages', defaultCategory: 'package' },
      'rubygems.org': { brand: 'RubyGems', defaultCategory: 'package' },
      'packagist.org': { brand: 'Packagist', defaultCategory: 'package' },
      'mvnrepository.com': { brand: 'Maven', defaultCategory: 'package' },
      // 电商
      'amazon.com': { brand: 'Amazon', defaultCategory: 'ecommerce' },
      'ebay.com': { brand: 'eBay', defaultCategory: 'ecommerce' },
      'taobao.com': { brand: '淘宝', defaultCategory: 'ecommerce' },
      'jd.com': { brand: '京东', defaultCategory: 'ecommerce' },
      'pinduoduo.com': { brand: '拼多多', defaultCategory: 'ecommerce' },
      'shopify.com': { brand: 'Shopify', defaultCategory: 'ecommerce' },
      // 科技巨头
      'microsoft.com': { brand: 'Microsoft', defaultCategory: 'tech' },
      'apple.com': { brand: 'Apple', defaultCategory: 'tech' },
      'mozilla.org': { brand: 'Mozilla', defaultCategory: 'tech' },
      // 文档与知识库
      'readthedocs.io': { brand: 'Read the Docs', defaultCategory: 'docs' },
      'gitbook.io': { brand: 'GitBook', defaultCategory: 'docs' },
      'docsify.js.org': { brand: 'Docsify', defaultCategory: 'docs' },
      'docusaurus.io': { brand: 'Docusaurus', defaultCategory: 'docs' },
      'vuepress.vuejs.org': { brand: 'VuePress', defaultCategory: 'docs' }
    };

    for (const [domain, info] of Object.entries(knownPlatforms)) {
      if (hostname.includes(domain)) {
        result.brand = info.brand;
        if (!result.category) result.category = info.defaultCategory;
        result.confidence = 'high';
        break;
      }
    }

  } catch (e) {
    result.hints.push('URL 解析失败');
  }

  return result;
}

/**
 * 生成页面类型描述字符串（用于提示词）
 */
function getPageTypeDescription(analysis) {
  const typeNames = {
    homepage: '网站首页',
    subpage: '功能子页面',
    functional: '功能性页面（如登录、控制台）',
    content: '内容页面（如文档、博客）',
    special: '特殊页面'
  };

  const categoryNames = {
    docs: '文档/教程',
    blog: '博客/文章',
    login: '登录/认证',
    dashboard: '控制台/后台',
    tool: '在线工具',
    product: '产品介绍',
    download: '下载页',
    api: 'API 接口',
    forum: '论坛/社区',
    support: '帮助/支持',
    legal: '法律条款',
    profile: '用户资料',
    video: '视频内容',
    shop: '电商/购物',
    search: '搜索页面',
    i18n: '多语言版本',
    code: '代码托管',
    deploy: '部署服务',
    cloud: '云服务',
    database: '数据库服务',
    design: '设计工具',
    productivity: '生产力工具',
    ai: 'AI/人工智能',
    social: '社交平台',
    qa: '问答社区',
    'tech-qa': '技术问答',
    'tech-blog': '技术博客',
    'tech-forum': '技术论坛',
    community: '社区',
    communication: '通讯工具',
    package: '包管理',
    ecommerce: '电子商务',
    tech: '科技公司',
    newsletter: '邮件订阅',
    network: '网络服务'
  };

  let desc = typeNames[analysis.type] || '未知类型';
  if (analysis.category && categoryNames[analysis.category]) {
    desc = categoryNames[analysis.category];
  }
  
  return desc;
}

// ==================== Prompt 构建函数 ====================

function buildUnifiedPrompt(card, types, existingTags) {
  const domain = extractDomain(card.url);
  const analysis = analyzePageType(card.url, card.title);
  const pageTypeDesc = getPageTypeDescription(analysis);
  
  const tagsStr = existingTags.length > 0 
    ? existingTags.slice(0, 30).join('、')
    : '暂无';
  
  const currentName = card.title && !card.title.includes('://') && !card.title.startsWith('www.') 
    ? card.title : '';

  // 构建上下文信息
  let contextInfo = `网站:${card.url}`;
  if (currentName) contextInfo += ` 当前参考名:${currentName}`;
  if (card.desc) contextInfo += ` 当前参考描述:${card.desc}`;
  contextInfo += ` 页面类型:${pageTypeDesc}`;
  if (analysis.brand) contextInfo += ` 品牌:${analysis.brand}`;
  if (analysis.hints.length > 0) contextInfo += ` 分析提示:${analysis.hints.join('; ')}`;
  contextInfo += ` 现有标签:${tagsStr}`;

  const messages = [
    {
      role: 'system',
      content: `你是一个专业的互联网产品分析师和导航站编辑。
任务：根据提供的网站信息（URL、参考标题、页面类型分析），生成高质量、精炼的导航卡片元数据。

## 核心准则

### 1. 名称 (name) 生成规则
- **品牌首页**：只输出品牌核心名称（如 "GitHub"、"Notion"、"飞书"）
- **文档/教程页**：采用 "[品牌] [主题]" 模式（如 "Vue 文档"、"React 入门指南"）
- **博客/文章页**：采用 "[品牌/作者] [文章主题]" 或直接用文章标题精简版
- **工具页**：采用 "[品牌] [工具名]" 模式（如 "JSON 格式化工具"）
- **登录/功能页**：使用核心产品名称，忽略 "登录"、"注册" 等功能词
- **清洗规则**：严格剔除 "官网"、"首页"、"官方网站"、"Login"、"Welcome"、"Sign in"、"-"、"|" 分隔符后的冗余内容
- **长度限制**：建议中文 2-15 字，中英混合 2-40 字符

### 2. 描述 (description) 生成规则
- **品牌首页**：一句话说明 "它是什么" + "核心价值"（如 "全球领先的代码托管平台"）
- **文档/教程页**：说明 "这份文档/教程讲什么"（如 "Vue3 组合式 API 的详细使用指南"）
- **博客/文章页**：概括文章核心观点或主题
- **工具页**：说明 "这个工具能做什么"
- **登录/功能页**：描述该产品的核心功能，而非描述登录行为
- **精炼原则**：杜绝 "这是一个"、"本网站"、"致力于" 等冗余前缀
- **长度限制**：严格 15-35 个中文字符

### 3. 标签 (tags) 生成规则
- 推荐 2-4 个最相关的分类标签
- 优先从 "现有标签列表" 中精确匹配
- 若现有标签不匹配，创造 1-2 个精准新标签（每个 2-4 字）

## 重要提示
- 你无法访问实际网页，请根据 URL 结构、域名、参考标题、页面类型分析来推断
- 如果信息不足，基于 URL 和域名做合理推断，不要输出 "无法确定" 类内容
- 必须输出纯 JSON 对象，严禁包含思考过程、解释说明或 Markdown 标记`
    },
    // Few-shot 示例：覆盖多种网站类型
    // 1. 代码托管平台首页
    { role: 'user', content: '网站:https://github.com/ 当前参考名:GitHub: Let\'s build from here · GitHub 页面类型:网站首页 品牌:GitHub 现有标签:开发工具,代码托管,开源,AI' },
    { role: 'assistant', content: '{"name":"GitHub","description":"全球领先的代码托管与开源协作开发平台","tags":["开发工具","代码托管"]}' },
    
    // 2. 技术文档页
    { role: 'user', content: '网站:https://vuejs.org/guide/introduction.html 当前参考名:Introduction | Vue.js 页面类型:文档/教程 品牌:Vue 现有标签:前端框架,JavaScript,文档' },
    { role: 'assistant', content: '{"name":"Vue 入门指南","description":"Vue.js 框架核心概念与基础使用方法详解","tags":["前端框架","JavaScript","文档"]}' },
    
    // 3. 登录/认证页面
    { role: 'user', content: '网站:https://auth.example.com/login?redirect=/dashboard 当前参考名:Sign In - Example Platform 页面类型:登录/认证 品牌:Example 分析提示:URL 参数表明这是登录/认证流程页面 现有标签:SaaS,效率工具' },
    { role: 'assistant', content: '{"name":"Example Platform","description":"企业级协作与项目管理平台","tags":["SaaS","效率工具"]}' },
    
    // 4. 在线工具
    { role: 'user', content: '网站:https://tinypng.com/ 当前参考名:TinyPNG – Compress WebP, PNG and JPEG images intelligently 页面类型:在线工具 品牌:TinyPNG 现有标签:图片工具,压缩,设计' },
    { role: 'assistant', content: '{"name":"TinyPNG","description":"智能图片压缩工具，支持 PNG、JPEG、WebP 格式","tags":["图片工具","压缩"]}' },
    
    // 5. 问答社区
    { role: 'user', content: '网站:https://www.zhihu.com/question/12345678 当前参考名:如何学习编程？ - 知乎 页面类型:问答社区 品牌:知乎 现有标签:问答,知识,社区' },
    { role: 'assistant', content: '{"name":"知乎","description":"中文互联网高质量问答社区与知识分享平台","tags":["问答","知识","社区"]}' },
    
    // 6. 电商网站
    { role: 'user', content: '网站:https://www.amazon.com/dp/B09V3KXJPB 当前参考名:Apple AirPods Pro (2nd Generation) - Amazon.com 页面类型:电商/购物 品牌:Amazon 现有标签:购物,电商,数码' },
    { role: 'assistant', content: '{"name":"Amazon","description":"全球综合性电子商务与云计算服务平台","tags":["购物","电商"]}' },
    
    // 7. AI 产品
    { role: 'user', content: '网站:https://chat.openai.com/ 当前参考名:ChatGPT 页面类型:AI/人工智能 品牌:ChatGPT 现有标签:AI,聊天机器人,效率工具' },
    { role: 'assistant', content: '{"name":"ChatGPT","description":"OpenAI 开发的智能对话 AI 助手","tags":["AI","聊天机器人"]}' },
    
    // 8. 个人博客/技术文章
    { role: 'user', content: '网站:https://overreacted.io/a-complete-guide-to-useeffect/ 当前参考名:A Complete Guide to useEffect — overreacted 页面类型:博客/文章 品牌:overreacted 现有标签:React,前端,博客' },
    { role: 'assistant', content: '{"name":"useEffect 完全指南","description":"Dan Abramov 深入讲解 React useEffect 的工作原理","tags":["React","前端","博客"]}' },
    
    // 实际请求
    { role: 'user', content: contextInfo }
  ];

  return messages;
}

function buildNamePrompt(card) {
  const domain = extractDomain(card.url);
  const analysis = analyzePageType(card.url, card.title);
  const pageTypeDesc = getPageTypeDescription(analysis);
  
  const commonRules = '\n注意：严禁输出任何思考过程或解释，直接输出名称文本。';
  
  return [
    {
      role: 'system',
      content: `你是一个精炼的网站命名专家。

## 命名规则（按页面类型）

### 品牌/产品首页
- 只输出品牌核心名称（如 "GitHub"、"Notion"、"飞书"、"淘宝"）

### 文档/教程/指南页
- 采用 "[品牌] [主题]" 模式（如 "Vue 文档"、"React 入门指南"、"Stripe API 文档"）

### 博客/文章页
- 输出文章标题精简版或 "[作者/平台] [主题]"（如 "useEffect 完全指南"、"张三的技术博客"）

### 工具/在线应用页
- 采用 "[品牌/功能] [工具类型]" 模式（如 "TinyPNG 图片压缩"、"JSON 格式化工具"）

### 登录/认证/功能页
- 使用核心产品名称，完全忽略功能词（如 "Sign in to GitHub" → "GitHub"）

### 电商/商品页
- 输出平台品牌名（如 "淘宝"、"京东"、"Amazon"），不要输出商品名

### 视频/社交内容页
- 输出平台品牌名（如 "YouTube"、"哔哩哔哩"、"知乎"）

## 清洗规则
- 严格剔除：官网、首页、官方网站、Home、Official、Login、Welcome、Sign in、注册、|、-、· 后的冗余内容
- 去除 SEO 堆砌词汇和重复的品牌名

## 长度限制
- 中文：2-15 字
- 中英混合：2-40 字符${commonRules}`
    },
    // Few-shot 示例
    { role: 'user', content: '网站地址：https://github.com/\n当前抓取名：GitHub: Let\'s build from here · GitHub\n页面类型：代码托管\n品牌：GitHub\n输出名称：' },
    { role: 'assistant', content: 'GitHub' },
    { role: 'user', content: '网站地址：https://auth.business.gemini.google/login\n当前抓取名：Sign in - Gemini\n页面类型：登录/认证\n品牌：Gemini\n分析提示：URL 参数表明这是登录/认证流程页面\n输出名称：' },
    { role: 'assistant', content: 'Gemini' },
    { role: 'user', content: '网站地址：https://react.dev/learn/tutorial-tic-tac-toe\n当前抓取名：Tutorial: Tic-Tac-Toe – React\n页面类型：文档/教程\n品牌：React\n输出名称：' },
    { role: 'assistant', content: 'React 井字棋教程' },
    { role: 'user', content: '网站地址：https://www.taobao.com/\n当前抓取名：淘宝网 - 淘！我喜欢\n页面类型：电子商务\n品牌：淘宝\n输出名称：' },
    { role: 'assistant', content: '淘宝' },
    // 实际请求
    {
      role: 'user',
      content: `网站地址：${card.url}
当前抓取名：${card.title || '无'}
页面类型：${pageTypeDesc}${analysis.brand ? `\n品牌：${analysis.brand}` : ''}${analysis.hints.length > 0 ? `\n分析提示：${analysis.hints.join('; ')}` : ''}
输出名称：`
    }
  ];
}

function buildDescriptionPrompt(card) {
  const domain = extractDomain(card.url);
  const analysis = analyzePageType(card.url, card.title);
  const pageTypeDesc = getPageTypeDescription(analysis);
  
  const commonRules = '\n注意：严禁输出任何思考过程或解释，直接输出描述文本。';
  
  return [
    {
      role: 'system',
      content: `你是一个资深的导航站文案编辑。

## 描述生成规则（按页面类型）

### 品牌/产品首页
- 公式："[定位词] + [核心价值]"
- 示例："全球领先的代码托管与协作开发平台"、"一站式智能协作办公平台"

### 文档/教程/指南页
- 公式："[主题] + [具体内容概述]"
- 示例："Vue3 组合式 API 的详细使用指南"、"从零开始学习 React Hooks"

### 工具/在线应用页
- 公式："[功能动词] + [解决的问题]"
- 示例："智能压缩 PNG/JPEG 图片，最高减少 80% 文件体积"

### 博客/文章页
- 公式："[作者/来源] + [文章核心观点]"
- 示例："深入讲解 React useEffect 的工作原理与最佳实践"

### 登录/认证/功能页
- 描述产品核心功能，而非登录行为
- 示例："企业级项目管理与团队协作平台"

### 电商平台
- 公式："[平台定位] + [核心服务]"
- 示例："综合性电商平台，提供海量商品与便捷购物体验"

### 问答/社区
- 公式："[社区类型] + [核心价值]"
- 示例："高质量中文问答社区与知识分享平台"

### AI/工具产品
- 公式："[开发者/公司] + [产品功能]"
- 示例："OpenAI 开发的智能对话 AI 助手"

## 精炼原则
- 杜绝冗余前缀："这是一个"、"本网站"、"致力于"、"欢迎来到"
- 杜绝模糊表述："提供服务"、"满足需求"、"各种功能"

## 长度限制
- 严格 15-35 个中文字符（含标点）${commonRules}`
    },
    // Few-shot 示例
    { role: 'user', content: '网站名称：GitHub\n网站地址：https://github.com/\n页面类型：代码托管\n品牌：GitHub\n输出描述：' },
    { role: 'assistant', content: '全球领先的代码托管与开源协作开发平台' },
    { role: 'user', content: '网站名称：Gemini\n网站地址：https://gemini.google/\n页面类型：AI/人工智能\n品牌：Gemini\n输出描述：' },
    { role: 'assistant', content: 'Google 推出的多模态 AI 大模型助手' },
    { role: 'user', content: '网站名称：TinyPNG\n网站地址：https://tinypng.com/\n页面类型：在线工具\n品牌：TinyPNG\n输出描述：' },
    { role: 'assistant', content: '智能图片压缩工具，支持 PNG、JPEG、WebP 格式' },
    { role: 'user', content: '网站名称：知乎\n网站地址：https://www.zhihu.com/\n页面类型：问答社区\n品牌：知乎\n输出描述：' },
    { role: 'assistant', content: '中文互联网高质量问答社区与知识分享平台' },
    // 实际请求
    {
      role: 'user',
      content: `网站名称：${card.title || domain}
网站地址：${card.url}
${card.desc ? `参考描述：${card.desc}` : ''}
页面类型：${pageTypeDesc}${analysis.brand ? `\n品牌：${analysis.brand}` : ''}${analysis.hints.length > 0 ? `\n分析提示：${analysis.hints.join('; ')}` : ''}
输出描述：`
    }
  ];
}

function buildTagsPrompt(card, existingTags) {
  const domain = extractDomain(card.url);
  const analysis = analyzePageType(card.url, card.title);
  const pageTypeDesc = getPageTypeDescription(analysis);
  
  const tagsStr = existingTags.length > 0 
    ? existingTags.slice(0, 50).join('、')
    : '暂无';
  
  const commonRules = '\n注意：严禁输出任何思考过程，严格按 JSON 格式输出。';
  
  return [
    {
      role: 'system',
      content: `你是一个专业的互联网资源分类专家。

## 任务
为网站分配 2-4 个最合适的分类标签。

## 标签选择优先级
1. **优先精确匹配**：从"现有标签"列表中选择最贴切的标签
2. **语义近似匹配**：如果现有标签有近义词，优先使用现有标签
3. **补充新标签**：仅当现有标签完全无法覆盖时，创建 1-2 个新标签

## 按页面类型选择标签

### 代码/开发类
- 优先匹配：开发工具、代码托管、开源、GitHub、编程
- 常用新标签：版本控制、CI/CD、DevOps

### 文档/教程类
- 优先匹配：文档、教程、指南、学习
- 必须包含 "文档" 或 "教程" 标签

### 工具/效率类
- 优先匹配：在线工具、效率工具、工具
- 按功能细分：图片工具、格式转换、数据处理

### AI/人工智能类
- 优先匹配：AI、人工智能、机器学习、大模型
- 常用新标签：对话AI、图像生成、AI助手

### 电商/购物类
- 优先匹配：电商、购物、网购
- 按品类细分：数码、服饰、生鲜

### 社交/社区类
- 优先匹配：社交、社区、论坛
- 按类型细分：问答、技术社区、创作者

### 设计/创意类
- 优先匹配：设计、UI、创意、素材
- 常用标签：设计工具、图标、配色

## 新标签规范
- 长度：2-4 个中文字符
- 通用性：避免过于具体（如具体产品名）
- 可复用：其他网站也可能使用

## 输出格式
{"tags":["现有标签1","现有标签2"],"newTags":["新标签1"]}${commonRules}`
    },
    // Few-shot 示例
    { role: 'user', content: '网站名称：GitHub\n网站描述：全球领先的代码托管平台\n页面类型：代码托管\n现有标签：开发工具、代码托管、开源、设计、AI、效率工具\n输出JSON：' },
    { role: 'assistant', content: '{"tags":["开发工具","代码托管","开源"],"newTags":[]}' },
    { role: 'user', content: '网站名称：Midjourney\n网站描述：AI 图像生成工具\n页面类型：AI/人工智能\n现有标签：AI、设计、效率工具\n输出JSON：' },
    { role: 'assistant', content: '{"tags":["AI","设计"],"newTags":["图像生成"]}' },
    { role: 'user', content: '网站名称：淘宝\n网站描述：综合性电商平台\n页面类型：电子商务\n现有标签：购物、工具、AI\n输出JSON：' },
    { role: 'assistant', content: '{"tags":["购物"],"newTags":["电商"]}' },
    // 实际请求
    {
      role: 'user',
      content: `网站名称：${card.title || domain}
网站描述：${card.desc || '暂无'}
页面类型：${pageTypeDesc}${analysis.category ? `\n页面分类：${analysis.category}` : ''}
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

// ==================== 响应清理函数 ====================

// AI 思考过程的特征模式（需要过滤掉）
// 注意：只匹配明确的思考过程句式，避免误杀正常内容
const AI_THINKING_PATTERNS = [
  /(我需要|让我|由于我|我将|我无法).{0,30}(分析|查看|访问|了解|处理|确认)/,
  /^(我需要|让我|由于我|我将|我无法|好的，|没问题，|当然，)/,
  /^(This|I need to|Let me|Since I|I will|I cannot|Okay,|Sure,).{0,30}/i,
  /无法(直接)?访问(该|这个|此)?(网站|链接|页面)/,
  /无法获取(网站|网页|页面)(内容|信息)/,
  /请提供(更多|详细)(信息|内容)/,
  /抱歉[，,]我无法/
];

function isAIThinkingText(text) {
  if (!text || text.length < 10) return false;
  if (text.length <= 50) return false;
  
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
      .substring(0, 40); // 控制在合理范围
  }
  
    function cleanDescription(text) {
      if (!text) return '';
      
      let processed = stripThoughtTags(text);
      
      // 检测是否为 AI 思考过程文本
      if (isAIThinkingText(processed)) {
        // 尝试从思考文本中提取最后一句有用的内容
        const sentences = processed.split(/[。！？\n]/).filter(s => s.trim().length > 10);
        const lastSentence = sentences[sentences.length - 1]?.trim();
        if (lastSentence && lastSentence.length >= 15 && lastSentence.length <= 100 && !isAIThinkingText(lastSentence)) {
          processed = lastSentence;
        } else {
          console.warn('Detected AI thinking text in description, rejecting:', processed.substring(0, 50));
          return '';
        }
      }
      
      let cleaned = processed
        .replace(/```[\s\S]*?```/g, '')
        .replace(/^["'「」『』""'']+|["'「」『』""'']+$/g, '')
        .replace(/^(描述[：:]\s*|简介[：:]\s*|网站描述[：:]\s*|Description[：:]\s*)/i, '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[。.]+$/, '');
      
      return cleaned.length > 200 ? cleaned.substring(0, 200) + '...' : cleaned;

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

// 公开接口：获取 AI 状态（无需认证，仅返回是否可用）
router.get('/status', async (req, res) => {
  try {
    const config = await db.getAIConfig();
    res.json({
      success: true,
      data: {
        available: !!(config && config.apiKey),
        provider: config?.provider || null
      }
    });
  } catch (error) {
    res.json({ success: false, data: { available: false } });
  }
});

// 获取 AI 配置
router.get('/config', authMiddleware, async (req, res) => {
  try {
    const { provider } = req.query;
    const config = await db.getAIConfig(provider);
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
    const { provider, apiKey, baseUrl, model, requestDelay, autoGenerate, lastTestedOk } = req.body;
    
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
      lastTestedOk: lastTestedOk ? 'true' : 'false'
    });
    
    res.json({ success: true, message: '配置保存成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '保存配置失败' });
  }
});

// 清除 AI 配置
router.delete('/config', authMiddleware, async (req, res) => {
  try {
    await db.clearAIConfig();
    res.json({ success: true, message: 'AI 配置已清除' });
  } catch (error) {
    res.status(500).json({ success: false, message: '清除配置失败' });
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
    
    // 3. 执行智能测试请求
    const originalBaseUrl = config.baseUrl;
    const probeResult = await probeBaseUrl(config);
    
    if (probeResult.success) {
      // 测试成功，持久化状态
      await db.saveAIConfig({ lastTestedOk: 'true' });
      
      const resData = { 
        success: true, 
        responseTime: probeResult.responseTime
      };

      // 如果探测出的 working baseUrl 与用户提供的不一致，返回建议
      if (probeResult.baseUrl && probeResult.baseUrl !== originalBaseUrl.replace(/\/+$/, '')) {
        resData.suggestedBaseUrl = probeResult.baseUrl;
      }

      res.json(resData);
    } else {
      throw new Error(probeResult.error || '所有补全方式均无法连接');
    }
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
    const { updated, data, unchanged } = await generateCardFields(config, card, types, existingTags || [], { mode: 'overwrite' });
    
    res.json({ success: true, ...data, unchanged });
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
        const needsName = checkIsDirtyName(card.title, card.url);
        const needsDesc = checkIsDirtyDesc(card.desc, card.title, card.url);
      
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
module.exports.analyzePageType = analyzePageType;
module.exports.getPageTypeDescription = getPageTypeDescription;
