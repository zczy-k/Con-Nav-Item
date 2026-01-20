<template>
  <div class="promo-manage">
    <!-- 加载遮罩 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span>{{ loadingText }}</span>
    </div>

    <!-- 头部添加区域 -->
    <div class="promo-header">
      <h2 class="page-title">宣传管理</h2>
      <div class="promo-form">
        <input v-model="form.img" placeholder="宣传图片链接" class="input" />
        <input v-model="form.url" placeholder="宣传跳转链接" class="input" />
        <select v-model="form.position" class="input select">
          <option value="left">左侧宣传</option>
          <option value="right">右侧宣传</option>
        </select>
        <button class="btn btn-primary" @click="handleAdd" :disabled="!form.img || !form.url">
          + 添加宣传
        </button>
      </div>
    </div>

    <!-- 左侧宣传 -->
    <div class="promo-section">
      <h3 class="section-title">📍 左侧宣传</h3>
      <div class="promo-list">
        <div v-if="leftPromos.length === 0" class="empty-state">暂无左侧宣传</div>
        <div v-for="item in leftPromos" :key="item.id" class="promo-card">
          <div class="promo-preview">
            <img :src="item.img" alt="宣传图片" @error="handleImgError" />
          </div>
          <div class="promo-info">
            <div class="promo-field">
              <label>图片链接</label>
              <input v-model="item.img" class="input" @blur="handleUpdate(item)" />
            </div>
            <div class="promo-field">
              <label>跳转链接</label>
              <input v-model="item.url" class="input" @blur="handleUpdate(item)" />
            </div>
          </div>
          <div class="promo-actions">
            <button class="btn btn-danger" @click="handleDelete(item)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧宣传 -->
    <div class="promo-section">
      <h3 class="section-title">📍 右侧宣传</h3>
      <div class="promo-list">
        <div v-if="rightPromos.length === 0" class="empty-state">暂无右侧宣传</div>
        <div v-for="item in rightPromos" :key="item.id" class="promo-card">
          <div class="promo-preview">
            <img :src="item.img" alt="宣传图片" @error="handleImgError" />
          </div>
          <div class="promo-info">
            <div class="promo-field">
              <label>图片链接</label>
              <input v-model="item.img" class="input" @blur="handleUpdate(item)" />
            </div>
            <div class="promo-field">
              <label>跳转链接</label>
              <input v-model="item.url" class="input" @blur="handleUpdate(item)" />
            </div>
          </div>
          <div class="promo-actions">
            <button class="btn btn-danger" @click="handleDelete(item)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useDataSync } from '../../composables/useDataSync';

const BASE = '/api';
const getToken = () => localStorage.getItem('token') || '';
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` });

const allPromos = ref([]);
const loading = ref(false);
const loadingText = ref('加载中...');
const form = ref({ img: '', url: '', position: 'left' });

const leftPromos = computed(() => allPromos.value.filter(item => item.position === 'left'));
const rightPromos = computed(() => allPromos.value.filter(item => item.position === 'right'));

useDataSync('PromoManage', ({ isSelfChange }) => {
  if (!isSelfChange) {
    loadPromos();
  }
});

onMounted(() => {
  loadPromos();
});

async function loadPromos() {
  loading.value = true;
  loadingText.value = '加载中...';
  try {
    const res = await axios.get(`${BASE}/promos`);
    let items = [];
    if (Array.isArray(res.data)) {
      items = res.data;
    } else if (res.data && Array.isArray(res.data.data)) {
      items = res.data.data;
    }
    allPromos.value = items;
  } catch (err) {
    console.error('加载宣传失败:', err);
    alert('加载宣传失败: ' + (err.response?.data?.error || err.message));
  } finally {
    loading.value = false;
  }
}

async function handleAdd() {
  if (!form.value.img || !form.value.url) {
    alert('请填写宣传图片链接和跳转链接');
    return;
  }
  loading.value = true;
  loadingText.value = '添加中...';
  try {
    await axios.post(`${BASE}/promos`, form.value, { headers: authHeaders() });
    form.value = { img: '', url: '', position: 'left' };
    await loadPromos();
  } catch (err) {
    alert('添加失败: ' + (err.response?.data?.error || err.message));
    loading.value = false;
  }
}

async function handleUpdate(item) {
  try {
    await axios.put(`${BASE}/promos/${item.id}`, { img: item.img, url: item.url }, { headers: authHeaders() });
  } catch (err) {
    alert('更新失败: ' + (err.response?.data?.error || err.message));
    await loadPromos();
  }
}

async function handleDelete(item) {
  if (!confirm(`确定删除这个宣传吗？`)) return;
  loading.value = true;
  loadingText.value = '删除中...';
  try {
    await axios.delete(`${BASE}/promos/${item.id}`, { headers: authHeaders() });
    await loadPromos();
  } catch (err) {
    alert('删除失败: ' + (err.response?.data?.error || err.message));
    loading.value = false;
  }
}

function handleImgError(e) {
  e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect fill="%23f0f0f0" width="100" height="60"/><text x="50" y="35" text-anchor="middle" fill="%23999" font-size="12">图片加载失败</text></svg>';
}
</script>

<style scoped>
.promo-manage {
  max-width: 900px;
  width: 95%;
  margin: 0 auto;
  position: relative;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  gap: 16px;
  font-size: 16px;
  color: #1890ff;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #e0e0e0;
  border-top-color: #1890ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.promo-header {
  background: linear-gradient(135deg, #1890ff 0%, #69c0ff 100%);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  color: white;
}

.page-title {
  font-size: 1.4rem;
  font-weight: 600;
  margin: 0 0 16px 0;
  text-align: center;
}

.promo-form {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.promo-form .input {
  flex: 1;
  min-width: 180px;
  max-width: 250px;
}

.promo-form .select {
  min-width: 120px;
}

.promo-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 12px;
  padding-left: 8px;
  border-left: 3px solid #1890ff;
}

.promo-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #999;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.promo-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.promo-preview {
  width: 120px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  background: #f5f5f5;
  flex-shrink: 0;
}

.promo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.promo-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.promo-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.promo-field label {
  font-size: 0.85rem;
  color: #666;
  width: 60px;
  flex-shrink: 0;
}

.promo-field .input {
  flex: 1;
}

.promo-actions {
  flex-shrink: 0;
}

.input {
  padding: 10px 14px;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  font-size: 0.9rem;
  transition: all 0.2s;
  color: #333;
  background: white;
}

.input:focus {
  outline: none;
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: white;
  color: #1890ff;
}

.btn-primary:hover:not(:disabled) {
  background: #f0f7ff;
}

.btn-danger {
  background: #fff1f0;
  color: #ff4d4f;
}

.btn-danger:hover {
  background: #ff4d4f;
  color: white;
}

@media (max-width: 600px) {
  .promo-form {
    flex-direction: column;
  }
  
  .promo-form .input,
  .promo-form .select {
    max-width: none;
  }
  
  .promo-card {
    flex-direction: column;
    align-items: stretch;
  }
  
  .promo-preview {
    width: 100%;
    height: 120px;
  }
  
  .promo-field {
    flex-direction: column;
    align-items: stretch;
  }
  
  .promo-field label {
    width: auto;
    margin-bottom: 4px;
  }
  
  .promo-actions {
    text-align: center;
  }
}
</style>
