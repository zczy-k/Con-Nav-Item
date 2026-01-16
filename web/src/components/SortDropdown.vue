<template>
  <div class="sort-dropdown" @click.stop>
    <button class="sort-trigger" @click="toggleDropdown" :title="currentSortLabel">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4"/>
      </svg>
      <span class="sort-label">{{ currentSortLabel }}</span>
      <svg class="chevron" :class="{ open: isOpen }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>
    
    <transition name="dropdown">
      <div v-if="isOpen" class="sort-menu">
        <div 
          v-for="option in sortOptions" 
          :key="option.value"
          class="sort-option"
          :class="{ active: currentSort === option.value }"
          @click="selectSort(option.value)"
        >
          <span class="option-icon">{{ option.icon }}</span>
          <span class="option-label">{{ option.label }}</span>
          <svg v-if="currentSort === option.value" class="check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
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
  },
  storageKey: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:modelValue', 'change']);

const isOpen = ref(false);

const sortOptions = [
  { value: 'time_desc', label: '时间 (最新)', icon: '🕐' },
  { value: 'time_asc', label: '时间 (最旧)', icon: '🕰️' },
  { value: 'freq_desc', label: '使用频率 (高)', icon: '🔥' },
  { value: 'freq_asc', label: '使用频率 (低)', icon: '❄️' },
  { value: 'name_asc', label: '名称 A-Z', icon: '🔤' },
  { value: 'name_desc', label: '名称 Z-A', icon: '🔠' }
];

const currentSort = computed(() => props.modelValue);

const currentSortLabel = computed(() => {
  const option = sortOptions.find(o => o.value === currentSort.value);
  return option ? option.label : '排序';
});

function toggleDropdown() {
  isOpen.value = !isOpen.value;
}

function selectSort(value) {
  emit('update:modelValue', value);
  emit('change', value);
  
  if (props.storageKey) {
    try {
      localStorage.setItem(props.storageKey, value);
    } catch (e) {}
  }
  
  isOpen.value = false;
}

function closeDropdown() {
  isOpen.value = false;
}

onMounted(() => {
  document.addEventListener('click', closeDropdown);
  
  if (props.storageKey) {
    try {
      const saved = localStorage.getItem(props.storageKey);
      if (saved && sortOptions.some(o => o.value === saved)) {
        emit('update:modelValue', saved);
      }
    } catch (e) {}
  }
});

onUnmounted(() => {
  document.removeEventListener('click', closeDropdown);
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
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.sort-trigger:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.sort-label {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chevron {
  transition: transform 0.2s ease;
  opacity: 0.7;
}

.chevron.open {
  transform: rotate(180deg);
}

.sort-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 180px;
  background: rgba(30, 30, 35, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  padding: 6px;
  box-shadow: 
    0 10px 40px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(255, 255, 255, 0.05);
  overflow: hidden;
}

.sort-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  transition: all 0.15s ease;
}

.sort-option:hover {
  background: rgba(255, 255, 255, 0.1);
}

.sort-option.active {
  background: linear-gradient(135deg, rgba(99, 179, 237, 0.25) 0%, rgba(99, 179, 237, 0.15) 100%);
  color: #63b3ed;
}

.option-icon {
  font-size: 14px;
  width: 20px;
  text-align: center;
}

.option-label {
  flex: 1;
}

.check-icon {
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
    padding: 5px 10px;
    font-size: 12px;
  }
  
  .sort-label {
    display: none;
  }
  
  .sort-menu {
    right: -20px;
    min-width: 160px;
  }
}
</style>
