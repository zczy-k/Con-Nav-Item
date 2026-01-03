<template>
  <div class="ai-settings">
    <h2>🤖 AI 智能生成</h2>
    
    <!-- AI 配置区域 -->
    <div class="config-section">
      <h3>API 配置</h3>
      
      <div class="form-group">
        <label>API 提供商</label>
        <select v-model="config.provider" @change="onProviderChange">
          <optgroup label="国外服务">
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic Claude</option>
            <option value="gemini">Google Gemini</option>
            <option value="groq">Groq</option>
          </optgroup>
          <optgroup label="国内服务">
            <option value="deepseek">DeepSeek (推荐)</option>
            <option value="zhipu">智谱 GLM</option>
            <option value="qwen">通义千问</option>
            <option value="doubao">豆包</option>
            <option value="moonshot">Moonshot (Kimi)</option>
          </optgroup>
          <optgroup label="本地/自定义">
            <option value="ollama">Ollama (本地)</option>
            <option value="custom">自定义 OpenAI 兼容</option>
          </optgroup>
        </select>
      </div>

      <div class="form-group" v-if="needsApiKey">
        <label>API Key</label>
        <div class="input-with-icon">
          <input 
            :type="showApiKey ? 'text' : 'password'" 
            v-model="config.apiKey" 
            :placeholder="config.hasApiKey ? '已配置（留空保持不变）' : '请输入 API Key'"
          />
          <button type="button" class="icon-btn" @click="showApiKey = !showApiKey">
            {{ showApiKey ? '👁️' : '👁️‍🗨️' }}
          </button>
        </div>
      </div>

      <div class="form-group" v-if="needsBaseUrl">
        <label>Base URL</label>
        <input 
          type="text" 
          v-model="config.baseUrl" 
          :placeholder="defaultBaseUrl"
        />
        <span class="hint">不需要加 /v1/chat/completions</span>
      </div>

      <div class="form-group">
        <label>模型名称</label>
        <input 
          type="text" 
          v-model="config.model" 
          :placeholder="defaultModel"
        />
      </div>

      <div class="form-group">
        <label>请求间隔 (ms)</label>
        <input 
          type="number" 
          v-model.number="config.requestDelay" 
          min="500" 
          max="10000"
        />
        <span class="hint">批量生成时的调用间隔，防止触发限流</span>
      </div>

      <div class="btn-group">
        <button class="btn btn-secondary" @click="testConnection" :disabled="testing">
          {{ testing ? '测试中...' : '🔗 测试连接' }}
        </button>
        <button class="btn btn-primary" @click="saveConfig" :disabled="saving">
          {{ saving ? '保存中...' : '💾 保存配置' }}
        </button>
      </div>
    </div>

    <!-- 批量生成区域 -->
    <div class="batch-section">
      <h3>批量生成</h3>
      
      <div class="stats-row" v-if="stats">
        <div class="stat-item">
          <span class="stat-value">{{ stats.emptyDesc }}</span>
          <span class="stat-label">缺少描述</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ stats.emptyTags }}</span>
          <span class="stat-label">缺少标签</span>
        </div>
        <button class="btn btn-text" @click="refreshStats">🔄 刷新</button>
      </div>

      <!-- 空闲状态 -->
      <div class="batch-idle" v-if="!batchRunning">
        <p class="hint">扫描所有缺少描述或标签的卡片，使用 AI 自动生成</p>
        <div class="btn-group">
          <button 
            class="btn btn-secondary" 
            @click="startBatch('description')"
            :disabled="!stats || stats.emptyDesc === 0"
          >
            ✨ 生成所有描述
          </button>
          <button 
            class="btn btn-secondary" 
            @click="startBatch('tags')"
            :disabled="!stats || stats.emptyTags === 0"
          >
            🏷️ 生成所有标签
          </button>
        </div>
      </div>

      <!-- 进行中状态 -->
      <div class="batch-progress" v-else>
        <div class="progress-header">
          <span>{{ batchType === 'description' ? '生成描述' : '生成标签' }}中...</span>
          <span>{{ batchProgress.current }} / {{ batchProgress.total }}</span>
        </div>
        <div class="progress-bar">
          <div 
            class="progress-fill" 
            :style="{ width: progressPercent + '%' }"
          ></div>
        </div>
        <div class="progress-info" v-if="batchProgress.currentCard">
          <span class="current-card">{{ batchProgress.currentCard }}</span>
        </div>
        <button class="btn btn-danger" @click="stopBatch">
          ⏹️ 停止
        </button>
      </div>
    </div>

    <!-- 消息提示 -->
    <div class="message" :class="messageType" v-if="message">
      {{ message }}
    </div>
  </div>
</template>

<script>
import axios from 'axios';

// 创建带认证的 axios 实例
function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const api = {
  get: (url) => axios.get(url, { headers: authHeaders() }),
  post: (url, data) => axios.post(url, data, { headers: authHeaders() })
};

