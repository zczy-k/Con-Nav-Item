<template>
  <div class="card-manage">
    <div class="card-header">
      <div class="header-content">
        <h2 class="page-title">管理分类下的网站导航卡片</h2>
      </div>
      <div class="card-add">
        <select v-model="selectedCategoryId" class="input category-select" @change="loadCards">
          <option v-for="option in categoryOptions" :key="option.id" :value="option.id">
            {{ option.label }}
          </option>
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
      <div class="category-tip">{{ selectedCategoryLabel }}</div>
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

    <div v-if="showTagModal" class="modal-overlay" @click="closeTagSelector">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>选择标签</h3>
          <button class="close-btn" @click="closeTagSelector">×</button>
        </div>
        <div class="modal-body">
          <div v-if="allTags.length === 0" class="empty-tags"><p>暂无标签，请先在标签管理页面创建</p></div>
          <div v-else class="tag-options">
            <label v-for="tag in allTags" :key="tag.id" class="tag-option">
              <input type="checkbox" :checked="selectedTagIds.includes(tag.id)" @change="toggleTag(tag.id)" />
              <span class="tag-label" :style="{ backgroundColor: tag.color }">{{ tag.name }}</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeTagSelector">取消</button>
          <button class="btn btn-primary" @click="saveCardTags">确定</button>
        </div>
      </div>
    </div>

    <div v-if="showDuplicateModal" class="modal-overlay" @click="closeDuplicateModal">
      <div class="modal-content duplicate-modal" @click.stop>
        <div class="modal-header">
          <div class="header-with-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <h3>{{ duplicateMode === 'exact' ? '检测到重复卡片' : '检测到疑似重复卡片' }}</h3>
          </div>
          <button class="close-btn" @click="closeDuplicateModal">×</button>
        </div>
        <div class="modal-body">
          <div class="duplicate-warning">
            <p class="warning-text">
              {{ duplicateMode === 'exact' ? '您要添加的卡片与以下现有卡片重复：' : `您要添加的卡片与以下现有卡片疑似重复（${duplicateReason}）：` }}
            </p>
          </div>
          <div class="duplicate-comparison">
            <div class="card-info-box existing">
              <div class="box-header"><span class="box-label">现有卡片</span></div>
              <div class="card-details">
                <div class="detail-row"><span class="detail-label">标题：</span><span class="detail-value">{{ duplicateInfo?.title }}</span></div>
                <div class="detail-row"><span class="detail-label">网址：</span><span class="detail-value url">{{ duplicateInfo?.url }}</span></div>
                <div class="detail-row" v-if="duplicateInfo?.logo_url"><span class="detail-label">Logo：</span><span class="detail-value url">{{ duplicateInfo?.logo_url }}</span></div>
              </div>
            </div>
            <div class="arrow-divider">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
            <div class="card-info-box pending">
              <div class="box-header"><span class="box-label">待添加卡片</span></div>
              <div class="card-details">
                <div class="detail-row"><span class="detail-label">标题：</span><span class="detail-value">{{ pendingCard?.title }}</span></div>
                <div class="detail-row"><span class="detail-label">网址：</span><span class="detail-value url">{{ pendingCard?.url }}</span></div>
                <div class="detail-row" v-if="pendingCard?.logo_url"><span class="detail-label">Logo：</span><span class="detail-value url">{{ pendingCard?.logo_url }}</span></div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer duplicate-footer">
          <button class="btn btn-secondary" @click="skipDuplicate">跳过</button>
          <button v-if="duplicateMode === 'exact'" class="btn btn-warning" @click="replaceDuplicate">替换</button>
          <button v-else class="btn btn-warning" @click="continueAddAnyway">仍然添加</button>
          <button class="btn btn-primary" @click="editAndAdd">编辑后添加</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { addCard as apiAddCard, deleteCard as apiDeleteCard, getCardsByCategory, getCategoryTree, getTags, updateCard as apiUpdateCard } from '../../api';
import { getDuplicateMatch } from '../../utils/urlNormalizer';
import { useDataSync } from '../../composables/useDataSync';

