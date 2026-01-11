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
        ref="menuBtnRefs"
        @click="handleMenuClick(menu)" 
        :class="{active: menu.id === activeId, 'drag-handle': editMode}"
        :data-menu-id="menu.id"
      >
        {{ menu.name }}
      </button>
    </div>
    
    <!-- 编辑模式下添加菜单按钮 -->
    <div v-if="editMode" class="menu-item add-menu-item">
      <button class="add-menu-btn" @click="$emit('addMenu')">+ 添加菜单</button>
    </div>
  </nav>
  
  <!-- 子菜单使用 Teleport 渲染到 body，避免层叠上下文问题 -->
  <Teleport to="body">
    <!-- 编辑模式下拉面板 -->
    <div 
      v-if="editMode && hoveredMenuId && hoveredMenu"
      class="menu-dropdown-portal"
      :style="dropdownStyle"
      @mouseenter="cancelHideSubMenu(hoveredMenuId)"
      @mouseleave="scheduleHideSubMenu(hoveredMenuId)"
    >
      <div class="menu-actions-row">
        <span class="menu-actions-label">菜单操作</span>
        <div class="menu-actions">
          <button class="action-btn edit-btn" @click.stop="$emit('editMenu', hoveredMenu)" title="编辑">✏️</button>
          <button class="action-btn del-btn" @click.stop="$emit('deleteMenu', hoveredMenu)" title="删除">🗑️</button>
        </div>
      </div>
      <div v-if="hoveredMenu.subMenus && hoveredMenu.subMenus.length > 0" class="sub-menu-list">
        <div 
          v-for="(subMenu, index) in hoveredMenu.subMenus" 
          :key="subMenu.id" 
          class="sub-menu-row"
        >
          <button 
            @click="$emit('select', subMenu, hoveredMenu)"
            :class="{active: subMenu.id === activeSubMenuId}"
            class="sub-menu-item"
          >
            {{ subMenu.name }}
          </button>
          <div class="sub-menu-actions">
            <button v-if="index > 0" class="action-btn-sm sort-btn" @click.stop="$emit('moveSubMenuUp', subMenu, hoveredMenu, index)" title="上移">↑</button>
            <button v-if="index < hoveredMenu.subMenus.length - 1" class="action-btn-sm sort-btn" @click.stop="$emit('moveSubMenuDown', subMenu, hoveredMenu, index)" title="下移">↓</button>
            <button class="action-btn-sm" @click.stop="$emit('editSubMenu', subMenu, hoveredMenu)" title="编辑">✏️</button>
            <button class="action-btn-sm" @click.stop="$emit('deleteSubMenu', subMenu, hoveredMenu)" title="删除">🗑️</button>
          </div>
        </div>
      </div>
      <button class="add-sub-menu-btn" @click.stop="$emit('addSubMenu', hoveredMenu)">+ 添加子菜单</button>
    </div>
    
    <!-- 非编辑模式子菜单 -->
    <div 
      v-if="!editMode && hoveredMenuId && hoveredMenu && hoveredMenu.subMenus && hoveredMenu.subMenus.length > 0"
      class="sub-menu-portal"
      :style="dropdownStyle"
      @mouseenter="cancelHideSubMenu(hoveredMenuId)"
      @mouseleave="scheduleHideSubMenu(hoveredMenuId)"
    >
      <div v-for="subMenu in hoveredMenu.subMenus" :key="subMenu.id" class="sub-menu-row">
        <button 
          @click="$emit('select', subMenu, hoveredMenu)"
          :class="{active: subMenu.id === activeSubMenuId}"
          class="sub-menu-item"
        >
          {{ subMenu.name }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue';
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
const dropdownPosition = ref({ top: 0, left: 0 });
let sortableInstance = null;
let hideTimer = null;

// 计算当前悬停的菜单对象
const hoveredMenu = computed(() => {
  if (!hoveredMenuId.value || !props.menus) return null;
  return props.menus.find(m => m.id === hoveredMenuId.value);
});

// 计算下拉框位置样式
const dropdownStyle = computed(() => ({
  position: 'fixed',
  top: `${dropdownPosition.value.top}px`,
  left: `${dropdownPosition.value.left}px`,
  zIndex: 10000
}));

function handleMenuClick(menu) {
  emit('select', menu);
}

function updateDropdownPosition(menuId) {
  const menuBtn = menuBarRef.value?.querySelector(`button[data-menu-id="${menuId}"]`);
  if (menuBtn) {
    const rect = menuBtn.getBoundingClientRect();
    dropdownPosition.value = {
      top: rect.bottom + 4,
      left: rect.left + rect.width / 2
    };
  }
}

function showSubMenu(menuId) {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  hoveredMenuId.value = menuId;
  nextTick(() => updateDropdownPosition(menuId));
}

function scheduleHideSubMenu(menuId) {
  hideTimer = setTimeout(() => {
    if (hoveredMenuId.value === menuId) {
      hoveredMenuId.value = null;
    }
  }, 150);
}

function cancelHideSubMenu(menuId) {
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
    filter: '.add-menu-item, .action-btn, .action-btn-sm',
    preventOnFilter: false,
    onEnd: (evt) => {
      const menuIds = Array.from(container.querySelectorAll('.menu-item:not(.add-menu-item)')).map((el) => {
        return parseInt(el.getAttribute('data-menu-id'));
      }).filter(id => !isNaN(id));
      
      emit('menusReordered', menuIds);
    }
  });
}

