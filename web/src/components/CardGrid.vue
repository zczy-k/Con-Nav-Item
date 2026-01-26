<template>
    <div ref="cardGridRef" class="container card-grid" :class="{ 'selection-mode': selectionMode }">
      <div v-for="(card, index) in cards" :key="card.id"
           class="link-item" 
           :class="{ 
             'selected': isCardSelected(card)
           }"
           :data-card-id="card.id"
           draggable="false"
           @contextmenu.prevent="handleContextMenu($event, card)"
           @click="handleCardClick($event, card)">
          <a :href="selectionMode ? 'javascript:void(0)' : card.url" 
             :target="selectionMode ? '' : '_blank'" 
             :title="getTooltip(card)" 
             draggable="false"
             @click="handleLinkClick($event, card)"
             @contextmenu.prevent
             class="card-link">
            <img 
              class="link-icon" 
              :ref="(el) => el && setupIconLazyLoad(el, card)"
              :src="placeholderIcon"
              :data-url="card.url"
              alt="" 
              draggable="false"
              @error="onImgError($event, card)"
              @contextmenu.prevent>
            <span class="link-text" @contextmenu.prevent>{{ truncate(card.title) }}</span>
          </a>
        <div v-if="isCardSelected(card)" class="card-selected-badge">✓</div>
      </div>
    
    <Teleport to="body">
      <div v-if="contextMenuVisible" 
           class="context-menu"
           :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
           @click.stop>
        <div class="context-menu-item" @click="onContextEdit">
          <span class="context-menu-icon">✏️</span>
          <span>编辑</span>
        </div>
        <div class="context-menu-item" @click="onContextDelete">
          <span class="context-menu-icon">🗑️</span>
          <span>删除</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="onContextSelect">
          <span class="context-menu-icon">☑️</span>
          <span>{{ isCardSelected(contextMenuCard) ? '取消选中' : '选中' }}</span>
        </div>
        <div class="context-menu-item" @click="onContextMove">
          <span class="context-menu-icon">📁</span>
          <span>移动到...</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="onContextOpen">
          <span class="context-menu-icon">🔗</span>
          <span>在新标签页打开</span>
        </div>
        <div class="context-menu-item" @click="onContextCopyUrl">
          <span class="context-menu-icon">📋</span>
          <span>复制链接</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useIconLoader } from '../composables/useIconLoader';

const props = defineProps({ 
  cards: Array,
  selectedCards: Array,
  categoryId: Number,
  subCategoryId: [Number, null],
  selectionMode: Boolean
});

const emit = defineEmits([
  'contextEdit', 
  'contextDelete',
  'toggleCardSelection',
  'openMovePanel',
  'requireAuth',
  'cardClicked'
]);

const cardGridRef = ref(null);
const placeholderIcon = '/icons/common/default-favicon.png';

const { setupLazyLoad, queueIcon } = useIconLoader();

const iconCleanups = new Map();

function getOriginUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin;
  } catch {
    return null;
  }
}

function setupIconLazyLoad(el, card) {
  if (!el || !card.url) return;
  
  if (iconCleanups.has(card.id)) {
    iconCleanups.get(card.id)();
  }
  
  if (card.logo_url) {
    el.src = card.logo_url;
    return;
  }
  
  const originUrl = getOriginUrl(card.url);
  if (!originUrl) {
    el.src = placeholderIcon;
    return;
  }
  
  const cleanup = setupLazyLoad(el, originUrl, card.id);
  if (cleanup) {
    iconCleanups.set(card.id, cleanup);
  }
}

onUnmounted(() => {
  iconCleanups.forEach(cleanup => cleanup());
  iconCleanups.clear();
});

const contextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);
const contextMenuCard = ref(null);

async function handleContextMenu(event, card) {
  contextMenuCard.value = card;
  contextMenuVisible.value = true;
  
  const x = event.clientX;
  const y = event.clientY;
  
  // Use nextTick to ensure the menu is in the DOM before measuring
  const { nextTick } = await import('vue');
  await nextTick();
  
  const menu = document.querySelector('.context-menu');
  if (menu) {
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let finalX = x;
    let finalY = y;
    
    // Adjust horizontal position
    if (x + menuWidth > viewportWidth) {
      finalX = viewportWidth - menuWidth - 10;
    }
    
    // Adjust vertical position
    if (y + menuHeight > viewportHeight) {
      finalY = viewportHeight - menuHeight - 10;
    }
    
    // Ensure it doesn't go off the left or top edge either
    finalX = Math.max(10, finalX);
    finalY = Math.max(10, finalY);
    
    contextMenuX.value = finalX;
    contextMenuY.value = finalY;
  } else {
    contextMenuX.value = x;
    contextMenuY.value = y;
  }
}

