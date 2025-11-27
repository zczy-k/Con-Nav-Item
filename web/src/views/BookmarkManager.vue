<template>
  <div class="bookmark-manager">
    <div class="header">
      <div class="header-left">
        <router-link to="/" class="back-btn">← 返回首页</router-link>
        <h1>📚 书签导入</h1>
      </div>
    </div>

    <!-- 待导入书签预处理 -->
    <div v-if="pendingBookmarks.length > 0" class="import-panel">
      <div class="import-header">
        <h2>待导入书签 ({{ pendingBookmarks.length }})</h2>
        <div class="import-actions">
          <button @click="checkAllUrls" class="btn btn-check" :disabled="checking">
            {{ checking ? `检测中 ${checkProgress}/${pendingBookmarks.length}` : '🔍 检测链接有效性' }}
          </button>
        </div>
      </div>

      <!-- 检测结果统计 -->
      <div v-if="checkCompleted" class="check-summary">
        <span class="status-tag valid" @click="filterStatus = 'valid'">✅ 有效 {{ statusCounts.valid }}</span>
        <span class="status-tag timeout" @click="filterStatus = 'timeout'">⚠️ 超时 {{ statusCounts.timeout }}</span>
        <span class="status-tag invalid" @click="filterStatus = 'invalid'">❌ 失效 {{ statusCounts.invalid }}</span>
        <span class="status-tag duplicate" @click="filterStatus = 'duplicate'">🔄 重复 {{ statusCounts.duplicate }}</span>
        <span class="status-tag" @click="filterStatus = ''">全部</span>
      </div>

      <!-- 批量操作 -->
      <div class="batch-toolbar">
        <button @click="selectAllValid" class="btn btn-sm">全选有效</button>
        <button @click="selectAll" class="btn btn-sm">全选</button>
        <button @click="clearSelection" class="btn btn-sm">清除选择</button>
        <span class="selected-count">已选 {{ selectedIds.length }} 项</span>
      </div>

      <!-- 书签列表 -->
      <div class="bookmark-list">
        <div v-for="(bookmark, index) in filteredBookmarks" :key="index" 
             class="bookmark-item" 
             :class="[bookmark.status, { selected: selectedIds.includes(index) }]">
          <input type="checkbox" :checked="selectedIds.includes(index)" @change="toggleSelect(index)" />
          <div class="status-icon">
            <span v-if="bookmark.status === 'valid'">✅</span>
            <span v-else-if="bookmark.status === 'invalid'">❌</span>
            <span v-else-if="bookmark.status === 'timeout'">⚠️</span>
            <span v-else-if="bookmark.status === 'duplicate'">🔄</span>
            <span v-else>⏳</span>
          </div>
          <div class="bookmark-info">
            <div class="bookmark-title">{{ bookmark.title }}</div>
            <div class="bookmark-url">{{ bookmark.url }}</div>
            <div class="bookmark-folder" v-if="bookmark.folder">📁 {{ bookmark.folder }}</div>
          </div>
          <div class="bookmark-category">
            <select v-model="bookmark.targetMenuId" class="category-select">
              <option value="">选择分类</option>
              <option v-for="menu in menus" :key="menu.id" :value="menu.id">{{ menu.name }}</option>
            </select>
          </div>
        </div>
      </div>

      <!-- 导入操作 -->
      <div class="import-footer">
        <button @click="cancelImport" class="btn btn-secondary">取消</button>
        <button @click="doImport" class="btn btn-primary" :disabled="selectedIds.length === 0 || importing">
          {{ importing ? '导入中...' : `导入选中 (${selectedIds.length})` }}
        </button>
      </div>
    </div>

    <!-- 无待导入数据 -->
    <div v-else class="empty-state">
      <p>📭 暂无待导入的书签</p>
      <p class="hint">请使用浏览器扩展选择书签后导入</p>
      <router-link to="/" class="btn btn-primary">返回首页</router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { getMenus, batchCheckUrls, batchAddCards } from '../api';

const pendingBookmarks = ref([]);
const menus = ref([]);
const selectedIds = ref([]);
const checking = ref(false);
const checkProgress = ref(0);
const checkCompleted = ref(false);
const filterStatus = ref('');
const importing = ref(false);

// 智能分类规则
const categoryRules = {
  'github.com': '开发工具',
  'gitlab.com': '开发工具',
  'stackoverflow.com': '开发工具',
  'youtube.com': '视频',
  'bilibili.com': '视频',
  'twitter.com': '社交',
  'facebook.com': '社交',
  'weibo.com': '社交',
  'zhihu.com': '社区',
  'reddit.com': '社区',
  'amazon.com': '购物',
  'taobao.com': '购物',
  'jd.com': '购物'
};

const statusCounts = computed(() => {
  const counts = { valid: 0, invalid: 0, timeout: 0, duplicate: 0, pending: 0 };
  pendingBookmarks.value.forEach(b => {
    counts[b.status || 'pending']++;
  });
  return counts;
});

const filteredBookmarks = computed(() => {
  if (!filterStatus.value) return pendingBookmarks.value;
  return pendingBookmarks.value.filter(b => b.status === filterStatus.value);
});

function suggestCategory(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    for (const [domain, category] of Object.entries(categoryRules)) {
      if (hostname.includes(domain)) {
        const menu = menus.value.find(m => m.name.includes(category));
        return menu?.id || '';
      }
    }
  } catch {}
  return '';
}

