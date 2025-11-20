<template>
  <div ref="cardGridRef" class="container card-grid" :class="[animationClass, { 'edit-mode': editMode }]">
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

// 动画状态
const animationClass = ref('');
const animationType = ref('slideUp'); // 'slideUp' 或 'radial'

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

// 触发动画（极简版：只在首次加载时有轻微淡入）
let isFirstLoad = true;

function triggerAnimation() {
  // 首次加载：极快淡入（100ms）
  if (isFirstLoad) {
    animationType.value = 'instant';
    animationClass.value = 'animate-instant';
    isFirstLoad = false;
    
    setTimeout(() => {
      animationClass.value = '';
    }, 150);
    return;
  }
  
  // 后续切换：无动画，立即显示
  animationClass.value = '';
}

// 获取卡片样式（用于延迟动画 + 随机渐变色）
function getCardStyle(index) {
  const gradient = gradients[index % gradients.length];
  const style = {
    background: gradient
  };
  
  if (!animationClass.value) return style;
  
  // 在移动设备上不使用延迟动画
  const isMobile = window.innerWidth <= 480;
  if (isMobile) {
    style.animationDelay = '0s';
    return style;
  }
  
  if (animationType.value === 'slideUp') {
    // 从下往上：按索引顺序延迟
    style.animationDelay = `${index * 0.02}s`;
  } else if (animationType.value === 'radial') {
    // 从中心扩散：根据距离中心的位置计算延迟
    const cols = window.innerWidth <= 768 ? 3 : (window.innerWidth <= 1200 ? 4 : 8);
    const row = Math.floor(index / cols);
    const col = index % cols;
    const centerCol = Math.floor(cols / 2);
    const distance = Math.abs(col - centerCol) + row;
    style.animationDelay = `${distance * 0.03}s`;
  } else if (animationType.value === 'fadeIn') {
    // 淡入动画：随机延迟
    style.animationDelay = `${Math.random() * 0.2}s`;
  } else if (animationType.value === 'slideLeft') {
    // 从左往右：按行延迟
    const cols = window.innerWidth <= 768 ? 3 : (window.innerWidth <= 1200 ? 4 : 8);
    const row = Math.floor(index / cols);
    style.animationDelay = `${row * 0.04}s`;
  } else if (animationType.value === 'slideRight') {
    // 从右往左：按行延迟（反向）
    const cols = window.innerWidth <= 768 ? 3 : (window.innerWidth <= 1200 ? 4 : 8);
    const row = Math.floor(index / cols);
    const col = index % cols;
    style.animationDelay = `${(row + (cols - col - 1) * 0.01) * 0.03}s`;
  } else if (animationType.value === 'convergeIn') {
    // 从两边往中间靠拢：根据列的位置计算延迟
    const cols = window.innerWidth <= 768 ? 3 : (window.innerWidth <= 1200 ? 4 : 8);
    const col = index % cols;
    const centerCol = Math.floor(cols / 2);
    const distanceFromCenter = Math.abs(col - centerCol);
    // 边缘的元素先出现，中间的最后出现
    style.animationDelay = `${(cols - distanceFromCenter - 1) * 0.03}s`;
  } else if (animationType.value === 'flipIn') {
    // 翻转入场：按对角线延迟
    const cols = window.innerWidth <= 768 ? 3 : (window.innerWidth <= 1200 ? 4 : 8);
    const row = Math.floor(index / cols);
    const col = index % cols;
    style.animationDelay = `${(row + col) * 0.02}s`;
  }
  
  return style;
}

// 提取域名
function getDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
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

