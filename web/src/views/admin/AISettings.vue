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

      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" v-model="config.autoGenerate" />
          <span>添加卡片时自动生成名称、描述和标签</span>
        </label>
        <span class="hint">开启后，新添加的卡片会自动使用 AI 生成简洁的名称、描述和推荐标签</span>
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
          <span class="stat-value">{{ stats.total }}</span>
          <span class="stat-label">总卡片数</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ stats.emptyName }}</span>
          <span class="stat-label">缺少名称</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ stats.emptyDesc }}</span>
          <span class="stat-label">缺少描述</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ stats.emptyTags }}</span>
          <span class="stat-label">缺少标签</span>
        </div>
        <button class="btn btn-text" @click="refreshStats" :disabled="refreshing">
          {{ refreshing ? '刷新中...' : '🔄 刷新' }}
        </button>
      </div>

      <!-- 空闲状态 -->
      <div class="batch-idle" v-if="!batchRunning">
        <div class="batch-group">
          <h4>补充缺失内容</h4>
          <p class="hint">只为缺少内容的卡片生成</p>
          <div class="btn-group">
            <button 
              class="btn btn-secondary" 
              @click="startBatch('name', 'empty')"
              :disabled="!stats || stats.emptyName === 0 || starting"
            >
              📝 生成缺少的名称 ({{ stats?.emptyName || 0 }})
            </button>
            <button 
              class="btn btn-secondary" 
              @click="startBatch('description', 'empty')"
              :disabled="!stats || stats.emptyDesc === 0 || starting"
            >
              ✨ 生成缺少的描述 ({{ stats?.emptyDesc || 0 }})
            </button>
            <button 
              class="btn btn-secondary" 
              @click="startBatch('tags', 'empty')"
              :disabled="!stats || stats.emptyTags === 0 || starting"
            >
              🏷️ 生成缺少的标签 ({{ stats?.emptyTags || 0 }})
            </button>
          </div>
        </div>
        
        <div class="batch-group">
          <h4>重新生成所有</h4>
          <p class="hint">覆盖所有卡片的现有内容</p>
          <div class="btn-group">
            <button 
              class="btn btn-warning" 
              @click="startBatch('name', 'all')"
              :disabled="!stats || stats.total === 0 || starting"
            >
              🔄 重新生成所有名称 ({{ stats?.total || 0 }})
            </button>
            <button 
              class="btn btn-warning" 
              @click="startBatch('description', 'all')"
              :disabled="!stats || stats.total === 0 || starting"
            >
              🔄 重新生成所有描述 ({{ stats?.total || 0 }})
            </button>
            <button 
              class="btn btn-warning" 
              @click="startBatch('tags', 'all')"
              :disabled="!stats || stats.total === 0 || starting"
            >
              🔄 重新生成所有标签 ({{ stats?.total || 0 }})
            </button>
          </div>
        </div>
      </div>

      <!-- 进行中状态 -->
      <div class="batch-progress" v-else>
        <div class="progress-header">
          <span>{{ batchLabel }}中...</span>
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
        <button class="btn btn-danger" @click="stopBatch" :disabled="stopping">
          {{ stopping ? '停止中...' : '⏹️ 停止' }}
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
        autoGenerate: false,
        hasApiKey: false
      },
      showApiKey: false,
      testing: false,
      saving: false,
      refreshing: false,
      starting: false,
      stopping: false,
      stats: null,
      batchRunning: false,
      batchType: '',
      batchMode: '', // 'empty' | 'all'
      batchProgress: { current: 0, total: 0, currentCard: '' },
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
    },
    batchLabel() {
      const typeLabels = { name: '名称', description: '描述', tags: '标签' };
      const typeLabel = typeLabels[this.batchType] || '内容';
      const modeLabel = this.batchMode === 'all' ? '重新生成所有' : '生成缺少的';
      return `${modeLabel}${typeLabel}`;
    }
  },
  async mounted() {
    await this.loadConfig();
    await this.refreshStats();
    await this.checkRunningTask();
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
          this.config.autoGenerate = cfg.autoGenerate || false;
        }
      } catch (e) {
        // 静默处理
      }
    },
    async checkRunningTask() {
      try {
        const res = await api.get('/api/ai/batch-task/status');
        if (res.data.success && res.data.running) {
          // 有正在运行的任务，恢复显示
          this.batchRunning = true;
          this.batchType = res.data.type;
          this.batchMode = res.data.mode;
          this.batchProgress = {
            current: res.data.current,
            total: res.data.total,
            currentCard: res.data.currentCard
          };
          // 开始轮询
          this.pollTaskStatus();
        }
      } catch (e) {
        // 静默处理
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
          requestDelay: this.config.requestDelay,
          autoGenerate: this.config.autoGenerate
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
      if (this.refreshing) return;
      this.refreshing = true;
      try {
        const [nameRes, descRes, tagsRes, allRes] = await Promise.all([
          api.get('/api/ai/empty-cards?type=name'),
          api.get('/api/ai/empty-cards?type=description'),
          api.get('/api/ai/empty-cards?type=tags'),
          api.get('/api/ai/empty-cards?type=description&mode=all')
        ]);
        this.stats = {
          emptyName: nameRes.data.total || 0,
          emptyDesc: descRes.data.total || 0,
          emptyTags: tagsRes.data.total || 0,
          total: allRes.data.total || 0
        };
      } catch (e) {
        // 静默处理
      } finally {
        this.refreshing = false;
      }
    },
    async startBatch(type, mode) {
      // 防止重复点击
      if (this.starting || this.batchRunning) return;
      
      // mode: 'empty' = 只处理缺少的, 'all' = 处理所有
      if (mode === 'all') {
        const typeLabels = { name: '名称', description: '描述', tags: '标签' };
        const confirmMsg = `确定要重新生成所有卡片的${typeLabels[type]}吗？这将覆盖现有${typeLabels[type]}。`;
        if (!confirm(confirmMsg)) return;
      }
      
      this.starting = true;
      this.batchType = type;
      this.batchMode = mode;
      this.batchProgress = { current: 0, total: 0, currentCard: '正在启动...' };
      // 立即显示进度条
      this.batchRunning = true;

      try {
        // 启动后台任务
        const res = await api.post('/api/ai/batch-task/start', { type, mode });
        
        if (!res.data.success) {
          this.batchRunning = false;
          this.showMessage(res.data.message || '启动任务失败', 'error');
          return;
        }
        
        if (res.data.total === 0) {
          this.batchRunning = false;
          this.showMessage('没有需要处理的卡片', 'info');
          return;
        }
        
        this.batchProgress.total = res.data.total;
        this.batchProgress.currentCard = '';
        this.showMessage(`任务已启动，共 ${res.data.total} 个卡片`, 'info');
        
        // 开始轮询任务状态
        this.pollTaskStatus();
        
      } catch (e) {
        this.batchRunning = false;
        this.showMessage(e.response?.data?.message || '启动任务失败', 'error');
      } finally {
        this.starting = false;
      }
    },
    async pollTaskStatus() {
      // 轮询任务状态
      let pollCount = 0;
      const poll = async () => {
        if (!this.batchRunning) return;
        pollCount++;
        
        try {
          const res = await api.get('/api/ai/batch-task/status');
          if (res.data.success) {
            if (res.data.running) {
              this.batchProgress.current = res.data.current;
              this.batchProgress.total = res.data.total;
              this.batchProgress.currentCard = res.data.currentCard;
              // 继续轮询
              setTimeout(poll, 1000);
            } else {
              // 任务未运行
              // 检查是否有处理结果（successCount > 0 或 current > 0 表示任务已执行过）
              const hasResult = (res.data.successCount > 0) || (res.data.current > 0);
              
              if (pollCount <= 5 && !hasResult) {
                // 前几次轮询且没有处理结果，可能任务还没开始，继续等待
                setTimeout(poll, 800);
              } else {
                // 任务完成
                this.batchRunning = false;
                const successCount = res.data.successCount || 0;
                const total = res.data.total || this.batchProgress.total;
                if (total > 0) {
                  this.showMessage(`完成！成功处理 ${successCount} / ${total} 个卡片`, 'success');
                }
                // 延迟一点再刷新统计，确保数据已更新
                setTimeout(() => this.refreshStats(), 500);
              }
            }
          }
        } catch (e) {
          // 轮询失败，继续尝试
          setTimeout(poll, 2000);
        }
      };
      
      // 延迟 500ms 开始第一次轮询，给后端一点时间启动任务
      setTimeout(poll, 500);
    },
    async stopBatch() {
      if (this.stopping) return;
      this.stopping = true;
      try {
        await api.post('/api/ai/batch-task/stop');
        this.showMessage('正在停止任务...', 'info');
      } catch (e) {
        // 静默处理
      } finally {
        // 延迟重置，等待任务实际停止
        setTimeout(() => { this.stopping = false; }, 2000);
      }
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

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 500;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--primary-color, #3b82f6);
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

.batch-group {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.batch-group:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.batch-group h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #333);
}

.batch-group .hint {
  margin-bottom: 12px;
}

.btn-warning {
  background: #f59e0b;
  color: #fff;
}

.btn-warning:hover:not(:disabled) {
  background: #d97706;
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
