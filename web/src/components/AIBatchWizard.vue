<template>
    <div class="wizard-overlay" v-if="visible" @click.self="handleOverlayClick" @contextmenu.prevent>
      <div class="wizard-modal" @contextmenu.prevent>
        <!-- 头部 -->
        <div class="wizard-header">
          <h3>🤖 AI 批量生成向导</h3>
          <button class="close-btn" @click="handleClose">✕</button>
        </div>
  
        <!-- 步骤指示器 -->
        <div class="steps">
          <div v-for="(s, i) in stepNames" :key="i" class="step" :class="{ active: step === i, done: step > i }">
            <span class="step-num">{{ step > i ? '✓' : i + 1 }}</span>
            <span class="step-name">{{ s }}</span>
          </div>
        </div>

        <!-- 步骤内容 -->
        <div class="wizard-body">
          <!-- 第一步：筛选 -->
          <div v-if="step === 0" class="step-content">
            <div class="filter-section">
              <h4>状态筛选</h4>
              <div class="checkbox-group">
                <label><input type="checkbox" v-model="filters.status" value="empty_name" @change="applyFilter" /> 缺名称</label>
                <label><input type="checkbox" v-model="filters.status" value="empty_desc" @change="applyFilter" /> 缺描述</label>
                <label><input type="checkbox" v-model="filters.status" value="empty_tags" @change="applyFilter" /> 缺标签</label>
              </div>
            </div>

            <div class="filter-section">
              <h4>菜单筛选</h4>
              <select v-model="filters.menuId" @change="onMenuChange" class="input">
                <option value="">全部菜单</option>
                <option v-for="m in menus" :key="m.id" :value="m.id">{{ m.name }}</option>
              </select>
              <select v-if="subMenus.length" v-model="filters.subMenuId" @change="applyFilter" class="input" style="margin-top:8px">
                <option value="">全部子菜单</option>
                <option v-for="s in subMenus" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
            </div>

            <div class="filter-section" v-if="tags.length">
              <h4>标签筛选 <span class="hint">(可选)</span></h4>
              <div class="tag-filter-group">
                <div class="tag-filter-row">
                  <span class="tag-filter-label">包含标签：</span>
                  <div class="tag-select-list">
                    <label v-for="t in tags.slice(0, 20)" :key="t.id" class="tag-checkbox">
                      <input type="checkbox" :value="t.id" v-model="filters.tagIds" @change="applyFilter" />
                      <span class="tag-name" :style="{ background: t.color || '#e5e7eb' }">{{ t.name }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div class="filter-result">
              <span class="result-count">已选中 <strong>{{ filteredCards.length }}</strong> 个卡片</span>
              <button class="btn sm" @click="applyFilter" :disabled="filtering">{{ filtering ? '筛选中...' : '🔄 刷新' }}</button>
            </div>

            <div class="card-preview-list" v-if="filteredCards.length">
              <div v-for="card in filteredCards.slice(0, 10)" :key="card.id" class="card-preview-item">
                <span class="card-title">{{ card.title || extractDomain(card.url) }}</span>
                <span class="card-url">{{ card.url }}</span>
              </div>
              <div v-if="filteredCards.length > 10" class="more-hint">还有 {{ filteredCards.length - 10 }} 个...</div>
            </div>
          </div>

        <!-- 第二步：策略 -->
        <div v-if="step === 1" class="step-content">
          <div class="filter-section">
            <h4>生成字段</h4>
            <div class="checkbox-group">
              <label><input type="checkbox" v-model="strategy.types" value="name" /> 名称</label>
              <label><input type="checkbox" v-model="strategy.types" value="description" /> 描述</label>
              <label><input type="checkbox" v-model="strategy.types" value="tags" /> 标签</label>
            </div>
          </div>

          <div class="filter-section">
            <h4>生成模式</h4>
            <div class="radio-group">
              <label><input type="radio" v-model="strategy.mode" value="fill" /> 补全模式（仅填充空字段）</label>
              <label><input type="radio" v-model="strategy.mode" value="overwrite" /> 覆盖模式（重新生成所有）</label>
            </div>
          </div>

          <div class="filter-section">
            <h4>生成风格</h4>
            <select v-model="strategy.style" class="input">
              <option value="default">默认</option>
              <option value="concise">简洁有力</option>
              <option value="professional">专业正式</option>
              <option value="friendly">友好轻松</option>
              <option value="seo">SEO 优化</option>
            </select>
          </div>

          <div class="filter-section">
            <h4>自定义提示（可选）</h4>
            <textarea v-model="strategy.customPrompt" class="input" rows="2" placeholder="例如：请使用中文，描述控制在30字以内"></textarea>
          </div>
        </div>

        <!-- 第三步：预览 -->
        <div v-if="step === 2" class="step-content">
          <div class="preview-actions">
            <div class="preview-count-selector">
              <label>预览数量：</label>
              <select v-model="previewCount" class="input sm" :disabled="previewing">
                <option :value="1">1 个</option>
                <option :value="3">3 个</option>
                <option :value="5">5 个</option>
                <option :value="Math.min(10, filteredCards.length)">{{ Math.min(10, filteredCards.length) }} 个</option>
              </select>
            </div>
            <button class="btn primary" @click="runPreview" :disabled="previewing || filteredCards.length === 0">
              {{ previewing ? `⏳ 生成中 (${previewProgress}/${previewCount})...` : '🔮 试运行预览' }}
            </button>
          </div>

          <div v-if="previews.length" class="preview-list">
            <div v-for="p in previews" :key="p.cardId" class="preview-card">
              <div class="preview-title">{{ p.title || extractDomain(p.url) }}</div>
              <div v-for="(field, key) in p.fields" :key="key" class="preview-field">
                <span class="field-label">{{ fieldLabels[key] }}</span>
                <div class="diff-view">
                  <div class="diff-old">{{ formatFieldValue(field.original, key) }}</div>
                  <div class="diff-arrow">→</div>
                  <div class="diff-new" :class="{ error: field.error }">{{ field.error || formatFieldValue(field.generated, key) }}</div>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="!previewing" class="preview-hint">
            点击"试运行预览"查看 AI 生成效果，不满意可返回调整策略
          </div>
        </div>

        <!-- 第四步：执行 -->
        <div v-if="step === 3" class="step-content">
          <div v-if="!taskRunning && !taskDone" class="execute-confirm">
            <p>即将处理 <strong>{{ filteredCards.length }}</strong> 个卡片</p>
            <p>生成字段：{{ strategy.types.map(t => fieldLabels[t]).join('、') }}</p>
            <p>生成模式：{{ strategy.mode === 'fill' ? '补全模式' : '覆盖模式' }}</p>
            <button class="btn primary lg" @click="startTask" :disabled="starting">
              {{ starting ? '启动中...' : '🚀 开始执行' }}
            </button>
          </div>

            <div v-if="taskRunning || taskDone" class="task-progress">
              <div class="progress-header">
                <span>{{ taskStatusText }}</span>
                <span>{{ taskStatus.current }} / {{ taskStatus.total }}</span>
              </div>
              <div class="progress-bar" :class="{ 'rate-limited': taskStatus.isRateLimited }">
                <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
              </div>
              <div class="progress-info">
                <span v-if="taskStatus.currentCard && taskRunning">{{ taskStatus.currentCard }}</span>
                <span v-if="taskETA && taskRunning && !taskStatus.isRateLimited">预计剩余：{{ taskETA }}</span>
              </div>

              <!-- 限流/自动重试状态提示 -->
              <div v-if="taskStatus.isRateLimited && taskRunning" class="rate-limit-notice">
                <span class="rate-limit-icon">⏳</span>
                <span>API 限流中，等待后将自动重试...</span>
              </div>
              <div v-if="taskStatus.retryQueueSize > 0 && taskRunning" class="retry-queue-notice">
                <span class="retry-icon">🔄</span>
                <span>{{ taskStatus.retryQueueSize }} 个卡片待自动重试 (第 {{ taskStatus.autoRetryRound + 1 }} 轮)</span>
              </div>

              <!-- 任务完成统计摘要 -->
              <div v-if="taskDone" class="task-summary">
                <div class="summary-grid">
                  <div class="summary-item">
                    <span class="summary-value success">{{ taskStatus.successCount || 0 }}</span>
                    <span class="summary-label">成功</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-value fail">{{ realErrorCount }}</span>
                    <span class="summary-label">失败</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-value warning">{{ warningCount }}</span>
                    <span class="summary-label">警告</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-value">{{ taskDuration }}</span>
                    <span class="summary-label">用时</span>
                  </div>
                </div>
                <div class="summary-rate">
                  成功率：{{ successRate }}%
                </div>
                <div v-if="taskStatus.autoRetryRound > 0" class="auto-retry-summary">
                  自动重试：{{ taskStatus.autoRetryRound }} 轮
                </div>
              </div>

              <div v-if="!taskDone" class="task-stats">
                <span class="stat success">✓ 成功 {{ taskStatus.successCount || 0 }}</span>
                <span class="stat fail">✗ 失败 {{ taskStatus.failCount || 0 }}</span>
                <span class="stat retry" v-if="taskStatus.retryQueueSize > 0">⏳ 待重试 {{ taskStatus.retryQueueSize }}</span>
              </div>
              
              <div v-if="taskDone && hasRealErrors" class="retry-actions">
                <button class="btn sm outline retry-all-btn" @click="retryAllFailed" :disabled="starting || taskRunning">
                  🔄 重试全部失败 ({{ realErrorCount }})
                </button>
              </div>

              <div v-if="hasErrorsOrWarnings" class="error-log-container" :class="{ 'warning-only': !hasRealErrors }">
                <div class="error-log-header">
                  <span>{{ hasRealErrors ? '失败详情' : '警告信息' }} ({{ displayErrors.length }})</span>
                  <span class="header-hint" v-if="hasRealErrors">可点击右侧按钮单独重试</span>
                </div>
                <div class="error-log" v-if="displayErrors.length > 0">
                  <div v-for="(err, i) in displayErrors" :key="i" class="error-item" :class="{ 'is-warning': err.isWarning }">
                    <div class="error-info">
                      <div class="error-row">
                        <span class="error-title" :title="err.cardTitle">
                          <span v-if="err.isWarning" class="warning-icon">⚠️</span>
                          {{ err.cardTitle || '未知卡片' }}
                        </span>
                        <span class="error-time">{{ formatTime(err.time) }}</span>
                      </div>
                      <div class="error-msg" :class="{ 'warning-msg': err.isWarning }" :title="err.error">{{ err.error || '未知错误原因' }}</div>
                    </div>
                    <button 
                      v-if="!err.isWarning"
                      class="btn xs outline retry-btn" 
                      @click.stop="retryCard(err)" 
                      :disabled="starting || taskRunning"
                      title="重试此卡片"
                    >
                      重试
                    </button>
                  </div>
                </div>
                  <div v-else class="error-empty-hint">
                    {{ taskRunning ? '正在实时同步失败详情...' : '未获取到详细错误记录' }}
                  </div>
              </div>

              <div class="task-actions" v-if="taskRunning">
                <button class="btn danger" @click="stopTask" :disabled="stopping">
                  {{ stopping ? '停止中...' : '⏹️ 停止任务' }}
                </button>
              </div>
            </div>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="wizard-footer">
        <button class="btn" @click="handleClose">{{ taskRunning ? '后台运行' : '取消' }}</button>
        <div class="footer-right">
          <button class="btn" v-if="step > 0 && !taskRunning" @click="step--">上一步</button>
          <button class="btn primary" v-if="step < 3" @click="nextStep" :disabled="!canNext">
            {{ step === 2 ? '下一步：执行' : '下一步' }}
          </button>
          <button class="btn primary" v-if="step === 3 && taskDone" @click="$emit('close')">完成</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { getMenus, getTags, aiFilterCards, aiPreview, aiStartBatchTask, aiStopTask } from '../api';

export default {
  name: 'AIBatchWizard',
  props: { 
    visible: Boolean,
    activeTask: { type: Object, default: () => ({ running: false }) }
  },
  emits: ['close', 'start'],
  data() {
    return {
      step: 0,
      stepNames: ['选择范围', '生成策略', '效果预览', '执行任务'],
      fieldLabels: { name: '名称', description: '描述', tags: '标签' },
      menus: [],
      subMenus: [],
      tags: [],
      filters: { status: ['empty_name', 'empty_desc'], menuId: '', subMenuId: '', tagIds: [] },
      filteredCards: [],
      filtering: false,
      strategy: { types: ['name', 'description'], mode: 'fill', style: 'default', customPrompt: '' },
      previews: [],
      previewing: false,
      previewCount: 3,
      previewProgress: 0,
      taskDone: false,
      taskStartTime: null,
      taskEndTime: null,
      localTaskStatus: { current: 0, total: 0, successCount: 0, failCount: 0, currentCard: '', errors: [] },
      pendingRetryErrors: [],
      pendingSuccessCount: 0,
      retrySuccessIds: new Set(),
      lastRetryCardId: null,
      isRetrying: false,
      starting: false,
      stopping: false,
      eventSource: null
    };
  },
    computed: {
      canNext() {
        if (this.step === 0) return this.filteredCards.length > 0;
        if (this.step === 1) return this.strategy.types.length > 0;
        return true;
      },
      taskStatus() {
        const baseStatus = this.activeTask.running ? this.activeTask : this.localTaskStatus;
        
        if (this.isRetrying && this.pendingRetryErrors.length > 0) {
          const currentErrors = baseStatus.errors || [];
          const currentRetryingIds = new Set(currentErrors.map(e => e.cardId));
          const currentSuccessIds = this.retrySuccessIds || new Set();
          
          const mergedErrors = [
            ...currentErrors,
            ...this.pendingRetryErrors.filter(e => 
              !currentRetryingIds.has(e.cardId) && !currentSuccessIds.has(e.cardId)
            )
          ];
          
          const realFailCount = mergedErrors.filter(e => !e.isWarning).length;
          
          return {
            ...baseStatus,
            errors: mergedErrors,
            failCount: realFailCount,
            successCount: this.pendingSuccessCount + (baseStatus.successCount || 0),
            total: this.pendingRetryErrors.length + (baseStatus.total || 0)
          };
        }
        
        return baseStatus;
      },
    taskRunning() {
      return this.activeTask.running;
    },
    taskStatusText() {
      if (this.taskDone) return '✅ 任务完成';
      if (this.taskStatus.isRateLimited) return '⏳ 限流等待中...';
      if (this.taskStatus.autoRetryRound > 0) return `🔄 自动重试第 ${this.taskStatus.autoRetryRound} 轮`;
      return '⏳ 正在处理...';
    },
    progressPercent() {
      const s = this.taskStatus;
      return s.total ? Math.min(100, Math.round((s.current / s.total) * 100)) : 0;
    },
    displayErrors() {
      return this.taskStatus.errors || [];
    },
    hasRealErrors() {
      return this.displayErrors.some(e => !e.isWarning && !e.isRateLimited);
    },
    hasErrorsOrWarnings() {
      return this.displayErrors.length > 0;
    },
    realErrorCount() {
      return this.displayErrors.filter(e => !e.isWarning && !e.isRateLimited).length;
    },
    warningCount() {
      return this.displayErrors.filter(e => e.isWarning).length;
    },
    successRate() {
      const total = this.taskStatus.total || 0;
      const success = this.taskStatus.successCount || 0;
      if (total === 0) return 0;
      return Math.min(100, Math.round((success / total) * 100));
    },
    taskDuration() {
      const start = this.taskStatus.startTime || this.taskStartTime;
      if (!start) return '-';
      const end = this.taskEndTime || Date.now();
      const seconds = Math.round((end - start) / 1000);
      if (seconds < 60) return `${seconds}秒`;
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes}分${secs}秒`;
    },
    taskETA() {
      if (!this.taskRunning || !this.taskStatus.startTime) return '';
      const current = this.taskStatus.current || 0;
      const total = this.taskStatus.total || 0;
      if (current === 0 || total === 0) return '';
      const elapsed = Date.now() - this.taskStatus.startTime;
      const avgPerItem = elapsed / current;
      const remaining = (total - current) * avgPerItem;
      const seconds = Math.round(remaining / 1000);
      if (seconds < 60) return `${seconds}秒`;
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes}分${secs}秒`;
    }
  },
    watch: {
      visible(v) {
        if (v) this.init();
      },
      'activeTask.running'(newVal, oldVal) {
        if (newVal === true) {
          this.taskDone = false;
          this.taskStartTime = Date.now();
          this.taskEndTime = null;
        }
        if (oldVal === true && newVal === false && this.step === 3) {
          this.taskDone = true;
          this.taskEndTime = Date.now();
          
          if (this.isRetrying && this.pendingRetryErrors.length > 0) {
            const currentErrors = this.activeTask.errors || [];
            const failedIds = new Set(currentErrors.map(e => e.cardId));
            this.pendingRetryErrors = this.pendingRetryErrors.filter(e => failedIds.has(e.cardId) || !this.retrySuccessIds.has(e.cardId));
            
            if (this.activeTask.successCount > 0) {
              const retriedIds = [...this.retrySuccessIds];
              this.pendingRetryErrors = this.pendingRetryErrors.filter(e => !retriedIds.includes(e.cardId));
            }
          }
          
          if (this.pendingRetryErrors.length === 0) {
            this.isRetrying = false;
            this.pendingSuccessCount = 0;
            this.retrySuccessIds = new Set();
          }
          
          this.applyFilter();
        }
      },
      'activeTask.successCount'(newVal, oldVal) {
        if (this.isRetrying && newVal > (oldVal || 0) && this.activeTask.currentCard) {
          const successCardId = this.lastRetryCardId;
          if (successCardId) {
            this.retrySuccessIds.add(successCardId);
            this.pendingRetryErrors = this.pendingRetryErrors.filter(e => e.cardId !== successCardId);
          }
        }
      },
      activeTask: {
        handler(val) {
          if (val) {
            this.localTaskStatus = { ...val };
          }
        },
        deep: true
      }
    },
  methods: {
    async init() {
      this.step = 0;
      this.previews = [];
      this.taskDone = false;
      this.localTaskStatus = { current: 0, total: 0, successCount: 0, failCount: 0, currentCard: '', errors: [] };
      this.pendingRetryErrors = [];
      this.pendingSuccessCount = 0;
      this.retrySuccessIds = new Set();
      this.lastRetryCardId = null;
      this.isRetrying = false;

      try {
        const [menuRes, tagRes] = await Promise.all([getMenus(), getTags()]);
        this.menus = menuRes.data || [];
        this.tags = tagRes.data || [];
      } catch {}
      this.applyFilter();
    },
    async onMenuChange() {
      this.filters.subMenuId = '';
      const menu = this.menus.find(m => m.id === this.filters.menuId);
      this.subMenus = menu?.subMenus || [];
      this.applyFilter();
    },
    async applyFilter() {
      this.filtering = true;
      try {
        const params = { status: this.filters.status };
        if (this.filters.menuId) params.menuIds = [this.filters.menuId];
        if (this.filters.subMenuId) params.subMenuIds = [this.filters.subMenuId];
        if (this.filters.tagIds?.length) params.tagIds = this.filters.tagIds;
        const { data } = await aiFilterCards(params);
        this.filteredCards = data.cards || [];
      } catch { this.filteredCards = []; }
      this.filtering = false;
    },
    nextStep() {
      if (this.step < 3) this.step++;
    },
    async runPreview() {
      this.previewing = true;
      this.previews = [];
      this.previewProgress = 0;
      try {
        const count = Math.min(this.previewCount, this.filteredCards.length);
        const shuffled = [...this.filteredCards].sort(() => Math.random() - 0.5);
        const sampleIds = shuffled.slice(0, count).map(c => c.id);
        this.previewProgress = 1;
        const { data } = await aiPreview({
          cardIds: sampleIds,
          types: this.strategy.types,
          strategy: { mode: this.strategy.mode, style: this.strategy.style, customPrompt: this.strategy.customPrompt }
        });
        this.previews = data.previews || [];
        this.previewProgress = count;
      } catch (e) {
        alert('预览失败: ' + (e.response?.data?.message || e.message));
      }
      this.previewing = false;
    },
    async startTask() {
      this.pendingRetryErrors = [];
      this.pendingSuccessCount = 0;
      this.retrySuccessIds = new Set();
      this.lastRetryCardId = null;
      this.isRetrying = false;
      await this.doStartTask(this.filteredCards.map(c => c.id));
    },
      async retryCard(errItem) {
        if (!errItem.cardId) {
          alert('无法重试：该错误没有关联的卡片 ID');
          return;
        }
        
        const cardIdToRetry = errItem.cardId;
        this.lastRetryCardId = cardIdToRetry;
        this.pendingRetryErrors = (this.taskStatus.errors || []).filter(e => e.cardId !== cardIdToRetry);
        this.pendingSuccessCount = this.taskStatus.successCount || 0;
        this.isRetrying = true;
        
        await this.doStartTask([cardIdToRetry]);
      },
    async retryAllFailed() {
      // 只获取真正失败的卡片（排除警告）
      const realErrors = (this.taskStatus.errors || []).filter(e => !e.isWarning);
      if (realErrors.length === 0) {
        alert('没有需要重试的失败卡片');
        return;
      }
      
      const failedIds = realErrors
        .map(e => e.cardId)
        .filter(id => !!id && id !== 0);
        
      if (failedIds.length === 0) {
        alert('没有可重试的卡片（部分系统错误无法直接重试）');
        return;
      }
      
      // 重试全部时，保留之前的成功数，清空错误记录
      this.pendingSuccessCount = this.taskStatus.successCount || 0;
      this.pendingRetryErrors = [];
      this.isRetrying = true;  // 标记为重试模式，以便累加成功数
      
      await this.doStartTask(failedIds);
    },
    async doStartTask(cardIds) {
      this.starting = true;
      this.taskDone = false;
      
      // 重试时清空本地错误记录
      this.localTaskStatus.errors = [];
      
      const payload = {
        cardIds: cardIds,
        types: this.strategy.types,
        strategy: { mode: this.strategy.mode, style: this.strategy.style, customPrompt: this.strategy.customPrompt }
      };

      try {
        const { data } = await aiStartBatchTask(payload);
        
        if (!data.success || data.total === 0) {
          alert(data.message || '没有需要处理的卡片');
          this.starting = false;
          return;
        }
        
        // API 成功后，通知父组件启动任务状态，切换到进度界面
        // 注意：errors 设为空数组，后端会通过 SSE 实时推送新的错误
        this.$emit('start', {
          total: data.total || payload.cardIds.length,
          types: payload.types,
          mode: payload.strategy.mode,
          current: 0,
          successCount: 0,
          failCount: 0,
          currentCard: '任务已启动...',
          errors: []
        });
      } catch (e) {
        alert('启动失败: ' + (e.response?.data?.message || e.message));
      }
      this.starting = false;
    },
    async stopTask() {
      this.stopping = true;
      try { await aiStopTask(); } catch {}
      setTimeout(() => { this.stopping = false; }, 2000);
    },
    extractDomain(url) {
      try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
    },
    formatFieldValue(value, fieldKey) {
      if (!value || (Array.isArray(value) && value.length === 0)) return '(空)';
      if (fieldKey === 'tags' && Array.isArray(value)) {
        return value.join('、');
      }
      return value;
    },
      formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
      },
      handleClose() {
        if (this.taskRunning) {
          this.$emit('close');
        } else if (this.previewing) {
          if (confirm('预览正在生成中，确定要取消吗？')) {
            this.$emit('close');
          }
        } else {
          this.$emit('close');
        }
      },
      handleOverlayClick() {
        if (this.taskRunning) {
          return;
        }
        this.handleClose();
      }
    }
  };
