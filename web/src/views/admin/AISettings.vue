<template>
  <div class="ai-settings">
    <!-- 页面标题 -->
    <div class="page-header">
      <div class="header-left">
        <h2>🤖 AI 配置</h2>
        <p class="page-desc">配置 AI 服务、模型参数与自动生成策略，用于卡片名称、描述和标签生成。</p>
        <div class="active-badge" v-if="activeProviderKey">
          <span class="label">当前使用:</span>
          <span class="value">{{ providers[activeProviderKey]?.name }}</span>
        </div>
      </div>
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
      <div class="provider-select-wrapper">
          <select 
            :value="config.provider" 
            class="input provider-dropdown" 
            @change="e => selectProvider(e.target.value)"
          >
            <option v-for="p in sortedProviders" :key="p.key" :value="p.key">
              {{ p.icon }} {{ p.name }} {{ p.isActive ? '(当前使用)' : '' }} {{ p.recommended ? '(推荐)' : '' }} {{ p.local ? '(本地)' : '' }}
            </option>
          </select>
      </div>
    </div>

    <!-- API 配置 -->
    <div class="section">
      <div class="section-header">
        <div class="section-title-group">
          <h3>API 配置</h3>
          <span class="active-tag" v-if="config.provider === activeProviderKey">
            已激活
          </span>
          <span class="editing-tag" v-else>
            配置中
          </span>
        </div>
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
                :class="{ 'input-error': !apiKeyValidation.valid }"
                @input="validateApiKey(config.apiKey)"
              />
              <button type="button" class="input-btn" @click="showApiKey = !showApiKey">
                {{ showApiKey ? '🙈' : '👁️' }}
              </button>
            </div>
            <div class="input-hint" v-if="currentProvider.keyHint && !config.apiKey">
              {{ currentProvider.keyHint }}
            </div>
            <div class="input-error-msg" v-if="!apiKeyValidation.valid">
              {{ apiKeyValidation.message }}
            </div>
            <div class="input-warning-msg" v-else-if="apiKeyValidation.warning">
              {{ apiKeyValidation.message }}
            </div>
          </div>

        <div class="form-item" v-if="currentProvider.needsBaseUrl">
          <label>
            <span>Base URL</span>
            <span class="label-hint" v-if="currentProvider.local">本地服务</span>
          </label>
          <input 
            type="text" 
            v-model="config.baseUrl" 
            :placeholder="currentProvider.defaultBaseUrl || 'https://api.example.com'" 
            class="input"
            :class="{ 'input-error': !baseUrlValidation.valid }"
            @input="validateBaseUrl(config.baseUrl)"
          />
          <div class="input-hint" v-if="currentProvider.local && baseUrlValidation.valid">
            确保 Ollama 服务已启动，默认端口 11434
          </div>
          <div class="input-hint" v-else-if="!currentProvider.local && baseUrlValidation.valid && !config.baseUrl">
            填写 API 服务地址，无需包含 /v1 路径
          </div>
          <div class="input-error-msg" v-if="!baseUrlValidation.valid">
            {{ baseUrlValidation.message }}
          </div>
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
          <div class="model-description" v-if="selectedModelDescription">
            {{ selectedModelDescription }}
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
            <button class="btn primary" @click="saveConfig" :disabled="saving || testing || (!apiKeyValidation.valid && config.apiKey)">
              <template v-if="saving || testing">⏳ 正在测试并保存...</template>
              <template v-else-if="config.provider !== activeProviderKey">🚀 激活并测试连接</template>
              <template v-else>💾 保存并测试连接</template>
            </button>
            <button 
              v-if="config.hasApiKey || config.baseUrl || connectionOk" 
              class="btn danger" 
              @click="showClearConfirm = true" 
              :disabled="clearing"
            >
              {{ clearing ? '⏳ 清除中...' : '🗑️ 清除配置' }}
            </button>
          </div>

        
        <!-- 测试错误详情 -->
        <div class="test-error-panel" v-if="testError && !connectionOk">
          <div class="error-header">
            <span class="error-icon">⚠️</span>
            <span class="error-title">{{ testError.title }}</span>
          </div>
          <div class="error-detail" v-if="testError.detail">
            {{ testError.detail }}
          </div>
          <div class="error-suggestions" v-if="testError.suggestions.length">
            <div class="suggestion-title">排查建议：</div>
            <ul>
              <li v-for="(s, i) in testError.suggestions" :key="i">{{ s }}</li>
            </ul>
          </div>
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
        <div class="task-panel" v-if="task.running && !showWizard">
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
            <div class="task-errors" v-if="task.failCount > 0">
              <div class="error-header">
                <span>失败详情 ({{ task.errors ? task.errors.length : 0 }}/{{ task.failCount }})</span>
                <button v-if="!task.running && task.failCount > 0" class="btn xs outline retry-all-btn" @click="retryAllFailed" :disabled="starting">
                  🔄 重试全部失败
                </button>
              </div>
              <div class="error-list" v-if="task.errors && task.errors.length > 0">
                <div v-for="(err, idx) in task.errors" :key="idx" class="error-item">
                  <div class="err-info">
                    <span class="err-title" :title="err.cardTitle">{{ err.cardTitle }}:</span>
                    <span class="err-msg" :title="err.error">{{ err.error }}</span>
                  </div>
                  <button class="btn xs outline" @click="retryCard(err)" :disabled="starting || task.running">重试</button>
                </div>
              </div>
              <div v-else class="error-empty-hint">
                正在同步失败详情...
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

        <!-- 操作按钮 (优化后) -->
        <div class="batch-actions" v-else>
          <div class="action-bar">
            <button 
              class="btn primary lg main-action" 
              @click="startTask('all', 'empty')"
              :disabled="!config.hasApiKey || starting || totalMissing === 0"
            >
              ✨ 智能补全缺失内容 ({{ totalMissing }})
            </button>
            <button 
              class="btn lg outline wizard-action" 
              @click="showWizard = true" 
              :disabled="!config.hasApiKey"
            >
              🎯 高级批量生成向导
            </button>
          </div>
          <p class="action-hint" v-if="totalMissing > 0">
            补全将自动分析 URL 并生成缺失的名称、描述和标签。
          </p>
        </div>
      </div>

      <!-- AI 批量生成向导 (传递任务状态) -->
      <AIBatchWizard 
        :visible="showWizard" 
        :active-task="task"
        @close="onWizardClose" 
        @start="onWizardStart"
      />

    <!-- 清除配置确认弹窗 -->
    <div v-if="showClearConfirm" class="modal-overlay" @click="showClearConfirm = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>⚠️ 确认清除</h3>
          <button @click="showClearConfirm = false" class="close-btn">×</button>
        </div>
        <div class="modal-body">
          <p class="warning-text">清除后，所有 AI 功能将不可用，包括：</p>
          <ul class="warning-list">
            <li>自动生成卡片名称、描述和标签</li>
            <li>批量智能补全功能</li>
            <li>手动 AI 生成功能</li>
          </ul>
          <p class="warning-text">确定要清除 API 配置吗？</p>
        </div>
        <div class="modal-footer">
          <button class="btn" @click="showClearConfirm = false">取消</button>
          <button class="btn danger" @click="clearConfig" :disabled="clearing">
            {{ clearing ? '清除中...' : '确认清除' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div class="toast" :class="[toast.type, { show: toast.show }]">
      {{ toast.msg }}
    </div>
  </div>
</template>

<script>
import { 
  aiGetConfig,
  aiUpdateConfig,
  aiClearConfig,
  aiTestConnection,
  aiGetStats,
  aiStartBatchTask, 
  aiStopTask
} from '../../api';
import AIBatchWizard from '../../components/AIBatchWizard.vue';

const PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    icon: '🐳',
    recommended: true,
    docsUrl: 'https://platform.deepseek.com/',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyPrefix: 'sk-',
    keyHint: '以 sk- 开头，约 32 位字符',
    modelDescriptions: {
      'deepseek-chat': '通用对话，性价比极高',
      'deepseek-reasoner': '推理增强，适合复杂任务'
    }
  },
  siliconflow: {
    name: '硅基流动',
    icon: '🚀',
    docsUrl: 'https://siliconflow.cn/',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1', 'THUDM/glm-4-9b-chat', 'Qwen/Qwen2.5-7B-Instruct'],
    keyHint: '在硅基流动平台获取',
    modelDescriptions: {
      'deepseek-ai/DeepSeek-V3': 'DeepSeek V3 官方模型',
      'deepseek-ai/DeepSeek-R1': 'DeepSeek R1 推理模型'
    }
  },
  zhipu: {
    name: '智谱 AI',
    icon: '🧠',
    docsUrl: 'https://open.bigmodel.cn/',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4', 'glm-4-plus'],
    keyHint: '在智谱开放平台获取',
    modelDescriptions: {
      'glm-4-flash': '快速响应，免费额度多',
      'glm-4': '均衡模型，效果稳定',
      'glm-4-plus': '增强版，复杂任务更优'
    }
  },
  qwen: {
    name: '通义千问',
    icon: '☁️',
    docsUrl: 'https://dashscope.console.aliyun.com/',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
    keyHint: '在阿里云 DashScope 获取',
    modelDescriptions: {
      'qwen-plus': '主力模型，能力均衡',
      'qwen-turbo': '极速模型，适合简单任务',
      'qwen-max': '最强模型，理解力最深'
    }
  },
  volcengine: {
    name: '火山引擎',
    icon: '🌋',
    docsUrl: 'https://www.volcengine.com/product/ark',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: '',
    models: [],
    keyHint: '在火山引擎控制台获取 API Key',
    modelDescriptions: {
      '': '请输入具体的模型推理端点 ID'
    }
  },
  moonshot: {
    name: 'Moonshot',
    icon: '🌙',
    docsUrl: 'https://platform.moonshot.cn/',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    keyHint: '在 Moonshot 平台获取',
    modelDescriptions: {
      'moonshot-v1-8k': '8k 上下文窗口',
      'moonshot-v1-32k': '32k 上下文窗口'
    }
  },
  yi: {
    name: '零一万物',
    icon: '0️⃣',
    docsUrl: 'https://platform.lingyiwanwu.com/',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'yi-lightning',
    models: ['yi-lightning', 'yi-large', 'yi-medium'],
    keyHint: '在零一万物平台获取',
    modelDescriptions: {
      'yi-lightning': '极速响应',
      'yi-large': '高性能旗舰'
    }
  },
  openai: {
    name: 'OpenAI',
    icon: '🤖',
    docsUrl: 'https://platform.openai.com/',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'o1-mini'],
    keyPrefix: 'sk-',
    keyHint: '以 sk- 开头',
    modelDescriptions: {
      'gpt-4o-mini': '轻量快速，性价比高',
      'gpt-4o': '最强多模态模型',
      'o1-mini': '推理增强模型'
    }
  },
  anthropic: {
    name: 'Claude',
    icon: '🎨',
    docsUrl: 'https://console.anthropic.com/',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'claude-3-5-sonnet-20240620',
    models: ['claude-3-5-sonnet-20240620', 'claude-3-haiku-20240307'],
    keyPrefix: 'sk-ant-',
    keyHint: '以 sk-ant- 开头',
    modelDescriptions: {
      'claude-3-5-sonnet-20240620': '目前最强理解模型之一',
      'claude-3-haiku-20240307': '极致速度与性价比'
    }
  },
  gemini: {
    name: 'Gemini',
    icon: '♊',
    docsUrl: 'https://aistudio.google.com/',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'gemini-1.5-flash',
    models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'],
    keyPrefix: 'AIza',
    keyHint: '以 AIza 开头',
    modelDescriptions: {
      'gemini-1.5-flash': 'Google 极速模型',
      'gemini-1.5-pro': '具备百万上下文窗口'
    }
  },
  openrouter: {
    name: 'OpenRouter',
    icon: '🌐',
    docsUrl: 'https://openrouter.ai/',
    needsApiKey: true,
    needsBaseUrl: false,
    defaultModel: 'google/gemini-flash-1.5',
    models: ['google/gemini-flash-1.5', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o-mini'],
    keyHint: '在 OpenRouter 获取，支持聚合所有模型'
  },
  ollama: {
    name: 'Ollama',
    icon: '🦙',
    local: true,
    docsUrl: 'https://ollama.com/',
    needsApiKey: false,
    needsBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434',
    defaultModel: 'llama3.2',
    models: ['llama3.2', 'qwen2.5', 'mistral', 'deepseek-r1'],
    modelDescriptions: {
      'llama3.2': 'Meta 最新开源模型',
      'qwen2.5': '阿里最强开源系列',
      'deepseek-r1': 'DeepSeek 推理开源版'
    }
  },
  custom: {
    name: '自定义',
    icon: '🛠️',
    needsApiKey: true,
    needsBaseUrl: true,
    defaultModel: '',
    models: [],
    keyHint: '任意符合 OpenAI 规范的接口'
  }
};

