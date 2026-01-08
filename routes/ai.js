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
 */
async function generateCardFields(config, card, types, existingTags, strategy = {}) {
  let updated = false;
  const isFillMode = strategy.mode !== 'overwrite';
  const resultData = { name: null, description: null, tags: null };

  const neededTypes = types.filter(type => {
    if (type === 'name') return !(isFillMode && card.title && !card.title.includes('://') && !card.title.startsWith('www.'));
    if (type === 'description') return !(isFillMode && card.desc);
    return true;
  });

  if (neededTypes.length === 0) return { updated: false, data: resultData };

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
      if (parsed.tags && parsed.tags.length > 0) {
        await db.updateCardTags(card.id, parsed.tags);
        resultData.tags = parsed.tags;
        updated = true;
      }
      return { updated, data: resultData };
    } catch (e) {
      console.warn(`Unified prompt failed for card ${card.id}, fallback:`, e.message);
    }
  }

  for (const type of neededTypes) {
    try {
      let prompt, aiResponse, cleaned;
      if (type === 'name') {
        prompt = buildPromptWithStrategy(buildNamePrompt(card), strategy);
        aiResponse = await callAI(config, prompt);
        cleaned = cleanName(aiResponse);
        if (cleaned && cleaned !== card.title) {
          await db.updateCardName(card.id, cleaned);
          resultData.name = cleaned;
          updated = true;
        }
      } else if (type === 'description') {
        prompt = buildPromptWithStrategy(buildDescriptionPrompt(card), strategy);
        aiResponse = await callAI(config, prompt);
        cleaned = cleanDescription(aiResponse);
        if (cleaned && cleaned !== card.desc) {
          await db.updateCardDescription(card.id, cleaned);
          resultData.description = cleaned;
          updated = true;
        }
      } else if (type === 'tags') {
        prompt = buildPromptWithStrategy(buildTagsPrompt(card, existingTags), strategy);
        aiResponse = await callAI(config, prompt);
        const { tags, newTags } = parseTagsResponse(aiResponse, existingTags);
        const allTags = [...tags, ...newTags];
        if (allTags.length > 0) {
          await db.updateCardTags(card.id, allTags);
          resultData.tags = allTags;
          updated = true;
        }
      }
    } catch (e) {
      console.error(`Failed to generate ${type} for card ${card.id}:`, e.message);
      if (neededTypes.length === 1) throw e;
    }
  }

  return { updated, data: resultData };
}

// ==================== 自适应并发批量任务管理器 ====================
class BatchTaskManager extends EventEmitter {
  constructor() {
    super();
    this.task = null;
    this.abortController = null;
    this.minConcurrency = 1;
    this.maxConcurrency = 5;
    this.initialConcurrency = 3;
  }

  getStatus() {
    if (!this.task) return { running: false };
    return { ...this.task, errors: this.task.errors.slice(-20) };
  }

  isRunning() { return this.task && this.task.running; }

  emitUpdate() { this.emit('update', this.getStatus()); }

  async start(config, cards, types, strategy = {}) {
    if (this.isRunning()) throw new Error('已有任务在运行中');
    this.abortController = new AbortController();
    this.task = {
      running: true, types: Array.isArray(types) ? types : [types], strategy,
      current: 0, total: cards.length, successCount: 0, failCount: 0,
      currentCard: '准备启动...', startTime: Date.now(), errors: [],
      concurrency: this.initialConcurrency, isRateLimited: false, consecutiveSuccesses: 0, rateLimitCount: 0
    };
    this.emitUpdate();
    this.runTask(config, cards).catch(err => {
      console.error('Batch task error:', err);
      if (this.task) {
        this.task.running = false;
        this.task.errors.push({ cardId: 0, cardTitle: '系统', error: err.message || '异常中断', time: Date.now() });
        this.emitUpdate();
      }
    });
    return { total: cards.length };
  }

  stop() {
    if (this.abortController) this.abortController.abort();
    if (this.task) {
      this.task.running = false;
      this.task.currentCard = '已停止';
      this.emitUpdate();
    }
    return { stopped: true };
  }

