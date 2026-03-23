<template>
    <Teleport to="body">
      <transition name="drawer-overlay">
        <div v-if="visible" class="drawer-overlay" @click="close" @contextmenu.prevent></div>
      </transition>
      
      <transition name="drawer-slide">
        <div v-if="visible" class="mobile-drawer" @contextmenu.prevent>
          <div class="drawer-header">
          <span class="drawer-title">导航菜单</span>
          <button class="drawer-close" @click="close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <div class="drawer-content">
            <div v-for="menu in menus" :key="menu.id" class="drawer-menu-item">
              <div 
                class="drawer-menu-header"
                :class="{ active: activeMenuId === menu.id && !activeSubMenuId }"
                @click="handleMenuClick(menu)"
                @contextmenu.prevent
              >
                <span class="menu-name">{{ menu.name }}</span>
                <div class="menu-actions">
                  <span v-if="menu.subMenus?.length" class="sub-count">{{ menu.subMenus.length }}</span>
                  <button 
                    v-if="menu.subMenus?.length"
                    class="expand-btn"
                    :class="{ expanded: expandedMenuId === menu.id }"
                    @click.stop="toggleExpand(menu.id)"
                    @contextmenu.prevent
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                </div>
              </div>
              
              <transition name="submenu-expand">
                <div v-if="expandedMenuId === menu.id && menu.subMenus?.length" class="drawer-submenu">
                  <div 
                    v-for="sub in menu.subMenus" 
                    :key="sub.id"
                    class="drawer-submenu-item"
                    :class="{ active: activeSubMenuId === sub.id }"
                    @click="handleSubMenuClick(sub, menu)"
                    @contextmenu.prevent
                  >
                    {{ sub.name }}
                  </div>
                </div>
              </transition>
            </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  visible: Boolean,
  menus: Array,
  activeMenuId: Number,
  activeSubMenuId: Number
});

const emit = defineEmits(['close', 'selectMenu', 'selectSubMenu']);

const expandedMenuId = ref(null);

watch(() => props.activeMenuId, (newId) => {
  if (newId && props.menus?.find(m => m.id === newId)?.subMenus?.length) {
    expandedMenuId.value = newId;
  }
}, { immediate: true });

function close() {
  emit('close');
}

function toggleExpand(menuId) {
  expandedMenuId.value = expandedMenuId.value === menuId ? null : menuId;
}

function handleMenuClick(menu) {
  emit('selectMenu', menu);
  if (!menu.subMenus?.length) {
    close();
  }
}

function handleSubMenuClick(subMenu, parentMenu) {
  emit('selectSubMenu', subMenu, parentMenu);
  close();
}
</script>

<style scoped>
.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 9998;
}

.mobile-drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 240px;
  max-width: 65vw;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 32px rgba(0, 0, 0, 0.12);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.drawer-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.drawer-close {
  width: 36px;
  height: 36px;
  border: none;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 10px;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.drawer-close:hover {
  background: rgba(0, 0, 0, 0.08);
  color: #333;
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
}

.drawer-menu-item {
  margin: 4px 12px;
}

.drawer-menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #333;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.drawer-menu-header:hover {
  background: rgba(24, 144, 255, 0.06);
}

.drawer-menu-header.active {
  background: linear-gradient(135deg, rgba(24, 144, 255, 0.12) 0%, rgba(64, 169, 255, 0.08) 100%);
  color: #1890ff;
}

.menu-name {
  font-size: 15px;
  font-weight: 500;
  pointer-events: none;
}

.menu-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sub-count {
  font-size: 12px;
  color: #999;
  background: rgba(0, 0, 0, 0.04);
  padding: 2px 8px;
  border-radius: 10px;
  pointer-events: none;
}

.expand-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s ease;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.expand-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #666;
}

.expand-btn svg {
  transition: transform 0.25s ease;
  pointer-events: none;
}

.expand-btn.expanded svg {
  transform: rotate(180deg);
}

.drawer-submenu {
  margin-top: 4px;
  margin-left: 16px;
  padding-left: 16px;
  border-left: 2px solid rgba(24, 144, 255, 0.2);
}

.drawer-submenu-item {
  padding: 12px 16px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;
  margin: 2px 0;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.drawer-submenu-item:hover {
  background: rgba(24, 144, 255, 0.06);
  color: #333;
}

.drawer-submenu-item.active {
  background: rgba(24, 144, 255, 0.1);
  color: #1890ff;
  font-weight: 500;
}

.drawer-overlay-enter-active,
.drawer-overlay-leave-active {
  transition: opacity 0.25s ease;
}

.drawer-overlay-enter-from,
.drawer-overlay-leave-to {
  opacity: 0;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(-100%);
}

.submenu-expand-enter-active,
.submenu-expand-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.submenu-expand-enter-from,
.submenu-expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.submenu-expand-enter-to,
.submenu-expand-leave-from {
  opacity: 1;
  max-height: 500px;
}
</style>