const PROVIDER_CONFIG = {
  openai: { needsApiKey: true, needsBaseUrl: false, defaultModel: 'gpt-3.5-turbo', defaultBaseUrl: 'https://api.openai.com' },
  anthropic: { needsApiKey: true, needsBaseUrl: false, defaultModel: 'claude-3-haiku-20240307', defaultBaseUrl: '' },
  gemini: { needsApiKey: true, needsBaseUrl: false, defaultModel: 'gemini-1.5-flash', defaultBaseUrl: '' },
  groq: { needsApiKey: true, needsBaseUrl: false, defaultModel: 'llama-3.1-8b-instant', defaultBaseUrl: '' },
  deepseek: { needsApiKey: true, needsBaseUrl: false, defaultModel: 'deepseek-chat', defaultBaseUrl: 'https://api.deepseek.com' },
  zhipu: { needsApiKey: true, needsBaseUrl: false, defaultModel: 'glm-4-flash', defaultBaseUrl: '' },
  qwen: { needsApiKey: true, needsBaseUrl: false, defaultModel: 'qwen-turbo', defaultBaseUrl: '' },
  doubao: { needsApiKey: true, needsBaseUrl: false, defaultModel: 'doubao-lite-4k', defaultBaseUrl: '' },
  moonshot: { needsApiKey: true, needsBaseUrl: false, defaultModel: 'moonshot-v1-8k', defaultBaseUrl: '' },
  ollama: { needsApiKey: false, needsBaseUrl: true, defaultModel: 'llama3.2', defaultBaseUrl: 'http://localhost:11434' },
  custom: { needsApiKey: true, needsBaseUrl: true, defaultModel: '', defaultBaseUrl: '' }
};

export default {
  name: 'AISettings',
  data() {
    return {
      config: {
        provider: 'deepseek',
        apiKey: '',
        baseUrl: '',
        model: '',
        requestDelay: 1500,
        hasApiKey: false
      },
      showApiKey: false,
      testing: false,
      saving: false,
      stats: null,
      batchRunning: false,
      batchType: '',
      batchProgress: { current: 0, total: 0, currentCard: '' },
      shouldStop: false,
      message: '',
      messageType: 'info'
    };
  },
  computed: {
    needsApiKey() {
      return PROVIDER_CONFIG[this.config.provider]?.needsApiKey ?? true;
    },
    needsBaseUrl() {
      return PROVIDER_CONFIG[this.config.provider]?.needsBaseUrl ?? false;
    },
    defaultModel() {
      return PROVIDER_CONFIG[this.config.provider]?.defaultModel || '';
    },
    defaultBaseUrl() {
      return PROVIDER_CONFIG[this.config.provider]?.defaultBaseUrl || '';
    },
    progressPercent() {
      if (!this.batchProgress.total) return 0;
      return Math.round((this.batchProgress.current / this.batchProgress.total) * 100);
    }
  },
  async mounted() {
    await this.loadConfig();
    await this.refreshStats();
  },
  methods: {
    async loadConfig() {
      try {
        const res = await api.get('/api/ai/config');
        if (res.data.success) {
          const cfg = res.data.config;
          this.config.provider = cfg.provider || 'deepseek';
          this.config.hasApiKey = cfg.hasApiKey;
          this.config.baseUrl = cfg.baseUrl || '';
          this.config.model = cfg.model || '';
          this.config.requestDelay = cfg.requestDelay || 1500;
        }
      } catch (e) {
        console.error('加载 AI 配置失败:', e);
      }
    },
    onProviderChange() {
      // 切换提供商时清空 API Key 输入
      this.config.apiKey = '';
      this.config.hasApiKey = false;
    },
    async saveConfig() {
      this.saving = true;
      try {
        const res = await api.post('/api/ai/config', {
          provider: this.config.provider,
          apiKey: this.config.apiKey || undefined,
          baseUrl: this.config.baseUrl || this.defaultBaseUrl,
          model: this.config.model || this.defaultModel,
          requestDelay: this.config.requestDelay
        });
        if (res.data.success) {
          this.showMessage('配置保存成功', 'success');
          this.config.hasApiKey = true;
          this.config.apiKey = '';
        } else {
          this.showMessage(res.data.message, 'error');
        }
      } catch (e) {
        this.showMessage(e.response?.data?.message || '保存失败', 'error');
      } finally {
        this.saving = false;
      }
    },
    async testConnection() {
      this.testing = true;
      try {
        const res = await api.post('/api/ai/test');
        if (res.data.success) {
          this.showMessage(`连接成功: ${res.data.response}`, 'success');
        } else {
          this.showMessage(res.data.message, 'error');
        }
      } catch (e) {
        this.showMessage(e.response?.data?.message || '连接失败', 'error');
      } finally {
        this.testing = false;
      }
    },
    async refreshStats() {
      try {
        const [descRes, tagsRes] = await Promise.all([
          api.get('/api/ai/empty-cards?type=description'),
          api.get('/api/ai/empty-cards?type=tags')
        ]);
        this.stats = {
          emptyDesc: descRes.data.total || 0,
          emptyTags: tagsRes.data.total || 0
        };
      } catch (e) {
        console.error('获取统计失败:', e);
      }
    },
    async startBatch(type) {
      this.batchType = type;
      this.batchRunning = true;
      this.shouldStop = false;
      this.batchProgress = { current: 0, total: 0, currentCard: '' };

      try {
        // 获取待处理卡片
        const res = await api.get(`/api/ai/empty-cards?type=${type}`);
        const cards = res.data.cards || [];
        
        if (cards.length === 0) {
          this.showMessage('没有需要处理的卡片', 'info');
          this.batchRunning = false;
          return;
        }

        this.batchProgress.total = cards.length;
        const delay = this.config.requestDelay || 1500;
        let successCount = 0;

        for (let i = 0; i < cards.length; i++) {
          if (this.shouldStop) break;

          const card = cards[i];
          this.batchProgress.current = i + 1;
          this.batchProgress.currentCard = card.name || card.url;

          try {
            // 调用 AI 生成
            const genRes = await api.post('/api/ai/generate', {
              type,
              card,
              existingTags: type === 'tags' ? await this.getExistingTags() : []
            });

            if (genRes.data.success) {
              // 更新卡片
              if (type === 'description' && genRes.data.description) {
                await api.post('/api/ai/update-description', {
                  cardId: card.id,
                  description: genRes.data.description
                });
                successCount++;
              } else if (type === 'tags' && genRes.data.tags) {
                const allTags = [...(genRes.data.tags.tags || []), ...(genRes.data.tags.newTags || [])];
                if (allTags.length > 0) {
                  await api.post('/api/ai/update-tags', {
                    cardId: card.id,
                    tags: allTags
                  });
                  successCount++;
                }
              }
            }
          } catch (e) {
            console.error(`处理卡片 ${card.name} 失败:`, e);
          }

          // 延迟
          if (i < cards.length - 1 && !this.shouldStop) {
            await new Promise(r => setTimeout(r, delay));
          }
        }

        this.showMessage(
          this.shouldStop 
            ? `已停止，成功处理 ${successCount} 个卡片` 
            : `完成！成功处理 ${successCount} / ${cards.length} 个卡片`,
          successCount > 0 ? 'success' : 'info'
        );
        await this.refreshStats();
      } catch (e) {
        this.showMessage(e.response?.data?.message || '批量生成失败', 'error');
      } finally {
        this.batchRunning = false;
      }
    },
    stopBatch() {
      this.shouldStop = true;
    },
    async getExistingTags() {
      try {
        const res = await api.get('/api/tags');
        return res.data.map(t => t.name);
      } catch (e) {
        return [];
      }
    },
    showMessage(msg, type = 'info') {
      this.message = msg;
      this.messageType = type;
      setTimeout(() => { this.message = ''; }, 5000);
    }
  }
};
</script>

