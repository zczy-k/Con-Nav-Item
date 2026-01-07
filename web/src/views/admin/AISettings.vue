<template>
  <div class="ai-settings">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2>🤖 AI 智能生成</h2>
      <div class="connection-status" :class="connectionStatus">
        <span class="status-dot"></span>
        <span>{{ statusText }}</span>
      </div>
    </div>

    <!-- 快速开始提示 -->
    <div class="quick-start" v-if="!config.hasApiKey && !config.apiKey">
      <div class="quick-start-icon">🚀</div>
      <div class="quick-start-content">
        <h4>快速开始</h4>
        <p>配置 AI 服务后，可自动为卡片生成名称、描述和标签</p>
        <div class="quick-start-steps">
          <span class="step">1. 选择提供商</span>
          <span class="step">2. 填写 API Key</span>
          <span class="step">3. 测试连接</span>
        </div>
      </div>
    </div>

    <!-- 提供商选择 -->
    <div class="section">
      <div class="section-header">
        <h3>选择 AI 提供商</h3>
        <span class="section-hint">推荐使用 DeepSeek，性价比高</span>
      </div>
      <div class="provider-grid">
        <div 
          v-for="(provider, key) in providers" 
          :key="key"
          class="provider-card"
          :class="{ active: config.provider === key }"
          @click="selectProvider(key)"
        >
          <div class="provider-icon">{{ provider.icon }}</div>
          <div class="provider-info">
            <span class="provider-name">{{ provider.name }}</span>
            <span class="provider-tag" v-if="provider.recommended">推荐</span>
            <span class="provider-tag local" v-if="provider.local">本地</span>
          </div>
        </div>
      </div>
    </div>

    <!-- API 配置 -->
    <div class="section">
      <div class="section-header">
        <h3>API 配置</h3>
        <a v-if="currentProvider.docsUrl" :href="currentProvider.docsUrl" target="_blank" class="docs-link">
          📖 获取 API Key
        </a>
      </div>
      <div class="config-form">
        <div class="form-item" v-if="currentProvider.needsApiKey">
          <label>
            <span>API Key</span>
            <span class="label-status" :class="{ ok: config.hasApiKey }">
              {{ config.hasApiKey ? '✓ 已配置' : '未配置' }}
            </span>
          </label>
          <div class="input-group">
            <input 
              :type="showApiKey ? 'text' : 'password'" 
              v-model="config.apiKey" 
              :placeholder="config.hasApiKey ? '已配置（留空保持不变）' : '请输入 API Key'"
              class="input"
            />
            <button type="button" class="input-btn" @click="showApiKey = !showApiKey">
              {{ showApiKey ? '🙈' : '👁️' }}
            </button>
          </div>
        </div>

        <div class="form-item" v-if="currentProvider.needsBaseUrl">
          <label>Base URL</label>
          <input type="text" v-model="config.baseUrl" :placeholder="currentProvider.defaultBaseUrl" class="input" />
        </div>

        <div class="form-item">
          <label>模型</label>
          <div class="model-select">
            <select v-model="modelSelect" class="input" @change="onModelChange">
              <option value="">自定义模型</option>
              <option v-for="m in currentProvider.models" :key="m" :value="m">{{ m }}</option>
            </select>
            <input 
              v-if="modelSelect === ''" 
              type="text" 
              v-model="config.model" 
              :placeholder="currentProvider.defaultModel || '输入模型名称'"
              class="input"
            />
          </div>
        </div>

        <div class="form-item switch-item">
          <span>
            <strong>自动生成</strong>
            <small>添加卡片时自动生成名称、描述和标签</small>
          </span>
          <label class="switch">
            <input type="checkbox" v-model="config.autoGenerate" />
            <span class="slider"></span>
          </label>
        </div>

        <div class="form-actions">
          <button class="btn" @click="testConnection" :disabled="testing || !canTest">
            {{ testing ? '⏳ 测试中...' : '🔗 测试连接' }}
          </button>
          <button class="btn primary" @click="saveConfig" :disabled="saving">
            {{ saving ? '⏳ 保存中...' : '💾 保存配置' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 批量生成 -->
    <div class="section">
      <div class="section-header">
        <h3>批量生成</h3>
        <button class="icon-btn" @click="refreshStats" :disabled="refreshing">
          {{ refreshing ? '⏳' : '🔄' }}
        </button>
      </div>

      <!-- 统计 -->
      <div class="stats" v-if="stats">
        <div class="stat"><span>{{ stats.total }}</span>总数</div>
        <div class="stat" :class="{ warn: stats.emptyName }"><span>{{ stats.emptyName }}</span>缺名称</div>
        <div class="stat" :class="{ warn: stats.emptyDesc }"><span>{{ stats.emptyDesc }}</span>缺描述</div>
        <div class="stat" :class="{ warn: stats.emptyTags }"><span>{{ stats.emptyTags }}</span>缺标签</div>
      </div>

        <!-- 任务进度 -->
        <div class="task-panel" v-if="task.running">
          <div class="task-header">
            <span class="task-title">{{ taskTitle }}</span>
            <div class="task-counts">
              <span class="count-item success">成功: {{ task.successCount || 0 }}</span>
              <span class="count-item fail" v-if="task.failCount">失败: {{ task.failCount }}</span>
              <span class="count-item total">{{ task.current }} / {{ task.total }}</span>
            </div>
          </div>
          <div class="progress-wrap">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: taskPercent + '%' }"></div>
            </div>
            <span class="progress-text">{{ taskPercent }}%</span>
          </div>
          <div class="task-info">
            <span class="task-current" v-if="task.currentCard" :title="task.currentCard">正在处理: {{ task.currentCard }}</span>
            <span class="task-eta" v-if="taskEta">剩余约 {{ taskEta }}</span>
          </div>

          <!-- 错误日志 -->
          <div class="task-errors" v-if="task.errors && task.errors.length > 0">
            <div class="error-header">最近错误:</div>
            <div class="error-list">
              <div v-for="(err, idx) in task.errors.slice(-3)" :key="idx" class="error-item">
                <span class="err-title">{{ err.cardTitle }}:</span>
                <span class="err-msg">{{ err.error }}</span>
              </div>
            </div>
          </div>

          <div class="task-actions">
            <div class="task-concurrency" v-if="task.concurrency">
              并发数: {{ task.concurrency }}
              <span v-if="task.isRateLimited" class="rate-limit-tag">限流中</span>
            </div>
            <button class="btn danger sm" @click="stopTask" :disabled="stopping">
              {{ stopping ? '停止中...' : '⏹️ 停止任务' }}
            </button>
          </div>
        </div>

      <!-- 操作按钮 -->
      <div class="batch-actions" v-else>
        <!-- 高级向导入口 -->
        <button class="btn primary lg wizard-btn" @click="showWizard = true" :disabled="!config.hasApiKey">
          🎯 高级批量生成向导
        </button>

          <div class="quick-actions">
            <span class="quick-label">快捷操作：</span>
            <button 
              class="btn" 
              v-if="totalMissing > 0"
              @click="startTask('all', 'empty')"
              :disabled="!config.hasApiKey || starting"
            >
              ✨ 一键补全 ({{ totalMissing }})
            </button>
          </div>

        <div class="action-grid">
          <div class="action-card" v-for="item in actionItems" :key="item.type">
            <div class="action-header">
              <span>{{ item.icon }} {{ item.label }}</span>
            </div>
            <div class="action-btns">
              <button 
                class="btn sm" 
                @click="startTask(item.type, 'empty')"
                :disabled="!item.emptyCount || !config.hasApiKey || starting"
              >
                补充 ({{ item.emptyCount }})
              </button>
              <button 
                class="btn sm outline" 
                @click="startTask(item.type, 'all')"
                :disabled="!stats?.total || !config.hasApiKey || starting"
              >
                全部重生成
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- AI 批量生成向导 -->
    <AIBatchWizard :visible="showWizard" @close="onWizardClose" />

    <!-- Toast -->
    <div class="toast" :class="[toast.type, { show: toast.show }]">
      {{ toast.msg }}
    </div>
  </div>
</template>

<script>
import axios from 'axios';
import AIBatchWizard from '../../components/AIBatchWizard.vue';

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const api = {
  get: url => axios.get(url, { headers: authHeaders() }),
  post: (url, data) => axios.post(url, data, { headers: authHeaders() })
};

const PROVIDERS = {
  deepseek: { name: 'DeepSeek', icon: '🔮', recommended: true, needsApiKey: true, needsBaseUrl: false, defaultModel: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-coder'], defaultBaseUrl: 'https://api.deepseek.com', docsUrl: 'https://platform.deepseek.com/api_keys' },
  openai: { name: 'OpenAI', icon: '🤖', needsApiKey: true, needsBaseUrl: false, defaultModel: 'gpt-4o-mini', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'], defaultBaseUrl: 'https://api.openai.com', docsUrl: 'https://platform.openai.com/api-keys' },
  anthropic: { name: 'Claude', icon: '🧠', needsApiKey: true, needsBaseUrl: false, defaultModel: 'claude-3-haiku-20240307', models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'], docsUrl: 'https://console.anthropic.com/settings/keys' },
  gemini: { name: 'Gemini', icon: '💎', needsApiKey: true, needsBaseUrl: false, defaultModel: 'gemini-1.5-flash', models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'], docsUrl: 'https://aistudio.google.com/app/apikey' },
  zhipu: { name: '智谱 GLM', icon: '🇨🇳', needsApiKey: true, needsBaseUrl: false, defaultModel: 'glm-4-flash', models: ['glm-4-flash', 'glm-4-air', 'glm-4'], docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
  qwen: { name: '通义千问', icon: '☁️', needsApiKey: true, needsBaseUrl: false, defaultModel: 'qwen-turbo', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'], docsUrl: 'https://dashscope.console.aliyun.com/apiKey' },
  moonshot: { name: 'Kimi', icon: '🌙', needsApiKey: true, needsBaseUrl: false, defaultModel: 'moonshot-v1-8k', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'], docsUrl: 'https://platform.moonshot.cn/console/api-keys' },
  groq: { name: 'Groq', icon: '⚡', needsApiKey: true, needsBaseUrl: false, defaultModel: 'llama-3.1-8b-instant', models: ['llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768'], docsUrl: 'https://console.groq.com/keys' },
  doubao: { name: '豆包', icon: '🫘', needsApiKey: true, needsBaseUrl: false, defaultModel: 'doubao-lite-4k', models: ['doubao-lite-4k', 'doubao-pro-4k'], docsUrl: 'https://console.volcengine.com/ark' },
  ollama: { name: 'Ollama', icon: '🦙', local: true, needsApiKey: false, needsBaseUrl: true, defaultModel: 'llama3.2', models: ['llama3.2', 'llama3.1', 'mistral', 'qwen2.5'], defaultBaseUrl: 'http://localhost:11434', docsUrl: 'https://ollama.com/' },
  custom: { name: '自定义', icon: '⚙️', needsApiKey: true, needsBaseUrl: true, defaultModel: '', models: [], defaultBaseUrl: '' }
};

export default {
  name: 'AISettings',
  components: { AIBatchWizard },
  data() {
    return {
      providers: PROVIDERS,
      config: { provider: 'deepseek', apiKey: '', baseUrl: '', model: 'deepseek-chat', autoGenerate: false, hasApiKey: false },
      modelSelect: 'deepseek-chat',
      showApiKey: false,
      testing: false,
      saving: false,
      refreshing: false,
      starting: false,
      stopping: false,
      connectionTested: false,
      connectionOk: false,
      stats: null,
      task: { running: false, type: '', mode: '', current: 0, total: 0, currentCard: '', startTime: 0, errors: [], successCount: 0, failCount: 0 },
      eventSource: null,
      toast: { show: false, msg: '', type: 'info' },
      showWizard: false
    };
  },
  computed: {
    currentProvider() { return PROVIDERS[this.config.provider] || PROVIDERS.deepseek; },
    canTest() {
      if (this.currentProvider.needsApiKey && !this.config.apiKey && !this.config.hasApiKey) return false;
      if (this.currentProvider.needsBaseUrl && !this.config.baseUrl) return false;
      return true;
    },
    connectionStatus() {
      if (!this.config.hasApiKey && !this.config.apiKey) return 'none';
      if (this.connectionTested) return this.connectionOk ? 'ok' : 'err';
      return 'pending';
    },
    statusText() {
      return { none: '未配置', ok: '已连接', err: '连接失败', pending: '待测试' }[this.connectionStatus];
    },
    totalMissing() {
      return this.stats ? this.stats.emptyName + this.stats.emptyDesc + this.stats.emptyTags : 0;
    },
    taskPercent() {
      return this.task.total ? Math.round((this.task.current / this.task.total) * 100) : 0;
    },
    taskTitle() {
      const labels = { name: '名称', description: '描述', tags: '标签' };
      const types = this.task.types || [this.task.type];
      if (Array.isArray(types) && types.length > 0) {
        return `正在生成${types.map(t => labels[t] || t).join('、')}`;
      }
      return '正在生成内容';
    },
    taskEta() {
      if (!this.task.startTime || this.task.current < 2) return '';
      const elapsed = Date.now() - this.task.startTime;
      const avg = elapsed / this.task.current;
      const remain = (this.task.total - this.task.current) * avg;
      return remain < 60000 ? `${Math.round(remain / 1000)}秒` : `${Math.round(remain / 60000)}分钟`;
    },
    actionItems() {
      return [
        { type: 'name', label: '名称', icon: '📝', emptyCount: this.stats?.emptyName || 0 },
        { type: 'description', label: '描述', icon: '📄', emptyCount: this.stats?.emptyDesc || 0 },
        { type: 'tags', label: '标签', icon: '🏷️', emptyCount: this.stats?.emptyTags || 0 }
      ];
    }
  },
  async mounted() {
    await this.loadConfig();
    await this.refreshStats();
    await this.initRealtimeUpdates();
  },
  beforeUnmount() {
    this.closeEventSource();
  },
  methods: {
    selectProvider(key) {
      this.config.provider = key;
      this.config.model = this.currentProvider.defaultModel;
      this.modelSelect = this.currentProvider.models?.includes(this.config.model) ? this.config.model : '';
      this.config.baseUrl = this.currentProvider.defaultBaseUrl || '';
      this.config.apiKey = '';
      this.config.hasApiKey = false;
      this.connectionTested = false;
    },
    onModelChange() {
      if (this.modelSelect) {
        this.config.model = this.modelSelect;
      }
    },
    async loadConfig() {
      try {
        const { data } = await api.get('/api/ai/config');
        if (data.success) {
          const c = data.config;
          this.config.provider = c.provider || 'deepseek';
          this.config.hasApiKey = c.hasApiKey;
          this.config.baseUrl = c.baseUrl || '';
          this.config.model = c.model || this.currentProvider.defaultModel;
          this.modelSelect = this.currentProvider.models?.includes(this.config.model) ? this.config.model : '';
          this.config.autoGenerate = c.autoGenerate || false;
        }
      } catch {}
    },
    async saveConfig() {
      this.saving = true;
      try {
        const { data } = await api.post('/api/ai/config', {
          provider: this.config.provider,
          apiKey: this.config.apiKey || undefined,
          baseUrl: this.config.baseUrl || this.currentProvider.defaultBaseUrl,
          model: this.config.model,
          autoGenerate: this.config.autoGenerate
        });
        if (data.success) {
          this.showToast('配置已保存', 'success');
          this.config.hasApiKey = true;
          this.config.apiKey = '';
          this.testConnection();
        } else {
          this.showToast(data.message, 'error');
        }
      } catch (e) {
        this.showToast(e.response?.data?.message || '保存失败', 'error');
      }
      this.saving = false;
    },
    async testConnection() {
      this.testing = true;
      try {
        const { data } = await api.post('/api/ai/test');
        this.connectionTested = true;
        this.connectionOk = data.success;
        this.showToast(data.success ? '连接成功' : data.message, data.success ? 'success' : 'error');
      } catch (e) {
        this.connectionTested = true;
        this.connectionOk = false;
        this.showToast('连接失败', 'error');
      }
      this.testing = false;
    },
      async refreshStats() {
        this.refreshing = true;
        try {
          const { data } = await api.get('/api/ai/stats');
          if (data.success) {
            this.stats = data.stats;
          }
        } catch (e) {
          console.error('Failed to refresh stats:', e);
        }
        this.refreshing = false;
      },
      // 初始化实时更新 (SSE)
      async initRealtimeUpdates() {
        this.closeEventSource();
        
        const token = localStorage.getItem('token');
        const url = `/api/ai/batch-task/stream${token ? '?token=' + encodeURIComponent(token) : ''}`;
        
        this.eventSource = new EventSource(url);
      
      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.updateTaskState(data);
        } catch (e) {
          console.error('Failed to parse SSE data:', e);
        }
      };
      
      this.eventSource.onerror = (err) => {
        console.warn('SSE connection error, falling back to polling...', err);
        this.closeEventSource();
        // 如果 SSE 失败，降级到轮询（可选，这里由于已经重构了后端，暂不实现轮询 fallback，SSE 应该很稳定）
      };
    },
    closeEventSource() {
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
    },
      updateTaskState(data) {
        if (!data) return;
        
        // 如果任务刚刚从运行变为不运行 (data.running 由 true 变为 false)
        if (this.task.running && !data.running) {
          // 确保进度条到 100%
          this.task.current = this.task.total;
          if (this.task.total > 0) {
            this.showToast(`任务结束！成功 ${data.successCount || 0}，失败 ${data.failCount || 0}`, data.failCount > 0 ? 'info' : 'success');
          }
          
          // 延迟关闭，让用户看清结果
          setTimeout(() => {
            this.task.running = false;
            this.refreshStats();
          }, 1500);
          return;
        }
        
        // 如果后端传回的任务状态是运行中，则更新本地状态
        if (data.running) {
          this.task = {
            ...this.task,
            running: true,
            types: data.types || [],
            current: data.current || 0,
            total: data.total || 0,
            successCount: data.successCount || 0,
            failCount: data.failCount || 0,
            currentCard: data.currentCard || '',
            errors: data.errors || [],
            concurrency: data.concurrency,
            isRateLimited: data.isRateLimited,
            startTime: data.startTime || this.task.startTime || Date.now()
          };
        } else if (!this.task.running) {
          // 如果后端不运行且本地也不运行，同步一下状态即可（比如失败数等）
          // 但不要把 running 设为 true，防止干扰延迟关闭逻辑
          Object.assign(this.task, { ...data, running: false });
        }
      },
    async startTask(type, mode) {
      if (this.starting || this.task.running) return;
      if (mode === 'all' && !confirm(`确定要重新生成所有卡片的${type === 'name' ? '名称' : type === 'description' ? '描述' : '标签'}吗？`)) return;
      
      this.starting = true;
      try {
        // 立即显示进度条面板
        this.task = {
          running: true,
          type,
          mode,
          current: 0,
          total: 0,
          successCount: 0,
          failCount: 0,
          currentCard: '准备中...',
          startTime: Date.now(),
          errors: [],
          types: type === 'all' ? ['name', 'description', 'tags'] : [type]
        };

        const { data } = await api.post('/api/ai/batch-task/start', { type, mode });
        if (!data.success) {
          this.showToast(data.message || '启动失败', 'error');
          this.task.running = false;
          return;
        }
        if (data.total === 0) {
          this.showToast('没有需要处理的卡片', 'info');
          this.task.running = false;
          return;
        }
        
        this.task.total = data.total;
        this.showToast(`任务已启动，正在处理 ${data.total} 个卡片`, 'success');
        
        // 重新初始化 SSE 确保连接处于最新状态
        this.initRealtimeUpdates();
      } catch (e) {
        this.showToast(e.response?.data?.message || '启动失败', 'error');
        this.task.running = false;
      } finally {
        this.starting = false;
      }
    },
    async stopTask() {
      this.stopping = true;
      try {
        await api.post('/api/ai/batch-task/stop');
        this.showToast('正在停止...', 'info');
      } catch {}
      setTimeout(() => { this.stopping = false; }, 2000);
    },
    showToast(msg, type = 'info') {
      this.toast = { show: true, msg, type };
      setTimeout(() => { this.toast.show = false; }, 3000);
    },
    onWizardClose() {
      this.showWizard = false;
      this.refreshStats();
      this.initRealtimeUpdates();
    }
  }
};
</script>

<style scoped>
.ai-settings { max-width: 700px; margin: 0 auto; padding: 20px; }

/* Header */
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; font-size: 1.4rem; }
.connection-status { display: flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 16px; font-size: 13px; background: #f3f4f6; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: #9ca3af; }
.connection-status.ok .status-dot { background: #10b981; }
.connection-status.err .status-dot { background: #ef4444; }
.connection-status.pending .status-dot { background: #f59e0b; }

/* Quick Start */
.quick-start { display: flex; gap: 16px; padding: 20px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 12px; color: #fff; margin-bottom: 20px; }
.quick-start-icon { font-size: 2rem; }
.quick-start-content h4 { margin: 0 0 6px; }
.quick-start-content p { margin: 0 0 10px; opacity: 0.9; font-size: 14px; }
.quick-start-steps { display: flex; gap: 10px; flex-wrap: wrap; }
.quick-start-steps .step { padding: 4px 10px; background: rgba(255,255,255,0.2); border-radius: 10px; font-size: 12px; }

/* Section */
.section { background: #fff; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.section-header h3 { margin: 0; font-size: 1rem; }
.section-hint { font-size: 12px; color: #6b7280; }
.docs-link { font-size: 13px; color: #3b82f6; text-decoration: none; }

/* Provider Grid */
.provider-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 8px; }
.provider-card { display: flex; flex-direction: column; align-items: center; padding: 12px 6px; border: 2px solid #e5e7eb; border-radius: 10px; cursor: pointer; transition: all 0.15s; }
.provider-card:hover { border-color: #3b82f6; }
.provider-card.active { border-color: #3b82f6; background: #eff6ff; }
.provider-icon { font-size: 1.4rem; margin-bottom: 4px; }
.provider-info { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.provider-name { font-size: 11px; font-weight: 500; text-align: center; }
.provider-tag { font-size: 9px; padding: 1px 5px; border-radius: 6px; background: #3b82f6; color: #fff; }
.provider-tag.local { background: #10b981; }

/* Form */
.config-form { display: flex; flex-direction: column; gap: 14px; }
.form-item { display: flex; flex-direction: column; gap: 6px; }
.form-item label { display: flex; justify-content: space-between; font-size: 14px; font-weight: 500; }
.label-status { font-size: 12px; color: #6b7280; }
.label-status.ok { color: #10b981; }
.input-group { display: flex; gap: 6px; }
.model-select { display: flex; flex-direction: column; gap: 6px; }
.model-select select { flex-shrink: 0; }
.input { flex: 1; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; }
.input:focus { outline: none; border-color: #3b82f6; }
.input-btn { padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; background: #f9fafb; cursor: pointer; }
.switch-item { flex-direction: row; justify-content: space-between; align-items: center; padding: 12px; background: #f9fafb; border-radius: 10px; }
.switch-item span { display: flex; flex-direction: column; gap: 2px; }
.switch-item strong { font-size: 14px; }
.switch-item small { font-size: 12px; color: #6b7280; }
.switch { position: relative; width: 44px; height: 24px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; inset: 0; background: #d1d5db; border-radius: 24px; transition: 0.2s; }
.slider:before { content: ''; position: absolute; height: 18px; width: 18px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: 0.2s; }
.switch input:checked + .slider { background: #3b82f6; }
.switch input:checked + .slider:before { transform: translateX(20px); }
.form-actions { display: flex; gap: 10px; margin-top: 6px; }

/* Buttons */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 18px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; font-weight: 500; background: #fff; cursor: pointer; transition: all 0.15s; }
.btn:hover:not(:disabled) { background: #f3f4f6; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; }
.btn.primary:hover:not(:disabled) { background: #2563eb; }
.btn.danger { background: #ef4444; border-color: #ef4444; color: #fff; }
.btn.outline { background: transparent; }
.btn.sm { padding: 7px 12px; font-size: 13px; }
.btn.lg { padding: 14px 24px; font-size: 15px; width: 100%; }
.icon-btn { padding: 6px; border: none; background: transparent; font-size: 18px; cursor: pointer; border-radius: 6px; }
.icon-btn:hover { background: #f3f4f6; }
.icon-btn:disabled { opacity: 0.5; }

/* Stats */
.stats { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.stat { display: flex; flex-direction: column; align-items: center; padding: 10px 16px; background: #f3f4f6; border-radius: 10px; min-width: 70px; }
.stat span { font-size: 18px; font-weight: 600; color: #3b82f6; }
.stat.warn span { color: #f59e0b; }
.stat.warn { background: #fef3c7; }

/* Task Panel */
.task-panel { padding: 20px; background: linear-gradient(135deg, #eff6ff, #f5f3ff); border: 2px solid #3b82f6; border-radius: 12px; }
.task-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.task-title { font-weight: 600; font-size: 15px; }
.task-counts { display: flex; gap: 10px; font-size: 13px; font-weight: 500; }
.count-item.success { color: #10b981; }
.count-item.fail { color: #ef4444; }
.count-item.total { color: #6b7280; }

.progress-wrap { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.progress-bar { flex: 1; height: 10px; background: #e5e7eb; border-radius: 5px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); border-radius: 5px; transition: width 0.3s; }
.progress-text { font-size: 14px; font-weight: 600; color: #3b82f6; min-width: 45px; text-align: right; }

.task-info { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 13px; color: #6b7280; }
.task-current { max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.task-eta { color: #3b82f6; }

.task-errors { margin-bottom: 16px; padding: 10px; background: rgba(239, 68, 68, 0.05); border-radius: 8px; border: 1px dashed rgba(239, 68, 68, 0.2); }
.error-header { font-size: 12px; font-weight: 600; color: #ef4444; margin-bottom: 6px; }
.error-list { display: flex; flex-direction: column; gap: 4px; }
.error-item { font-size: 12px; display: flex; gap: 6px; }
.err-title { font-weight: 600; white-space: nowrap; }
.err-msg { color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.task-actions { display: flex; justify-content: space-between; align-items: center; }
.task-concurrency { font-size: 12px; color: #6b7280; display: flex; align-items: center; gap: 6px; }
.rate-limit-tag { padding: 2px 6px; background: #fef3c7; color: #92400e; border-radius: 4px; font-size: 11px; font-weight: 600; animation: blink 1s infinite; }

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* Batch Actions */
.batch-actions { display: flex; flex-direction: column; gap: 16px; }
.wizard-btn { margin-bottom: 8px; }
.quick-actions { display: flex; align-items: center; gap: 10px; padding: 12px; background: #f9fafb; border-radius: 8px; }
.quick-label { font-size: 13px; color: #6b7280; }
.action-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.action-card { padding: 14px; background: #f9fafb; border-radius: 10px; }
.action-header { font-size: 14px; font-weight: 500; margin-bottom: 10px; }
.action-btns { display: flex; flex-direction: column; gap: 6px; }
.action-btns .btn { width: 100%; }

/* Toast */
.toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(100px); padding: 12px 24px; border-radius: 10px; font-size: 14px; color: #fff; background: #3b82f6; opacity: 0; transition: all 0.3s; z-index: 1000; }
.toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
.toast.success { background: #10b981; }
.toast.error { background: #ef4444; }
.toast.info { background: #3b82f6; }

/* Responsive */
@media (max-width: 600px) {
  .provider-grid { grid-template-columns: repeat(4, 1fr); }
  .action-grid { grid-template-columns: 1fr; }
  .form-actions { flex-direction: column; }
  .stats { justify-content: center; }
}

/* Dark Mode */
:root.dark .section { background: #1f2937; }
:root.dark .provider-card { border-color: #374151; background: #1f2937; }
:root.dark .provider-card.active { background: #1e3a5f; }
:root.dark .input { background: #374151; border-color: #4b5563; color: #fff; }
:root.dark .stat, :root.dark .action-card, :root.dark .switch-item { background: #374151; }
:root.dark .connection-status { background: #374151; }
:root.dark .task-panel { background: linear-gradient(135deg, #1e3a5f, #2d1f5f); }
</style>
