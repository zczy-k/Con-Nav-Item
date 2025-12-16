<template>
  <div class="ad-manage">
    <!-- 加载遮罩 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span>{{ loadingText }}</span>
    </div>

    <!-- 头部添加区域 -->
    <div class="ad-header">
      <h2 class="page-title">广告管理</h2>
      <div class="ad-form">
        <input v-model="form.img" placeholder="广告图片链接" class="input" />
        <input v-model="form.url" placeholder="广告跳转链接" class="input" />
        <select v-model="form.position" class="input select">
          <option value="left">左侧广告</option>
          <option value="right">右侧广告</option>
        </select>
        <button class="btn btn-primary" @click="handleAdd" :disabled="!form.img || !form.url">
          + 添加广告
        </button>
      </div>
    </div>

    <!-- 左侧广告 -->
    <div class="ad-section">
      <h3 class="section-title">📍 左侧广告</h3>
      <div class="ad-list">
        <div v-if="leftAds.length === 0" class="empty-state">暂无左侧广告</div>
        <div v-for="ad in leftAds" :key="ad.id" class="ad-card">
          <div class="ad-preview">
            <img :src="ad.img" alt="广告图片" @error="handleImgError" />
          </div>
          <div class="ad-info">
            <div class="ad-field">
              <label>图片链接</label>
              <input v-model="ad.img" class="input" @blur="handleUpdate(ad)" />
            </div>
            <div class="ad-field">
              <label>跳转链接</label>
              <input v-model="ad.url" class="input" @blur="handleUpdate(ad)" />
            </div>
          </div>
          <div class="ad-actions">
            <button class="btn btn-danger" @click="handleDelete(ad)">删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧广告 -->
    <div class="ad-section">
      <h3 class="section-title">📍 右侧广告</h3>
      <div class="ad-list">
        <div v-if="rightAds.length === 0" class="empty-state">暂无右侧广告</div>
        <div v-for="ad in rightAds" :key="ad.id" class="ad-card">
          <div class="ad-preview">
            <img :src="ad.img" alt="广告图片" @error="handleImgError" />
          </div>
          <div class="ad-info">
            <div class="ad-field">
              <label>图片链接</label>
              <input v-model="ad.img" class="input" @blur="handleUpdate(ad)" />
            </div>
            <div class="ad-field">
              <label>跳转链接</label>
              <input v-model="ad.url" class="input" @blur="handleUpdate(ad)" />
            </div>
          </div>
          <div class="ad-actions">
            <button class="btn btn-danger" @click="handleDelete(ad)">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';

const BASE = '/api';
const getToken = () => localStorage.getItem('token') || '';
const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` });

const allAds = ref([]);
const loading = ref(false);
const loadingText = ref('加载中...');
const form = ref({ img: '', url: '', position: 'left' });

const leftAds = computed(() => allAds.value.filter(ad => ad.position === 'left'));
const rightAds = computed(() => allAds.value.filter(ad => ad.position === 'right'));

onMounted(() => {
  loadAds();
});

async function loadAds() {
  loading.value = true;
  loadingText.value = '加载中...';
  try {
    const res = await axios.get(`${BASE}/ads`);
    let ads = [];
    if (Array.isArray(res.data)) {
      ads = res.data;
    } else if (res.data && Array.isArray(res.data.data)) {
      ads = res.data.data;
    }
    allAds.value = ads;
  } catch (err) {
    console.error('加载广告失败:', err);
    alert('加载广告失败: ' + (err.response?.data?.error || err.message));
  } finally {
    loading.value = false;
  }
}

async function handleAdd() {
  if (!form.value.img || !form.value.url) {
    alert('请填写广告图片链接和跳转链接');
    return;
  }
  loading.value = true;
  loadingText.value = '添加中...';
  try {
    await axios.post(`${BASE}/ads`, form.value, { headers: authHeaders() });
    form.value = { img: '', url: '', position: 'left' };
    await loadAds();
  } catch (err) {
    alert('添加失败: ' + (err.response?.data?.error || err.message));
    loading.value = false;
  }
}

async function handleUpdate(ad) {
  try {
    await axios.put(`${BASE}/ads/${ad.id}`, { img: ad.img, url: ad.url }, { headers: authHeaders() });
  } catch (err) {
    alert('更新失败: ' + (err.response?.data?.error || err.message));
    await loadAds();
  }
}

async function handleDelete(ad) {
  if (!confirm(`确定删除这个广告吗？`)) return;
  loading.value = true;
  loadingText.value = '删除中...';
  try {
    await axios.delete(`${BASE}/ads/${ad.id}`, { headers: authHeaders() });
    await loadAds();
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
.ad-manage {
  max-width: 900px;
  width: 95%;
  margin: 0 auto;
  position: relative;
}

/* 加载遮罩 */
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

/* 头部 */
.ad-header {
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

.ad-form {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.ad-form .input {
  flex: 1;
  min-width: 180px;
  max-width: 250px;
}

.ad-form .select {
  min-width: 120px;
}

/* 区块 */
.ad-section {
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

/* 广告列表 */
.ad-list {
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

/* 广告卡片 */
.ad-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.ad-preview {
  width: 120px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  background: #f5f5f5;
  flex-shrink: 0;
}

.ad-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ad-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ad-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ad-field label {
  font-size: 0.85rem;
  color: #666;
  width: 60px;
  flex-shrink: 0;
}

.ad-field .input {
  flex: 1;
}

.ad-actions {
  flex-shrink: 0;
}

/* 表单元素 */
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

/* 响应式 */
@media (max-width: 600px) {
  .ad-form {
    flex-direction: column;
  }
  
  .ad-form .input,
  .ad-form .select {
    max-width: none;
  }
  
  .ad-card {
    flex-direction: column;
    align-items: stretch;
  }
  
  .ad-preview {
    width: 100%;
    height: 120px;
  }
  
  .ad-field {
    flex-direction: column;
    align-items: stretch;
  }
  
  .ad-field label {
    width: auto;
    margin-bottom: 4px;
  }
  
  .ad-actions {
    text-align: center;
  }
}
</style>
