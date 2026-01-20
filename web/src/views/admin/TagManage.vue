<template>
  <div class="tag-manage">
    <div class="tag-header">
      <div class="header-content">
        <h2 class="page-title">管理标签</h2>
        <p class="page-desc">为卡片创建多维度分类标签</p>
      </div>
      <div class="tag-add">
        <input v-model="newTagName" placeholder="标签名称" class="input" maxlength="20" />
        <input v-model="newTagColor" type="color" class="color-input" title="选择标签颜色" />
        <button class="btn btn-primary" @click="addTag">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          添加标签
        </button>
      </div>
    </div>
    
    <div class="tag-content">
      <div v-if="tags.length === 0" class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
        <p>暂无标签</p>
        <p class="hint">创建第一个标签，开始为卡片添加多维度分类</p>
      </div>
      
      <div v-else class="tag-list">
        <div v-for="tag in tags" :key="tag.id" class="tag-item">
          <div class="tag-preview" :style="{ backgroundColor: tag.color }">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
          </div>
          
          <div class="tag-info">
            <input v-model="tag.name" @blur="updateTag(tag)" class="tag-name-input" maxlength="20" />
            <div class="tag-stats">
              <span class="card-count">{{ tag.cardCount || 0 }} 张卡片</span>
            </div>
          </div>
          
          <div class="tag-controls">
            <input v-model="tag.color" type="color" @change="updateTag(tag)" class="color-picker" title="更改颜色" />
            <div class="tag-order">
              <span class="order-label">排序</span>
              <input v-model.number="tag.order" type="number" @blur="updateTag(tag)" class="order-input" />
            </div>
          </div>
          
          <div class="tag-actions">
            <button class="btn btn-danger btn-icon" @click="deleteTag(tag.id)" title="删除标签">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                <path d="M10 11v6M14 11v6"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { 
  getTags, 
  addTag as apiAddTag, 
  updateTag as apiUpdateTag, 
  deleteTag as apiDeleteTag,
  getTagCardCount
} from '../../api';
import { useDataSync } from '../../composables/useDataSync';

const tags = ref([]);
const newTagName = ref('');
const newTagColor = ref('#2566d8');

useDataSync('TagManage', ({ isSelfChange }) => {
  if (!isSelfChange) {
    loadTags();
  }
});

onMounted(loadTags);

async function loadTags() {
  const res = await getTags();
  tags.value = res.data;
  
  // 加载每个标签的卡片数量
  for (const tag of tags.value) {
    try {
      const countRes = await getTagCardCount(tag.id);
      tag.cardCount = countRes.data.count;
    } catch (err) {
      tag.cardCount = 0;
    }
  }
}

async function addTag() {
  if (!newTagName.value.trim()) return;
  
  const maxOrder = tags.value.length
    ? Math.max(...tags.value.map(t => t.order || 0))
    : 0;
  
  const tagName = newTagName.value.trim();
  const tagColor = newTagColor.value;
  
  // 乐观更新：立即添加到列表
  const tempTag = {
    id: Date.now(), // 临时 ID
    name: tagName,
    color: tagColor,
    order: maxOrder + 1,
    cardCount: 0,
    _temp: true // 标记为临时数据
  };
  tags.value.push(tempTag);
  
  // 清空输入
  newTagName.value = '';
  newTagColor.value = '#2566d8';
  
  // 后台保存
  try {
    const res = await apiAddTag({ 
      name: tagName, 
      color: tagColor,
      order: maxOrder + 1 
    });
    
    // 更新为真实 ID
    const index = tags.value.findIndex(t => t.id === tempTag.id);
    if (index > -1) {
      tags.value[index] = {
        ...res.data,
        cardCount: 0
      };
    }
  } catch (err) {
    // 失败时移除临时标签
    const index = tags.value.findIndex(t => t.id === tempTag.id);
    if (index > -1) {
      tags.value.splice(index, 1);
    }
    alert('添加标签失败：' + (err.response?.data?.error || err.message));
  }
}

