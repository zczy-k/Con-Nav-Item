<template>
  <div class="menu-manage">
    <!-- 保存状态提示 -->
    <transition name="toast">
      <div v-if="saveStatus.show" class="save-toast" :class="saveStatus.type">
        <svg v-if="saveStatus.type === 'saving'" class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        <svg v-else-if="saveStatus.type === 'success'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
        </svg>
        <span>{{ saveStatus.message }}</span>
      </div>
    </transition>
    
    <div class="menu-header">
      <div class="header-content">
        <h2 class="page-title">管理主菜单和子菜单</h2>
      </div>
      <div class="menu-add">
        <input v-model="newMenuName" placeholder="请输入主菜单名称" class="input" />
        <button class="btn btn-primary" @click="addMenu">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          添加主菜单
        </button>
      </div>
    </div>
    
    <div class="menu-content">
      <div class="menu-list">
        <div v-for="menu in menus" :key="menu.id" class="menu-item">
          <!-- 主菜单 -->
          <div class="main-menu">
            <div class="menu-info">
              <div class="menu-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 3h18v18H3zM9 9h6v6H9z"/>
                </svg>
              </div>
              <input v-model="menu.name" @blur="updateMenu(menu)" class="menu-name-input" />
              <div class="menu-order">
                <span class="order-label">排序</span>
                <input v-model.number="menu.order" type="number" @blur="updateMenu(menu)" class="order-input" />
              </div>
            </div>
            <div class="menu-actions">
              <button class="btn btn-icon expand-btn" @click="toggleSubMenu(menu.id)" :title="menu.showSubMenu ? '收起子菜单' : '展开子菜单'">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="m6 9 6 6 6-6"/>
                </svg>
              </button>
              <button class="btn btn-danger btn-icon" @click="deleteMenu(menu.id)" title="删除主菜单">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                  <path d="M10 11v6M14 11v6"/>
                </svg>
              </button>
            </div>
          </div>
          
          <!-- 子菜单区域 -->
          <div class="sub-menu-section" :class="{ 'expanded': menu.showSubMenu }">
            <div class="sub-menu-header">
              <div class="sub-menu-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 11H1l8-8 8 8h-8v8z"/>
                </svg>
                子菜单 ({{ menu.subMenus?.length || 0 }})
              </div>
              <button class="btn btn-sm btn-outline" @click="addSubMenu(menu.id)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                添加子菜单
              </button>
            </div>
            
            <div class="sub-menu-list" v-if="menu.subMenus && menu.subMenus.length > 0">
              <div v-for="subMenu in menu.subMenus" :key="subMenu.id" class="sub-menu-item">
                <div class="sub-menu-info">
                  <div class="sub-menu-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M4 6h16M4 12h16M4 18h16"/>
                    </svg>
                  </div>
                  <input v-model="subMenu.name" @blur="updateSubMenu(subMenu)" class="sub-menu-name-input" />
                  <div class="sub-menu-order">
                    <input v-model.number="subMenu.order" type="number" @blur="updateSubMenu(subMenu)" class="order-input" />
                  </div>
                </div>
                <div class="sub-menu-actions">
                  <button class="btn btn-danger btn-icon btn-sm" @click="deleteSubMenu(subMenu.id)" title="删除子菜单">
                    <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                      <path d="M10 11v6M14 11v6"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            
            <div v-else class="empty-sub-menu">
              <!-- <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
              <path d="M9 11H1l8-8 8 8h-8v8z"/>
              </svg> -->
              <p>暂无子菜单</p>
              <button class="btn btn-sm btn-outline" @click="addSubMenu(menu.id)">添加第一个子菜单</button>
            </div>
          </div>
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
const newMenuName = ref('');

// 保存状态提示
const saveStatus = ref({
  show: false,
  type: 'saving', // saving, success, error
  message: ''
});
let saveStatusTimer = null;

function showSaveStatus(type, message, duration = 2000) {
  if (saveStatusTimer) clearTimeout(saveStatusTimer);
  saveStatus.value = { show: true, type, message };
  if (type !== 'saving') {
    saveStatusTimer = setTimeout(() => {
      saveStatus.value.show = false;
    }, duration);
  }
}

onMounted(loadMenus);

async function loadMenus(forceRefresh = false) {
  // 保存当前展开状态
  const expandedMenuIds = menus.value.filter(m => m.showSubMenu).map(m => m.id);
  
  const res = await getMenus(forceRefresh);
  menus.value = res.data.map(menu => ({
    ...menu,
    subMenus: menu.subMenus || [], // 确保subMenus始终是数组
    showSubMenu: expandedMenuIds.includes(menu.id) // 恢复展开状态
  }));
}

