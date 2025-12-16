<template>
  <div class="menu-manage">
    <!-- 全局加载遮罩 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span>{{ loadingText }}</span>
    </div>

    <div class="menu-header">
      <h2 class="page-title">栏目管理</h2>
      <div class="menu-add">
        <input v-model="newMenuName" placeholder="输入主菜单名称" class="input" @keyup.enter="addMenu" />
        <button class="btn btn-primary" @click="addMenu" :disabled="loading || !newMenuName.trim()">
          + 添加主菜单
        </button>
      </div>
    </div>

    <div class="menu-content">
      <div v-if="menus.length === 0" class="empty-state">
        <p>暂无菜单，请添加第一个主菜单</p>
      </div>
      
      <div v-for="menu in menus" :key="menu.id" class="menu-card">
        <div class="menu-card-header">
          <div class="menu-title">
            <span class="menu-name">{{ menu.name }}</span>
            <span class="menu-order">排序: {{ menu.order }}</span>
          </div>
          <div class="menu-actions">
            <button class="btn-icon btn-edit" @click="openEditMenu(menu)" title="编辑">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn-icon btn-add" @click="openAddSubMenu(menu)" title="添加子菜单">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
            <button class="btn-icon btn-delete" @click="confirmDeleteMenu(menu)" title="删除">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
              </svg>
            </button>
          </div>
        </div>
        
        <div v-if="menu.subMenus && menu.subMenus.length > 0" class="sub-menu-list">
          <div v-for="sub in menu.subMenus" :key="sub.id" class="sub-menu-item">
            <span class="sub-menu-name">{{ sub.name }}</span>
            <span class="sub-menu-order">排序: {{ sub.order }}</span>
            <div class="sub-menu-actions">
              <button class="btn-icon-sm btn-edit" @click="openEditSubMenu(menu, sub)" title="编辑">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="btn-icon-sm btn-delete" @click="confirmDeleteSubMenu(sub)" title="删除">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div v-else class="no-sub-menu">
          <span>暂无子菜单</span>
        </div>
      </div>
    </div>

    <!-- 编辑主菜单弹窗 -->
    <div v-if="showEditModal" class="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>{{ editingMenu ? '编辑主菜单' : '添加子菜单' }}</h3>
          <button class="modal-close" @click="closeModal">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>名称</label>
            <input v-model="editForm.name" type="text" class="input" placeholder="请输入名称" />
          </div>
          <div class="form-group">
            <label>排序</label>
            <input v-model.number="editForm.order" type="number" class="input" placeholder="数字越小越靠前" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-cancel" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="saveEdit" :disabled="!editForm.name.trim()">保存</button>
        </div>
      </div>
    </div>

    <!-- 添加子菜单弹窗 -->
    <div v-if="showAddSubModal" class="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>添加子菜单到「{{ parentMenuName }}」</h3>
          <button class="modal-close" @click="closeModal">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>子菜单名称</label>
            <input v-model="subMenuForm.name" type="text" class="input" placeholder="请输入子菜单名称" />
          </div>
          <div class="form-group">
            <label>排序</label>
            <input v-model.number="subMenuForm.order" type="number" class="input" placeholder="数字越小越靠前" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-cancel" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="saveSubMenu" :disabled="!subMenuForm.name.trim()">添加</button>
        </div>
      </div>
    </div>

    <!-- 编辑子菜单弹窗 -->
    <div v-if="showEditSubModal" class="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <h3>编辑子菜单</h3>
          <button class="modal-close" @click="closeModal">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>子菜单名称</label>
            <input v-model="editSubForm.name" type="text" class="input" placeholder="请输入子菜单名称" />
          </div>
          <div class="form-group">
            <label>排序</label>
            <input v-model.number="editSubForm.order" type="number" class="input" placeholder="数字越小越靠前" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-cancel" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="saveSubMenuEdit" :disabled="!editSubForm.name.trim()">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import {
  getMenus,
  addMenu as apiAddMenu,
  updateMenu as apiUpdateMenu,
  deleteMenu as apiDeleteMenu,
  addSubMenu as apiAddSubMenu,
  updateSubMenu as apiUpdateSubMenu,
  deleteSubMenu as apiDeleteSubMenu
} from '../../api';

const menus = ref([]);
const loading = ref(false);
const loadingText = ref('加载中...');
const newMenuName = ref('');

// 编辑主菜单
const showEditModal = ref(false);
const editingMenu = ref(null);
const editForm = ref({ name: '', order: 0 });

