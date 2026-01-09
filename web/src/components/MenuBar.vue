<template>
  <nav ref="menuBarRef" class="menu-bar" :class="{ 'edit-mode': editMode }">
    <div 
      v-for="menu in menus" 
      :key="menu.id" 
      class="menu-item"
      :data-menu-id="menu.id"
      @mouseenter="showSubMenu(menu.id)"
      @mouseleave="scheduleHideSubMenu(menu.id)"
    >
      <button 
        @click="handleMenuClick(menu)" 
        :class="{active: menu.id === activeId, 'drag-handle': editMode}"
      >
        {{ menu.name }}
      </button>
      
      <!-- 编辑模式下的下拉面板（包含操作按钮和子菜单） -->
      <div 
        v-if="editMode" 
        class="menu-dropdown"
        :class="{ 'show': hoveredMenuId === menu.id }"
        @mouseenter="cancelHideSubMenu(menu.id)"
        @mouseleave="scheduleHideSubMenu(menu.id)"
      >
        <!-- 主菜单操作按钮 -->
        <div class="menu-actions-row">
          <span class="menu-actions-label">菜单操作</span>
          <div class="menu-actions">
            <button class="action-btn edit-btn" @click.stop="$emit('editMenu', menu)" title="编辑">✏️</button>
            <button class="action-btn del-btn" @click.stop="$emit('deleteMenu', menu)" title="删除">🗑️</button>
          </div>
        </div>
        
        <!-- 子菜单列表 -->
        <div v-if="menu.subMenus && menu.subMenus.length > 0" class="sub-menu-list">
          <div 
            v-for="(subMenu, index) in menu.subMenus" 
            :key="subMenu.id" 
            class="sub-menu-row"
            :data-submenu-id="subMenu.id"
          >
            <button 
              @click="$emit('select', subMenu, menu)"
              :class="{active: subMenu.id === activeSubMenuId}"
              class="sub-menu-item"
            >
              {{ subMenu.name }}
            </button>
            <div class="sub-menu-actions">
              <button 
                v-if="index > 0"
                class="action-btn-sm sort-btn" 
                @click.stop="$emit('moveSubMenuUp', subMenu, menu, index)" 
                title="上移"
              >↑</button>
              <button 
                v-if="index < menu.subMenus.length - 1"
                class="action-btn-sm sort-btn" 
                @click.stop="$emit('moveSubMenuDown', subMenu, menu, index)" 
                title="下移"
              >↓</button>
              <button class="action-btn-sm" @click.stop="$emit('editSubMenu', subMenu, menu)" title="编辑">✏️</button>
              <button class="action-btn-sm" @click.stop="$emit('deleteSubMenu', subMenu, menu)" title="删除">🗑️</button>
            </div>
          </div>
        </div>
        
        <!-- 添加子菜单按钮 -->
        <button class="add-sub-menu-btn" @click.stop="$emit('addSubMenu', menu)">
          + 添加子菜单
        </button>
      </div>
      
      <!-- 非编辑模式下的二级菜单 -->
      <div 
        v-if="!editMode && menu.subMenus && menu.subMenus.length > 0" 
        class="sub-menu"
        :class="{ 'show': hoveredMenuId === menu.id }"
        @mouseenter="cancelHideSubMenu(menu.id)"
        @mouseleave="scheduleHideSubMenu(menu.id)"
      >
        <div v-for="subMenu in menu.subMenus" :key="subMenu.id" class="sub-menu-row">
          <button 
            @click="$emit('select', subMenu, menu)"
            :class="{active: subMenu.id === activeSubMenuId}"
            class="sub-menu-item"
          >
            {{ subMenu.name }}
          </button>
        </div>
      </div>
    </div>
    
    <!-- 编辑模式下添加菜单按钮 -->
    <div v-if="editMode" class="menu-item add-menu-item">
      <button class="add-menu-btn" @click="$emit('addMenu')">+ 添加菜单</button>
    </div>
  </nav>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import Sortable from 'sortablejs';

const props = defineProps({ 
  menus: Array, 
  activeId: Number,
  activeSubMenuId: Number,
  editMode: Boolean
});