async function addMenu() {
  if (!newMenuName.value.trim()) return;
  showSaveStatus('saving', '添加中...');
  try {
    const maxOrder = menus.value.length
      ? Math.max(...menus.value.map(m => m.order || 0))
      : 0;
    await apiAddMenu({ name: newMenuName.value.trim(), order: maxOrder + 1 });
    newMenuName.value = '';
    await loadMenus(true); // 强制刷新
    showSaveStatus('success', '添加成功');
  } catch (error) {
    showSaveStatus('error', '添加失败：' + (error.response?.data?.error || error.message), 3000);
  }
}

async function updateMenu(menu) {
  showSaveStatus('saving', '保存中...');
  try {
    await apiUpdateMenu(menu.id, { name: menu.name, order: menu.order });
    // 强制从后端获取最新数据
    await loadMenus(true);
    showSaveStatus('success', '已保存');
  } catch (error) {
    console.error('更新菜单失败:', error);
    showSaveStatus('error', '保存失败：' + (error.response?.data?.error || error.message), 3000);
    // 失败时强制刷新恢复原始数据
    await loadMenus(true);
  }
}

async function deleteMenu(id) {
  if (!confirm('确定要删除这个主菜单吗？删除后将同时删除其下的所有子菜单和卡片。')) return;
  
  showSaveStatus('saving', '删除中...');
  try {
    await apiDeleteMenu(id);
    // 强制从后端获取最新数据
    await loadMenus(true);
    showSaveStatus('success', '删除成功');
  } catch (error) {
    console.error('删除菜单失败:', error);
    showSaveStatus('error', '删除失败：' + (error.response?.data?.error || error.message), 3000);
    // 失败时强制刷新
    await loadMenus(true);
  }
}

async function addSubMenu(menuId) {
  const menu = menus.value.find(m => m.id === menuId);
  const subMenuName = prompt('请输入子菜单名称：');
  if (!subMenuName?.trim()) return;
  
  showSaveStatus('saving', '添加中...');
  try {
    const subMenus = menu?.subMenus || [];
    const maxOrder = subMenus.length
      ? Math.max(...subMenus.map(sm => sm.order || 0))
      : 0;
      
    await apiAddSubMenu(menuId, { name: subMenuName.trim(), order: maxOrder + 1 });
    // 强制从后端获取最新数据
    await loadMenus(true);
    showSaveStatus('success', '添加成功');
  } catch (error) {
    showSaveStatus('error', '添加失败：' + (error.response?.data?.error || error.message), 3000);
  }
}

async function updateSubMenu(subMenu) {
  showSaveStatus('saving', '保存中...');
  try {
    await apiUpdateSubMenu(subMenu.id, { name: subMenu.name, order: subMenu.order });
    // 强制从后端获取最新数据
    await loadMenus(true);
    showSaveStatus('success', '已保存');
  } catch (error) {
    console.error('更新子菜单失败:', error);
    showSaveStatus('error', '保存失败：' + (error.response?.data?.error || error.message), 3000);
    // 失败时强制刷新恢复原始数据
    await loadMenus(true);
  }
}

async function deleteSubMenu(id) {
  if (!confirm('确定要删除这个子菜单吗？删除后将同时删除其下的所有卡片。')) return;
  
  showSaveStatus('saving', '删除中...');
  try {
    await apiDeleteSubMenu(id);
    // 强制从后端获取最新数据
    await loadMenus(true);
    showSaveStatus('success', '删除成功');
  } catch (error) {
    console.error('删除子菜单失败:', error);
    showSaveStatus('error', '删除失败：' + (error.response?.data?.error || error.message), 3000);
  }
}

function toggleSubMenu(menuId) {
  const menu = menus.value.find(m => m.id === menuId);
  if (menu) {
    menu.showSubMenu = !menu.showSubMenu;
  }
}
</script>

<style scoped>
/* 保存状态提示样式 */
.save-toast {
  position: fixed;
  top: 80px;
  right: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
}

.save-toast.saving {
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #7dd3fc;
}

.save-toast.success {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
}

.save-toast.error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

.save-toast .spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.menu-manage {
  max-width: 1200px;
  width: 95%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}



