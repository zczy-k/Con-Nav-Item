<template>
  <div class="bookmark-manager">
    <div class="header">
      <div class="header-left">
        <router-link to="/" class="back-btn">← 返回首页</router-link>
        <h1>📚 书签管理</h1>
        <span class="bookmark-total">共 {{ total }} 个书签</span>
      </div>
      <div class="header-right">
        <input v-model="searchQuery" type="text" placeholder="搜索书签..." class="search-input" @input="debouncedSearch" />
        <select v-model="selectedFolder" class="folder-select" @change="loadBookmarks">
          <option value="">全部文件夹</option>
          <option v-for="folder in folders" :key="folder" :value="folder">{{ folder }}</option>
        </select>
      </div>
    </div>

    <div class="toolbar" v-if="selectedIds.length > 0">
      <span>已选择 {{ selectedIds.length }} 项</span>
      <button @click="batchDelete" class="btn btn-danger">删除选中</button>
      <button @click="showConvertModal = true" class="btn btn-primary">转为卡片</button>
      <button @click="clearSelection" class="btn btn-secondary">取消选择</button>
    </div>

    <div class="bookmark-list" v-if="!loading">
      <div v-for="bookmark in bookmarks" :key="bookmark.id" class="bookmark-item" :class="{ selected: selectedIds.includes(bookmark.id) }">
        <input type="checkbox" :checked="selectedIds.includes(bookmark.id)" @change="toggleSelect(bookmark.id)" />
        <img :src="bookmark.logo_url || '/default-favicon.png'" class="favicon" @error="e => e.target.src = '/default-favicon.png'" />
        <div class="bookmark-info">
          <a :href="bookmark.url" target="_blank" class="bookmark-title">{{ bookmark.title }}</a>
          <span class="bookmark-folder" v-if="bookmark.folder">📁 {{ bookmark.folder }}</span>
          <span class="bookmark-url">{{ bookmark.url }}</span>
        </div>
        <div class="bookmark-actions">
          <button @click="editBookmark(bookmark)" class="btn-icon" title="编辑">✏️</button>
          <button @click="deleteOne(bookmark.id)" class="btn-icon" title="删除">🗑️</button>
        </div>
      </div>
      <div v-if="bookmarks.length === 0" class="empty-state">
        <p>暂无书签</p>
        <p class="hint">使用浏览器扩展导入书签</p>
      </div>
    </div>

    <div v-else class="loading">加载中...</div>

    <div class="pagination" v-if="totalPages > 1">
      <button @click="changePage(page - 1)" :disabled="page <= 1">上一页</button>
      <span>{{ page }} / {{ totalPages }}</span>
      <button @click="changePage(page + 1)" :disabled="page >= totalPages">下一页</button>
    </div>

    <!-- 转换为卡片弹窗 -->
    <div v-if="showConvertModal" class="modal-overlay" @click.self="showConvertModal = false">
      <div class="modal-content">
        <h3>转换为卡片</h3>
        <p>选择目标分类：</p>
        <select v-model="targetMenuId" class="folder-select">
          <option value="">请选择分类</option>
          <option v-for="menu in menus" :key="menu.id" :value="menu.id">{{ menu.name }}</option>
        </select>
        <select v-if="targetMenuId && getSubMenus(targetMenuId).length" v-model="targetSubMenuId" class="folder-select">
          <option value="">不选择子分类</option>
          <option v-for="sub in getSubMenus(targetMenuId)" :key="sub.id" :value="sub.id">{{ sub.name }}</option>
        </select>
        <div class="modal-actions">
          <button @click="showConvertModal = false" class="btn btn-secondary">取消</button>
          <button @click="convertToCard" class="btn btn-primary" :disabled="!targetMenuId">确认转换</button>
        </div>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
      <div class="modal-content">
        <h3>编辑书签</h3>
        <div class="form-group">
          <label>标题</label>
          <input v-model="editForm.title" type="text" />
        </div>
        <div class="form-group">
          <label>网址</label>
          <input v-model="editForm.url" type="url" />
        </div>
        <div class="form-group">
          <label>文件夹</label>
          <input v-model="editForm.folder" type="text" />
        </div>
        <div class="modal-actions">
          <button @click="showEditModal = false" class="btn btn-secondary">取消</button>
          <button @click="saveEdit" class="btn btn-primary">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { getBookmarks, getBookmarkFolders, deleteBookmark, batchDeleteBookmarks, bookmarkToCard, updateBookmark, getMenus } from '../api';

const bookmarks = ref([]);
const folders = ref([]);
const menus = ref([]);
const loading = ref(true);
const searchQuery = ref('');
const selectedFolder = ref('');
const page = ref(1);
const pageSize = 50;
const total = ref(0);
const selectedIds = ref([]);

const showConvertModal = ref(false);
const targetMenuId = ref('');
const targetSubMenuId = ref('');

const showEditModal = ref(false);
const editForm = ref({ id: null, title: '', url: '', folder: '' });

const totalPages = computed(() => Math.ceil(total.value / pageSize));

let searchTimeout = null;
const debouncedSearch = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    page.value = 1;
    loadBookmarks();
  }, 300);
};

async function loadBookmarks() {
  loading.value = true;
  try {
    const res = await getBookmarks({
      page: page.value,
      pageSize,
      folder: selectedFolder.value || undefined,
      search: searchQuery.value || undefined
    });
    bookmarks.value = res.data.data;
    total.value = res.data.total;
  } catch (e) {
    console.error('加载书签失败:', e);
  } finally {
    loading.value = false;
  }
}