// 添加子菜单
const showAddSubModal = ref(false);
const parentMenuId = ref(null);
const parentMenuName = ref('');
const subMenuForm = ref({ name: '', order: 0 });

// 编辑子菜单
const showEditSubModal = ref(false);
const editingSubMenu = ref(null);
const editSubForm = ref({ name: '', order: 0 });

onMounted(() => {
  loadMenus();
});

// 通知浏览器扩展刷新右键菜单
function notifyExtensionMenusUpdated() {
  try {
    window.dispatchEvent(new CustomEvent('nav-menus-updated'));
    console.log('[栏目管理] 已通知扩展刷新右键菜单');
  } catch (e) {
    console.warn('[栏目管理] 通知扩展失败:', e);
  }
}

async function loadMenus(isUpdate = false) {
  loading.value = true;
  loadingText.value = '加载中...';
  try {
    const res = await getMenus(true); // 强制刷新
    menus.value = res.data || [];
    // 如果是更新操作，通知扩展刷新右键菜单
    if (isUpdate) {
      notifyExtensionMenusUpdated();
    }
  } catch (e) {
    alert('加载失败: ' + (e.response?.data?.error || e.message));
  } finally {
    loading.value = false;
  }
}

// 添加主菜单
async function addMenu() {
  if (!newMenuName.value.trim()) return;
  loading.value = true;
  loadingText.value = '添加中...';
  try {
    const maxOrder = menus.value.length ? Math.max(...menus.value.map(m => m.order || 0)) : 0;
    await apiAddMenu({ name: newMenuName.value.trim(), order: maxOrder + 1 });
    newMenuName.value = '';
    await loadMenus(true); // 通知扩展刷新
  } catch (e) {
    alert('添加失败: ' + (e.response?.data?.error || e.message));
    loading.value = false;
  }
}

// 打开编辑主菜单弹窗
function openEditMenu(menu) {
  editingMenu.value = menu;
  editForm.value = { name: menu.name, order: menu.order };
  showEditModal.value = true;
}

// 保存主菜单编辑
async function saveEdit() {
  if (!editForm.value.name.trim() || !editingMenu.value) return;
  const menuId = editingMenu.value.id; // 先保存id
  const name = editForm.value.name.trim();
  const order = editForm.value.order;
  closeModal();
  loading.value = true;
  loadingText.value = '保存中...';
  try {
    await apiUpdateMenu(menuId, { name, order });
    await loadMenus(true); // 通知扩展刷新
  } catch (e) {
    alert('保存失败: ' + (e.response?.data?.error || e.message));
    loading.value = false;
  }
}

// 删除主菜单
async function confirmDeleteMenu(menu) {
  if (!confirm(`确定删除主菜单「${menu.name}」吗？\n将同时删除其下所有子菜单和卡片！`)) return;
  loading.value = true;
  loadingText.value = '删除中...';
  try {
    await apiDeleteMenu(menu.id);
    await loadMenus(true); // 通知扩展刷新
  } catch (e) {
    alert('删除失败: ' + (e.response?.data?.error || e.message));
    loading.value = false;
  }
}

// 打开添加子菜单弹窗
function openAddSubMenu(menu) {
  parentMenuId.value = menu.id;
  parentMenuName.value = menu.name;
  const subs = menu.subMenus || [];
  const maxOrder = subs.length ? Math.max(...subs.map(s => s.order || 0)) : 0;
  subMenuForm.value = { name: '', order: maxOrder + 1 };
  showAddSubModal.value = true;
}

// 保存新子菜单
async function saveSubMenu() {
  if (!subMenuForm.value.name.trim() || !parentMenuId.value) return;
  const menuId = parentMenuId.value; // 先保存id
  const name = subMenuForm.value.name.trim();
  const order = subMenuForm.value.order;
  closeModal();
  loading.value = true;
  loadingText.value = '添加中...';
  try {
    await apiAddSubMenu(menuId, { name, order });
    await loadMenus(true); // 通知扩展刷新
  } catch (e) {
    alert('添加失败: ' + (e.response?.data?.error || e.message));
    loading.value = false;
  }
}

// 打开编辑子菜单弹窗
function openEditSubMenu(menu, sub) {
  editingSubMenu.value = sub;
  editSubForm.value = { name: sub.name, order: sub.order };
  showEditSubModal.value = true;
}