const emit = defineEmits(['select', 'addMenu', 'editMenu', 'deleteMenu', 'addSubMenu', 'editSubMenu', 'deleteSubMenu', 'menusReordered', 'moveSubMenuUp', 'moveSubMenuDown']);

const hoveredMenuId = ref(null);
const menuBarRef = ref(null);
let sortableInstance = null;
let hideTimer = null;

function handleMenuClick(menu) {
  emit('select', menu);
}

function showSubMenu(menuId) {
  // 清除隐藏定时器
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  hoveredMenuId.value = menuId;
}

function scheduleHideSubMenu(menuId) {
  // 延迟隐藏，给用户时间移动到下拉框
  hideTimer = setTimeout(() => {
    if (hoveredMenuId.value === menuId) {
      hoveredMenuId.value = null;
    }
  }, 150);
}

function cancelHideSubMenu(menuId) {
  // 鼠标进入下拉框时取消隐藏
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  hoveredMenuId.value = menuId;
}

// 初始化拖拽排序
function initSortable() {
  if (!props.editMode || sortableInstance) return;
  
  const container = menuBarRef.value;
  if (!container) return;
  
  sortableInstance = new Sortable(container, {
    animation: 150,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    handle: '.drag-handle',
    filter: '.add-menu-item, .action-btn, .action-btn-sm, .menu-dropdown',
    preventOnFilter: false,
    onEnd: (evt) => {
      const menuIds = Array.from(container.querySelectorAll('.menu-item:not(.add-menu-item)')).map((el) => {
        return parseInt(el.getAttribute('data-menu-id'));
      }).filter(id => !isNaN(id));
      
      emit('menusReordered', menuIds);
    }
  });
}

// 销毁拖拽
function destroySortable() {
  if (sortableInstance) {
    sortableInstance.destroy();
    sortableInstance = null;
  }
}

// 监听编辑模式变化
watch(() => props.editMode, (newVal) => {
  if (newVal) {
    nextTick(() => initSortable());
  } else {
    destroySortable();
  }
});

onMounted(() => {
  if (props.editMode) {
    nextTick(() => initSortable());
  }
});

onUnmounted(() => {
  destroySortable();
});
</script>

<style scoped>
.menu-bar {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  padding: 0 1rem;
  position: relative;
  gap: 4px;
}

.menu-item {
  position: relative;
}

.menu-bar button {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 15px;
  font-weight: 500;
  padding: 0.75rem 1.5rem;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  box-shadow: none;
  border-radius: 10px;
  position: relative;
  overflow: hidden;
  letter-spacing: 0.02em;
  outline: none; /* 移除焦点外框 */
  -webkit-tap-highlight-color: transparent; /* 移除移动端点击高亮 */
}

.menu-bar button::before {
  content: '';
  position: absolute;
  bottom: 6px;
  left: 50%;
  width: 0;
  height: 2px;
  background: linear-gradient(90deg, #40a9ff, #1890ff);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  transform: translateX(-50%);
  border-radius: 2px;
}

.menu-bar button:hover {
  color: #40a9ff;
  background: rgba(64, 169, 255, 0.12);
  box-shadow: none;
}

.menu-bar button:focus,
.menu-bar button:focus-visible {
  outline: none;
  box-shadow: none;
}

.menu-bar button.active {
  color: #40a9ff;
  background: rgba(64, 169, 255, 0.1);
}

.menu-bar button.active::before {
  width: 50%;
}

/* 编辑模式样式 */
.menu-bar.edit-mode .menu-item:not(.add-menu-item) {
  border: 1px dashed rgba(99, 179, 237, 0.4);
  border-radius: 8px;
  margin: 0 2px;
  cursor: grab;
}

.menu-bar.edit-mode .menu-item:not(.add-menu-item):active {
  cursor: grabbing;
}

/* 编辑模式下拉面板 */
.menu-dropdown {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(30, 30, 35, 0.98);
  border-radius: 12px;
  min-width: max-content;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1000;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  margin-top: 6px;
  padding: 10px 0;
}

.menu-dropdown.show {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(4px);
}

/* 菜单操作行 */
.menu-actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 4px;
}