  async runTask(config, cards) {
    const { notifyDataChange } = require('../utils/autoBackup');
    const types = this.task?.types || ['name'];
    const strategy = this.task?.strategy || {};
    
    try {
      const existingTags = types.includes('tags') ? await db.getAllTagNames() : [];
      const rawConfig = await db.getAIConfig();
      const baseDelay = Math.max(500, Math.min(10000, parseInt(rawConfig.requestDelay) || 1500));

      let index = 0;
      while (index < cards.length) {
        if (this.abortController?.signal.aborted || !this.task?.running) break;

        const batch = cards.slice(index, index + this.task.concurrency);
        this.task.currentCard = batch.map(c => c.title || extractDomain(c.url)).join(', ');
        this.emitUpdate();

        const results = await Promise.allSettled(batch.map(card => this.processCardWithRetry(config, card, types, existingTags, strategy)));

        let hasRateLimit = false;
        let batchSuccess = 0, batchFail = 0;

        results.forEach((result, i) => {
          const card = batch[i];
          if (this.task) this.task.current++;
          if (result.status === 'fulfilled') {
            if (result.value.success) { batchSuccess++; this.task.successCount++; notifyDataChange(); }
            else { 
              batchFail++; this.task.failCount++; 
              if (result.value.rateLimited) hasRateLimit = true;
              if (result.value.error) this.task.errors.push({ cardId: card.id, cardTitle: card.title || card.url, error: result.value.error, time: Date.now() });
            }
          } else {
            batchFail++; this.task.failCount++;
            this.task.errors.push({ cardId: card.id, cardTitle: card.title || card.url, error: result.reason?.message || '未知错误', time: Date.now() });
          }
        });

        this.adjustConcurrency(batchSuccess, batchFail, hasRateLimit);
        this.emitUpdate();
        index += batch.length;

        if (index < cards.length && this.task?.running) {
          await this.sleep(this.calculateDelay(baseDelay, hasRateLimit));
        }
      }
    } finally {
      if (this.task) {
        await new Promise(r => setTimeout(r, 500));
        this.task.running = false;
        this.task.currentCard = '';
        this.task.current = this.task.total;
        this.emitUpdate();
      }
    }
  }

  adjustConcurrency(success, fail, rateLimited) {
    if (!this.task) return;
    if (rateLimited) {
      this.task.rateLimitCount++; this.task.consecutiveSuccesses = 0; this.task.isRateLimited = true;
      this.task.concurrency = Math.max(this.minConcurrency, Math.floor(this.task.concurrency / 2));
    } else if (success > 0 && fail === 0) {
      this.task.consecutiveSuccesses++; this.task.isRateLimited = false;
      if (this.task.consecutiveSuccesses >= 3 && this.task.concurrency < this.maxConcurrency) {
        this.task.concurrency++; this.task.consecutiveSuccesses = 0;
      }
    } else { this.task.consecutiveSuccesses = 0; }
  }

  calculateDelay(base, rateLimited) {
    if (!this.task) return base;
    if (rateLimited) return Math.min(base * Math.pow(2, Math.min(this.task.rateLimitCount, 4)), 30000);
    return this.task.concurrency === 1 ? base : Math.max(200, base / 2);
  }

  async processCardWithRetry(config, card, types, existingTags, strategy, retry = 0) {
    try {
      const { updated } = await generateCardFields(config, card, types, existingTags, strategy);
      return { success: updated, rateLimited: false };
    } catch (error) {
      const isRate = this.isRateLimitError(error);
      if (isRate && retry < 2) {
        await this.sleep(Math.pow(2, retry + 1) * 1000);
        return this.processCardWithRetry(config, card, types, existingTags, strategy, retry + 1);
      }
      return { success: false, rateLimited: isRate, error: error.message };
    }
  }

  isRateLimitError(e) {
    if (!e) return false;
    const m = (e.message || '').toLowerCase();
    return e.status === 429 || m.includes('429') || m.includes('rate limit') || m.includes('too many requests') || m.includes('quota exceeded');
  }

  sleep(ms) {
    return new Promise(resolve => {
      const t = setTimeout(resolve, ms);
      this.abortController?.signal.addEventListener('abort', () => { clearTimeout(t); resolve(); });
    });
  }
}

const taskManager = new BatchTaskManager();

// ==================== 辅助函数 ====================

function extractDomain(url) { try { return new URL(url).hostname.replace('www.', ''); } catch { return url; } }

async function getDecryptedAIConfig() {
  const cfg = await db.getAIConfig();
  if (cfg.apiKey) {
    try {
      const enc = JSON.parse(cfg.apiKey);
      cfg.apiKey = decrypt(enc.encrypted, enc.iv, enc.authTag);
    } catch {}
  }
  return cfg;
}

