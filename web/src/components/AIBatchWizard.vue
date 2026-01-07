<template>
  <div class="wizard-overlay" v-if="visible" @click.self="$emit('close')">
    <div class="wizard-modal">
      <!-- 头部 -->
      <div class="wizard-header">
        <h3>🤖 AI 批量生成向导</h3>
        <button class="close-btn" @click="$emit('close')">✕</button>
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
            <button class="btn primary" @click="runPreview" :disabled="previewing">
              {{ previewing ? '⏳ 生成预览中...' : '🔮 试运行（随机3个）' }}
            </button>
          </div>

          <div v-if="previews.length" class="preview-list">
            <div v-for="p in previews" :key="p.cardId" class="preview-card">
              <div class="preview-title">{{ p.title || extractDomain(p.url) }}</div>
              <div v-for="(field, key) in p.fields" :key="key" class="preview-field">
                <span class="field-label">{{ fieldLabels[key] }}</span>
                <div class="diff-view">
                  <div class="diff-old">{{ field.original || '(空)' }}</div>
                  <div class="diff-arrow">→</div>
                  <div class="diff-new" :class="{ error: field.error }">{{ field.error || field.generated || '(空)' }}</div>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="!previewing" class="preview-hint">
            点击"试运行"预览 AI 生成效果，不满意可返回调整策略
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
              <span>{{ taskDone ? '✅ 任务完成' : '⏳ 正在处理...' }}</span>
              <span>{{ taskStatus.current }} / {{ taskStatus.total }}</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
            </div>
            <div class="progress-info">
              <span v-if="taskStatus.currentCard">当前：{{ taskStatus.currentCard }}</span>
              <span v-if="taskStatus.eta">预计剩余：{{ taskStatus.eta }}</span>
            </div>

            <div class="task-stats">
              <span class="stat success">✓ 成功 {{ taskStatus.successCount || 0 }}</span>
              <span class="stat fail">✗ 失败 {{ taskStatus.failCount || 0 }}</span>
            </div>

            <div v-if="taskStatus.errors?.length" class="error-log">
              <div v-for="(err, i) in taskStatus.errors.slice(-5)" :key="i" class="error-item">
                [失败] {{ err.cardTitle }}: {{ err.error }}
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
        <button class="btn" @click="$emit('close')">取消</button>
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
import { getMenus, getTags, aiFilterCards, aiPreview, aiStartBatchTask, aiGetTaskStatus, aiStopTask } from '../api';

export default {
  name: 'AIBatchWizard',
  props: { visible: Boolean },
  emits: ['close'],
  data() {
    return {
      step: 0,
      stepNames: ['选择范围', '生成策略', '效果预览', '执行任务'],
      fieldLabels: { name: '名称', description: '描述', tags: '标签' },
      menus: [],
      subMenus: [],
      tags: [],
      filters: { status: ['empty_name', 'empty_desc'], menuId: '', subMenuId: '' },
      filteredCards: [],
      filtering: false,
      strategy: { types: ['name', 'description'], mode: 'fill', style: 'default', customPrompt: '' },
      previews: [],
      previewing: false,
      taskRunning: false,
      taskDone: false,
      taskStatus: {},
      starting: false,
      stopping: false,
      pollTimer: null
    };
  },
  computed: {
    canNext() {
      if (this.step === 0) return this.filteredCards.length > 0;
      if (this.step === 1) return this.strategy.types.length > 0;
      return true;
    },
    progressPercent() {
      return this.taskStatus.total ? Math.round((this.taskStatus.current / this.taskStatus.total) * 100) : 0;
    }
  },
  watch: {
    visible(v) {
      if (v) this.init();
      else this.cleanup();
    }
  },
  methods: {
    async init() {
      this.step = 0;
      this.previews = [];
      this.taskRunning = false;
      this.taskDone = false;
      this.taskStatus = {};
      try {
        const [menuRes, tagRes] = await Promise.all([getMenus(), getTags()]);
        this.menus = menuRes.data || [];
        this.tags = tagRes.data || [];
      } catch {}
      this.applyFilter();
    },
    cleanup() {
      if (this.pollTimer) clearInterval(this.pollTimer);
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
      try {
        const sampleIds = this.filteredCards.slice(0, 3).map(c => c.id);
        const { data } = await aiPreview({
          cardIds: sampleIds,
          types: this.strategy.types,
          strategy: { mode: this.strategy.mode, style: this.strategy.style, customPrompt: this.strategy.customPrompt }
        });
        this.previews = data.previews || [];
      } catch (e) {
        alert('预览失败: ' + (e.response?.data?.message || e.message));
      }
      this.previewing = false;
    },
    async startTask() {
      this.starting = true;
      try {
        const { data } = await aiStartBatchTask({
          cardIds: this.filteredCards.map(c => c.id),
          types: this.strategy.types,
          strategy: { mode: this.strategy.mode, style: this.strategy.style, customPrompt: this.strategy.customPrompt }
        });
        if (data.success && data.total > 0) {
          this.taskRunning = true;
          this.taskStatus = { current: 0, total: data.total, successCount: 0, failCount: 0 };
          this.startPoll();
        } else {
          alert(data.message || '没有需要处理的卡片');
        }
      } catch (e) {
        alert('启动失败: ' + (e.response?.data?.message || e.message));
      }
      this.starting = false;
    },
    startPoll() {
      this.pollTimer = setInterval(async () => {
        try {
          const { data } = await aiGetTaskStatus();
          this.taskStatus = data;
          if (!data.running) {
            clearInterval(this.pollTimer);
            this.taskRunning = false;
            this.taskDone = true;
          }
        } catch {}
      }, 1000);
    },
    async stopTask() {
      this.stopping = true;
      try { await aiStopTask(); } catch {}
      setTimeout(() => { this.stopping = false; }, 2000);
    },
    extractDomain(url) {
      try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
    }
  }
};
</script>