// 保存子菜单编辑
async function saveSubMenuEdit() {
  if (!editSubForm.value.name.trim() || !editingSubMenu.value) return;
  const subMenuId = editingSubMenu.value.id; // 先保存id
  const name = editSubForm.value.name.trim();
  const order = editSubForm.value.order;
  closeModal();
  loading.value = true;
  loadingText.value = '保存中...';
  try {
    await apiUpdateSubMenu(subMenuId, { name, order });
    await loadMenus(true); // 通知扩展刷新
  } catch (e) {
    alert('保存失败: ' + (e.response?.data?.error || e.message));
    loading.value = false;
  }
}

// 删除子菜单
async function confirmDeleteSubMenu(sub) {
  if (!confirm(`确定删除子菜单「${sub.name}」吗？\n将同时删除其下所有卡片！`)) return;
  loading.value = true;
  loadingText.value = '删除中...';
  try {
    await apiDeleteSubMenu(sub.id);
    await loadMenus(true); // 通知扩展刷新
  } catch (e) {
    alert('删除失败: ' + (e.response?.data?.error || e.message));
    loading.value = false;
  }
}

function closeModal() {
  showEditModal.value = false;
  showAddSubModal.value = false;
  showEditSubModal.value = false;
  editingMenu.value = null;
  editingSubMenu.value = null;
}
</script>


<style scoped>
.menu-manage {
  max-width: 900px;
  width: 95%;
  margin: 0 auto;
  position: relative;
}

/* 加载遮罩 */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  gap: 16px;
  font-size: 16px;
  color: #1890ff;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e0e0e0;
  border-top-color: #1890ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 头部 */
.menu-header {
  background: linear-gradient(135deg, #1890ff 0%, #69c0ff 100%);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 20px;
  color: white;
}

.page-title {
  font-size: 1.4rem;
  font-weight: 600;
  margin: 0 0 16px 0;
  text-align: center;
}

.menu-add {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.menu-add .input {
  flex: 1;
  max-width: 300px;
}

/* 内容区 */
.menu-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
  background: white;
  border-radius: 12px;
}

/* 菜单卡片 */
.menu-card {
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.menu-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #eee;
}

.menu-title {
  display: flex;
  align-items: center;
  gap: 16px;
}

.menu-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
}

.menu-order {
  font-size: 0.85rem;
  color: #888;
  background: #e8e8e8;
  padding: 2px 8px;
  border-radius: 4px;
}

.menu-actions {
  display: flex;
  gap: 8px;
}

/* 子菜单列表 */
.sub-menu-list {
  padding: 12px 20px;
}

.sub-menu-item {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  margin-bottom: 8px;
  background: #f8fafc;
  border-radius: 8px;
  border-left: 3px solid #10b981;
}

.sub-menu-item:last-child {
  margin-bottom: 0;
}

.sub-menu-name {
  flex: 1;
  font-size: 0.95rem;
  color: #444;
}

.sub-menu-order {
  font-size: 0.8rem;
  color: #888;
  margin-right: 12px;
}

.sub-menu-actions {
  display: flex;
  gap: 6px;
}

.no-sub-menu {
  padding: 20px;
  text-align: center;
  color: #aaa;
  font-size: 0.9rem;
}

/* 按钮样式 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #1890ff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #1478d4;
}

.btn-cancel {
  background: #f0f0f0;
  color: #666;
}

.btn-cancel:hover {
  background: #e0e0e0;
}

.btn-icon {
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-icon-sm {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-edit {
  background: #e6f7ff;
  color: #1890ff;
}

.btn-edit:hover {
  background: #1890ff;
  color: white;
}

.btn-add {
  background: #f6ffed;
  color: #52c41a;
}

.btn-add:hover {
  background: #52c41a;
  color: white;
}

.btn-delete {
  background: #fff1f0;
  color: #ff4d4f;
}

.btn-delete:hover {
  background: #ff4d4f;
  color: white;
}

.input {
  padding: 10px 14px;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  font-size: 0.95rem;
  transition: all 0.2s;
  color: #333;
  background: white;
}

.input:focus {
  outline: none;
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

/* 弹窗 */
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
  z-index: 1001;
}

.modal {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #333;
}

.modal-close {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  font-size: 24px;
  color: #999;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.modal-close:hover {
  background: #f0f0f0;
  color: #333;
}

.modal-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.9rem;
  color: #666;
}

.form-group .input {
  width: 100%;
  box-sizing: border-box;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #eee;
}

/* 响应式 */
@media (max-width: 600px) {
  .menu-add {
    flex-direction: column;
  }
  
  .menu-add .input {
    max-width: none;
  }
  
  .menu-card-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }
  
  .sub-menu-item {
    flex-wrap: wrap;
    gap: 8px;
  }
  
  .sub-menu-name {
    width: 100%;
  }
}
</style>
