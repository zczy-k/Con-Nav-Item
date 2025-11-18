<template>
  <div class="card-manage">
    <div class="card-header">
      <div class="header-content">
        <h2 class="page-title">管理网站导航卡片，支持主菜单和子菜单分类</h2>
      </div>
      <div class="card-add">
        <select v-model="selectedMenuId" class="input narrow" @change="onMenuChange">
          <option v-for="menu in menus" :value="menu.id" :key="menu.id">{{ menu.name }}</option>
        </select>
        <select v-model="selectedSubMenuId" class="input narrow" @change="onSubMenuChange">
          <option value="">主菜单</option>
          <option v-for="subMenu in currentSubMenus" :value="subMenu.id" :key="subMenu.id">{{ subMenu.name }}</option>
        </select>
        <input v-model="newCardTitle" placeholder="卡片标题" class="input narrow" />
        <input v-model="newCardUrl" placeholder="卡片链接" class="input wide" />
        <input v-model="newCardLogo" placeholder="logo链接(可选)" class="input wide" />
        <button class="btn" @click="addCard">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          添加卡片
        </button>
      </div>
    </div>
    <div class="card-card">
      <table class="card-table">
        <thead>
          <tr>
            <th>标题</th>
            <th>网址</th>
            <th>Logo链接</th>
            <th>描述</th>
            <th>标签</th>
            <th>排序</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="card in cards" :key="card.id">
            <td><input v-model="card.title" @blur="updateCard(card)" class="table-input" /></td>
            <td><input v-model="card.url" @blur="updateCard(card)" class="table-input" /></td>
            <td><input v-model="card.logo_url" @blur="updateCard(card)" class="table-input" placeholder="logo链接(可选)" /></td>
            <td><input v-model="card.desc" @blur="updateCard(card)" class="table-input" placeholder="描述（可选）" /></td>
            <td>
              <div class="tag-selector" @click="openTagSelector(card)">
                <div v-if="card.tags && card.tags.length > 0" class="selected-tags">
                  <span v-for="tag in card.tags" :key="tag.id" class="mini-tag" :style="{ backgroundColor: tag.color }">
                    {{ tag.name }}
                  </span>
                </div>
                <span v-else class="tag-placeholder">选择标签</span>
              </div>
            </td>
            <td><input v-model.number="card.order" type="number" @blur="updateCard(card)" class="table-input order-input" /></td>
            <td>
              <button class="btn btn-danger btn-icon" @click="deleteCard(card.id)" title="删除">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                  <path d="M10 11v6M14 11v6"/>
                </svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <!-- 标签选择弹窗 -->
    <div v-if="showTagModal" class="modal-overlay" @click="closeTagSelector">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>选择标签</h3>
          <button class="close-btn" @click="closeTagSelector">×</button>
        </div>
        <div class="modal-body">
          <div v-if="allTags.length === 0" class="empty-tags">
            <p>暂无标签，请先在标签管理页面创建</p>
          </div>
          <div v-else class="tag-options">
            <label v-for="tag in allTags" :key="tag.id" class="tag-option">
              <input 
                type="checkbox" 
                :checked="selectedTagIds.includes(tag.id)"
                @change="toggleTag(tag.id)"
              />
              <span class="tag-label" :style="{ backgroundColor: tag.color }">
                {{ tag.name }}
              </span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeTagSelector">取消</button>
          <button class="btn btn-primary" @click="saveCardTags">确定</button>
        </div>
      </div>
    </div>
    
    <!-- 重复检测对话框 -->
    <div v-if="showDuplicateModal" class="modal-overlay" @click="closeDuplicateModal">
      <div class="modal-content duplicate-modal" @click.stop>
        <div class="modal-header">
          <div class="header-with-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <h3>检测到重复卡片</h3>
          </div>
          <button class="close-btn" @click="closeDuplicateModal">×</button>
        </div>
        <div class="modal-body">
          <div class="duplicate-warning">
            <p class="warning-text">您要添加的卡片与以下现有卡片重复：</p>
          </div>
          
          <div class="duplicate-comparison">
            <!-- 现有卡片 -->
            <div class="card-info-box existing">
              <div class="box-header">
                <span class="box-label">现有卡片</span>
              </div>
              <div class="card-details">
                <div class="detail-row">
                  <span class="detail-label">标题：</span>
                  <span class="detail-value">{{ duplicateInfo?.title }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">网址：</span>
                  <span class="detail-value url">{{ duplicateInfo?.url }}</span>
                </div>
                <div class="detail-row" v-if="duplicateInfo?.logo_url">
                  <span class="detail-label">Logo：</span>
                  <span class="detail-value url">{{ duplicateInfo?.logo_url }}</span>
                </div>
              </div>
            </div>
            
            <!-- 箭头 -->
            <div class="arrow-divider">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
            
            <!-- 待添加卡片 -->
            <div class="card-info-box pending">
              <div class="box-header">
                <span class="box-label">待添加卡片</span>
              </div>
              <div class="card-details">
                <div class="detail-row">
                  <span class="detail-label">标题：</span>
                  <span class="detail-value">{{ pendingCard?.title }}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">网址：</span>
                  <span class="detail-value url">{{ pendingCard?.url }}</span>
                </div>
                <div class="detail-row" v-if="pendingCard?.logo_url">
                  <span class="detail-label">Logo：</span>
                  <span class="detail-value url">{{ pendingCard?.logo_url }}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="duplicate-actions-info">
            <p>请选择如何处理：</p>
          </div>
        </div>
        <div class="modal-footer duplicate-footer">
          <button class="btn btn-secondary" @click="skipDuplicate">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
            跳过
          </button>
          <button class="btn btn-warning" @click="replaceDuplicate">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
              <path d="M21 3v5h-5"></path>
            </svg>
            替换
          </button>
          <button class="btn btn-primary" @click="editAndAdd">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            编辑后添加
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import { 
  getMenus, 
  getCards, 
  addCard as apiAddCard, 
  updateCard as apiUpdateCard, 
  deleteCard as apiDeleteCard,
  getTags
} from '../../api';
import { isDuplicateCard } from '../../utils/urlNormalizer';

const menus = ref([]);
const cards = ref([]);
const selectedMenuId = ref();
const selectedSubMenuId = ref('');
const newCardTitle = ref('');
const newCardUrl = ref('');
const newCardLogo = ref('');
const allTags = ref([]);
const showTagModal = ref(false);
const currentEditCard = ref(null);
const selectedTagIds = ref([]);

// 重复检测相关状态
const showDuplicateModal = ref(false);
const duplicateInfo = ref(null);
const pendingCard = ref(null);

const currentSubMenus = computed(() => {
  if (!selectedMenuId.value) return [];
  const menu = menus.value.find(m => m.id === selectedMenuId.value);
  return menu?.subMenus || [];
});

onMounted(async () => {
  const res = await getMenus();
  menus.value = res.data;
  if (menus.value.length) {
    selectedMenuId.value = menus.value[0].id;
    selectedSubMenuId.value = '';
  }
  
  // 加载标签
  const tagsRes = await getTags();
  allTags.value = tagsRes.data;
});

watch(selectedMenuId, () => {
  selectedSubMenuId.value = '';
  loadCards();
});

watch(selectedSubMenuId, loadCards);

function onMenuChange() {
  selectedSubMenuId.value = '';
}

function onSubMenuChange() {
  loadCards();
}

async function loadCards() {
  if (!selectedMenuId.value) return;
  const res = await getCards(selectedMenuId.value, selectedSubMenuId.value || null);
  cards.value = res.data;
}

async function addCard() {
  if (!newCardTitle.value || !newCardUrl.value) return;
  
  // 检测重复
  const duplicate = cards.value.find(card => 
    isDuplicateCard(
      { title: newCardTitle.value, url: newCardUrl.value },
      card
    )
  );
  
  if (duplicate) {
    // 发现重复，显示对话框
    duplicateInfo.value = duplicate;
    pendingCard.value = {
      menu_id: selectedMenuId.value,
      sub_menu_id: selectedSubMenuId.value || null,
      title: newCardTitle.value,
      url: newCardUrl.value,
      logo_url: newCardLogo.value
    };
    showDuplicateModal.value = true;
  } else {
    // 没有重复，直接添加
    await performAddCard({
      menu_id: selectedMenuId.value,
      sub_menu_id: selectedSubMenuId.value || null,
      title: newCardTitle.value,
      url: newCardUrl.value,
      logo_url: newCardLogo.value
    });
  }
}

async function updateCard(card) {
  await apiUpdateCard(card.id, {
    menu_id: selectedMenuId.value,
    sub_menu_id: selectedSubMenuId.value || null,
    title: card.title,
    url: card.url,
    logo_url: card.logo_url,
    desc: card.desc,
    order: card.order,
    tagIds: card.tags ? card.tags.map(t => t.id) : []
  });
  loadCards();
}

async function deleteCard(id) {
  await apiDeleteCard(id);
  loadCards();
}

function openTagSelector(card) {
  currentEditCard.value = card;
  selectedTagIds.value = card.tags ? card.tags.map(t => t.id) : [];
  showTagModal.value = true;
}

function closeTagSelector() {
  showTagModal.value = false;
  currentEditCard.value = null;
  selectedTagIds.value = [];
}

function toggleTag(tagId) {
  const index = selectedTagIds.value.indexOf(tagId);
  if (index > -1) {
    selectedTagIds.value.splice(index, 1);
  } else {
    selectedTagIds.value.push(tagId);
  }
}

async function saveCardTags() {
  if (!currentEditCard.value) return;
  
  await apiUpdateCard(currentEditCard.value.id, {
    menu_id: currentEditCard.value.menu_id,
    sub_menu_id: currentEditCard.value.sub_menu_id,
    title: currentEditCard.value.title,
    url: currentEditCard.value.url,
    logo_url: currentEditCard.value.logo_url,
    desc: currentEditCard.value.desc,
    order: currentEditCard.value.order,
    tagIds: selectedTagIds.value
  });
  
  closeTagSelector();
  loadCards();
}

// 执行添加卡片操作
async function performAddCard(cardData) {
  await apiAddCard(cardData);
  newCardTitle.value = '';
  newCardUrl.value = '';
  newCardLogo.value = '';
  loadCards();
}

// 关闭重复对话框
function closeDuplicateModal() {
  showDuplicateModal.value = false;
  duplicateInfo.value = null;
  pendingCard.value = null;
}

// 跳过添加
function skipDuplicate() {
  closeDuplicateModal();
  // 清空输入
  newCardTitle.value = '';
  newCardUrl.value = '';
  newCardLogo.value = '';
}

// 替换现有卡片
async function replaceDuplicate() {
  if (!pendingCard.value || !duplicateInfo.value) return;
  
  // 删除旧卡片，添加新卡片
  await apiDeleteCard(duplicateInfo.value.id);
  await performAddCard(pendingCard.value);
  closeDuplicateModal();
}

// 编辑后添加
function editAndAdd() {
  if (!pendingCard.value) return;
  
  // 将待添加的卡片信息填充回输入框
  newCardTitle.value = pendingCard.value.title;
  newCardUrl.value = pendingCard.value.url;
  newCardLogo.value = pendingCard.value.logo_url || '';
  
  closeDuplicateModal();
  
  // 提示用户修改
  alert('请修改卡片信息后再次点击“添加卡片”按钮');
}
</script>

<style scoped>
.card-manage {
  max-width: 1200px;
  width: 95%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.card-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 20px;
  color: white;
  box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3);
  width: 95%;
  text-align: center;
}