function closeContextMenu() {
  contextMenuVisible.value = false;
  contextMenuCard.value = null;
}

function onContextEdit() {
  if (contextMenuCard.value) {
    emit('contextEdit', contextMenuCard.value);
  }
  closeContextMenu();
}

function onContextDelete() {
  if (contextMenuCard.value) {
    emit('contextDelete', contextMenuCard.value);
  }
  closeContextMenu();
}

function onContextSelect() {
  if (contextMenuCard.value) {
    emit('toggleCardSelection', contextMenuCard.value);
  }
  closeContextMenu();
}

function onContextMove() {
  if (contextMenuCard.value) {
    if (!isCardSelected(contextMenuCard.value)) {
      emit('toggleCardSelection', contextMenuCard.value);
    }
    emit('openMovePanel');
  }
  closeContextMenu();
}

function onContextOpen() {
  if (contextMenuCard.value) {
    recordCardClick(contextMenuCard.value.id);
    window.open(contextMenuCard.value.url, '_blank');
  }
  closeContextMenu();
}

function onContextCopyUrl() {
  if (contextMenuCard.value) {
    const url = contextMenuCard.value.url;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).catch(() => {
        fallbackCopyText(url);
      });
    } else {
      fallbackCopyText(url);
    }
  }
  closeContextMenu();
}

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
  } catch (e) {
    console.error('Copy failed:', e);
  }
  document.body.removeChild(textarea);
}

function handleClickOutside(event) {
  if (contextMenuVisible.value) {
    closeContextMenu();
  }
}

function handleCardClick(event, card) {
  if (event.ctrlKey || event.metaKey || props.selectionMode) {
    event.preventDefault();
    event.stopPropagation();
    emit('toggleCardSelection', card);
  }
}

function handleLinkClick(event, card) {
  if (event.ctrlKey || event.metaKey || props.selectionMode) {
    event.preventDefault();
    event.stopPropagation();
    emit('toggleCardSelection', card);
  } else {
    recordCardClick(card.id);
  }
}

function recordCardClick(cardId) {
  fetch(`/api/cards/${cardId}/click`, { method: 'POST' }).catch(() => {});
  emit('cardClicked', cardId);
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
  document.addEventListener('scroll', closeContextMenu);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
  document.removeEventListener('scroll', closeContextMenu);
});

function onImgError(e, card) {
  if (e.target._retried) {
    e.target.src = placeholderIcon;
    return;
  }
  
  e.target._retried = true;
  
  const originUrl = getOriginUrl(card.url);
  if (originUrl) {
    queueIcon(originUrl, e.target, card.id);
  } else {
    e.target.src = placeholderIcon;
  }
}

function getTooltip(card) {
  let tip = '';
  if (card.desc) tip += card.desc + '\n';
  if (card.tags && card.tags.length > 0) {
    tip += '标签: ' + card.tags.map(t => t.name).join(', ') + '\n';
  }
  tip += card.url;
  return tip;
}

function truncate(str) {
  if (!str) return '';
  return str.length > 20 ? str.slice(0, 20) + '...' : str;
}

function isCardSelected(card) {
  return props.selectedCards?.some(c => c.id === card.id) || false;
}
</script>

<style scoped>
.container {
  max-width: 68rem;
  margin: 0 auto;
  margin-top: 2.5vh;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 18px;
  position: relative;
  z-index: 1;
  padding: 0 1rem;
  box-sizing: border-box;
}

@media (max-width: 1400px) {
  .container { 
    grid-template-columns: repeat(7, 1fr); 
    gap: 16px;
    max-width: 60rem;
  }
}

@media (max-width: 1200px) {
  .container { 
    grid-template-columns: repeat(6, 1fr); 
    gap: 14px;
    max-width: 52rem;
  }
}

@media (max-width: 1024px) {
  .container { 
    grid-template-columns: repeat(5, 1fr); 
    gap: 14px;
    max-width: 46rem;
    padding: 0 2vw;
  }
}

@media (max-width: 900px) {
  .container { 
    grid-template-columns: repeat(4, 1fr); 
    gap: 14px;
    padding: 0 4vw;
  }
  .link-item {
    min-height: 90px;
    height: auto;
    border-radius: 16px;
  }
  .link-icon {
    width: 34px;
    height: 34px;
  }
  .link-text {
    font-size: 12px;
  }
}

