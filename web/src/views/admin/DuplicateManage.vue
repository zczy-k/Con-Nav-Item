<template>
  <div class="duplicate-manage">
    <div class="section-header">
      <div>
        <h3>重复清理</h3>
        <p class="page-desc">扫描并清理重复卡片，保持导航内容唯一和整洁。</p>
      </div>
      <button @click="handleDetectDuplicates" class="btn btn-primary" :disabled="detecting">
        {{ detecting ? '检测中...' : '🔍 一键检测重复' }}
      </button>
    </div>

    <!-- 检测结果 -->
    <div v-if="duplicateGroups.length > 0" class="duplicate-results">
      <div class="result-summary">
        <div class="summary-card">
          <div class="summary-label">总卡片数</div>
          <div class="summary-value">{{ totalCards }}</div>
        </div>
        <div class="summary-card warning">
          <div class="summary-label">重复组数</div>
          <div class="summary-value">{{ duplicateGroups.length }}</div>
        </div>
        <div class="summary-card danger">
          <div class="summary-label">重复卡片</div>
          <div class="summary-value">{{ duplicateCount }}</div>
        </div>
      </div>

      <!-- 重复卡片组列表 -->
      <div class="duplicate-groups">
        <div v-for="(group, index) in duplicateGroups" :key="index" class="duplicate-group">
          <div class="group-header">
            <h4>重复组 {{ index + 1 }}</h4>
            <span class="group-count">{{ group.totalCount }} 张卡片</span>
          </div>

          <!-- 保留的原始卡片 -->
          <div class="card-item original">
            <div class="card-badge">保留</div>
            <div class="card-info">
              <div class="card-title">{{ group.original.title }}</div>
              <div class="card-url">{{ group.original.url }}</div>
              <div class="card-desc" v-if="group.original.desc">{{ group.original.desc }}</div>
            </div>
            <div class="card-id">ID: {{ group.original.id }}</div>
          </div>

          <!-- 重复的卡片 -->
          <div class="duplicates-list">
            <div v-for="duplicate in group.duplicates" :key="duplicate.id" class="card-item duplicate">
              <div class="card-badge danger">重复</div>
              <div class="card-info">
                <div class="card-title">{{ duplicate.title }}</div>
                <div class="card-url">{{ duplicate.url }}</div>
                <div class="card-desc" v-if="duplicate.desc">{{ duplicate.desc }}</div>
              </div>
              <div class="card-actions">
                <span class="card-id">ID: {{ duplicate.id }}</span>
                <button 
                  @click="removeCard(duplicate.id)" 
                  class="btn-remove"
                  :disabled="removing"
                  title="删除此卡片"
                >
                  删除
                </button>
              </div>
            </div>
          </div>

          <!-- 批量操作 -->
          <div class="group-actions">
            <button 
              @click="removeGroupDuplicates(group)" 
              class="btn btn-danger"
              :disabled="removing"
            >
              删除此组所有重复卡片 ({{ group.duplicates.length }} 张)
            </button>
          </div>
        </div>
      </div>

      <!-- 全局批量操作 -->
      <div class="global-actions">
        <button 
          @click="removeAllDuplicates" 
          class="btn btn-danger btn-large"
          :disabled="removing"
        >
          {{ removing ? '删除中...' : `删除所有重复卡片 (${duplicateCount} 张)` }}
        </button>
      </div>
    </div>

    <!-- 无重复提示 -->
    <div v-else-if="detected && duplicateGroups.length === 0" class="no-duplicates">
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#1abc9c" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <h3>太棒了！没有发现重复卡片</h3>
      <p>您的导航卡片都是唯一的</p>
    </div>

    <!-- 初始提示 -->
    <div v-else-if="!detected" class="initial-hint">
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      <h3>点击"一键检测重复"开始扫描</h3>
      <p>系统将检测所有重复的导航卡片</p>
      <ul class="hint-list">
        <li>📌 URL 相同的卡片</li>
        <li>📌 标题相同且域名相同的卡片</li>
      </ul>
    </div>

    <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { detectDuplicates, removeDuplicates } from '../../api';