async function loadMenus() {
  try {
    const res = await getMenus();
    menus.value = res.data;
  } catch (e) {
    console.error('加载菜单失败:', e);
  }
}

async function checkAllUrls() {
  if (checking.value) return;
  checking.value = true;
  checkProgress.value = 0;

  const urls = pendingBookmarks.value.map(b => ({
    url: b.url,
    title: b.title,
    folder: b.folder
  }));

  try {
    const res = await batchCheckUrls(urls);
    
    // 更新状态
    const statusMap = {};
    [...res.data.valid, ...res.data.invalid, ...res.data.timeout, ...res.data.duplicate].forEach(item => {
      statusMap[item.url] = item.status;
    });

    pendingBookmarks.value.forEach(b => {
      b.status = statusMap[b.url] || 'valid';
    });

    checkCompleted.value = true;
  } catch (e) {
    console.error('检测失败:', e);
    alert('检测失败: ' + (e.response?.data?.error || e.message));
  } finally {
    checking.value = false;
  }
}

function toggleSelect(index) {
  const idx = selectedIds.value.indexOf(index);
  if (idx > -1) {
    selectedIds.value.splice(idx, 1);
  } else {
    selectedIds.value.push(index);
  }
}

function selectAll() {
  selectedIds.value = pendingBookmarks.value.map((_, i) => i);
}

function selectAllValid() {
  selectedIds.value = pendingBookmarks.value
    .map((b, i) => b.status === 'valid' || !b.status ? i : -1)
    .filter(i => i >= 0);
}

function clearSelection() {
  selectedIds.value = [];
}

async function doImport() {
  if (selectedIds.value.length === 0) return;
  importing.value = true;

  try {
    // 按分类分组
    const byCategory = {};
    selectedIds.value.forEach(idx => {
      const b = pendingBookmarks.value[idx];
      const menuId = b.targetMenuId || menus.value[0]?.id;
      if (!menuId) return;
      if (!byCategory[menuId]) byCategory[menuId] = [];
      byCategory[menuId].push({
        title: b.title,
        url: b.url,
        logo: `https://api.xinac.net/icon/?url=${new URL(b.url).origin}&sz=128`,
        description: ''
      });
    });

    let totalAdded = 0;
    for (const [menuId, cards] of Object.entries(byCategory)) {
      const res = await batchAddCards(parseInt(menuId), null, cards);
      totalAdded += res.data.added || 0;
    }

    alert(`成功导入 ${totalAdded} 个书签`);
    
    // 清除已导入的数据
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.remove(['pendingBookmarks', 'bookmarkImportTime']);
    }
    
    // 返回首页
    window.location.href = '/';
  } catch (e) {
    console.error('导入失败:', e);
    alert('导入失败: ' + (e.response?.data?.error || e.message));
  } finally {
    importing.value = false;
  }
}

function cancelImport() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.remove(['pendingBookmarks', 'bookmarkImportTime']);
  }
  window.location.href = '/';
}

onMounted(async () => {
  await loadMenus();
  
  // 从chrome.storage获取待导入书签
  if (typeof chrome !== 'undefined' && chrome.storage) {
    try {
      const result = await chrome.storage.local.get(['pendingBookmarks', 'bookmarkImportTime']);
      if (result.pendingBookmarks && result.pendingBookmarks.length > 0) {
        const isExpired = Date.now() - (result.bookmarkImportTime || 0) > 10 * 60 * 1000;
        if (!isExpired) {
          pendingBookmarks.value = result.pendingBookmarks.map(b => ({
            ...b,
            status: '',
            targetMenuId: suggestCategory(b.url)
          }));
        }
      }
    } catch (e) {
      console.error('获取待导入书签失败:', e);
    }
  }
});
</script>


<style scoped>
.bookmark-manager {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-btn {
  color: #667eea;
  text-decoration: none;
  font-weight: 500;
}

h1, h2 {
  margin: 0;
  color: #333;
}

h1 { font-size: 20px; }
h2 { font-size: 16px; }

.import-panel {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 20px;
}

.import-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-sm { padding: 4px 12px; font-size: 12px; }
.btn-primary { background: #667eea; color: white; }
.btn-secondary { background: #e5e7eb; color: #333; }
.btn-check { background: #10b981; color: white; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.check-summary {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.status-tag {
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  background: #f3f4f6;
}

.status-tag.valid { background: #d1fae5; color: #065f46; }
.status-tag.invalid { background: #fee2e2; color: #991b1b; }
.status-tag.timeout { background: #fef3c7; color: #92400e; }
.status-tag.duplicate { background: #e0e7ff; color: #3730a3; }

.batch-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 16px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.selected-count {
  margin-left: auto;
  color: #666;
  font-size: 13px;
}

.bookmark-list {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.bookmark-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid #eee;
}

.bookmark-item:last-child { border-bottom: none; }
.bookmark-item.selected { background: #eff6ff; }
.bookmark-item.invalid { background: #fef2f2; }
.bookmark-item.duplicate { background: #f5f3ff; opacity: 0.7; }

.status-icon { font-size: 16px; width: 24px; text-align: center; }

.bookmark-info { flex: 1; min-width: 0; }

.bookmark-title {
  font-weight: 500;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-url {
  font-size: 12px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-folder {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
}

.category-select {
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
  min-width: 100px;
}

.import-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #eee;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  color: #666;
}

.empty-state p { margin: 8px 0; }
.empty-state .hint { font-size: 14px; color: #999; }
.empty-state .btn { margin-top: 20px; text-decoration: none; display: inline-block; }
</style>