@media (max-width: 768px) {
  .container { 
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    padding: 0 16px;
  }
  .link-item {
    min-height: 100px;
    height: auto;
    border-radius: 18px;
  }
  .link-icon {
    width: 36px;
    height: 36px;
    margin-bottom: 8px;
  }
  .link-text {
    font-size: 12px;
    font-weight: 500;
  }
  .card-link {
    padding: 14px 8px;
  }
}

@media (max-width: 480px) {
  .container { 
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    padding: 0 12px;
  }
  .link-item {
    min-height: 90px;
    border-radius: 16px;
  }
  .link-icon {
    width: 32px;
    height: 32px;
    margin-bottom: 6px;
  }
  .link-text {
    font-size: 11px;
    line-height: 1.3;
  }
  .card-link {
    padding: 12px 6px;
  }
}

@media (max-width: 380px) {
  .container { 
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    padding: 0 10px;
  }
  .link-item {
    min-height: 85px;
    border-radius: 14px;
  }
  .link-icon {
    width: 28px;
    height: 28px;
    margin-bottom: 5px;
  }
  .link-text {
    font-size: 10px;
    line-height: 1.25;
  }
  .card-link {
    padding: 10px 4px;
  }
}

.link-item {
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 18px;
  min-height: 92px;
  height: 92px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.08),
    0 1px 3px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.link-item:hover {
  background: rgba(255, 255, 255, 0.28);
  transform: translateY(-6px) scale(1.03);
  border-color: rgba(255, 255, 255, 0.4);
  box-shadow: 
    0 16px 40px rgba(0, 0, 0, 0.15),
    0 4px 12px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.link-item:active {
  transform: translateY(-2px) scale(0.97);
  transition: transform 0.08s ease;
  background: rgba(255, 255, 255, 0.32);
}

@media (hover: none) {
  .link-item:hover {
    transform: none;
    background: rgba(255, 255, 255, 0.18);
    box-shadow: 
      0 4px 20px rgba(0, 0, 0, 0.08),
      0 1px 3px rgba(0, 0, 0, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }
  .link-item:active {
    transform: scale(0.96);
    background: rgba(255, 255, 255, 0.3);
    box-shadow: 
      0 2px 8px rgba(0, 0, 0, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.15);
  }
}

.link-item.selected {
  border: 2px solid rgba(99, 179, 237, 0.85);
  box-shadow: 
    0 0 0 4px rgba(99, 179, 237, 0.25), 
    0 4px 20px rgba(0, 0, 0, 0.1);
}

.card-grid.selection-mode .link-item {
  cursor: pointer;
}

.card-grid.selection-mode .link-item:hover {
  border-color: rgba(99, 179, 237, 0.5);
}

.card-grid.selection-mode .link-item .card-link {
  pointer-events: none;
}

.card-link {
  text-decoration: none;
  color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 10px 8px;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  -webkit-touch-callout: none;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}

.link-icon {
  width: 34px;
  height: 34px;
  object-fit: contain;
  filter: drop-shadow(0 2px 10px rgba(0, 0, 0, 0.25));
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
  margin-bottom: 8px;
  opacity: 0.8;
  pointer-events: none;
  -webkit-user-drag: none;
}

.link-icon[src]:not([src=""]):not([src$="default-favicon.png"]) {
  opacity: 1;
}

.link-item:hover .link-icon {
  transform: scale(1.12);
}

.link-text {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  color: #ffffff;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
  max-width: 100%;
  padding: 0 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
  letter-spacing: 0.01em;
  pointer-events: none;
}

.card-selected-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  background: rgba(99, 179, 237, 0.9);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
  font-weight: bold;
  z-index: 10;
}

  .context-menu {
    position: fixed;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 12px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    box-shadow: 
      0 8px 32px rgba(0, 0, 0, 0.12),
      0 2px 8px rgba(0, 0, 0, 0.08);
    padding: 6px;
    min-width: 150px;
    max-width: calc(100vw - 20px);
    max-height: calc(100vh - 20px);
    overflow-y: auto;
    z-index: 9999;
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

.context-menu-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  color: #333;
  font-size: 13px;
  border-radius: 8px;
  transition: background 0.15s ease;
}

.context-menu-item:hover {
  background: rgba(24, 144, 255, 0.1);
}

.context-menu-icon {
  margin-right: 10px;
  font-size: 14px;
}

.context-menu-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.08);
  margin: 4px 0;
}
</style>