.menu-actions-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.menu-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  padding: 0;
}

.action-btn:hover {
  transform: scale(1.1);
}

.action-btn.edit-btn:hover {
  background: rgba(99, 179, 237, 0.8);
}

.action-btn.del-btn:hover {
  background: rgba(245, 101, 101, 0.8);
}

/* 子菜单列表 */
.sub-menu-list {
  padding: 0;
}

.sub-menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.sub-menu-item {
  flex: 1;
  display: block !important;
  text-align: left !important;
  padding: 0.4rem 0.8rem !important;
  border: none !important;
  background: transparent !important;
  color: #fff !important;
  font-size: 14px !important;
  font-weight: 400 !important;
  cursor: pointer !important;
  transition: all 0.2s ease !important;
  border-radius: 4px !important;
  text-shadow: none !important;
  line-height: 1.5 !important;
  white-space: nowrap !important;
}

.sub-menu-item:hover {
  background: rgba(57, 157, 255, 0.25) !important;
  color: #399dff !important;
  transform: none !important;
}

.sub-menu-item:focus,
.sub-menu-item:focus-visible {
  outline: none !important;
  box-shadow: none !important;
}

.sub-menu-item.active {
  background: rgba(57, 157, 255, 0.35) !important;
  color: #399dff !important;
  font-weight: 500 !important;
}

.sub-menu-item::before {
  display: none;
}

.sub-menu-actions {
  display: flex;
  gap: 2px;
  padding-right: 4px;
}

.action-btn-sm {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 9px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  padding: 0;
}

.action-btn-sm:hover {
  background: rgba(99, 179, 237, 0.6);
}

.action-btn-sm.sort-btn {
  font-size: 10px;
  font-weight: bold;
}

.action-btn-sm.sort-btn:hover {
  background: rgba(74, 222, 128, 0.6);
}

.add-sub-menu-btn {
  width: calc(100% - 16px) !important;
  margin: 4px 8px !important;
  padding: 0.4rem 0.8rem !important;
  border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: rgba(99, 179, 237, 0.8) !important;
  font-size: 12px !important;
  border-radius: 4px !important;
  text-align: center !important;
}

.add-sub-menu-btn:hover {
  background: rgba(99, 179, 237, 0.2) !important;
  color: #399dff !important;
}

.add-sub-menu-btn::before {
  display: none;
}

/* 非编辑模式二级菜单样式 */
.sub-menu {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(30, 30, 35, 0.98);
  border-radius: 12px;
  min-width: max-content;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1000;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  margin-top: 0;
  padding: 6px 0;
}

.sub-menu.show {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(4px);
}

/* 添加菜单按钮 */
.add-menu-item {
  border: 1px dashed rgba(99, 179, 237, 0.6) !important;
}

.add-menu-btn {
  color: rgba(99, 179, 237, 0.8) !important;
  font-size: 14px !important;
}

.add-menu-btn:hover {
  color: #399dff !important;
  background: rgba(99, 179, 237, 0.15) !important;
}

.add-menu-btn::before {
  display: none;
}

/* 拖拽状态 */
.sortable-ghost {
  opacity: 0.4;
}

.sortable-chosen {
  box-shadow: 0 0 0 2px rgba(99, 179, 237, 0.6);
}

.sortable-drag {
  opacity: 0.9;
}

@media (max-width: 768px) {
  .menu-bar {
    gap: 2px;
    padding: 0 0.5rem;
  }
  
  .menu-bar button {
    font-size: 13px;
    padding: .5rem .8rem;
  }
  
  .menu-dropdown,
  .sub-menu {
    min-width: max-content;
  }
  
  .sub-menu-item {
    font-size: 12px !important;
    padding: 0.35rem 0.7rem !important;
  }
  
  .action-btn {
    width: 22px;
    height: 22px;
    font-size: 11px;
  }
  
  .action-btn-sm {
    width: 18px;
    height: 18px;
    font-size: 9px;
  }
}

@media (max-width: 480px) {
  .menu-bar {
    gap: 1px;
    padding: 0 0.3rem;
  }
  
  .menu-bar button {
    font-size: 12px;
    padding: .4rem .6rem;
  }
}
</style>