function destroySortable() {
  if (sortableInstance) {
    sortableInstance.destroy();
    sortableInstance = null;
  }
}

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
  if (hideTimer) clearTimeout(hideTimer);
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
  pointer-events: auto;
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
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  box-shadow: none;
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  letter-spacing: 0.02em;
  outline: none;
  -webkit-tap-highlight-color: transparent;
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
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.menu-bar button:focus,
.menu-bar button:focus-visible {
  outline: none;
  box-shadow: none;
}

.menu-bar button.active {
  color: #40a9ff;
  background: rgba(64, 169, 255, 0.15);
}

.menu-bar button.active::before {
  width: 50%;
}

/* 编辑模式样式 */
.menu-bar.edit-mode .menu-item:not(.add-menu-item) {
  border: 1px dashed rgba(64, 169, 255, 0.4);
  border-radius: 12px;
  margin: 0 2px;
  cursor: grab;
}

.menu-bar.edit-mode .menu-item:not(.add-menu-item):active {
  cursor: grabbing;
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
    flex-wrap: nowrap;
    justify-content: flex-start;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    -ms-overflow-style: none;
    gap: 4px;
    padding: 0 0.75rem;
    margin: 0 auto;
    max-width: 100vw;
  }
  
  .menu-bar::-webkit-scrollbar {
    display: none;
  }
  
  .menu-bar button {
    font-size: 14px;
    padding: 0.5rem 1rem;
    white-space: nowrap;
    flex-shrink: 0;
  }
}

@media (max-width: 480px) {
  .menu-bar {
    gap: 3px;
    padding: 0 0.5rem;
  }
  
  .menu-bar button {
    font-size: 13px;
    padding: 0.45rem 0.85rem;
  }
}
</style>

<!-- 全局样式用于 Teleport 的下拉菜单 -->
<style>
/* 子菜单下拉框 - 渲染到 body */
.sub-menu-portal,
.menu-dropdown-portal {
  background: #2a2a30;
  border-radius: 10px;
  min-width: max-content;
  white-space: nowrap;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 6px 0;
  transform: translateX(-50%);
  animation: dropdownFadeIn 0.15s ease;
}

.menu-dropdown-portal {
  padding: 10px 0;
}

@keyframes dropdownFadeIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* 菜单操作行 */
.menu-dropdown-portal .menu-actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 4px;
}

.menu-dropdown-portal .menu-actions-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.menu-dropdown-portal .menu-actions {
  display: flex;
  gap: 4px;
}

.menu-dropdown-portal .action-btn,
.sub-menu-portal .action-btn {
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

.menu-dropdown-portal .action-btn:hover {
  transform: scale(1.1);
}

.menu-dropdown-portal .action-btn.edit-btn:hover {
  background: rgba(99, 179, 237, 0.8);
}

.menu-dropdown-portal .action-btn.del-btn:hover {
  background: rgba(245, 101, 101, 0.8);
}

/* 子菜单列表 */
.sub-menu-portal .sub-menu-row,
.menu-dropdown-portal .sub-menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.sub-menu-portal .sub-menu-item,
.menu-dropdown-portal .sub-menu-item {
  flex: 1;
  display: block;
  text-align: left;
  padding: 0.4rem 0.8rem;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 14px;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 4px;
  line-height: 1.5;
  white-space: nowrap;
}

.sub-menu-portal .sub-menu-item:hover,
.menu-dropdown-portal .sub-menu-item:hover {
  background: rgba(57, 157, 255, 0.25);
  color: #399dff;
}

.sub-menu-portal .sub-menu-item:focus,
.menu-dropdown-portal .sub-menu-item:focus {
  outline: none;
}

.sub-menu-portal .sub-menu-item.active,
.menu-dropdown-portal .sub-menu-item.active {
  background: rgba(57, 157, 255, 0.35);
  color: #399dff;
  font-weight: 500;
}

.menu-dropdown-portal .sub-menu-actions {
  display: flex;
  gap: 2px;
  padding-right: 4px;
}

.menu-dropdown-portal .action-btn-sm {
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

.menu-dropdown-portal .action-btn-sm:hover {
  background: rgba(99, 179, 237, 0.6);
}

.menu-dropdown-portal .action-btn-sm.sort-btn {
  font-size: 10px;
  font-weight: bold;
}

.menu-dropdown-portal .action-btn-sm.sort-btn:hover {
  background: rgba(74, 222, 128, 0.6);
}

.menu-dropdown-portal .add-sub-menu-btn {
  display: block;
  width: calc(100% - 16px);
  margin: 4px 8px;
  padding: 0.4rem 0.8rem;
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: rgba(99, 179, 237, 0.8);
  font-size: 12px;
  border-radius: 4px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.menu-dropdown-portal .add-sub-menu-btn:hover {
  background: rgba(99, 179, 237, 0.2);
  color: #399dff;
}

@media (max-width: 768px) {
  .sub-menu-portal,
  .menu-dropdown-portal {
    min-width: max-content;
  }
  
  .sub-menu-portal .sub-menu-item,
  .menu-dropdown-portal .sub-menu-item {
    font-size: 12px;
    padding: 0.35rem 0.7rem;
  }
}
</style>
