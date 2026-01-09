<template>
  <div ref="cardGridRef" class="container card-grid" :class="{ 'edit-mode': editMode }">
    <div v-for="(card, index) in cards" :key="card.id"
         class="link-item" 
         :class="{ 'draggable': editMode }"
         :data-card-id="card.id"
         :style="getCardStyle(index)">
      <a :href="editMode ? 'javascript:void(0)' : card.url" :target="editMode ? '' : '_blank'" :title="getTooltip(card)" @click="editMode ? $event.preventDefault() : null" :class="{'drag-handle': editMode}">
        <img class="link-icon" :src="getLogo(card)" alt="" @error="onImgError($event, card)" loading="lazy">
        <span class="link-text">{{ truncate(card.title) }}</span>
      </a>
      <div v-if="editMode" class="card-btns">
        <input 
          type="checkbox" 
          class="card-checkbox"
          :checked="isCardSelected(card)"
          @click="$emit('toggleCardSelection', card)"
          title="选中"
        />
        <button @click="$emit('editCard', card)" class="card-btn edit-btn" title="编辑">✏️</button>
        <button @click="$emit('deleteCard', card)" class="card-btn del-btn" title="删除">🗑️</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import Sortable from 'sortablejs';

const props = defineProps({ 
  cards: Array,
  editMode: Boolean,
  selectedCards: Array,
  categoryId: Number,
  subCategoryId: [Number, null]
});

const emit = defineEmits(['cardsReordered', 'editCard', 'deleteCard', 'toggleCardSelection']);

// 容器引用
const cardGridRef = ref(null);
let sortableInstance = null;

// 动画已完全禁用

// 初始化拖拽功能
function initSortable() {
  if (!props.editMode || sortableInstance) return;
  
  // 使用组件自己的 ref，而不是全局选择器
  const container = cardGridRef.value;
  if (!container) return;
  
  sortableInstance = new Sortable(container, {
    animation: 150,
    group: 'cards', // 设置组名，允许跨分类拖动
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    handle: '.drag-handle', // 改为特定的拖拽手柄
    filter: '.card-btn, .card-checkbox', // 过滤掉按钮和复选框
    preventOnFilter: false, // 允许过滤元素的默认事件
    onEnd: (evt) => {
      // 拖拽结束后，通知父组件更新顺序
      const targetContainer = evt.to;
      // 只需要传递卡片ID列表，父组件会处理完整数据
      const cardIds = Array.from(targetContainer.children).map((el) => {
        return parseInt(el.getAttribute('data-card-id'));
      }).filter(id => !isNaN(id));
      
      // 传递卡片ID列表和目标分类ID
      emit('cardsReordered', cardIds, props.categoryId, props.subCategoryId);
    }
  });
}

// 销毁拖拽功能
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

// 监听 cards 变化，触发动画并重新初始化 Sortable
watch(() => props.cards, (newCards, oldCards) => {
  // 如果是新的卡片数据或者从有数据变成其他数据
  if (newCards && newCards.length > 0) {
    // 如果是首次加载或者数据发生了变化
    const isDataChanged = !oldCards || oldCards.length === 0 || JSON.stringify(newCards) !== JSON.stringify(oldCards);
    if (isDataChanged) {
      // 延迟一下确保DOM更新完成
      nextTick(() => {
        triggerAnimation();
        // 在编辑模式下，重新初始化 Sortable（因为 DOM 可能已重新渲染）
        if (props.editMode) {
          destroySortable();
          nextTick(() => initSortable());
        }
      });
    }
  }
}, { deep: true, immediate: false });

// 完全禁用所有动画
function triggerAnimation() {
  // 无动画，立即显示
}

// 获取卡片样式（纯毛玻璃，无渐变色）
function getCardStyle(index) {
  return {};
}

//获取完整的origin URL
function getOriginUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin;
  } catch {
    return null;
  }
}

function getLogo(card) {
  // 1. 优先使用数据库中的 logo_url
  if (card.logo_url) {
    return card.logo_url;
  }
  
  // 2. 如果没有 logo_url，使用 CDN 自动生成
  const originUrl = getOriginUrl(card.url);
  if (originUrl) {
    return `https://api.xinac.net/icon/?url=${originUrl}&sz=128`;
  }
  
  // 3. 默认图标
  return '/default-favicon.png';
}

// CDN 备用源列表（用于降级）
const CDN_PROVIDERS = [
  (url) => `https://api.xinac.net/icon/?url=${url}&sz=128`,           // CDN 1: xinac (国内)
  (url) => `https://api.afmax.cn/so/ico/index.php?r=${url}&sz=128`,  // CDN 2: afmax (国内)
  (url) => `https://icon.horse/icon/${url}`,                          // CDN 3: icon.horse
  (url) => `https://www.google.com/s2/favicons?domain=${url}&sz=128`, // CDN 4: Google
  (url) => `https://favicon.im/${url}?larger=true`,                   // CDN 5: favicon.im
];