<style scoped>
.wizard-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.wizard-modal { background: #fff; border-radius: 16px; width: 90%; max-width: 600px; max-height: 90vh; display: flex; flex-direction: column; }
.wizard-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
.wizard-header h3 { margin: 0; font-size: 1.1rem; }
.close-btn { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #6b7280; }

.steps { display: flex; padding: 16px 20px; gap: 8px; border-bottom: 1px solid #f3f4f6; }
.step { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #9ca3af; }
.step.active { color: #3b82f6; font-weight: 500; }
.step.done { color: #10b981; }
.step-num { width: 22px; height: 22px; border-radius: 50%; background: #e5e7eb; display: flex; align-items: center; justify-content: center; font-size: 12px; }
.step.active .step-num { background: #3b82f6; color: #fff; }
.step.done .step-num { background: #10b981; color: #fff; }

.wizard-body { flex: 1; overflow-y: auto; padding: 20px; }
.step-content { display: flex; flex-direction: column; gap: 16px; }

.filter-section h4 { margin: 0 0 8px; font-size: 14px; color: #374151; }
.checkbox-group, .radio-group { display: flex; flex-wrap: wrap; gap: 12px; }
.checkbox-group label, .radio-group label { display: flex; align-items: center; gap: 6px; font-size: 14px; cursor: pointer; }
.input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; }
.input:focus { outline: none; border-color: #3b82f6; }
textarea.input { resize: vertical; }

.filter-result { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f9fafb; border-radius: 8px; }
.result-count { font-size: 14px; }
.result-count strong { color: #3b82f6; font-size: 18px; }

.card-preview-list { max-height: 200px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 8px; }
.card-preview-item { display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
.card-preview-item:last-child { border-bottom: none; }
.card-title { font-weight: 500; color: #374151; }
.card-url { color: #9ca3af; max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.more-hint { padding: 8px 12px; text-align: center; color: #6b7280; font-size: 13px; background: #f9fafb; }

.preview-actions { text-align: center; }
.preview-hint { text-align: center; color: #6b7280; padding: 40px 20px; }
.preview-list { display: flex; flex-direction: column; gap: 12px; }
.preview-card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; }
.preview-title { font-weight: 600; margin-bottom: 10px; color: #374151; }
.preview-field { margin-top: 8px; }
.field-label { font-size: 12px; color: #6b7280; display: block; margin-bottom: 4px; }
.diff-view { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.diff-old { color: #9ca3af; text-decoration: line-through; flex: 1; }
.diff-arrow { color: #3b82f6; }
.diff-new { color: #10b981; flex: 1; font-weight: 500; }
.diff-new.error { color: #ef4444; }

.execute-confirm { text-align: center; padding: 20px; }
.execute-confirm p { margin: 8px 0; color: #374151; }
.execute-confirm strong { color: #3b82f6; }

.task-progress { padding: 10px 0; }
.progress-header { display: flex; justify-content: space-between; margin-bottom: 10px; font-weight: 500; }
.progress-bar { height: 10px; background: #e5e7eb; border-radius: 5px; overflow: hidden; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); transition: width 0.3s; }
.progress-info { display: flex; justify-content: space-between; margin-top: 8px; font-size: 13px; color: #6b7280; }
.task-stats { display: flex; gap: 16px; margin-top: 12px; }
.stat { font-size: 14px; }
.stat.success { color: #10b981; }
.stat.fail { color: #ef4444; }
.error-log { margin-top: 12px; max-height: 100px; overflow-y: auto; background: #fef2f2; border-radius: 8px; padding: 8px; }
.error-item { font-size: 12px; color: #b91c1c; padding: 4px 0; }
.task-actions { margin-top: 16px; text-align: center; }

.wizard-footer { display: flex; justify-content: space-between; padding: 16px 20px; border-top: 1px solid #e5e7eb; }
.footer-right { display: flex; gap: 8px; }

.btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 18px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; background: #fff; cursor: pointer; transition: all 0.15s; }
.btn:hover:not(:disabled) { background: #f3f4f6; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; }
.btn.primary:hover:not(:disabled) { background: #2563eb; }
.btn.danger { background: #ef4444; border-color: #ef4444; color: #fff; }
.btn.sm { padding: 6px 12px; font-size: 13px; }
.btn.lg { padding: 14px 28px; font-size: 16px; }

:root.dark .wizard-modal { background: #1f2937; }
:root.dark .wizard-header, :root.dark .wizard-footer { border-color: #374151; }
:root.dark .steps { border-color: #374151; }
:root.dark .filter-section h4, :root.dark .card-title, :root.dark .preview-title { color: #e5e7eb; }
:root.dark .input { background: #374151; border-color: #4b5563; color: #fff; }
:root.dark .filter-result, :root.dark .more-hint { background: #374151; }
:root.dark .card-preview-list, :root.dark .preview-card { border-color: #374151; }
:root.dark .card-preview-item { border-color: #374151; }
</style>