.header-content {
  margin-bottom: 15px;
  text-align: center;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 8px 0;
  letter-spacing: -0.5px;
}



.card-add {
  margin: 0 auto;
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
}

.card-card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  width: 100%;
}

.card-table {
  width: 100%;
  border-collapse: collapse;
  padding: 24px;
}

.card-table th,
.card-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}

.card-table th {
  background: #f9fafb;
  font-weight: 600;
  color: #374151;
}

/* 表格列宽度设置 */
.card-table th:nth-child(1), /* 标题列 */
.card-table td:nth-child(1) {
  width: 10%;
}

.card-table th:nth-child(2), /* 网址列 */
.card-table td:nth-child(2) {
  width: 22%;
}

.card-table th:nth-child(3), /* Logo链接列 */
.card-table td:nth-child(3) {
  width: 22%;
}

.card-table th:nth-child(4), /* 描述列 */
.card-table td:nth-child(4) {
  width: 12%;
}

.card-table th:nth-child(5), /* 标签列 */
.card-table td:nth-child(5) {
  width: 15%;
}

.card-table th:nth-child(6), /* 排序列 */
.card-table td:nth-child(6) {
  width: 7%;
}

.card-table th:nth-child(7), /* 操作列 */
.card-table td:nth-child(7) {
  width: 12%;
  text-align: center;
}