async function loadFolders() {
  try {
    const res = await getBookmarkFolders();
    folders.value = res.data;
  } catch (e) {
    console.error('加载文件夹失败:', e);
  }
}

async function loadMenus() {
  try {
    const res = await getMenus();
    menus.value = res.data;
  } catch (e) {
    console.error('加载菜单失败:', e);
  }
}

function getSubMenus(menuId) {
  const menu = menus.value.find(m => m.id === menuId);
  return menu?.subMenus || [];
}

function toggleSelect(id) {
  const idx = selectedIds.value.indexOf(id);
  if (idx > -1) {
    selectedIds.value.splice(idx, 1);
  } else {
    selectedIds.value.push(id);
  }
}

function clearSelection() {
  selectedIds.value = [];
}

async function deleteOne(id) {
  if (!confirm('确定删除这个书签吗？')) return;
  try {
    await deleteBookmark(id);
    loadBookmarks();
  } catch (e) {
    alert('删除失败');
  }
}

async function batchDelete() {
  if (!confirm(`确定删除选中的 ${selectedIds.value.length} 个书签吗？`)) return;
  try {
    await batchDeleteBookmarks(selectedIds.value);
    selectedIds.value = [];
    loadBookmarks();
  } catch (e) {
    alert('删除失败');
  }
}

async function convertToCard() {
  if (!targetMenuId.value) return;
  try {
    for (const id of selectedIds.value) {
      await bookmarkToCard(id, targetMenuId.value, targetSubMenuId.value || null);
    }
    alert('转换成功');
    selectedIds.value = [];
    showConvertModal.value = false;
    loadBookmarks();
  } catch (e) {
    alert('转换失败');
  }
}

function editBookmark(bookmark) {
  editForm.value = { id: bookmark.id, title: bookmark.title, url: bookmark.url, folder: bookmark.folder || '' };
  showEditModal.value = true;
}

async function saveEdit() {
  try {
    await updateBookmark(editForm.value.id, editForm.value);
    showEditModal.value = false;
    loadBookmarks();
  } catch (e) {
    alert('保存失败');
  }
}

function changePage(newPage) {
  if (newPage < 1 || newPage > totalPages.value) return;
  page.value = newPage;
  loadBookmarks();
}

onMounted(async () => {
  loadBookmarks();
  loadFolders();
  loadMenus();
  
  // 检查是否有待导入的书签（从浏览器扩展传来）
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('import') === 'pending') {
    await handlePendingImport();
  }
});

// 处理从浏览器扩展传来的待导入书签
async function handlePendingImport() {
  try {
    // 尝试从chrome.storage获取待导入的书签
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.local.get(['pendingBookmarks', 'bookmarkImportTime']);
      
      if (result.pendingBookmarks && result.pendingBookmarks.length > 0) {
        // 检查数据是否过期（5分钟内有效）
        const isExpired = Date.now() - (result.bookmarkImportTime || 0) > 5 * 60 * 1000;
        
        if (!isExpired) {
          // 确认导入
          if (confirm(`检测到 ${result.pendingBookmarks.length} 个待导入的书签，是否立即导入？`)) {
            await importBookmarks(result.pendingBookmarks);
            // 清除已导入的数据
            await chrome.storage.local.remove(['pendingBookmarks', 'bookmarkImportTime']);
          }
        } else {
          // 清除过期数据
          await chrome.storage.local.remove(['pendingBookmarks', 'bookmarkImportTime']);
        }
      }
    }
  } catch (e) {
    console.error('处理待导入书签失败:', e);
  }
}
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
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
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

.back-btn:hover {
  text-decoration: underline;
}

h1 {
  font-size: 20px;
  color: #333;
  margin: 0;
}

.bookmark-total {
  color: #666;
  font-size: 14px;
}

.header-right {
  display: flex;
  gap: 12px;
}

.search-input, .folder-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.search-input {
  width: 200px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  margin-bottom: 16px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-secondary {
  background: #e5e7eb;
  color: #333;
}

.bookmark-list {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.bookmark-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid #eee;
  transition: background 0.2s;
}

.bookmark-item:hover {
  background: #f9fafb;
}

.bookmark-item.selected {
  background: #eff6ff;
}

.bookmark-item:last-child {
  border-bottom: none;
}

.favicon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
}

.bookmark-info {
  flex: 1;
  min-width: 0;
}

.bookmark-title {
  display: block;
  font-weight: 500;
  color: #333;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-title:hover {
  color: #667eea;
}

.bookmark-folder {
  display: inline-block;
  font-size: 12px;
  color: #666;
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 4px;
  margin-right: 8px;
}

.bookmark-url {
  display: block;
  font-size: 12px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-actions {
  display: flex;
  gap: 8px;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
  opacity: 0.6;
}

.btn-icon:hover {
  opacity: 1;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #666;
}

.empty-state .hint {
  font-size: 14px;
  color: #999;
}

.loading {
  text-align: center;
  padding: 40px;
  color: white;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
  color: white;
}

.pagination button {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 24px;
  border-radius: 12px;
  width: 400px;
  max-width: 90%;
}

.modal-content h3 {
  margin: 0 0 16px 0;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}
</style>