const detecting = ref(false);
const removing = ref(false);
const detected = ref(false);
const duplicateGroups = ref([]);
const totalCards = ref(0);
const duplicateCount = ref(0);
const errorMsg = ref('');

// 检测重复卡片
async function handleDetectDuplicates() {
  detecting.value = true;
  errorMsg.value = '';
  
  try {
    const res = await detectDuplicates();
    totalCards.value = res.data.total;
    duplicateGroups.value = res.data.duplicateGroups;
    duplicateCount.value = res.data.duplicateCount;
    detected.value = true;
  } catch (error) {
    errorMsg.value = error.response?.data?.error || '检测失败';
    console.error('检测重复失败:', error);
  } finally {
    detecting.value = false;
  }
}

// 删除单个卡片
async function removeCard(cardId) {
  if (!confirm('确定要删除这张卡片吗？')) return;
  
  removing.value = true;
  errorMsg.value = '';
  
  try {
    console.log('[去重管理] 删除单个卡片:', cardId);
    const res = await removeDuplicates([cardId]);
    console.log('[去重管理] 删除响应:', res.data);
    
    if (res.data.success) {
      console.log('[去重管理] 删除成功，重新检测...');
      // 重新检测
      await handleDetectDuplicates();
    } else {
      errorMsg.value = '删除失败：' + (res.data.message || '未知错误');
    }
  } catch (error) {
    console.error('[去重管理] 删除卡片失败:', error);
    console.error('[去重管理] 错误详情:', error.response?.data);
    errorMsg.value = error.response?.data?.error || error.message || '删除失败';
  } finally {
    removing.value = false;
  }
}

// 删除一组的所有重复卡片
async function removeGroupDuplicates(group) {
  const count = group.duplicates.length;
  if (!confirm(`确定要删除这 ${count} 张重复卡片吗？\n\n将保留：${group.original.title}`)) return;
  
  removing.value = true;
  errorMsg.value = '';
  
  try {
    const cardIds = group.duplicates.map(d => d.id);
    console.log('[去重管理] 删除一组重复卡片:', cardIds);
    const res = await removeDuplicates(cardIds);
    console.log('[去重管理] 删除响应:', res.data);
    
    if (res.data.success) {
      console.log('[去重管理] 删除成功，重新检测...');
      // 重新检测
      await handleDetectDuplicates();
    } else {
      errorMsg.value = '删除失败：' + (res.data.message || '未知错误');
    }
  } catch (error) {
    console.error('[去重管理] 删除重复卡片失败:', error);
    console.error('[去重管理] 错误详情:', error.response?.data);
    errorMsg.value = error.response?.data?.error || error.message || '删除失败';
  } finally {
    removing.value = false;
  }
}

// 删除所有重复卡片
async function removeAllDuplicates() {
  const totalDuplicates = duplicateCount.value;
  if (!confirm(`确定要删除所有 ${totalDuplicates} 张重复卡片吗？\n\n此操作不可撤销！`)) return;
  
  removing.value = true;
  errorMsg.value = '';
  
  try {
    const allDuplicateIds = duplicateGroups.value.flatMap(group => 
      group.duplicates.map(d => d.id)
    );
    console.log('[去重管理] 删除所有重复卡片:', allDuplicateIds);
    const res = await removeDuplicates(allDuplicateIds);
    console.log('[去重管理] 删除响应:', res.data);
    
    if (res.data.success) {
      console.log('[去重管理] 删除成功，重新检测...');
      // 重新检测
      await handleDetectDuplicates();
    } else {
      errorMsg.value = '删除失败：' + (res.data.message || '未知错误');
    }
  } catch (error) {
    console.error('[去重管理] 删除所有重复失败:', error);
    console.error('[去重管理] 错误详情:', error.response?.data);
    errorMsg.value = error.response?.data?.error || error.message || '删除失败';
  } finally {
    removing.value = false;
  }
}
</script>