function onImgError(e, card) {
  const currentSrc = e.target.src;
  const originUrl = getOriginUrl(card.url);
  
  if (!originUrl) {
    e.target.src = '/default-favicon.png';
    return;
  }
  
  // 记录已尝试的 CDN 索引
  if (e.target._cdnIndex === undefined) e.target._cdnIndex = 0;
  
  // 降级策略：CDN1 → CDN2 → CDN3 → CDN4 → CDN5 → 默认
  
  // 尝试下一个 CDN
  for (let i = 0; i < CDN_PROVIDERS.length; i++) {
    const cdnUrl = CDN_PROVIDERS[i](originUrl);
    // 检查是否当前是这个 CDN
    if (currentSrc.includes('api.xinac.net') && i === 0 ||
        currentSrc.includes('api.afmax.cn') && i === 1 ||
        currentSrc.includes('icon.horse') && i === 2 ||
        currentSrc.includes('www.google.com/s2/favicons') && i === 3 ||
        currentSrc.includes('favicon.im') && i === 4) {
      // 当前 CDN 失败，尝试下一个
      if (i + 1 < CDN_PROVIDERS.length) {
        e.target._cdnIndex = i + 1;
        e.target.src = CDN_PROVIDERS[i + 1](originUrl);
        return;
      }
      // 所有 CDN 都失败，使用默认图标
      break;
    }
  }
  
  // 最后降级到默认图标
  e.target.src = '/default-favicon.png';
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

// 检查卡片是否被选中
function isCardSelected(card) {
  return props.selectedCards?.some(c => c.id === card.id) || false;
}
</script>

<style scoped>
/* ========== 网格布局 ========== */
.container {
  max-width: 68rem;
  margin: 0 auto;
  margin-top: 2.5vh;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 16px;
  position: relative;
  z-index: 1;
  padding: 0 1rem;
}

@media (max-width: 1200px) {
  .container { 
    grid-template-columns: repeat(5, 1fr); 
    gap: 14px;
  }
}
@media (max-width: 768px) {
  .container { 
    grid-template-columns: repeat(4, 1fr); 
    gap: 12px;
    padding: 0 0.8rem;
  }
}
@media (max-width: 480px) {
  .container { 
    grid-template-columns: repeat(3, 1fr); 
    gap: 10px;
    padding: 0 0.6rem;
  }
}

/* ========== 卡片主体 - 纯毛玻璃风格 ========== */
.link-item {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 16px;
  min-height: 88px;
  height: 88px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  position: relative;
  overflow: hidden;
  /* 精致的边框 */
  border: 1px solid rgba(255, 255, 255, 0.2);
  /* 柔和的阴影 - 移除inset避免白框 */
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.1);
  /* 平滑过渡 */
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}

/* 顶部高光条 - 已移除，避免白色横条视觉问题 */
/*
.link-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 15%;
  right: 15%;
  height: 1px;
  background: linear-gradient(90deg, 
    transparent, 
    rgba(255, 255, 255, 0.5), 
    transparent
  );
  border-radius: 1px;
}
*/

/* 悬停效果 */
.link-item:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: translateY(-8px) scale(1.03);
  border-color: rgba(255, 255, 255, 0.35);
  box-shadow: 0 16px 40px -8px rgba(0, 0, 0, 0.2);
}

/* 点击效果 */
.link-item:active {
  transform: translateY(-4px) scale(0.98);
  transition: transform 0.1s ease;
}

/* ========== 链接样式 ========== */
.link-item a {
  text-decoration: none;
  color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 8px 6px;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
}

/* ========== 图标样式 ========== */
.link-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.2));
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: 6px;
}

.link-item:hover .link-icon {
  transform: scale(1.15);
}

/* ========== 文字样式 ========== */
.link-text {
  font-size: 12px;
  font-weight: 500;
  text-align: center;
  color: #ffffff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  max-width: 100%;
  padding: 0 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.35;
  letter-spacing: 0.02em;
}

/* ========== 编辑模式 ========== */
.edit-mode .link-item a.drag-handle {
  pointer-events: none;
}

.edit-mode .link-item .link-icon,
.edit-mode .link-item .link-text {
  pointer-events: auto;
}

.edit-mode .link-item.draggable {
  cursor: grab;
}

.edit-mode .link-item.draggable:active {
  cursor: grabbing;
}

.edit-mode .link-item {
  border: 1.5px dashed transparent;
}

.edit-mode .link-item:hover {
  border-color: rgba(99, 179, 237, 0.6);
}

/* ========== 拖拽状态 ========== */
.sortable-ghost {
  opacity: 0.4;
}

.sortable-chosen {
  box-shadow: 0 0 0 2px rgba(99, 179, 237, 0.6);
}

.sortable-drag {
  opacity: 0.9;
  transform: rotate(1deg) scale(1.02);
}

/* ========== 编辑按钮 ========== */
.card-btns {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 3px;
  align-items: center;
  z-index: 10;
  pointer-events: auto;
}

.edit-mode .card-btns {
  pointer-events: auto !important;
  z-index: 100 !important;
}

.card-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #63b3ed;
  pointer-events: auto;
}

.card-btn {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  color: #fff;
  font-size: 10px;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  transition: background 0.2s ease, transform 0.15s ease;
}

.card-btn:hover {
  transform: scale(1.1);
}

.edit-btn:hover {
  background: rgba(99, 179, 237, 0.85);
}

.del-btn:hover {
  background: rgba(245, 101, 101, 0.85);
}

.edit-mode .card-btn,
.edit-mode .card-checkbox {
  pointer-events: auto !important;
}
</style>