.input {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #d0d7e2;
  background: #fff;
  color: #222;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

/* 窄输入框 - 主菜单、子菜单、卡片标题 */
.input.narrow {
  width: 140px;
}

/* 中等输入框 - 添加卡片按钮 */
.input.medium {
  width: 140px;
}

/* 宽输入框 - 卡片链接、logo链接 */
.input.wide {
  width: 200px;
}

/* 表格内输入框 */
.table-input {
  width: 100%;
  padding: 8px 4px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #222;
  font-size: 0.85rem;
  transition: all 0.2s ease;
}

.table-input:focus {
  outline: none;
  border-color: #399dff;
  box-shadow: 0 0 0 2px rgba(57, 157, 255, 0.1);
}

.input:focus {
  outline: none;
  border-color: #399dff;
  box-shadow: 0 0 0 3px rgba(57, 157, 255, 0.1);
}

.order-input {
  width: 60px;
}

.btn {
  padding: 10px 8px;
  border: none;
  border-radius: 8px;
  background: #399dff;
  color: white;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.9rem;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  justify-content: center;
  border-radius: 6px;
}

.btn:hover {
  background: #2d7dd2;
  transform: translateY(-1px);
}

.btn-danger {
  background: #ef4444;
}

.btn-danger:hover {
  background: #dc2626;
}

.tag-selector {
  cursor: pointer;
  padding: 6px 8px;
  border: 1px dashed #d0d7e2;
  border-radius: 6px;
  min-height: 32px;
  display: flex;
  align-items: center;
  transition: all 0.2s;
}

.tag-selector:hover {
  border-color: #667eea;
  background: #f9fafb;
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.mini-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: white;
  white-space: nowrap;
}

.tag-placeholder {
  font-size: 12px;
  color: #9ca3af;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #374151;
}

.close-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: #9ca3af;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f3f4f6;
  color: #374151;
}