const categories = ref([]);
const cards = ref([]);
const selectedCategoryId = ref('');
const newCardTitle = ref('');
const newCardUrl = ref('');
const newCardLogo = ref('');
const allTags = ref([]);
const showTagModal = ref(false);
const currentEditCard = ref(null);
const selectedTagIds = ref([]);

const showDuplicateModal = ref(false);
const duplicateInfo = ref(null);
const pendingCard = ref(null);
const duplicateMode = ref('exact');
const duplicateReason = ref('');

const categoryOptions = computed(() => {
  const result = [];
  const walk = (nodes, depth = 0) => {
    nodes.forEach(node => {
      result.push({ id: node.id, label: `${'　'.repeat(depth)}${depth > 0 ? '└ ' : ''}${node.name}` });
      walk(node.children || [], depth + 1);
    });
  };
  walk(categories.value || []);
  return result;
});

const selectedCategoryLabel = computed(() => {
  const option = categoryOptions.value.find(item => String(item.id) === String(selectedCategoryId.value));
  return option ? `当前分类：${option.label.replace(/　/g, ' ')}` : '请选择分类';
});

onMounted(async () => {
  await loadCategories();
  const tagsRes = await getTags();
  allTags.value = tagsRes.data;
});

watch(selectedCategoryId, loadCards);

useDataSync('CardManage', ({ isSelfChange }) => {
  if (!isSelfChange) {
    loadCategories();
    loadCards();
  }
});

async function loadCategories() {
  const res = await getCategoryTree(true);
  categories.value = res.data || [];
  if (!selectedCategoryId.value && categoryOptions.value.length) {
    selectedCategoryId.value = categoryOptions.value[0].id;
  }
}

async function loadCards() {
  if (!selectedCategoryId.value) return;
  const res = await getCardsByCategory(selectedCategoryId.value, true);
  cards.value = res.data || [];
}

async function addCard() {
  if (!newCardTitle.value || !newCardUrl.value || !selectedCategoryId.value) return;

  let duplicate = null;
  let duplicateMatch = null;
  for (const card of cards.value) {
    const match = getDuplicateMatch({ title: newCardTitle.value, url: newCardUrl.value }, card);
    if (match) {
      duplicate = card;
      duplicateMatch = match;
      if (match.type === 'exact') break;
    }
  }

  if (duplicate) {
    duplicateInfo.value = duplicate;
    duplicateMode.value = duplicateMatch?.type || 'exact';
    duplicateReason.value = duplicateMatch?.reason || '';
    pendingCard.value = {
      category_id: selectedCategoryId.value,
      title: newCardTitle.value,
      url: newCardUrl.value,
      logo_url: newCardLogo.value
    };
    showDuplicateModal.value = true;
    return;
  }

  await performAddCard({
    category_id: selectedCategoryId.value,
    title: newCardTitle.value,
    url: newCardUrl.value,
    logo_url: newCardLogo.value
  });
}