// 随机渐变色配置（透明度80%）
const gradients = [
  'linear-gradient(135deg, rgba(102, 126, 234, 0.8) 0%, rgba(118, 75, 162, 0.8) 100%)',
  'linear-gradient(135deg, rgba(240, 147, 251, 0.8) 0%, rgba(245, 87, 108, 0.8) 100%)',
  'linear-gradient(135deg, rgba(79, 172, 254, 0.8) 0%, rgba(0, 242, 254, 0.8) 100%)',
  'linear-gradient(135deg, rgba(67, 233, 123, 0.8) 0%, rgba(56, 249, 215, 0.8) 100%)',
  'linear-gradient(135deg, rgba(250, 112, 154, 0.8) 0%, rgba(254, 225, 64, 0.8) 100%)',
  'linear-gradient(135deg, rgba(48, 207, 208, 0.8) 0%, rgba(51, 8, 103, 0.8) 100%)',
  'linear-gradient(135deg, rgba(168, 237, 234, 0.8) 0%, rgba(254, 214, 227, 0.8) 100%)',
  'linear-gradient(135deg, rgba(255, 154, 158, 0.8) 0%, rgba(254, 207, 239, 0.8) 100%)',
  'linear-gradient(135deg, rgba(255, 236, 210, 0.8) 0%, rgba(252, 182, 159, 0.8) 100%)',
  'linear-gradient(135deg, rgba(255, 110, 127, 0.8) 0%, rgba(191, 233, 255, 0.8) 100%)',
  'linear-gradient(135deg, rgba(224, 195, 252, 0.8) 0%, rgba(142, 197, 252, 0.8) 100%)',
  'linear-gradient(135deg, rgba(248, 177, 149, 0.8) 0%, rgba(246, 114, 128, 0.8) 100%)',
  'linear-gradient(135deg, rgba(210, 153, 194, 0.8) 0%, rgba(254, 249, 215, 0.8) 100%)',
  'linear-gradient(135deg, rgba(253, 219, 146, 0.8) 0%, rgba(209, 253, 255, 0.8) 100%)',
  'linear-gradient(135deg, rgba(152, 144, 227, 0.8) 0%, rgba(177, 244, 207, 0.8) 100%)',
  'linear-gradient(135deg, rgba(235, 192, 253, 0.8) 0%, rgba(217, 222, 216, 0.8) 100%)',
  'linear-gradient(135deg, rgba(150, 251, 196, 0.8) 0%, rgba(249, 245, 134, 0.8) 100%)',
  'linear-gradient(135deg, rgba(253, 160, 133, 0.8) 0%, rgba(246, 211, 101, 0.8) 100%)'
];
</script>

<style scoped>
.container {
  max-width: 70rem;
  margin: 0 auto;
  margin-top: 2vh;
  width: 100%;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 15px;
  opacity: 1;
  transition: opacity 0.2s ease;
  position: relative;
  z-index: 1;
}
@media (max-width: 1200px) {
  .container {
    grid-template-columns: repeat(4, 1fr);
  }
}
@media (max-width: 768px) {
  .container {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (max-width: 480px) {
  .container {
    grid-template-columns: repeat(3, 1fr);
  }
}
.link-item {
  /* background 由 JS 动态设置 */
  backdrop-filter: blur(8px) saturate(120%);
  -webkit-backdrop-filter: blur(8px) saturate(120%);
  border-radius: 16px;
  padding: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 
    0 2px 8px rgba(0, 0, 0, 0.15),
    0 4px 16px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
  text-align: center;
  min-height: 85px;
  height: 85px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.3);
  position: relative;
  overflow: hidden;
}

/* 苹果风格光晕效果 */
.link-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  transition: left 0.5s;
}

.link-item:hover::before {
  left: 100%;
}

.link-item:hover {
  filter: brightness(1.08);
  transform: translateY(-4px) scale(1.02);
  box-shadow: 
    0 4px 16px rgba(0, 0, 0, 0.2),
    0 8px 32px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
  border-color: rgba(255, 255, 255, 0.5);
}

