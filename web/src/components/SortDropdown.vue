<template>
  <div class="sort-dropdown" ref="dropdownRef">
    <button 
      class="sort-trigger" 
      @click.stop="toggleDropdown"
      :title="'排序方式: ' + currentSortLabel"
    >
      <svg class="sort-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 6h18M6 12h12M9 18h6"/>
      </svg>
      <span class="sort-label">{{ currentSortLabel }}</span>
      <svg class="chevron-icon" :class="{ 'open': isOpen }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>
    
    <transition name="dropdown">
      <div v-if="isOpen" class="sort-menu" @click.stop>
        <div class="sort-menu-header">排序方式</div>
        <div class="sort-menu-items">
          <button 
            v-for="option in sortOptions" 
            :key="option.value"
            class="sort-menu-item"
            :class="{ 'active': modelValue === option.value }"
            @click="selectSort(option.value)"
          >
            <span class="sort-item-icon">{{ option.icon }}</span>
            <span class="sort-item-label">{{ option.label }}</span>
            <svg v-if="modelValue === option.value" class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: 'time_desc'
  }
});

const emit = defineEmits(['update:modelValue']);

const isOpen = ref(false);
const dropdownRef = ref(null);

const sortOptions = [
  { value: 'time_desc', label: '时间 (最新)', icon: '🕐' },
  { value: 'time_asc', label: '时间 (最旧)', icon: '🕰️' },
  { value: 'name_asc', label: '名称 A-Z', icon: '🔤' },
  { value: 'name_desc', label: '名称 Z-A', icon: '🔡' },
  { value: 'custom', label: '自定义排序', icon: '✋' }
];

const currentSortLabel = computed(() => {
  const option = sortOptions.find(o => o.value === props.modelValue);
  return option ? option.label : '排序';
});

function toggleDropdown() {
  isOpen.value = !isOpen.value;
}

function selectSort(value) {
  emit('update:modelValue', value);
  isOpen.value = false;
}

function handleClickOutside(event) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.sort-dropdown {
  position: relative;
  z-index: 100;
}

.sort-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.sort-trigger:hover {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.35);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.sort-trigger:active {
  transform: translateY(0);
}

.sort-icon {
  flex-shrink: 0;
  opacity: 0.9;
}

.sort-label {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chevron-icon {
  flex-shrink: 0;
  opacity: 0.7;
  transition: transform 0.2s ease;
}

.chevron-icon.open {
  transform: rotate(180deg);
}

.sort-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 180px;
  background: rgba(30, 30, 35, 0.98);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 
    0 10px 40px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  overflow: hidden;
}

.sort-menu-header {
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.sort-menu-items {
  padding: 6px;
}

.sort-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.sort-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.sort-menu-item.active {
  background: rgba(99, 179, 237, 0.2);
  color: #63b3ed;
}

.sort-item-icon {
  font-size: 15px;
  width: 22px;
  text-align: center;
}

.sort-item-label {
  flex: 1;
}

.check-icon {
  flex-shrink: 0;
  color: #63b3ed;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}

@media (max-width: 768px) {
  .sort-trigger {
    padding: 6px 10px;
    font-size: 12px;
  }
  
  .sort-label {
    display: none;
  }
  
  .sort-menu {
    min-width: 160px;
    right: -10px;
  }
}
</style>
