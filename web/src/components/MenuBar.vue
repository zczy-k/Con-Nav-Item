<template>
  <nav ref="menuBarRef" class="menu-bar">
    <div
      v-for="menu in menus"
      :key="menu.id"
      class="menu-item"
      :data-menu-id="menu.id"
      @mouseenter="showMenu(menu)"
      @mouseleave="scheduleHideSubMenu(menu.id)"
      @contextmenu.prevent="handleMenuContextMenu($event, menu)"
    >
      <button
        @click="handleNodeClick(menu)"
        @contextmenu.prevent
        :class="{ active: activePathSet.has(menu.id) }"
        :data-menu-id="menu.id"
      >
        {{ menu.name }}
      </button>
    </div>
  </nav>

  <Teleport to="body">
    <div
      v-if="hoveredMenu && getChildren(hoveredMenu).length"
      class="sub-menu-portal"
      :style="dropdownStyle"
      @mouseenter="cancelHideSubMenu(hoveredMenu.id)"
      @mouseleave="scheduleHideSubMenu(hoveredMenu.id)"
    >
      <div
        v-for="child in getChildren(hoveredMenu)"
        :key="child.id"
        class="sub-menu-row"
        @mouseenter="hoveredChildId = child.id"
        @mouseleave="hoveredChildId = null"
        @contextmenu.prevent="handleSubMenuContextMenu($event, child, hoveredMenu)"
      >
        <button
          @click="handleNodeClick(child, hoveredMenu)"
          @contextmenu.prevent
          :class="{ active: activePathSet.has(child.id) }"
          class="sub-menu-item"
        >
          {{ child.name }}
          <span v-if="getChildren(child).length" class="sub-menu-arrow">›</span>
        </button>

        <div
          v-if="hoveredChildId === child.id && getChildren(child).length"
          class="third-menu-flyout"
        >
          <button
            v-for="grandChild in getChildren(child)"
            :key="grandChild.id"
            class="third-menu-item"
            :class="{ active: activePathSet.has(grandChild.id) }"
            @click="handleNodeClick(grandChild, child, hoveredMenu)"
            @contextmenu.prevent="handleSubMenuContextMenu($event, grandChild, child)"
          >
            {{ grandChild.name }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="contextMenuVisible"
      class="menu-context-menu"
      :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
      @click.stop
    >
      <template v-if="contextMenuType === 'menu'">
        <div class="context-menu-item" @click="emitContextAction('addMenu')"><span class="context-menu-icon">➕</span><span>添加菜单</span></div>
        <div class="context-menu-item" @click="emitContextAction('editMenu')"><span class="context-menu-icon">✏️</span><span>编辑菜单</span></div>
        <div class="context-menu-item" @click="emitContextAction('deleteMenu')"><span class="context-menu-icon">🗑️</span><span>删除菜单</span></div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="emitContextAction('addSubMenu')"><span class="context-menu-icon">📁</span><span>添加子菜单</span></div>
      </template>
      <template v-else>
        <div class="context-menu-item" @click="emitContextAction('editSubMenu')"><span class="context-menu-icon">✏️</span><span>编辑分类</span></div>
        <div class="context-menu-item" @click="emitContextAction('deleteSubMenu')"><span class="context-menu-icon">🗑️</span><span>删除分类</span></div>
      </template>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';

const props = defineProps({
  menus: { type: Array, default: () => [] },
  activePathIds: { type: Array, default: () => [] }
});

const emit = defineEmits(['select', 'addMenu', 'editMenu', 'deleteMenu', 'addSubMenu', 'editSubMenu', 'deleteSubMenu']);

const menuBarRef = ref(null);
const hoveredMenuId = ref(null);
const hoveredChildId = ref(null);
const dropdownPosition = ref({ top: 0, left: 0 });
let hideTimer = null;

const contextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextMenuType = ref('menu');
const contextMenuData = ref(null);
const contextParentNode = ref(null);

const activePathSet = computed(() => new Set(props.activePathIds || []));
const hoveredMenu = computed(() => props.menus.find(item => item.id === hoveredMenuId.value) || null);
const dropdownStyle = computed(() => ({ position: 'fixed', top: `${dropdownPosition.value.top}px`, left: `${dropdownPosition.value.left}px`, zIndex: 10000 }));

function getChildren(node) {
  return node?.children || node?.subMenus || [];
}

function handleNodeClick(node, parentNode = null, rootNode = null) {
  emit('select', node, parentNode, rootNode);
}

function updateDropdownPosition(menuId) {
  const menuBtn = menuBarRef.value?.querySelector(`button[data-menu-id="${menuId}"]`);
  if (!menuBtn) return;
  const rect = menuBtn.getBoundingClientRect();
  dropdownPosition.value = { top: rect.bottom + 4, left: rect.left + rect.width / 2 };
}

function showMenu(menu) {
  if (hideTimer) clearTimeout(hideTimer);
  hoveredMenuId.value = menu.id;
  hoveredChildId.value = null;
  nextTick(() => updateDropdownPosition(menu.id));
}

function scheduleHideSubMenu(menuId) {
  hideTimer = setTimeout(() => {
    if (hoveredMenuId.value === menuId) {
      hoveredMenuId.value = null;
      hoveredChildId.value = null;
    }
  }, 150);
}

function cancelHideSubMenu(menuId) {
  if (hideTimer) clearTimeout(hideTimer);
  hoveredMenuId.value = menuId;
}

async function openContextMenu(event, type, node, parentNode = null) {
  contextMenuType.value = type;
  contextMenuData.value = node;
  contextParentNode.value = parentNode;
  contextMenuVisible.value = true;

  await nextTick();
  const menuEl = document.querySelector('.menu-context-menu');
  const menuWidth = menuEl?.offsetWidth || 0;
  const menuHeight = menuEl?.offsetHeight || 0;
  contextMenuX.value = Math.max(10, Math.min(event.clientX, window.innerWidth - menuWidth - 10));
  contextMenuY.value = Math.max(10, Math.min(event.clientY, window.innerHeight - menuHeight - 10));
}

function handleMenuContextMenu(event, menu) {
  openContextMenu(event, 'menu', menu, null);
}

function handleSubMenuContextMenu(event, node, parentNode) {
  openContextMenu(event, 'subMenu', node, parentNode);
}

function closeContextMenu() {
  contextMenuVisible.value = false;
  contextMenuData.value = null;
  contextParentNode.value = null;
}

function emitContextAction(action) {
  if (!contextMenuData.value) return closeContextMenu();
  if (action === 'editSubMenu' || action === 'deleteSubMenu') emit(action, contextMenuData.value, contextParentNode.value);
  else emit(action, contextMenuData.value);
  closeContextMenu();
}

function handleClickOutside() {
  if (contextMenuVisible.value) closeContextMenu();
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
.menu-bar { display: flex; justify-content: center; flex-wrap: wrap; padding: 0 1rem; gap: 4px; }
.menu-item { position: relative; }
.menu-bar button {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  font-size: 15px;
  font-weight: 500;
  padding: 0.6rem 1.2rem;
  cursor: pointer;
  transition: all 0.3s ease;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 12px;
}
.menu-bar button.active { color: #fff; background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.4); font-weight: 600; }

@media (max-width: 768px) {
  .menu-bar { flex-wrap: nowrap; justify-content: flex-start; overflow-x: auto; padding: 0 0.75rem; }
  .menu-bar button { white-space: nowrap; flex-shrink: 0; }
}
</style>

<style>
.sub-menu-portal,
.third-menu-flyout {
  background: rgba(255, 255, 255, 0.98);
  border-radius: 10px;
  min-width: max-content;
  white-space: nowrap;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
  border: 1px solid rgba(0, 0, 0, 0.06);
  padding: 6px 0;
}

.sub-menu-portal { transform: translateX(-50%); position: fixed; }
.sub-menu-row { position: relative; }
.sub-menu-item,
.third-menu-item {
  width: 100%;
  border: none;
  background: transparent;
  padding: 10px 18px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sub-menu-item.active,
.third-menu-item.active { background: rgba(24, 144, 255, 0.1); color: #1890ff; }
.third-menu-flyout { position: absolute; left: calc(100% + 4px); top: 0; }
.sub-menu-arrow { color: #94a3b8; }

.menu-context-menu {
  position: fixed;
  z-index: 11000;
  min-width: 180px;
  background: rgba(255,255,255,0.98);
  border: 1px solid rgba(0,0,0,0.08);
  border-radius: 12px;
  box-shadow: 0 14px 40px rgba(0,0,0,0.18);
  padding: 6px;
}
.context-menu-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; border-radius: 8px; }
.context-menu-item:hover { background: rgba(24, 144, 255, 0.08); }
.context-menu-divider { height: 1px; background: rgba(0,0,0,0.08); margin: 6px 0; }
</style>