<style scoped>
.ai-settings {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

h2 {
  margin-bottom: 24px;
  font-size: 1.5rem;
  color: var(--text-primary, #333);
}

h3 {
  margin-bottom: 16px;
  font-size: 1.1rem;
  color: var(--text-primary, #333);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  padding-bottom: 8px;
}

.config-section,
.batch-section {
  background: var(--card-bg, #fff);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: var(--text-primary, #333);
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 8px;
  font-size: 14px;
  background: var(--input-bg, #fff);
  color: var(--text-primary, #333);
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--primary-color, #3b82f6);
}

.input-with-icon {
  display: flex;
  gap: 8px;
}

.input-with-icon input {
  flex: 1;
}

.icon-btn {
  padding: 8px 12px;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 8px;
  background: var(--input-bg, #fff);
  cursor: pointer;
}

.hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

.btn-group {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--primary-color, #3b82f6);
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover, #2563eb);
}

.btn-secondary {
  background: var(--secondary-bg, #f3f4f6);
  color: var(--text-primary, #333);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--secondary-hover, #e5e7eb);
}

.btn-danger {
  background: #ef4444;
  color: #fff;
}

.btn-danger:hover:not(:disabled) {
  background: #dc2626;
}

.btn-text {
  background: transparent;
  color: var(--primary-color, #3b82f6);
  padding: 4px 8px;
}

.stats-row {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--secondary-bg, #f9fafb);
  border-radius: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--primary-color, #3b82f6);
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

.batch-idle,
.batch-progress {
  padding: 16px;
  background: var(--secondary-bg, #f9fafb);
  border-radius: 8px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
}

.progress-bar {
  height: 8px;
  background: var(--border-color, #e5e7eb);
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 12px;
}

.progress-fill {
  height: 100%;
  background: var(--primary-color, #3b82f6);
  transition: width 0.3s;
}

.progress-info {
  margin-bottom: 12px;
}

.current-card {
  font-size: 13px;
  color: var(--text-secondary, #6b7280);
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 1000;
  animation: slideUp 0.3s ease;
}

.message.success {
  background: #10b981;
  color: #fff;
}

.message.error {
  background: #ef4444;
  color: #fff;
}

.message.info {
  background: #3b82f6;
  color: #fff;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* 暗色模式 */
:root.dark .config-section,
:root.dark .batch-section {
  background: var(--card-bg-dark, #1f2937);
}

:root.dark .form-group input,
:root.dark .form-group select {
  background: var(--input-bg-dark, #374151);
  border-color: var(--border-color-dark, #4b5563);
  color: #fff;
}
</style>