.modal-body {
  padding: 24px;
  max-height: 400px;
  overflow-y: auto;
}

.empty-tags {
  text-align: center;
  padding: 40px 20px;
  color: #9ca3af;
}

.tag-options {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.tag-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.tag-option input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.tag-label {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 14px;
  color: white;
  transition: opacity 0.2s;
}

.tag-option:hover .tag-label {
  opacity: 0.8;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #e5e7eb;
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

.btn-primary {
  background: #667eea;
  color: white;
}

.btn-primary:hover {
  background: #5568d3;
}

.btn-warning {
  background: #f59e0b;
  color: white;
}

.btn-warning:hover {
  background: #d97706;
}

/* 重复对话框样式 */
.duplicate-modal {
  max-width: 700px;
}

.header-with-icon {
  display: flex;
  align-items: center;
  gap: 12px;
}

.duplicate-warning {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 20px;
}

.warning-text {
  margin: 0;
  color: #dc2626;
  font-size: 14px;
  font-weight: 500;
}

.duplicate-comparison {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.card-info-box {
  flex: 1;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid;
}

.card-info-box.existing {
  border-color: #93c5fd;
}

.card-info-box.pending {
  border-color: #a78bfa;
}

.box-header {
  padding: 8px 12px;
  font-weight: 600;
  font-size: 13px;
  color: white;
}

.card-info-box.existing .box-header {
  background: #3b82f6;
}

.card-info-box.pending .box-header {
  background: #8b5cf6;
}

.card-details {
  padding: 12px;
  background: #f9fafb;
}

.detail-row {
  display: flex;
  margin-bottom: 8px;
  font-size: 13px;
}

.detail-row:last-child {
  margin-bottom: 0;
}

.detail-label {
  font-weight: 600;
  color: #6b7280;
  min-width: 50px;
}

.detail-value {
  color: #374151;
  word-break: break-all;
  flex: 1;
}

.detail-value.url {
  color: #3b82f6;
  font-size: 12px;
}

.arrow-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.duplicate-actions-info {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 12px 16px;
}

.duplicate-actions-info p {
  margin: 0;
  color: #15803d;
  font-size: 14px;
  font-weight: 500;
}

.duplicate-footer {
  justify-content: space-between;
}

@media (max-width: 768px) {
  .card-manage {
    width: 94%;
    padding: 16px;
  }
  
  .card-card {
    padding: 16px 12px;
  }
  
  .card-add {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  
  .input.narrow,
  .input.medium,
  .input.wide {
    width: 100%;
  }
  
  .order-input {
    width: 60px;
  }
  
  /* 移动端表格列宽度调整 */
  .card-table th:nth-child(1),
  .card-table td:nth-child(1),
  .card-table th:nth-child(2),
  .card-table td:nth-child(2),
  .card-table th:nth-child(3),
  .card-table td:nth-child(3),
  .card-table th:nth-child(4),
  .card-table td:nth-child(4),
  .card-table th:nth-child(5),
  .card-table td:nth-child(5),
  .card-table th:nth-child(6),
  .card-table td:nth-child(6),
  .card-table th:nth-child(7),
  .card-table td:nth-child(7) {
    width: auto;
  }
  
  /* 重复对话框移动端适配 */
  .duplicate-comparison {
    flex-direction: column;
    gap: 12px;
  }
  
  .arrow-divider {
    transform: rotate(90deg);
  }
  
  .duplicate-footer {
    flex-direction: column;
    gap: 8px;
  }
  
  .duplicate-footer .btn {
    width: 100%;
    justify-content: center;
  }
}
</style> 