async function updateTag(tag) {
  if (tag._temp) return; // 跳过临时标签
  
  try {
    await apiUpdateTag(tag.id, { 
      name: tag.name, 
      color: tag.color,
      order: tag.order 
    });
  } catch (err) {
    alert('更新标签失败：' + (err.response?.data?.error || err.message));
    loadTags(); // 失败时重新加载
  }
}

async function deleteTag(id) {
  const tag = tags.value.find(t => t.id === id);
  if (!tag) return;
  
  const confirmMsg = tag.cardCount > 0
    ? `确定要删除标签"${tag.name}"吗？这将取消 ${tag.cardCount} 张卡片的关联。`
    : `确定要删除标签"${tag.name}"吗？`;
  
  if (!confirm(confirmMsg)) return;
  
  // 乐观更新：立即移除
  const index = tags.value.findIndex(t => t.id === id);
  if (index > -1) {
    tags.value.splice(index, 1);
  }
  
  // 后台删除
  try {
    await apiDeleteTag(id);
  } catch (err) {
    alert('删除标签失败：' + (err.response?.data?.error || err.message));
    loadTags(); // 失败时重新加载
  }
}
</script>

<style scoped>
.tag-manage {
  max-width: 1200px;
  width: 95%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.tag-header {
  background: linear-gradient(135deg, #1890ff 0%, #69c0ff 100%);
  border-radius: 16px;
  padding: 32px;
  margin-bottom: 20px;
  color: white;
  width: 100%;
  box-shadow: 0 10px 40px rgba(102, 126, 234, 0.3);
}

.header-content {
  margin-bottom: 24px;
}

.page-title {
  margin: 0 0 8px 0;
  font-size: 28px;
  font-weight: 600;
}

.page-desc {
  margin: 0;
  opacity: 0.9;
  font-size: 14px;
}

.tag-add {
  display: flex;
  gap: 12px;
  align-items: center;
}

.input {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  font-size: 14px;
  background: rgba(255, 255, 255, 0.95);
  transition: all 0.3s;
}

.input:focus {
  outline: none;
  border-color: white;
  background: white;
}

.color-input {
  width: 48px;
  height: 48px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  cursor: pointer;
  background: white;
  padding: 4px;
}

.color-input:hover {
  border-color: white;
}

.btn {
  padding: 12px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}

.btn-primary {
  background: white;
  color: #1890ff;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.tag-content {
  width: 100%;
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
}

.empty-state svg {
  margin-bottom: 20px;
  opacity: 0.3;
}

.empty-state p {
  margin: 8px 0;
}

.empty-state .hint {
  font-size: 14px;
  color: #bbb;
}

.tag-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tag-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 12px;
  transition: all 0.3s;
}

.tag-item:hover {
  background: #f0f1f3;
  transform: translateX(4px);
}

.tag-preview {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.tag-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tag-name-input {
  font-size: 16px;
  font-weight: 500;
  border: none;
  background: transparent;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.tag-name-input:hover {
  background: rgba(255, 255, 255, 0.5);
}

.tag-name-input:focus {
  outline: none;
  background: white;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
}

.tag-stats {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: #666;
}

.card-count {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tag-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.color-picker {
  width: 40px;
  height: 40px;
  border: 2px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  padding: 2px;
  background: white;
  transition: border-color 0.2s;
}

.color-picker:hover {
  border-color: #1890ff;
}

.tag-order {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: white;
  border-radius: 6px;
}

.order-label {
  font-size: 13px;
  color: #666;
  white-space: nowrap;
}

.order-input {
  width: 60px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  text-align: center;
}

.order-input:focus {
  outline: none;
  border-color: #1890ff;
}

.tag-actions {
  display: flex;
  gap: 8px;
}

.btn-icon {
  width: 40px;
  height: 40px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border: 1px solid #ddd;
}

.btn-danger {
  color: #dc3545;
  border-color: #dc3545;
}

.btn-danger:hover {
  background: #dc3545;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(220, 53, 69, 0.3);
}

@media (max-width: 768px) {
  .tag-manage {
    width: 100%;
  }
  
  .tag-header {
    border-radius: 0;
  }
  
  .tag-add {
    flex-direction: column;
  }
  
  .color-input {
    width: 100%;
  }
  
  .tag-item {
    flex-wrap: wrap;
  }
  
  .tag-controls {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