.link-item:active {
  transform: translateY(-2px) scale(0.98);
  transition: all 0.1s;
}
.link-item a {
  /* margin-top: 8px; */
  text-decoration: none;
  color: #ffffff;
  font-weight: 600;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 0;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

/* 在编辑模式下，拖拽手柄不应该阻止按钮点击 */
.edit-mode .link-item a.drag-handle {
  pointer-events: none;
}

.edit-mode .link-item .link-icon,
.edit-mode .link-item .link-text {
  pointer-events: auto;
}
.link-icon {
  width: 28px;
  height: 28px;
  margin: 4px auto;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.link-item:hover .link-icon {
  transform: scale(1.15);
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.4));
}
.link-text {
  padding-right: 4px;
  padding-left: 4px;
  font-size: 13px;
  font-weight: normal;
  text-align: center;
  word-break: break-all;
  max-width: 100%;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  line-height: 1.2;
  min-height: 1.5em;
  letter-spacing: -0.01em;
  color: #ffffff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

/* 动画样式 */
/* 从下往上滑入动画 */
.animate-slideUp .link-item {
  animation: slideUpIn 0.3s ease-out;
}

@keyframes slideUpIn {
  0% {
    opacity: 0;
    transform: translateY(30px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 从中心扩散动画 */
.animate-radial .link-item {
  animation: radialIn 0.3s ease-out;
}

@keyframes radialIn {
  0% {
    opacity: 0;
    transform: scale(0.3);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

/* 淡入动画 */
.animate-fadeIn .link-item {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  0% {
    opacity: 0;
    transform: translateY(10px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 从左滑入动画 */
.animate-slideLeft .link-item {
  animation: slideLeftIn 0.3s ease-out;
}

@keyframes slideLeftIn {
  0% {
    opacity: 0;
    transform: translateX(-50px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

/* 从右滑入动画 */
.animate-slideRight .link-item {
  animation: slideRightIn 0.3s ease-out;
}

@keyframes slideRightIn {
  0% {
    opacity: 0;
    transform: translateX(50px);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}

/* 从两边往中间靠拢动画 */
.animate-convergeIn .link-item {
  animation: convergeIn 0.3s ease-out;
}

.animate-convergeIn .link-item:nth-child(8n+1),
.animate-convergeIn .link-item:nth-child(8n+8) {
  /* 最边缘的列（第1列和第8列） */
  transform: translateX(-100px);
}

.animate-convergeIn .link-item:nth-child(8n+2),
.animate-convergeIn .link-item:nth-child(8n+7) {
  /* 次边缘的列（第2列和第7列） */
  transform: translateX(-60px);
}

.animate-convergeIn .link-item:nth-child(8n+3),
.animate-convergeIn .link-item:nth-child(8n+6) {
  /* 第3列和第6列 */
  transform: translateX(-30px);
}

.animate-convergeIn .link-item:nth-child(8n+4),
.animate-convergeIn .link-item:nth-child(8n+5) {
  /* 中间的列（第4列和第5列） */
  transform: translateY(-30px);
}

/* 在中等屏幕上（4列布局） */
@media (max-width: 1200px) and (min-width: 769px) {
  .animate-convergeIn .link-item:nth-child(4n+1),
  .animate-convergeIn .link-item:nth-child(4n+4) {
    transform: translateX(-60px);
  }
  
  .animate-convergeIn .link-item:nth-child(4n+2),
  .animate-convergeIn .link-item:nth-child(4n+3) {
    transform: translateY(-30px);
  }
}

/* 在小屏幕上（3列布局） */
@media (max-width: 768px) {
  .animate-convergeIn .link-item:nth-child(3n+1),
  .animate-convergeIn .link-item:nth-child(3n+3) {
    transform: translateX(-50px);
  }
  
  .animate-convergeIn .link-item:nth-child(3n+2) {
    transform: translateY(-30px);
  }
}

@keyframes convergeIn {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
    transform: translate(0, 0);
  }
}

/* 翻转入场动画 */
.animate-flipIn .link-item {
  animation: flipIn 0.3s ease-out;
}

@keyframes flipIn {
  0% {
    opacity: 0;
    transform: rotateY(-90deg);
  }
  50% {
    opacity: 1;
    transform: rotateY(-45deg);
  }
  100% {
    opacity: 1;
    transform: rotateY(0deg);
  }
}

/* 优化过渡效果 */
.container:not(.animate-slideUp):not(.animate-radial):not(.animate-fadeIn) .link-item {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* 响应式动画调整 */
@media (max-width: 768px) {
  .animate-slideUp .link-item {
    animation-duration: 0.4s;
  }
  
  .animate-radial .link-item {
    animation-duration: 0.4s;
  }
}

/* 减少动画延迟在移动设备上 */
@media (max-width: 480px) {
  .animate-slideUp .link-item {
    animation-delay: 0s !important;
  }
  
  .animate-radial .link-item {
    animation-delay: 0s !important;
  }
}

/* 为移动设备提供更快的动画 */
@media (prefers-reduced-motion: reduce) {
  .animate-slideUp .link-item,
  .animate-radial .link-item {
    animation: none;
    opacity: 1;
    transform: none;
  }
}

/* 拖拽相关样式 */
.edit-mode .link-item.draggable {
  cursor: move;
  cursor: grab;
}

.edit-mode .link-item.draggable:active {
  cursor: grabbing;
}

.sortable-ghost {
  opacity: 0.5;
  background-color: rgba(255, 255, 255, 0.5);
}

.sortable-chosen {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
}

.sortable-drag {
  opacity: 0.8;
  transform: rotate(2deg);
}

/* 编辑模式下的视觉提示 */
.edit-mode .link-item {
  border: 2px dashed transparent;
  transition: all 0.2s;
  position: relative;
}

.edit-mode .link-item:hover {
  border-color: rgba(59, 130, 246, 0.5);
}

.card-btns {
  position: absolute;
  top: 2px;
  right: 2px;
  display: flex;
  gap: 4px;
  align-items: center;
  z-index: 10;
  pointer-events: auto;
}

.card-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #667eea;
  z-index: 11;
  pointer-events: auto;
}

.card-btn {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 11;
  pointer-events: auto;
}

.card-btn:hover {
  transform: scale(1.1);
}

.edit-btn:hover {
  background: rgba(59, 130, 246, 0.9);
}

.del-btn:hover {
  background: rgba(239, 68, 68, 0.9);
}

/* 极速显示动画（首次加载） */
.animate-instant .link-item {
  animation: instantShow 0.1s ease-out forwards;
}

@keyframes instantShow {
  from {
    opacity: 0.7;
  }
  to {
    opacity: 1;
  }
}

/* 默认状态：立即可见 */
.link-item {
  opacity: 1;
}
</style>
