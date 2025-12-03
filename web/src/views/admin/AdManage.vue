<template>
  <div class="ad-manage">
    <div class="ad-header">
      <form class="ad-add-row" @submit.prevent="handleAddAd">
        <input v-model="newAdImg" placeholder="广告图片链接" class="input" />
        <input v-model="newAdUrl" placeholder="广告跳转链接" class="input" />
        <select v-model="newAdPos" class="input select-input">
          <option value="left">左侧广告</option>
          <option value="right">右侧广告</option>
        </select>
        <button class="btn" type="submit">添加广告</button>
      </form>
    </div>
    <div class="ad-section">
      <h3 class="section-title">左侧广告列表</h3>
      <div class="ad-card">
        <table class="ad-table">
          <thead><tr><th>图片</th><th>跳转链接</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="ad in leftAds" :key="ad.id">
              <td><input v-model="ad.img" @blur="updateAd(ad)" class="input" /></td>
              <td><input v-model="ad.url" @blur="updateAd(ad)" class="input" /></td>
              <td><button class="btn btn-danger" @click="deleteAd(ad.id)">删除广告</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="ad-section">
      <h3 class="section-title">右侧广告列表</h3>
      <div class="ad-card">
        <table class="ad-table">
          <thead><tr><th>图片</th><th>跳转链接</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="ad in rightAds" :key="ad.id">
              <td><input v-model="ad.img" @blur="updateAd(ad)" class="input" /></td>
              <td><input v-model="ad.url" @blur="updateAd(ad)" class="input" /></td>
              <td><button class="btn btn-danger" @click="deleteAd(ad.id)">删除广告</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getAds, addAd as apiAddAd, updateAd as apiUpdateAd, deleteAd as apiDeleteAd } from '../../api';

const leftAds = ref([]);
const rightAds = ref([]);
const newAdImg = ref('');
const newAdUrl = ref('');
const newAdPos = ref('left');

onMounted(loadAds);

async function loadAds() {
  try {
    const res = await getAds();
    const ads = Array.isArray(res.data) ? res.data : [];
    leftAds.value = ads.filter(ad => ad.position === 'left');
    rightAds.value = ads.filter(ad => ad.position === 'right');
  } catch (err) {
    console.error('加载广告失败:', err);
  }
}
async function handleAddAd() {
  if (!newAdImg.value || !newAdUrl.value) {
    alert('请填写广告图片链接和跳转链接');
    return;
  }
  try {
    await apiAddAd({ position: newAdPos.value, img: newAdImg.value, url: newAdUrl.value });
    newAdImg.value = '';
    newAdUrl.value = '';
    newAdPos.value = 'left';
    await loadAds();
  } catch (err) {
    alert('添加广告失败：' + (err.response?.data?.error || err.message));
  }
}
async function updateAd(ad) {
  try {
    await apiUpdateAd(ad.id, { img: ad.img, url: ad.url });
  } catch (err) {
    alert('更新广告失败：' + (err.response?.data?.error || err.message));
    await loadAds();
  }
}
async function deleteAd(id) {
  if (!confirm('确定要删除这个广告吗？')) return;
  
  // 乐观更新：立即从列表中移除
  const leftIndex = leftAds.value.findIndex(ad => ad.id === id);
  const rightIndex = rightAds.value.findIndex(ad => ad.id === id);
  
  if (leftIndex > -1) {
    leftAds.value.splice(leftIndex, 1);
  }
  if (rightIndex > -1) {
    rightAds.value.splice(rightIndex, 1);
  }
  
  try {
    await apiDeleteAd(id);
  } catch (error) {
    console.error('删除广告失败:', error);
    // 失败时重新加载
    await loadAds();
  }
}
</script>