function validateAIConfig(cfg) {
  if (!cfg.provider) return { valid: false, message: '请先配置 AI 服务' };
  const pc = AI_PROVIDERS[cfg.provider];
  if (!pc) return { valid: false, message: `不支持的提供商: ${cfg.provider}` };
  if (pc.needsApiKey && !cfg.apiKey) return { valid: false, message: '请先配置 API Key' };
  if (pc.needsBaseUrl && !cfg.baseUrl) return { valid: false, message: '请先配置 Base URL' };
  return { valid: true };
}

// ==================== Prompt 构建函数 ====================

function buildUnifiedPrompt(card, types, existingTags) {
  const domain = extractDomain(card.url);
  const tagsStr = existingTags.slice(0, 25).join('、') || '暂无';
  const rules = [];
  if (types.includes('name')) rules.push('- name: 简洁品牌名');
  if (types.includes('description')) rules.push('- description: 10-25字功能描述');
  if (types.includes('tags')) rules.push('- tags: 2-4个标签数组');

  return [
    { role: 'system', content: `你是网站分析专家。严格按 JSON 格式输出：\n${rules.join('\n')}\n格式：{"name":"..","description":"..","tags":[".."]}` },
    { role: 'user', content: `网站：${card.url}\n当前名：${card.title || domain}\n当前描述：${card.desc || '无'}\n可用标签：${tagsStr}` }
  ];
}

function parseUnifiedResponse(text, types, existingTags) {
  try {
    const cleanText = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const match = cleanText.match(/\{[\s\S]*\}/);
    if (match) {
      const p = JSON.parse(match[0]);
      return {
        name: types.includes('name') ? cleanName(p.name) : '',
        description: types.includes('description') ? cleanDescription(p.description) : '',
        tags: (types.includes('tags') && Array.isArray(p.tags)) ? p.tags.filter(t => typeof t === 'string' && t.length > 0 && t.length <= 15) : []
      };
    }
  } catch {}
  return { name: '', description: '', tags: [] };
}

function buildNamePrompt(card) {
  return [
    { role: 'system', content: '直接输出简洁品牌名，无前缀/引号，2-10字。' },
    { role: 'user', content: `网站：${extractDomain(card.url)}\n地址：${card.url}\n输出名称：` }
  ];
}

function buildDescriptionPrompt(card) {
  return [
    { role: 'system', content: '直接输出10-25字简洁功能描述，无前缀/引号。' },
    { role: 'user', content: `网站：${card.title || extractDomain(card.url)}\n地址：${card.url}\n输出描述：` }
  ];
}

function buildTagsPrompt(card, existingTags) {
  return [
    { role: 'system', content: `输出 JSON：{"tags":["现有标签"],"newTags":["新标签"]}\n可用：${existingTags.slice(0, 25).join('、')}` },
    { role: 'user', content: `网站：${card.title || extractDomain(card.url)}\n描述：${card.desc || '无'}\n输出 JSON：` }
  ];
}