export default {
  name: 'AISettings',
  components: { AIBatchWizard },

    data() {
      return {
        providers: PROVIDERS,
        config: { provider: 'deepseek', apiKey: '', baseUrl: '', model: 'deepseek-chat', autoGenerate: false, hasApiKey: false },
        activeProviderKey: '', // 全局生效的提供商
        modelSelect: 'deepseek-chat',
        showApiKey: false,
        testing: false,
        saving: false,
        clearing: false,
        showClearConfirm: false,
        refreshing: false,
        starting: false,
        stopping: false,
        connectionTested: false,
        connectionOk: false,
        stats: null,
        task: { running: false, type: '', mode: '', current: 0, total: 0, currentCard: '', startTime: 0, errors: [], successCount: 0, failCount: 0 },
        eventSource: null,
        toast: { show: false, msg: '', type: 'info' },
        showWizard: false,
        testError: null,
        apiKeyValidation: { valid: true, message: '' },
        baseUrlValidation: { valid: true, message: '' }
      };
    },
  computed: {
    currentProvider() { return PROVIDERS[this.config.provider] || PROVIDERS.deepseek; },
      sortedProviders() {
        const list = Object.entries(this.providers).map(([key, p]) => ({ 
          key, 
          ...p,
          isActive: key === this.activeProviderKey
        }));
        // 当前活跃的排在第一位，其次是当前选中的，然后是推荐的
        return list.sort((a, b) => {
          if (a.isActive && !b.isActive) return -1;
          if (!a.isActive && b.isActive) return 1;
          if (a.key === this.config.provider) return -1;
          if (b.key === this.config.provider) return 1;
          if (a.recommended && !b.recommended) return -1;
          if (!a.recommended && b.recommended) return 1;
          return 0;
        });
      },
    canTest() {
      if (this.currentProvider.needsApiKey && !this.config.apiKey && !this.config.hasApiKey) return false;
      if (this.currentProvider.needsBaseUrl && !this.config.baseUrl) return false;
      if (!this.apiKeyValidation.valid && this.config.apiKey) return false;
      if (!this.baseUrlValidation.valid && this.config.baseUrl) return false;
      return true;
    },
    selectedModelDescription() {
      const descriptions = this.currentProvider.modelDescriptions || {};
      return descriptions[this.config.model] || '';
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
      }
    },
      async mounted() {
      // 并行加载配置和统计，加快页面渲染
      await Promise.all([
        this.loadConfig(),
        this.refreshStats()
      ]);
      this.initRealtimeUpdates();
      
      // 添加页面可见性监听，当用户切回标签页时自动刷新统计
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    },
    beforeUnmount() {
      this.closeEventSource();
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    },
    methods: {
      handleVisibilityChange() {
        if (document.visibilityState === 'visible') {
          this.refreshStats();
          // 如果连接断开了，尝试重新初始化
          if (!this.eventSource) {
            this.initRealtimeUpdates();
          }
        }
      },
      async selectProvider(key) {
        if (this.config.provider === key && this.config.hasApiKey) return;
        
        this.config.provider = key;
        this.testing = true; // 显示加载状态

      
      try {
        const { data } = await aiGetConfig(key);
        if (data.success && data.config) {
          const c = data.config;
          // 注意：hasApiKey 为 true 时表示数据库已有 key，apiKey 字段留空用于掩码显示
          this.config.hasApiKey = c.hasApiKey;
          this.config.apiKey = ''; 
          this.config.baseUrl = c.baseUrl || this.currentProvider.defaultBaseUrl || '';
          this.config.model = c.model || this.currentProvider.defaultModel || '';
          this.modelSelect = this.currentProvider.models?.includes(this.config.model) ? this.config.model : '';
          
          // 连接状态同步
          this.connectionOk = c.lastTestedOk;
          this.connectionTested = c.lastTestedOk;
        } else {
          // 如果没有保存过该提供商的配置，重置为默认值
          this.resetProviderConfig(key);
        }
      } catch (e) {
        console.error('切换提供商失败:', e);
        this.resetProviderConfig(key);
      } finally {
        this.testing = false;
        this.testError = null;
        this.apiKeyValidation = { valid: true, message: '' };
        this.baseUrlValidation = { valid: true, message: '' };
      }
    },
    resetProviderConfig(key) {
      this.config.hasApiKey = false;
      this.config.apiKey = '';
      this.config.baseUrl = this.providers[key].defaultBaseUrl || '';
      this.config.model = this.providers[key].defaultModel || '';
      this.modelSelect = this.providers[key].models?.includes(this.config.model) ? this.config.model : '';
      this.connectionTested = false;
      this.connectionOk = false;
    },
      validateApiKey(value) {
        if (!value) {
          this.apiKeyValidation = { valid: true, message: '' };
          return;
        }
        const provider = this.currentProvider;
        if (provider.keyPrefix && !value.startsWith(provider.keyPrefix)) {
          this.apiKeyValidation = { valid: false, message: `格式不正确，应以 ${provider.keyPrefix} 开头` };
          return;
        }
        if (value.length < 20) {
            this.apiKeyValidation = { valid: true, message: '⚠️ API Key 较短，请确认是否完整复制', warning: true };
            return;
          }
        if (/\s/.test(value)) {
          this.apiKeyValidation = { valid: false, message: '包含空格，请检查是否有多余字符' };
          return;
        }
        this.apiKeyValidation = { valid: true, message: '' };
      },
      validateBaseUrl(value) {
        if (!value) {
          this.baseUrlValidation = { valid: true, message: '' };
          return;
        }
        if (!/^https?:\/\//i.test(value)) {
          this.baseUrlValidation = { valid: false, message: '请以 http:// 或 https:// 开头' };
          return;
        }
        if (/\s/.test(value)) {
          this.baseUrlValidation = { valid: false, message: '包含空格，请检查是否有多余字符' };
          return;
        }
        if (value.endsWith('/v1') || value.endsWith('/v1/')) {
          this.baseUrlValidation = { valid: false, message: '无需包含 /v1 路径，系统会自动添加' };
          return;
        }
        try {
          new URL(value);
          this.baseUrlValidation = { valid: true, message: '' };
        } catch {
          this.baseUrlValidation = { valid: false, message: 'URL 格式不正确' };
        }
      },
    onModelChange() {
      if (this.modelSelect) {
        this.config.model = this.modelSelect;
      }
    },
          async loadConfig() {
            try {
              const { data } = await aiGetConfig();
              if (data.success) {
                const c = data.config;
                this.activeProviderKey = c.provider || 'deepseek';
                this.config.provider = this.activeProviderKey;
                this.config.hasApiKey = c.hasApiKey;
                this.config.baseUrl = c.baseUrl || '';
                this.config.model = c.model || this.currentProvider.defaultModel;
                this.modelSelect = this.currentProvider.models?.includes(this.config.model) ? this.config.model : '';
                this.config.autoGenerate = c.autoGenerate || false;
                
                // 初始化连接状态
                if (c.lastTestedOk) {
                  this.connectionTested = true;
                  this.connectionOk = true;
                } else if (c.hasApiKey) {
                  this.connectionTested = false;
                  this.connectionOk = false;
                }
              }
            } catch {}
          },
          async saveConfig() {
            if (this.saving || this.testing) return;
            
            this.saving = true;
            this.testing = true;
            this.testError = null;
            const isSwitching = this.config.provider !== this.activeProviderKey;
            
            try {
              // 1. 测试连接 (包含自动探测)
              const testConfig = {
                provider: this.config.provider,
                model: this.config.model,
                baseUrl: this.config.baseUrl || this.currentProvider.defaultBaseUrl || ''
              };
              if (this.config.apiKey) {
                testConfig.apiKey = this.config.apiKey;
              }
              
              let testPassed = false;
              let suggestedBaseUrl = null;
              let responseTime = '';
              
              try {
                const { data: testData } = await aiTestConnection(testConfig);
                testPassed = testData.success;
                if (testData.success) {
                  responseTime = testData.responseTime;
                  if (testData.suggestedBaseUrl) {
                    suggestedBaseUrl = testData.suggestedBaseUrl;
                    this.config.baseUrl = suggestedBaseUrl; // 自动应用补全后的 URL
                  }
                } else {
                  this.testError = this.parseTestError(testData.message);
                }
              } catch (e) {
                testPassed = false;
                this.testError = this.parseTestError(e.response?.data?.message || e.message || '连接失败');
              }
              
              this.connectionTested = true;
              this.connectionOk = testPassed;
              
              // 2. 保存配置 (将测试结果同步保存)
              const { data: saveData } = await aiUpdateConfig({
                provider: this.config.provider,
                apiKey: this.config.apiKey || undefined,
                baseUrl: this.config.baseUrl || this.currentProvider.defaultBaseUrl,
                model: this.config.model,
                autoGenerate: this.config.autoGenerate,
                lastTestedOk: testPassed
              });
              
              if (saveData.success) {
                this.config.hasApiKey = true;
                this.config.apiKey = '';
                this.activeProviderKey = this.config.provider; // 更新当前活跃的提供商
                
                if (testPassed) {
                  const msg = isSwitching 
                    ? `已切换至 ${this.currentProvider.name} 并连接成功 (${responseTime})`
                    : `配置已保存并连接成功 (${responseTime})`;
                  this.showToast(msg, 'success');
                } else {
                  this.showToast('配置已保存，但连接测试失败', 'warning');
                }
              } else {
                this.showToast(saveData.message, 'error');
              }
            } catch (e) {
              this.showToast(e.response?.data?.message || '操作失败', 'error');
      } finally {
        this.saving = false;
        this.testing = false;
      }
    },
    parseTestError(message) {
          const result = { title: '连接失败', detail: message, suggestions: [] };
          const msg = message.toLowerCase();
          
          if (msg.includes('401') || msg.includes('invalid') || msg.includes('api key') || msg.includes('authentication') || msg.includes('unauthorized')) {
            result.title = 'API Key 无效';
            result.suggestions = [
              '检查 API Key 是否正确复制（注意首尾空格）',
              '确认 API Key 是否已过期或被禁用',
              '检查账户余额是否充足'
            ];
          } else if (msg.includes('403') || msg.includes('forbidden') || msg.includes('permission')) {
            result.title = '权限不足';
            result.suggestions = [
              '检查 API Key 是否有对应模型的访问权限',
              '部分模型需要单独申请开通',
              '检查账户是否已完成实名认证'
            ];
          } else if (msg.includes('404') || msg.includes('not found') || msg.includes('model')) {
            result.title = '模型不存在';
            result.suggestions = [
              '检查模型名称是否正确',
              '该模型可能已下线或需要申请访问',
              '尝试切换到其他模型'
            ];
          } else if (msg.includes('429') || msg.includes('rate limit') || msg.includes('too many')) {
            result.title = '请求过于频繁';
            result.suggestions = [
              '稍后再试',
              '检查 API 调用配额是否已用完',
              '考虑升级套餐或降低调用频率'
            ];
          } else if (msg.includes('timeout') || msg.includes('超时')) {
            result.title = '连接超时';
            result.suggestions = [
              '检查网络连接是否正常',
              '如使用代理，确认代理配置正确',
              'API 服务可能暂时不可用，稍后再试'
            ];
          } else if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('dns') || msg.includes('fetch')) {
            result.title = '网络错误';
            result.suggestions = [
              '检查网络连接是否正常',
              '如使用 Ollama，确认服务已启动',
              '检查 Base URL 是否正确'
            ];
          } else if (msg.includes('base url') || msg.includes('url')) {
            result.title = 'Base URL 配置错误';
            result.suggestions = [
              '检查 URL 格式是否正确（包含 http:// 或 https://）',
              '确认 URL 末尾无多余斜杠',
              '验证服务地址是否可访问'
            ];
          }
          
          return result;
        },
        async clearConfig() {
          this.clearing = true;
          try {
            const { data } = await aiClearConfig();
            if (data.success) {
              this.showToast('配置已清除', 'success');
              // 重置所有配置状态
              this.config = {
                provider: 'deepseek',
                apiKey: '',
                baseUrl: '',
                model: PROVIDERS.deepseek.defaultModel,
                autoGenerate: false,
                hasApiKey: false
              };
              this.modelSelect = PROVIDERS.deepseek.defaultModel;
              this.connectionTested = false;
              this.connectionOk = false;
              this.testError = null;
              this.showClearConfirm = false;
              this.refreshStats();
            } else {
              this.showToast(data.message || '清除失败', 'error');
            }
          } catch (e) {
            this.showToast(e.response?.data?.message || '清除失败', 'error');
          }
          this.clearing = false;
        },

      async refreshStats() {
        this.refreshing = true;
        try {
          const { data } = await aiGetStats();
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
            // 确保进度显示完整
            this.task.current = this.task.total;
            if (this.task.total > 0 && data.successCount !== undefined) {
              this.showToast(`任务结束！成功 ${data.successCount || 0}，失败 ${data.failCount || 0}`, data.failCount > 0 ? 'info' : 'success');
            }
            
            // 立即刷新统计（第一次刷新）
            this.refreshStats();

            // 更新任务快照，但保持本地 running 为 true 2秒钟，以便用户看到“已完成”状态
            this.task = { ...this.task, ...data, running: true };
    
            // 延迟关闭任务面板
            setTimeout(() => {
              this.task.running = false;
              // 彻底结束时再次刷新统计（第二次刷新，确保最终一致性）
              this.refreshStats();
            }, 2000);
            return;
          }
          
          // 如果后端传回的任务状态是运行中，或者本地已经是运行中（处于延迟关闭期），则同步数据
          if (data.running || this.task.running) {
            // 如果处于延迟关闭期（this.task.running=true 但 data.running=false），不覆盖 running 状态
            const isClosing = this.task.running && !data.running;
            
            this.task = {
              ...this.task,
              ...data,
              running: isClosing ? true : !!data.running,
              startTime: data.startTime || this.task.startTime || Date.now()
            };
            
            // 如果是运行中且有进度更新，可以考虑按需刷新统计（可选，但通常 SSE 就够了）
          } else {
            // 完全不在运行状态，同步状态
            this.task = { ...this.task, ...data, running: false };
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
  
          const { data } = await aiStartBatchTask({ type, mode });
          if (!data.success) {
            this.showToast(data.message || '启动失败', 'error');
            this.task.running = false;
            return;
          }
          if (data.total === 0) {
            this.showToast('没有需要处理的卡片', 'info');
            this.task.running = false;
            this.refreshStats();
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
            await aiStopTask();
            this.showToast('正在停止...', 'info');
            // 立即触发一次统计刷新
            this.refreshStats();
          } catch {}
          setTimeout(() => { this.stopping = false; }, 2000);
        },
        async retryCard(errItem) {
          if (!errItem.cardId) return;
          await this.doStartBatchTask([errItem.cardId], this.task.types || ['name', 'description', 'tags']);
        },
        async retryAllFailed() {
          const failedIds = this.task.errors
            .map(e => e.cardId)
            .filter(id => !!id);
          if (failedIds.length === 0) return;
          await this.doStartBatchTask(failedIds, this.task.types || ['name', 'description', 'tags']);
        },
        async doStartBatchTask(cardIds, types) {
          if (this.starting || this.task.running) return;
          this.starting = true;
          try {
            // 立即显示进度条面板
            this.task = {
              running: true,
              current: 0,
              total: cardIds.length,
              successCount: 0,
              failCount: 0,
              currentCard: '准备中...',
              startTime: Date.now(),
              errors: [],
              types: types
            };

            const { data } = await aiStartBatchTask({ cardIds, types });
            if (!data.success) {
              this.showToast(data.message || '启动失败', 'error');
              this.task.running = false;
              return;
            }
            this.showToast(`重试任务已启动`, 'success');
            this.initRealtimeUpdates();
          } catch (e) {
            this.showToast(e.response?.data?.message || '启动失败', 'error');
            this.task.running = false;
          } finally {
            this.starting = false;
          }
        },


    showToast(msg, type = 'info') {
      this.toast = { show: true, msg, type };
      setTimeout(() => { this.toast.show = false; }, 3000);
    },
    onWizardClose() {
      this.showWizard = false;
      this.refreshStats();
      // 保持 SSE 连接，除非明确知道没有任务在运行
      if (!this.task.running) {
        this.initRealtimeUpdates();
      }
    },
    onWizardStart(taskInfo) {
      // 当向导开始任务时，同步主页面的任务状态
      // 如果 taskInfo 明确指定 running: false，则表示任务启动失败
      const isRunning = taskInfo.running !== false;
      this.task = {
        ...this.task,
        ...taskInfo,
        running: isRunning,
        startTime: isRunning ? Date.now() : this.task.startTime
      };
      if (isRunning) {
        this.initRealtimeUpdates();
      }
    }
  }
};
</script>

