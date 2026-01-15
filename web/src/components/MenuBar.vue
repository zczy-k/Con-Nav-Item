<template>
  <nav ref="menuBarRef" class="menu-bar">
    <div 
      v-for="menu in menus" 
      :key="menu.id" 
      class="menu-item"
      :data-menu-id="menu.id"
      @mouseenter="showSubMenu(menu.id)"
      @mouseleave="scheduleHideSubMenu(menu.id)"
      @contextmenu.prevent="handleMenuContextMenu($event, menu)"
    >
      <button 
        ref="menuBtnRefs"
        @click="handleMenuClick(menu)" 
        :class="{active: menu.id === activeId}"
        :data-menu-id="menu.id"
      >
        {{ menu.name }}
      </button>
    </div>
  </nav>
  
  <Teleport to="body">
    <div 
      v-if="hoveredMenuId && hoveredMenu && hoveredMenu.subMenus && hoveredMenu.subMenus.length > 0"
      class="sub-menu-portal"
      :style="dropdownStyle"
      @mouseenter="cancelHideSubMenu(hoveredMenuId)"
      @mouseleave="scheduleHideSubMenu(hoveredMenuId)"
    >
      <div 
        v-for="subMenu in hoveredMenu.subMenus" 
        :key="subMenu.id" 
        class="sub-menu-row"
        @contextmenu.prevent="handleSubMenuContextMenu($event, subMenu, hoveredMenu)"
      >
        <button 
          @click="$emit('select', subMenu, hoveredMenu)"
          :class="{active: subMenu.id === activeSubMenuId}"
          class="sub-menu-item"
        >
          {{ subMenu.name }}
        </button>
      </div>
    </div>
    
    <div v-if="contextMenuVisible" 
         class="menu-context-menu"
         :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
         @click.stop>
      <template v-if="contextMenuType === 'menu'">
        <div class="context-menu-item" @click="onAddMenu">
          <span class="context-menu-icon">➕</span>
          <span>添加菜单</span>
        </div>
        <div class="context-menu-item" @click="onEditMenu">
          <span class="context-menu-icon">✏️</span>
          <span>编辑菜单</span>
        </div>
        <div class="context-menu-item" @click="onDeleteMenu">
          <span class="context-menu-icon">🗑️</span>
          <span>删除菜单</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="onAddSubMenu">
          <span class="context-menu-icon">📁</span>
          <span>添加子菜单</span>
        </div>
      </template>
      <template v-else-if="contextMenuType === 'subMenu'">
        <div class="context-menu-item" @click="onEditSubMenu">
          <span class="context-menu-icon">✏️</span>
          <span>编辑子菜单</span>
        </div>
        <div class="context-menu-item" @click="onDeleteSubMenu">
          <span class="context-menu-icon">🗑️</span>
          <span>删除子菜单</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="onMoveSubMenuUp" :class="{ disabled: !canMoveUp }">
          <span class="context-menu-icon">⬆️</span>
          <span>上移</span>
        </div>
        <div class="context-menu-item" @click="onMoveSubMenuDown" :class="{ disabled: !canMoveDown }">
          <span class="context-menu-icon">⬇️</span>
          <span>下移</span>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, nextTick, onMounted, onUnmounted, computed } from 'vue';

const props = defineProps({ 
  menus: Array, 
  activeId: Number,
  activeSubMenuId: Number
});

const emit = defineEmits(['select', 'addMenu', 'editMenu', 'deleteMenu', 'addSubMenu', 'editSubMenu', 'deleteSubMenu', 'menusReordered', 'moveSubMenuUp', 'moveSubMenuDown']);

const hoveredMenuId = ref(null);
const menuBarRef = ref(null);
const dropdownPosition = ref({ top: 0, left: 0 });
let hideTimer = null;

const contextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextMenuType = ref('menu');
const contextMenuData = ref(null);
const contextParentMenu = ref(null);

const hoveredMenu = computed(() => {
  if (!hoveredMenuId.value || !props.menus) return null;
  return props.menus.find(m => m.id === hoveredMenuId.value);
});

const dropdownStyle = computed(() => ({
  position: 'fixed',
  top: `${dropdownPosition.value.top}px`,
  left: `${dropdownPosition.value.left}px`,
  zIndex: 10000
}));

const canMoveUp = computed(() => {
  if (!contextMenuData.value || !contextParentMenu.value) return false;
  const subs = contextParentMenu.value.subMenus || [];
  const idx = subs.findIndex(s => s.id === contextMenuData.value.id);
  return idx > 0;
});