function cleanName(t) { return (t || '').replace(/["'「」『』]/g, '').replace(/(官网|首页)$/i, '').trim().substring(0, 20); }
function cleanDescription(t) { return (t || '').replace(/["'「」『』]/g, '').trim().replace(/[。.]+$/, '').substring(0, 80); }
function parseTagsResponse(text, existingTags) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const p = JSON.parse(match[0]);
      return { tags: Array.isArray(p.tags) ? p.tags : [], newTags: Array.isArray(p.newTags) ? p.newTags : [] };
    }
  } catch {}
  return { tags: [], newTags: [] };
}

// ==================== API 路由 ====================

router.get('/config', authMiddleware, async (req, res) => {
  try {
    const cfg = await db.getAIConfig();
    res.json({ success: true, config: { ...cfg, autoGenerate: cfg.autoGenerate === 'true', lastTestedOk: cfg.lastTestedOk === 'true', hasApiKey: !!cfg.apiKey } });
  } catch { res.status(500).json({ success: false }); }
});

router.post('/config', authMiddleware, async (req, res) => {
  try {
    const { apiKey, ...rest } = req.body;
    let encKey = undefined;
    if (apiKey && apiKey !== '••••••') encKey = JSON.stringify(encrypt(apiKey));
    await db.saveAIConfig({ ...rest, apiKey: encKey, lastTestedOk: 'false' });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

router.post('/test', authMiddleware, async (req, res) => {
  try {
    const config = req.body.provider ? { ...req.body, apiKey: (req.body.apiKey === '••••••' ? (await getDecryptedAIConfig()).apiKey : req.body.apiKey) } : await getDecryptedAIConfig();
    const val = validateAIConfig(config);
    if (!val.valid) return res.status(400).json({ success: false, message: val.message });
    await callAI(config, [{ role: 'user', content: 'Respond with OK' }]);
    await db.saveAIConfig({ lastTestedOk: 'true' });
    res.json({ success: true });
  } catch (e) {
    await db.saveAIConfig({ lastTestedOk: 'false' });
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const [n, d, t, a] = await Promise.all([db.getCardsNeedingAI('name'), db.getCardsNeedingAI('description'), db.getCardsNeedingAI('tags'), db.getAllCards()]);
    res.json({ success: true, stats: { emptyName: n.length, emptyDesc: d.length, emptyTags: t.length, total: a.length } });
  } catch { res.status(500).json({ success: false }); }
});

router.post('/filter-cards', authMiddleware, async (req, res) => {
  try {
    const cards = await db.filterCardsForAI(req.body);
    res.json({ success: true, cards, total: cards.length });
  } catch { res.status(500).json({ success: false }); }
});

router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { type, card, existingTags } = req.body;
    const config = await getDecryptedAIConfig();
    const types = type === 'all' ? ['name', 'description', 'tags'] : type === 'both' ? ['name', 'description'] : [type];
    const { data } = await generateCardFields(config, card, types, existingTags || [], { mode: 'overwrite' });
    res.json({ success: true, ...data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.get('/batch-task/status', authMiddleware, (req, res) => res.json({ success: true, ...taskManager.getStatus() }));

router.get('/batch-task/stream', authMiddleware, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (s) => { res.write(`data: ${JSON.stringify(s)}\n\n`); if (res.flush) res.flush(); };
  send(taskManager.getStatus());
  taskManager.on('update', send);
  req.on('close', () => taskManager.removeListener('update', send));
});

router.post('/batch-task/start', authMiddleware, async (req, res) => {
  try {
    const { type, mode, cardIds, types, strategy } = req.body;
    if (taskManager.isRunning()) return res.status(409).json({ success: false, message: '任务运行中' });
    const config = await getDecryptedAIConfig();
    const val = validateAIConfig(config);
    if (!val.valid) return res.status(400).json({ success: false, message: val.message });
    const cards = cardIds?.length ? await db.getCardsByIds(cardIds) : (mode === 'all' ? await db.getAllCards() : await db.getCardsNeedingAI(type === 'all' ? 'both' : type));
    if (!cards?.length) return res.json({ success: true, total: 0 });
    const tTypes = cardIds?.length ? (types || ['name', 'description', 'tags']) : (type === 'all' ? ['name', 'description', 'tags'] : [type]);
    const tStrat = strategy || { mode: (mode === 'all' ? 'overwrite' : 'fill') };
    await taskManager.start(config, cards, tTypes, tStrat);
    res.json({ success: true, total: cards.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/batch-task/stop', authMiddleware, (req, res) => { taskManager.stop(); res.json({ success: true }); });

function buildPromptWithStrategy(p, s = {}) {
  if (!s.style || s.style === 'default') return p;
  const h = { concise: '简洁', professional: '专业', friendly: '友好', seo: 'SEO 优化' }[s.style];
  if (h && p[0]) p[0].content += `\n风格：${h}`;
  if (s.customPrompt && p[0]) p[0].content += `\n额外要求：${s.customPrompt}`;
  return p;
}

async function autoGenerateForCards(cardIds) {
  const { triggerDebouncedBackup } = require('../utils/autoBackup');
  try {
    const raw = await db.getAIConfig();
    if (raw.autoGenerate !== 'true') return;
    const config = await getDecryptedAIConfig();
    if (!validateAIConfig(config).valid) return;
    const tags = await db.getAllTagNames();
    const delay = Math.max(500, parseInt(raw.requestDelay) || 1500);
    let updated = false;
    for (let i = 0; i < cardIds.length; i++) {
      const cards = await db.getCardsByIds([cardIds[i]]);
      if (!cards?.length) continue;
      const { updated: u } = await generateCardFields(config, cards[0], ['name', 'description', 'tags'], tags, { mode: 'fill' });
      if (u) updated = true;
      if (i < cardIds.length - 1) await new Promise(r => setTimeout(r, delay));
    }
    if (updated) triggerDebouncedBackup();
  } catch {}
}

module.exports = router;
module.exports.autoGenerateForCards = autoGenerateForCards;