async function updateCard(card) {
  await apiUpdateCard(card.id, {
    category_id: card.category_id || selectedCategoryId.value,
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
  if (!confirm('确定要删除这张卡片吗？')) return;
  const index = cards.value.findIndex(c => c.id === id);
  if (index > -1) cards.value.splice(index, 1);
  try {
    await apiDeleteCard(id);
  } catch (error) {
    console.error('删除卡片失败:', error);
    await loadCards();
  }
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
  if (index > -1) selectedTagIds.value.splice(index, 1);
  else selectedTagIds.value.push(tagId);
}

async function saveCardTags() {
  if (!currentEditCard.value) return;
  await apiUpdateCard(currentEditCard.value.id, {
    category_id: currentEditCard.value.category_id || selectedCategoryId.value,
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

async function performAddCard(cardData) {
  await apiAddCard(cardData);
  newCardTitle.value = '';
  newCardUrl.value = '';
  newCardLogo.value = '';
  loadCards();
}

function closeDuplicateModal() {
  showDuplicateModal.value = false;
  duplicateInfo.value = null;
  pendingCard.value = null;
  duplicateMode.value = 'exact';
  duplicateReason.value = '';
}

function skipDuplicate() {
  closeDuplicateModal();
  newCardTitle.value = '';
  newCardUrl.value = '';
  newCardLogo.value = '';
}

async function replaceDuplicate() {
  if (!pendingCard.value || !duplicateInfo.value) return;
  await apiDeleteCard(duplicateInfo.value.id);
  await performAddCard(pendingCard.value);
  closeDuplicateModal();
}

async function continueAddAnyway() {
  if (!pendingCard.value) return;
  const cardToAdd = { ...pendingCard.value };
  closeDuplicateModal();
  await performAddCard(cardToAdd);
}

function editAndAdd() {
  if (!pendingCard.value) return;
  newCardTitle.value = pendingCard.value.title;
  newCardUrl.value = pendingCard.value.url;
  newCardLogo.value = pendingCard.value.logo_url || '';
  closeDuplicateModal();
  alert('请修改卡片信息后再次点击“添加卡片”按钮');
}
</script>

<style scoped>
.card-manage { max-width: 1200px; width: 95%; margin: 0 auto; display: flex; flex-direction: column; align-items: center; }
.card-header { background: linear-gradient(135deg, #1890ff 0%, #69c0ff 100%); border-radius: 16px; padding: 24px; margin-bottom: 20px; color: white; box-shadow: 0 8px 32px rgba(102, 126, 234, 0.3); width: 95%; text-align: center; }
.header-content { margin-bottom: 15px; text-align: center; }
.page-title { font-size: 1.5rem; font-weight: 700; margin: 0 0 8px 0; letter-spacing: -0.5px; }
.card-add { margin: 0 auto; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: center; }
.category-tip { margin-top: 12px; font-size: 0.9rem; color: rgba(255,255,255,0.92); }
.card-card { background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); overflow: hidden; width: 100%; }
.card-table { width: 100%; border-collapse: collapse; padding: 24px; }
.card-table th, .card-table td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
.card-table th { background: #f9fafb; font-weight: 600; color: #374151; }
.input { padding: 10px 12px; border-radius: 8px; border: 1px solid #d0d7e2; background: #fff; color: #222; font-size: 0.9rem; transition: all 0.2s ease; }
.input.narrow { width: 160px; }
.input.wide { width: 220px; }
.category-select { width: 260px; }
.table-input { width: 100%; padding: 8px 4px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff; color: #222; font-size: 0.85rem; transition: all 0.2s ease; }
.order-input { width: 60px; }
.btn { padding: 10px 8px; border: none; border-radius: 8px; background: #399dff; color: white; cursor: pointer; font-weight: 500; font-size: 0.9rem; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
.btn-icon { width: 32px; height: 32px; padding: 0; justify-content: center; border-radius: 6px; }
.btn:hover { background: #2d7dd2; transform: translateY(-1px); }
.btn-danger { background: #ef4444; }
.btn-danger:hover { background: #dc2626; }
.tag-selector { cursor: pointer; padding: 6px 8px; border: 1px dashed #d0d7e2; border-radius: 6px; min-height: 32px; display: flex; align-items: center; transition: all 0.2s; }
.selected-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.mini-tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; color: white; white-space: nowrap; }
.tag-placeholder { font-size: 12px; color: #9ca3af; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-content { background: white; border-radius: 12px; width: 90%; max-width: 500px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2); }
.modal-header, .modal-footer { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #eee; }
.modal-footer { border-bottom: none; border-top: 1px solid #eee; justify-content: flex-end; gap: 12px; }
.modal-body { padding: 20px; }
.close-btn { width: 32px; height: 32px; border: none; background: none; font-size: 24px; color: #999; cursor: pointer; }
.tag-options { display: flex; flex-wrap: wrap; gap: 12px; }
.tag-option { display: flex; align-items: center; gap: 8px; }
.tag-label { padding: 4px 10px; border-radius: 999px; color: white; font-size: 13px; }
.duplicate-modal { max-width: 760px; }
.header-with-icon { display: flex; align-items: center; gap: 12px; }
.duplicate-comparison { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: center; }
.card-info-box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; }
.box-header { margin-bottom: 10px; }
.box-label { font-weight: 600; }
.detail-row { margin-bottom: 8px; }
.detail-label { color: #6b7280; }
.detail-value.url { word-break: break-all; }
.arrow-divider { display: flex; align-items: center; justify-content: center; }
@media (max-width: 900px) { .duplicate-comparison { grid-template-columns: 1fr; } }
</style>