.menu-header {
  background: linear-gradient(135deg, #1890ff 0%, #69c0ff 100%);
  border-radius: 16px;
  padding: 32px;
  margin-bottom: 20px;
  color: white;
  box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
  width: 94%;
  text-align: center;
}

.header-content {
  margin-bottom: 15px;
  text-align: center;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 8px 0;
  letter-spacing: -0.5px;
}



.menu-add {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
}

.menu-content {
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  width: 100%;
}

.menu-list {
  padding: 0;
}

.menu-item {
  border-bottom: 1px solid #f1f5f9;
  transition: all 0.3s ease;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item:hover {
  background: #f8fafc;
}

.main-menu {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 32px;
  background: white;
  transition: all 0.3s ease;
}

.menu-info {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.menu-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #1890ff 0%, #69c0ff 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.menu-name-input {
  font-size: 1.1rem;
  font-weight: 600;
  border: 2px solid transparent;
  background: transparent;
  padding: 8px 12px;
  border-radius: 8px;
  color: #1e293b;
  min-width: 200px;
  transition: all 0.2s ease;
}

.menu-name-input:focus {
  outline: none;
  border-color: #1890ff;
  background: #f8fafc;
}

.menu-order {
  display: flex;
  align-items: center;
  gap: 8px;
}

.order-label {
  font-size: 0.9rem;
  color: #64748b;
  font-weight: 500;
}

.order-input {
  width: 60px;
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  text-align: center;
  font-size: 0.9rem;
}

.order-input:focus {
  outline: none;
  border-color: #1890ff;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.menu-actions {
  display: flex;
  gap: 8px;
}

.sub-menu-section {
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
  max-height: 0;
  overflow: hidden;
  transition: all 0.3s ease;
}

.sub-menu-section.expanded {
  max-height: 1000px;
}

.sub-menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 32px;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}

.sub-menu-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #475569;
  font-size: 0.95rem;
}

.sub-menu-list {
  padding: 16px 32px 16px 48px;
  position: relative;
}

.sub-menu-list::before {
  content: '';
  position: absolute;
  left: 32px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(to bottom, #e2e8f0, #cbd5e1);
  border-radius: 1px;
}

.sub-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  background: white;
  border-radius: 12px;
  margin-bottom: 5px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  border: 1px solid #e2e8f0;
  transition: all 0.2s ease;
  position: relative;
}

.sub-menu-item::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 50%;
  width: 12px;
  height: 2px;
  background: #cbd5e1;
  transform: translateY(-50%);
  border-radius: 1px;
}

.sub-menu-item:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.sub-menu-item:last-child {
  margin-bottom: 0;
}

.sub-menu-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.sub-menu-icon {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.sub-menu-name-input {
  font-size: 1rem;
  border: 2px solid transparent;
  background: transparent;
  padding: 6px 10px;
  border-radius: 6px;
  color: #374151;
  min-width: 150px;
  transition: all 0.2s ease;
}

.sub-menu-name-input:focus {
  outline: none;
  border-color: #10b981;
  background: #f0fdf4;
}

.sub-menu-order {
  display: flex;
  align-items: center;
}

.sub-menu-actions {
  display: flex;
  gap: 6px;
}

.empty-sub-menu {
  padding: 10px 0px 10px 0px;
  text-align: center;
  color: #64748b;
}

.empty-sub-menu p {
  color: #079f1e;
  margin: 0 0 16px 0;
  font-size: 1rem;
}

/* 按钮样式 */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
}

.btn-primary {
  background: linear-gradient(82deg, #1890ff, #2f025d);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-outline {
  background: transparent;
  color: #1890ff;
  border: 2px solid #1890ff;
}

.btn-outline:hover {
  background: #1890ff;
  color: white;
}

.btn-danger {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
}

.btn-danger:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
}

.btn-icon {
  width: 36px;
  height: 36px;
  padding: 0;
  justify-content: center;
  border-radius: 8px;
}

/* 展开子菜单按钮样式 */
.btn-icon.expand-btn {
  width: 200px;
  height: 36px;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 0.8rem;
}

.btn-icon.btn-sm {
  width: 35px;
  height: 30px;
}

.input {
  padding: 12px 16px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
  background: white;
  color: #1e293b;
  transition: all 0.2s ease;
  min-width: 200px;
}

.input:focus {
  outline: none;
  border-color: #1890ff;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.input::placeholder {
  color: #94a3b8;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .menu-manage {
    width: 93%;
    padding: 16px;
  }
  
  .menu-header {
    padding: 24px 20px;
  }
  
  .page-title {
    font-size: 1.5rem;
  }
  
  .menu-add {
    flex-direction: column;
    align-items: stretch;
  }
  
  .input {
    min-width: 0;
  }
  
  .main-menu {
    padding: 20px;
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }
  
  .menu-info {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .menu-name-input {
    min-width: 0;
  }
  
  .menu-order {
    justify-content: center;
  }
  
  .menu-actions {
    justify-content: center;
  }
  
  .btn-icon.expand-btn {
    width: 40px;
    height: 32px;
  }
  
  .sub-menu-header {
    padding: 16px 20px;
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  
  .sub-menu-list {
    padding: 12px 20px 12px 32px;
  }
  
  .sub-menu-list::before {
    left: 20px;
  }
  
  .sub-menu-item::before {
    left: -12px;
    width: 8px;
  }
  
  .sub-menu-item {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  
  .sub-menu-info {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  
  .sub-menu-name-input {
    min-width: 0;
  }
  
  .sub-menu-order {
    justify-content: center;
  }
  
  .sub-menu-actions {
    justify-content: center;
  }
  
  .empty-sub-menu {
    padding: 10px 0px 10px 0px;
  }
}
</style> 