<style scoped>
.duplicate-manage {
  padding: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.section-header h3 {
  font-size: 1.5rem;
  color: #222;
  margin: 0;
}

.result-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.summary-card {
  background: #fff;
  border: 2px solid #e3e6ef;
  border-radius: 12px;
  padding: 20px;
  flex: 1;
  text-align: center;
}

.summary-card.warning {
  border-color: #f39c12;
  background: #fff8e1;
}

.summary-card.danger {
  border-color: #e74c3c;
  background: #ffe5e5;
}

.summary-label {
  font-size: 0.9rem;
  color: #666;
  margin-bottom: 8px;
}

.summary-value {
  font-size: 2rem;
  font-weight: bold;
  color: #2566d8;
}

.summary-card.warning .summary-value {
  color: #f39c12;
}

.summary-card.danger .summary-value {
  color: #e74c3c;
}

.duplicate-groups {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.duplicate-group {
  background: #fff;
  border: 2px solid #e3e6ef;
  border-radius: 12px;
  padding: 20px;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e3e6ef;
}

.group-header h4 {
  margin: 0;
  color: #222;
  font-size: 1.2rem;
}

.group-count {
  background: #f39c12;
  color: #fff;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: bold;
}

.card-item {
  background: #f8f9fa;
  border: 2px solid #e3e6ef;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  position: relative;
}

.card-item.original {
  background: #e8f5e9;
  border-color: #1abc9c;
}

.card-item.duplicate {
  background: #ffebee;
  border-color: #e74c3c;
}

.card-badge {
  background: #1abc9c;
  color: #fff;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: bold;
  flex-shrink: 0;
}

.card-badge.danger {
  background: #e74c3c;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-weight: bold;
  color: #222;
  margin-bottom: 4px;
  word-break: break-all;
}

.card-url {
  color: #2566d8;
  font-size: 0.85rem;
  margin-bottom: 4px;
  word-break: break-all;
}

.card-desc {
  color: #666;
  font-size: 0.85rem;
  margin-top: 8px;
}

.card-id {
  color: #999;
  font-size: 0.8rem;
  font-family: monospace;
  flex-shrink: 0;
}

.card-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.btn-remove {
  background: #e74c3c;
  color: #fff;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.2s;
}

.btn-remove:hover:not(:disabled) {
  background: #c0392b;
}

.btn-remove:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.duplicates-list {
  margin-top: 12px;
}

.group-actions {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed #e3e6ef;
  text-align: right;
}

.global-actions {
  margin-top: 32px;
  padding: 24px;
  background: #fff5f5;
  border: 2px dashed #e74c3c;
  border-radius: 12px;
  text-align: center;
}

.btn-large {
  font-size: 1.1rem;
  padding: 14px 32px;
}

.no-duplicates,
.initial-hint {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.no-duplicates svg {
  margin-bottom: 20px;
}

.initial-hint svg {
  margin-bottom: 20px;
  opacity: 0.5;
}

.no-duplicates h3,
.initial-hint h3 {
  font-size: 1.5rem;
  color: #222;
  margin-bottom: 8px;
}

.no-duplicates p,
.initial-hint p {
  font-size: 1rem;
}

.hint-list {
  list-style: none;
  padding: 0;
  margin-top: 24px;
  text-align: left;
  max-width: 400px;
  margin-left: auto;
  margin-right: auto;
}

.hint-list li {
  padding: 8px 0;
  font-size: 0.95rem;
}

.error {
  color: #e74c3c;
  background: #ffe5e5;
  padding: 12px;
  border-radius: 8px;
  margin-top: 16px;
  text-align: center;
}

@media (max-width: 768px) {
  .result-summary {
    flex-direction: column;
  }
  
  .section-header {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  
  .card-item {
    flex-direction: column;
  }
  
  .card-actions {
    flex-direction: row;
    justify-content: space-between;
    width: 100%;
  }
}
</style>