<style scoped>
.ai-settings { max-width: 700px; margin: 0 auto; padding: 20px; }

/* Header */
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.header-left { display: flex; align-items: baseline; gap: 12px; }
.page-header h2 { margin: 0; font-size: 1.4rem; }
.active-badge { display: flex; align-items: center; gap: 4px; padding: 2px 8px; background: #ecfdf5; border: 1px solid #10b981; border-radius: 6px; font-size: 12px; color: #059669; }
.active-badge .label { opacity: 0.8; }
.active-badge .value { font-weight: 600; }
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
.section-title-group { display: flex; align-items: center; gap: 8px; }
.section-header h3 { margin: 0; font-size: 1rem; }
.active-tag { font-size: 11px; padding: 1px 6px; background: #10b981; color: #fff; border-radius: 4px; font-weight: 500; }
.editing-tag { font-size: 11px; padding: 1px 6px; background: #f3f4f6; color: #6b7280; border-radius: 4px; font-weight: 500; border: 1px solid #e5e7eb; }
.section-hint { font-size: 12px; color: #6b7280; }
.docs-link { font-size: 13px; color: #3b82f6; text-decoration: none; }

/* Provider Select */
.provider-select-wrapper { margin-bottom: 8px; }
.provider-dropdown { width: 100%; padding: 12px; font-size: 15px; border-radius: 10px; cursor: pointer; }

/* Form */
.config-form { display: flex; flex-direction: column; gap: 14px; }
.form-item { display: flex; flex-direction: column; gap: 6px; }
.form-item label { display: flex; justify-content: space-between; font-size: 14px; font-weight: 500; }
.label-status { font-size: 12px; color: #6b7280; }
.label-status.ok { color: #10b981; }
.label-hint { font-size: 11px; color: #3b82f6; background: #eff6ff; padding: 2px 6px; border-radius: 4px; }
.input-group { display: flex; gap: 6px; }
.model-select { display: flex; flex-direction: column; gap: 6px; }
.model-select select { flex-shrink: 0; }
.input { flex: 1; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; }
.input:focus { outline: none; border-color: #3b82f6; }
.input.input-error { border-color: #ef4444; background: #fef2f2; }
.input-btn { padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; background: #f9fafb; cursor: pointer; }
.input-hint { font-size: 12px; color: #6b7280; margin-top: 4px; }
.input-error-msg { font-size: 12px; color: #ef4444; margin-top: 4px; }
.input-warning-msg { font-size: 12px; color: #f59e0b; margin-top: 4px; }
.model-description { font-size: 12px; color: #6b7280; margin-top: 4px; padding: 6px 10px; background: #f3f4f6; border-radius: 6px; }
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
.form-actions { display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap; }

/* Test Error Panel */
.test-error-panel { margin-top: 16px; padding: 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; }
.test-error-panel .error-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.test-error-panel .error-icon { font-size: 18px; }
.test-error-panel .error-title { font-weight: 600; color: #dc2626; font-size: 14px; }
.test-error-panel .error-detail { font-size: 13px; color: #7f1d1d; margin-bottom: 12px; padding: 8px 10px; background: #fee2e2; border-radius: 6px; word-break: break-all; }
.test-error-panel .error-suggestions { font-size: 13px; }
.test-error-panel .suggestion-title { font-weight: 500; color: #374151; margin-bottom: 6px; }
.test-error-panel ul { margin: 0; padding-left: 20px; color: #4b5563; }
.test-error-panel li { margin-bottom: 4px; }

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

.task-errors { margin-bottom: 16px; padding: 0; background: #fff; border-radius: 10px; border: 1px solid #fee2e2; overflow: hidden; }
.error-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #fef2f2; font-size: 13px; font-weight: 600; color: #b91c1c; border-bottom: 1px solid #fee2e2; }
.error-list { display: flex; flex-direction: column; max-height: 200px; overflow-y: auto; }
.error-item { padding: 8px 12px; border-bottom: 1px solid #fef2f2; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.error-item:last-child { border-bottom: none; }
.err-info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
.err-title { font-weight: 600; color: #374151; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.err-msg { color: #6b7280; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.retry-all-btn { flex-shrink: 0; }

.error-empty-hint { padding: 20px; text-align: center; color: #9ca3af; font-size: 13px; font-style: italic; background: #fff; }

.task-actions { display: flex; justify-content: space-between; align-items: center; }
.task-concurrency { font-size: 12px; color: #6b7280; display: flex; align-items: center; gap: 6px; }
.rate-limit-tag { padding: 2px 6px; background: #fef3c7; color: #92400e; border-radius: 4px; font-size: 11px; font-weight: 600; animation: blink 1s infinite; }

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* Batch Actions */
.batch-actions { display: flex; flex-direction: column; gap: 12px; }
.action-bar { display: flex; gap: 12px; }
.main-action { flex: 2; }
.wizard-action { flex: 1; }
.action-hint { font-size: 13px; color: #6b7280; margin: 0; text-align: center; }

/* Toast */
.toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(100px); padding: 12px 24px; border-radius: 10px; font-size: 14px; color: #fff; background: #3b82f6; opacity: 0; transition: all 0.3s; z-index: 1000; }
.toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
.toast.success { background: #10b981; }
.toast.error { background: #ef4444; }
.toast.info { background: #3b82f6; }

/* Responsive */
@media (max-width: 600px) {
  .form-actions { flex-direction: column; }
  .stats { justify-content: center; }
}

/* Dark Mode */
:root.dark .section { background: #1f2937; }
:root.dark .input { background: #374151; border-color: #4b5563; color: #fff; }
:root.dark .input.input-error { background: #451a1a; border-color: #dc2626; }
:root.dark .input-hint { color: #9ca3af; }
:root.dark .model-description { background: #374151; color: #9ca3af; }
:root.dark .stat, :root.dark .switch-item { background: #374151; }
:root.dark .connection-status { background: #374151; }
:root.dark .task-panel { background: linear-gradient(135deg, #1e3a5f, #2d1f5f); }
:root.dark .test-error-panel { background: #451a1a; border-color: #7f1d1d; }
:root.dark .test-error-panel .error-detail { background: #5c1d1d; color: #fca5a5; }
:root.dark .test-error-panel .suggestion-title { color: #e5e7eb; }
:root.dark .test-error-panel ul { color: #d1d5db; }

/* Modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1001; }
.modal-content { background: #fff; border-radius: 12px; width: 90%; max-width: 400px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
.modal-header h3 { margin: 0; font-size: 1.1rem; }
.close-btn { border: none; background: none; font-size: 24px; color: #6b7280; cursor: pointer; padding: 0; line-height: 1; }
.close-btn:hover { color: #374151; }
.modal-body { padding: 20px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 20px; border-top: 1px solid #e5e7eb; background: #f9fafb; }
.warning-text { margin: 0 0 12px; color: #374151; }
.warning-list { margin: 0 0 16px; padding-left: 20px; color: #6b7280; }
.warning-list li { margin-bottom: 6px; }

:root.dark .modal-content { background: #1f2937; border-color: #374151; }
:root.dark .modal-header, :root.dark .modal-footer { border-color: #374151; background: #111827; }
:root.dark .warning-text { color: #e5e7eb; }
:root.dark .warning-list { color: #9ca3af; }
</style>