</script>

<style scoped>
.wizard-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.wizard-modal { background: #fff; border-radius: 16px; width: 90%; max-width: 600px; max-height: 90vh; display: flex; flex-direction: column; -webkit-touch-callout: none; user-select: none; -webkit-user-select: none; }
.wizard-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; -webkit-tap-highlight-color: transparent; }
.wizard-header h3 { margin: 0; font-size: 1.1rem; pointer-events: none; }
.close-btn { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #6b7280; -webkit-tap-highlight-color: transparent; }

.steps { display: flex; padding: 16px 20px; gap: 8px; border-bottom: 1px solid #f3f4f6; -webkit-tap-highlight-color: transparent; }
.step { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #9ca3af; pointer-events: none; }
.step.active { color: #3b82f6; font-weight: 500; }
.step.done { color: #10b981; }
.step-num { width: 22px; height: 22px; border-radius: 50%; background: #e5e7eb; display: flex; align-items: center; justify-content: center; font-size: 12px; }
.step.active .step-num { background: #3b82f6; color: #fff; }
.step.done .step-num { background: #10b981; color: #fff; }

.wizard-body { flex: 1; overflow-y: auto; padding: 20px; }
.step-content { display: flex; flex-direction: column; gap: 16px; }

.filter-section h4 { margin: 0 0 8px; font-size: 14px; color: #374151; pointer-events: none; }
.checkbox-group, .radio-group { display: flex; flex-wrap: wrap; gap: 12px; }
.checkbox-group label, .radio-group label { display: flex; align-items: center; gap: 6px; font-size: 14px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; }
.input.sm { width: auto; padding: 6px 10px; font-size: 13px; }
.input:focus { outline: none; border-color: #3b82f6; }
textarea.input { resize: vertical; }

.filter-result { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f9fafb; border-radius: 8px; -webkit-tap-highlight-color: transparent; }
.result-count { font-size: 14px; pointer-events: none; }
.result-count strong { color: #3b82f6; font-size: 18px; }

.card-preview-list { max-height: 200px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px; }
.card-preview-item { display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; -webkit-tap-highlight-color: transparent; }
.card-preview-item:last-child { border-bottom: none; }
.card-title { font-weight: 500; color: #374151; pointer-events: none; }
.card-url { color: #9ca3af; max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; pointer-events: none; }
.more-hint { padding: 8px 12px; text-align: center; color: #6b7280; font-size: 13px; background: #f9fafb; pointer-events: none; }

.filter-section h4 .hint { font-weight: normal; color: #9ca3af; font-size: 12px; }
.tag-filter-group { margin-top: 8px; }
.tag-filter-row { display: flex; align-items: flex-start; gap: 8px; }
.tag-filter-label { font-size: 13px; color: #6b7280; min-width: 70px; padding-top: 4px; pointer-events: none; }
.tag-select-list { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; }
.tag-checkbox { display: flex; align-items: center; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.tag-checkbox input { display: none; }
.tag-checkbox .tag-name { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; color: #374151; border: 1px solid transparent; transition: all 0.15s; pointer-events: none; }
.tag-checkbox input:checked + .tag-name { border-color: #3b82f6; box-shadow: 0 0 0 1px #3b82f6; }
.tag-checkbox:hover .tag-name { opacity: 0.8; }

.preview-actions { display: flex; align-items: center; justify-content: center; gap: 16px; flex-wrap: wrap; }
.preview-count-selector { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.preview-count-selector label { color: #6b7280; pointer-events: none; }
.preview-hint { text-align: center; color: #6b7280; padding: 40px 20px; pointer-events: none; }
.preview-list { display: flex; flex-direction: column; gap: 12px; }
.preview-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; -webkit-tap-highlight-color: transparent; }
.preview-title { font-weight: 600; margin-bottom: 10px; color: #374151; pointer-events: none; }
.preview-field { margin-top: 8px; }
.field-label { font-size: 12px; color: #6b7280; display: block; margin-bottom: 4px; pointer-events: none; }
.diff-view { display: flex; align-items: center; gap: 8px; font-size: 13px; pointer-events: none; }
.diff-old { color: #9ca3af; text-decoration: line-through; flex: 1; }
.diff-arrow { color: #3b82f6; }
.diff-new { color: #10b981; flex: 1; font-weight: 500; }
.diff-new.error { color: #ef4444; }

.execute-confirm { text-align: center; padding: 20px; pointer-events: none; }
.execute-confirm p { margin: 8px 0; color: #374151; }
.execute-confirm strong { color: #3b82f6; }

.task-progress { padding: 10px 0; }
.progress-header { display: flex; justify-content: space-between; margin-bottom: 10px; font-weight: 500; pointer-events: none; }
.progress-bar { height: 10px; background: #e5e7eb; border-radius: 5px; overflow: hidden; transition: all 0.3s; pointer-events: none; }
.progress-bar.rate-limited { background: #fef3c7; }
.progress-bar.rate-limited .progress-fill { background: linear-gradient(90deg, #f59e0b, #d97706); animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
.progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); transition: width 0.3s; }
.progress-info { display: flex; justify-content: space-between; margin-top: 8px; font-size: 13px; color: #6b7280; pointer-events: none; }

.rate-limit-notice, .retry-queue-notice { display: flex; align-items: center; gap: 8px; padding: 10px 14px; margin-top: 12px; border-radius: 8px; font-size: 13px; pointer-events: none; }
.rate-limit-notice { background: #fef3c7; color: #b45309; border: 1px solid #fcd34d; }
.retry-queue-notice { background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; }
.rate-limit-icon, .retry-icon { font-size: 16px; }
.auto-retry-summary { margin-top: 8px; text-align: center; font-size: 12px; color: #6b7280; pointer-events: none; }

.task-summary { margin-top: 16px; padding: 16px; background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border-radius: 12px; border: 1px solid #bae6fd; pointer-events: none; }
.summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; text-align: center; }
.summary-item { display: flex; flex-direction: column; gap: 4px; }
.summary-value { font-size: 24px; font-weight: 700; color: #374151; }
.summary-value.success { color: #10b981; }
.summary-value.fail { color: #ef4444; }
.summary-value.warning { color: #f59e0b; }
.summary-label { font-size: 12px; color: #6b7280; }
.summary-rate { margin-top: 12px; text-align: center; font-size: 14px; color: #374151; font-weight: 500; }

.task-stats { display: flex; align-items: center; gap: 16px; margin-top: 12px; flex-wrap: wrap; pointer-events: none; }
.stat { font-size: 14px; }
.stat.success { color: #10b981; }
.stat.fail { color: #ef4444; }
.stat.retry { color: #f59e0b; }

.retry-actions { margin-top: 12px; text-align: center; }
.retry-all-btn { margin-left: auto; }

.error-empty-hint { padding: 20px; text-align: center; color: #9ca3af; font-size: 13px; font-style: italic; background: #fff; pointer-events: none; }

.error-log-container { margin-top: 16px; border: 1px solid #fee2e2; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 4px rgba(239, 68, 68, 0.05); }
.error-log-container.warning-only { border-color: #fef3c7; }
.error-log-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #fef2f2; border-bottom: 1px solid #fee2e2; pointer-events: none; }
.error-log-container.warning-only .error-log-header { background: #fffbeb; border-color: #fef3c7; }
.error-log-container.warning-only .error-log-header span:first-child { color: #b45309; }
.error-log-header span:first-child { font-size: 13px; font-weight: 600; color: #b91c1c; }
.header-hint { font-size: 11px; color: #f87171; font-weight: normal; }
.error-log { max-height: 180px; overflow-y: auto; padding: 0; background: #fff; }
.error-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #fef2f2; gap: 12px; -webkit-tap-highlight-color: transparent; }
.error-item.is-warning { border-color: #fef3c7; }
.error-item.is-warning .error-msg { color: #b45309; }
.warning-icon { margin-right: 4px; }
.warning-msg { color: #b45309 !important; }
.error-item:last-child { border-bottom: none; }
.error-info { flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden; pointer-events: none; }
.error-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.error-title { font-size: 13px; font-weight: 600; color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.error-time { font-size: 11px; color: #9ca3af; font-family: monospace; flex-shrink: 0; }
.error-msg { font-size: 12px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.4; }
.retry-btn { flex-shrink: 0; border-color: #fecaca; color: #ef4444; }
.retry-btn:hover { background: #fef2f2; border-color: #f87171; }

.task-actions { margin-top: 16px; text-align: center; }

.wizard-footer { display: flex; justify-content: space-between; padding: 16px 20px; border-top: 1px solid #e5e7eb; -webkit-tap-highlight-color: transparent; }
.footer-right { display: flex; gap: 8px; }

.btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 18px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; background: #fff; cursor: pointer; transition: all 0.15s; -webkit-touch-callout: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
.btn:hover:not(:disabled) { background: #f3f4f6; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; }
.btn.primary:hover:not(:disabled) { background: #2563eb; }
.btn.danger { background: #ef4444; border-color: #ef4444; color: #fff; }
.btn.outline { background: transparent; }
.btn.sm { padding: 6px 12px; font-size: 13px; }
.btn.xs { padding: 4px 8px; font-size: 11px; border-radius: 4px; }
.btn.lg { padding: 14px 28px; font-size: 16px; }

:root.dark .wizard-modal { background: #1f2937; }
:root.dark .wizard-header, :root.dark .wizard-footer { border-color: #374151; }
:root.dark .steps { border-color: #374151; }
:root.dark .filter-section h4, :root.dark .card-title, :root.dark .preview-title { color: #e5e7eb; }
:root.dark .input { background: #374151; border-color: #4b5563; color: #fff; }
:root.dark .filter-result, :root.dark .more-hint { background: #374151; }
:root.dark .card-preview-list, :root.dark .preview-card { border-color: #374151; }
:root.dark .card-preview-item { border-color: #374151; }
:root.dark .error-log-container { border-color: #450a0a; }
:root.dark .error-log-header { background: #450a0a; color: #fecaca; border-color: #450a0a; }
:root.dark .error-log { background: #1f2937; }
:root.dark .error-item { border-color: #374151; }
:root.dark .error-item .error-title { color: #e5e7eb; }
:root.dark .error-item .error-msg { color: #9ca3af; }
</style>