<style scoped>
.ad-manage {
  max-width: 1400px;
  width: 90%;
  margin: 0 auto;
}
.page-title {
  text-align: center;
  font-size: 2rem;
  font-weight: bold;
  margin: 32px 0 32px 0;
  letter-spacing: 2px;
  color: #222;
}
.section-title {
  text-align: left;
  font-size: 1.2rem;
  font-weight: bold;
  margin-bottom: 12px;
  color: #2566d8;
}
.ad-header {
  height: 32px;
  margin-bottom: 64px;
}
.ad-section {
  margin-bottom: 32px;
}
.ad-add {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.ad-card {
  width: 98%;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  padding: 20px 10px;
}
.input {
  padding: 12px 8px;
  border-radius: 8px;
  border: 1px solid #d0d7e2;
  background: #fff;
  color: #222;
  margin-right: 8px;
}
.input:focus {
  outline: 2px solid #2566d8;
}
.btn {
  background: #2566d8;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 8px 18px;
  cursor: pointer;
  margin-right: 8px;
  transition: background 0.2s;
}
.btn:hover {
  background: #174ea6;
}
.btn-danger {
  background: #e74c3c;
  display: inline-block;
  margin: 0 auto;
}
.btn-danger:hover {
  background: #c0392b;
}
.ad-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  color: #222;
  border-radius: 8px;
  overflow: hidden;
}
.ad-table th, .ad-table td {
  padding: 10px 14px;
  border: 1px solid #e3e6ef;
}
.ad-table th {
  background: #f5f7fa;
  color: #222;
  font-weight: bold;
}
.ad-table td input {
  width: 95%;
  background: #f9f9f9;
  color: #222;
  border: 1px solid #d0d7e2;
  border-radius: 4px;
  padding: 4px 8px;
}
.ad-table th:last-child,
.ad-table td:last-child {
  text-align: center;
  vertical-align: middle;
}
.ad-add-group {
  display: flex;
  gap: 32px;
  justify-content: center;
  align-items: flex-start;
}
.ad-add-block {
  background: #f5f7fa;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  padding: 24px 32px 16px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 320px;
}
.ad-add-block .section-title {
  margin-bottom: 12px;
  color: #2566d8;
  font-size: 1.1rem;
  font-weight: bold;
}
.ad-add-block .input {
  margin-bottom: 12px;
  width: 100%;
}
.ad-add-block .btn {
  width: 100%;
  font-size: 1rem;
  padding: 10px 0;
}
.ad-add-row {
  display: flex;
  gap: 16px;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg,#1890ff,#69c0ff);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  padding: 24px 32px 16px 32px;
  min-width: 600px;
}
.select-input {
  min-width: 120px;
  height: 38px;
}
.ad-add-row input[type="text"], .ad-add-row input.input {
  width: 18rem !important;
  min-width: 200px;
  max-width: 100%;
}
@media (max-width: 768px) {
  .admin-content{
    width: 92%;
  }
  .ad-manage {
    width: 100%;
    padding: 0 2vw;
  }
  .ad-header, .ad-add-row {
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    width: 92%;
    margin: 0 auto;
    padding: 8px 0 !important;
  }
  .ad-section {
    width: 92%;
    padding-top: 10rem;
    margin-bottom: -8rem;
  }
  .ad-card {
    width: 100%;
    padding: 12px 2vw;
  }
  .ad-table {
    display: block;
    width: 100%;
    overflow-x: auto;
    font-size: 14px;
  }
  .ad-table thead, .ad-table tbody, .ad-table tr {
    display: table;
    width: 100%;
    table-layout: fixed;
  }
  .ad-table th, .ad-table td {
    padding: 8px 6px;
    font-size: 13px;
  }
  .input, .select-input {
    width: 84%;
    min-width: 0;
    margin-right: 0;
    font-size: 14px;
    padding: 8px 8px;
    height: 32px !important;
  }
  .ad-add-row input.input {
    margin: 0 auto;
  }
  .btn {
    width: 84%;
    margin-right: 0;
    padding: 8px 0;
    font-size: 14px;
  }
}
</style> 
