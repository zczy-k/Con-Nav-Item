<template>
  <div class="bookmarks-container">
    <div class="bookmarks-header">
      <div class="header-left">
        <button @click="$router.push('/')" class="back-btn" title="返回首页">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h2>书签管理</h2>
      </div>
      <div class="header-right">
        <div class="search-box">
          <input 
            v-model="searchQuery" 
            type="text" 
            placeholder="搜索书签..." 
            @keyup.enter="handleSearch"
          />
          <button @click="handleSearch">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div class="bookmarks-content">
      <div v-if="loading && bookmarks.length === 0" class="loading-state">
        <div class="spinner"></div>
        <p>加载中...</p>
      </div>

      <div v-else-if="bookmarks.length === 0" class="empty-state">
        <div class="empty-icon">🔖</div>
        <h3>暂无书签</h3>
        <p>请使用浏览器扩展同步您的书签</p>
      </div>

      <div v-else class="bookmarks-list">
        <div v-for="bookmark in bookmarks" :key="bookmark.id" class="bookmark-item">
          <div class="bookmark-icon">
            <img 
              :src="bookmark.icon || '/default-favicon.png'" 
              @error="e => e.target.src = '/default-favicon.png'"
              alt="icon"
            />
          </div>
          <div class="bookmark-info">
            <a :href="bookmark.url" target="_blank" class="bookmark-title">{{ bookmark.title }}</a>
            <div class="bookmark-url">{{ bookmark.url }}</div>
          </div>
          <div class="bookmark-actions">
            <button @click="editBookmark(bookmark)" class="action-btn edit" title="编辑">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button @click="confirmDelete(bookmark)" class="action-btn delete" title="删除">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 分页控件 -->
      <div v-if="total > pageSize" class="pagination">
        <button 
          :disabled="currentPage === 1" 
          @click="changePage(currentPage - 1)"
          class="page-btn"
        >
          上一页
        </button>
        <span class="page-info">{{ currentPage }} / {{ Math.ceil(total / pageSize) }}</span>
        <button 
          :disabled="currentPage * pageSize >= total" 
          @click="changePage(currentPage + 1)"
          class="page-btn"
        >
          下一页
        </button>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <div v-if="showEditModal" class="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h3>编辑书签</h3>
          <button @click="closeEditModal" class="close-btn">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>标题</label>
            <input v-model="editForm.title" type="text" class="form-input" />
          </div>
          <div class="form-group">
            <label>网址</label>
            <input v-model="editForm.url" type="text" class="form-input" />
          </div>
          <div class="form-group">
            <label>图标链接</label>
            <input v-model="editForm.icon" type="text" class="form-input" />
          </div>
          <div class="modal-actions">
            <button @click="closeEditModal" class="btn btn-cancel">取消</button>
            <button @click="saveEdit" class="btn btn-primary" :disabled="saving">
              {{ saving ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getBookmarks, deleteBookmark, updateBookmark } from '../api';

const bookmarks = ref([]);
const loading = ref(false);
const searchQuery = ref('');
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);

// 编辑相关
const showEditModal = ref(false);
const editForm = ref({ id: null, title: '', url: '', icon: '' });
const saving = ref(false);

async function loadBookmarks() {
  loading.value = true;
  try {
    const res = await getBookmarks({
      page: currentPage.value,
      pageSize: pageSize.value,
      q: searchQuery.value
    });
    bookmarks.value = res.data.data;
    total.value = res.data.total;
  } catch (err) {
    console.error('加载书签失败:', err);
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  currentPage.value = 1;
  loadBookmarks();
}

function changePage(page) {
  currentPage.value = page;
  loadBookmarks();
}

function editBookmark(bookmark) {
  editForm.value = { ...bookmark };
  showEditModal.value = true;
}

function closeEditModal() {
  showEditModal.value = false;
  editForm.value = { id: null, title: '', url: '', icon: '' };
}

async function saveEdit() {
  if (!editForm.value.title || !editForm.value.url) return;
  
  saving.value = true;
  try {
    await updateBookmark(editForm.value.id, {
      title: editForm.value.title,
      url: editForm.value.url,
      icon: editForm.value.icon
    });
    closeEditModal();
    loadBookmarks();
  } catch (err) {
    alert('保存失败: ' + err.message);
  } finally {
    saving.value = false;
  }
}

async function confirmDelete(bookmark) {
  if (confirm(`确定要删除书签 "${bookmark.title}" 吗？`)) {
    try {
      await deleteBookmark(bookmark.id);
      loadBookmarks();
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  }
}

onMounted(() => {
  loadBookmarks();
});
</script>

<style scoped>
.bookmarks-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  min-height: 100vh;
  background-color: var(--bg-color, #f5f7fa);
}

.bookmarks-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  background: white;
  padding: 15px 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 15px;
}

.back-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.back-btn:hover {
  background: rgba(0,0,0,0.05);
}

.search-box {
  display: flex;
  align-items: center;
  background: #f0f2f5;
  border-radius: 20px;
  padding: 5px 15px;
  width: 300px;
}

.search-box input {
  border: none;
  background: none;
  flex: 1;
  padding: 8px;
  outline: none;
}

.search-box button {
  background: none;
  border: none;
  cursor: pointer;
  color: #666;
}

.bookmarks-list {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  overflow: hidden;
}

.bookmark-item {
  display: flex;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid #eee;
  transition: background 0.2s;
}

.bookmark-item:hover {
  background: #f9fafb;
}

.bookmark-icon {
  width: 32px;
  height: 32px;
  margin-right: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bookmark-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
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
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bookmark-title:hover {
  color: #2566d8;
}

.bookmark-url {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bookmark-actions {
  display: flex;
  gap: 10px;
  opacity: 0;
  transition: opacity 0.2s;
}

.bookmark-item:hover .bookmark-actions {
  opacity: 1;
}

.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  color: #666;
  transition: all 0.2s;
}

.action-btn:hover {
  background: rgba(0,0,0,0.05);
}

.action-btn.delete:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 20px;
  gap: 15px;
}

.page-btn {
  padding: 8px 16px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-state {
  text-align: center;
  padding: 60px 0;
  color: #666;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 20px;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  padding: 20px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #999;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
}

.form-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  outline: none;
}

.form-input:focus {
  border-color: #2566d8;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.btn {
  padding: 8px 20px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-weight: 500;
}

.btn-cancel {
  background: #f0f2f5;
  color: #666;
}

.btn-primary {
  background: #2566d8;
  color: white;
}

.btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .search-box {
    width: 200px;
  }
  
  .bookmark-actions {
    opacity: 1;
  }
}
</style>