const canMoveDown = computed(() => {
  if (!contextMenuData.value || !contextParentMenu.value) return false;
  const subs = contextParentMenu.value.subMenus || [];
  const idx = subs.findIndex(s => s.id === contextMenuData.value.id);
  return idx >= 0 && idx < subs.length - 1;
});

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

function handleMenuContextMenu(event, menu) {
  contextMenuType.value = 'menu';
  contextMenuData.value = menu;
  contextParentMenu.value = null;
  contextMenuX.value = event.clientX;
  contextMenuY.value = event.clientY;
  contextMenuVisible.value = true;
}

function handleSubMenuContextMenu(event, subMenu, parentMenu) {
  contextMenuType.value = 'subMenu';
  contextMenuData.value = subMenu;
  contextParentMenu.value = parentMenu;
  contextMenuX.value = event.clientX;
  contextMenuY.value = event.clientY;
  contextMenuVisible.value = true;
}

function closeContextMenu() {
  contextMenuVisible.value = false;
  contextMenuData.value = null;
  contextParentMenu.value = null;
}

function onAddMenu() {
  emit('addMenu');
  closeContextMenu();
}

function onEditMenu() {
  if (contextMenuData.value) {
    emit('editMenu', contextMenuData.value);
  }
  closeContextMenu();
}

function onDeleteMenu() {
  if (contextMenuData.value) {
    emit('deleteMenu', contextMenuData.value);
  }
  closeContextMenu();
}

function onAddSubMenu() {
  if (contextMenuData.value) {
    emit('addSubMenu', contextMenuData.value);
  }
  closeContextMenu();
}

function onEditSubMenu() {
  if (contextMenuData.value && contextParentMenu.value) {
    emit('editSubMenu', contextMenuData.value, contextParentMenu.value);
  }
  closeContextMenu();
}

function onDeleteSubMenu() {
  if (contextMenuData.value && contextParentMenu.value) {
    emit('deleteSubMenu', contextMenuData.value, contextParentMenu.value);
  }
  closeContextMenu();
}

function onMoveSubMenuUp() {
  if (!canMoveUp.value) return;
  if (contextMenuData.value && contextParentMenu.value) {
    const subs = contextParentMenu.value.subMenus || [];
    const idx = subs.findIndex(s => s.id === contextMenuData.value.id);
    emit('moveSubMenuUp', contextMenuData.value, contextParentMenu.value, idx);
  }
  closeContextMenu();
}

function onMoveSubMenuDown() {
  if (!canMoveDown.value) return;
  if (contextMenuData.value && contextParentMenu.value) {
    const subs = contextParentMenu.value.subMenus || [];
    const idx = subs.findIndex(s => s.id === contextMenuData.value.id);
    emit('moveSubMenuDown', contextMenuData.value, contextParentMenu.value, idx);
  }
  closeContextMenu();
}

function handleClickOutside(event) {
  if (contextMenuVisible.value) {
    closeContextMenu();
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('scroll', closeContextMenu);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('scroll', closeContextMenu);
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

<style>
.sub-menu-portal {
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

.sub-menu-portal .sub-menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.sub-menu-portal .sub-menu-item {
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

.sub-menu-portal .sub-menu-item:hover {
  background: rgba(57, 157, 255, 0.25);
  color: #399dff;
}

.sub-menu-portal .sub-menu-item:focus {
  outline: none;
}

.sub-menu-portal .sub-menu-item.active {
  background: rgba(57, 157, 255, 0.35);
  color: #399dff;
  font-weight: 500;
}

.menu-context-menu {
  position: fixed;
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  padding: 6px 0;
  min-width: 160px;
  z-index: 99999;
  animation: contextMenuFadeIn 0.15s ease;
}

@keyframes contextMenuFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.menu-context-menu .context-menu-item {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  color: #fff;
  font-size: 14px;
  transition: background 0.15s ease;
}

.menu-context-menu .context-menu-item:hover {
  background: rgba(99, 179, 237, 0.3);
}

.menu-context-menu .context-menu-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.menu-context-menu .context-menu-item.disabled:hover {
  background: transparent;
}

.menu-context-menu .context-menu-icon {
  margin-right: 10px;
  font-size: 14px;
}

.menu-context-menu .context-menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 4px 0;
}

@media (max-width: 768px) {
  .sub-menu-portal {
    min-width: max-content;
  }
  
  .sub-menu-portal .sub-menu-item {
    font-size: 12px;
    padding: 0.35rem 0.7rem;
  }
}
</style>
