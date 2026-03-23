<template>
  <div class="menu-manage">
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span>{{ loadingText }}</span>
    </div>

    <div class="menu-header">
      <h2 class="page-title">栏目管理</h2>
      <div class="menu-add">
        <input v-model="newRootName" placeholder="输入一级分类名称" class="input" @keyup.enter="createRootCategory" />
        <button class="btn btn-primary" @click="createRootCategory" :disabled="loading || !newRootName.trim()">
          + 添加一级分类
        </button>
      </div>
      <div class="insert-tip">{{ rootInsertTip }}</div>
    </div>

    <div class="menu-content">
      <div v-if="categories.length === 0" class="empty-state">
        <p>暂无分类，请添加第一个一级分类</p>
      </div>

      <div v-else class="tree-panel">
        <CategoryTreeNode
          v-for="node in categories"
          :key="node.id"
          :node="node"
          :selected-id="selectedNodeId"
          :expanded-ids="expandedNodeIds"
          @select="selectNode"
          @toggle="toggleNode"
          @add-child="openCreateModal($event, 'child')"
          @add-sibling="openCreateModal($event, 'sibling')"
          @edit="openEditModal"
          @remove="confirmDeleteCategory"
        />
      </div>
    </div>

    <div v-if="showCategoryModal" class="modal-overlay">
      <div class="modal tree-modal">
        <div class="modal-header">
          <h3>{{ modalTitle }}</h3>
          <button class="modal-close" @click="closeModal">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>名称</label>
            <input v-model="modalForm.name" type="text" class="input" placeholder="请输入分类名称" />
          </div>
          <div class="insert-hint">{{ modalHint }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-cancel" @click="closeModal">取消</button>
          <button class="btn btn-primary" @click="submitModal" :disabled="!modalForm.name.trim()">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineComponent, h, nextTick, onMounted, ref } from 'vue';
import { addCategory, deleteCategory, getCategoryTree, updateCategory } from '../../api';
import { useDataSync } from '../../composables/useDataSync';

const CategoryTreeNode = defineComponent({
  name: 'CategoryTreeNode',
  props: {
    node: { type: Object, required: true },
    selectedId: { type: Number, default: null },
    expandedIds: { type: Object, required: true }
  },
  emits: ['select', 'toggle', 'add-child', 'add-sibling', 'edit', 'remove'],
  setup(props, { emit }) {
    const renderChildren = () => {
      if (!props.node.children?.length || !props.expandedIds.has(props.node.id)) return null;
      return h('div', { class: 'tree-children' }, props.node.children.map(child =>
        h(CategoryTreeNode, {
          key: child.id,
          node: child,
          selectedId: props.selectedId,
          expandedIds: props.expandedIds,
          onSelect: node => emit('select', node),
          onToggle: node => emit('toggle', node),
          onAddChild: node => emit('add-child', node),
          onAddSibling: node => emit('add-sibling', node),
          onEdit: node => emit('edit', node),
          onRemove: node => emit('remove', node)
        })
      ));
    };

    return () => h('div', { class: 'tree-node-wrap' }, [
      h('div', {
        class: ['tree-node', { selected: props.selectedId === props.node.id }],
        onClick: () => emit('select', props.node),
        'data-category-id': props.node.id
      }, [
        h('div', { class: 'tree-main' }, [
          h('button', {
            class: ['tree-toggle', { empty: !props.node.children?.length }],
            onClick: event => {
              event.stopPropagation();
              if (props.node.children?.length) emit('toggle', props.node);
            }
          }, props.node.children?.length ? (props.expandedIds.has(props.node.id) ? '▾' : '▸') : '·'),
          h('span', { class: 'tree-name' }, props.node.name),
          h('span', { class: 'tree-meta' }, `L${props.node.level} / 排序 ${props.node.sort_order}`)
        ]),
        h('div', { class: 'tree-actions' }, [
          h('button', { class: 'btn-icon-sm btn-add', title: '添加下级', onClick: event => { event.stopPropagation(); emit('add-child', props.node); } }, '+'),
          h('button', { class: 'btn-icon-sm btn-edit', title: '添加同级', onClick: event => { event.stopPropagation(); emit('add-sibling', props.node); } }, '≡'),
          h('button', { class: 'btn-icon-sm btn-edit', title: '编辑', onClick: event => { event.stopPropagation(); emit('edit', props.node); } }, '✎'),
          h('button', { class: 'btn-icon-sm btn-delete', title: '删除', onClick: event => { event.stopPropagation(); emit('remove', props.node); } }, '×')
        ])
      ]),
      renderChildren()
    ]);
  }
});

const categories = ref([]);
const loading = ref(false);
const loadingText = ref('加载中...');
const newRootName = ref('');
const selectedNodeId = ref(null);
const expandedNodeIds = ref(new Set());

const showCategoryModal = ref(false);
const modalMode = ref('create');
const modalTargetType = ref('root');
const modalTargetNode = ref(null);
const modalForm = ref({ name: '' });

const rootInsertTip = computed(() => {
  if (!selectedNodeId.value) return '未选中分类时，新增一级分类将追加到末尾';
  const node = findNodeById(selectedNodeId.value);
  return node ? `当前新增一级分类将插入到「${node.name}」所在顶级位置后面` : '未选中分类时，新增一级分类将追加到末尾';
});

const modalTitle = computed(() => {
  if (modalMode.value === 'edit') return '编辑分类';
  if (modalTargetType.value === 'child') return '添加下级分类';
  if (modalTargetType.value === 'sibling') return '添加同级分类';
  return '添加一级分类';
});

const modalHint = computed(() => {
  const node = modalTargetNode.value;
  if (modalMode.value === 'edit') {
    return node ? `正在编辑「${node.name}」` : '更新当前分类名称';
  }
  if (modalTargetType.value === 'child') {
    return node ? `新分类将作为「${node.name}」的下级分类创建` : '请选择一个父分类';
  }
  if (modalTargetType.value === 'sibling') {
    return node ? `新分类将插入到「${node.name}」后面` : '请选择一个参考分类';
  }
  return '新一级分类将追加到顶级列表末尾';
});

useDataSync('CategoryTreeManage', ({ isSelfChange }) => {
  if (!isSelfChange) loadCategories(false);
});

onMounted(() => {
  loadCategories();
});

function notifyExtensionMenusUpdated() {
  try {
    window.dispatchEvent(new CustomEvent('nav-menus-updated'));
  } catch (error) {
    console.warn('[栏目管理] 通知扩展失败:', error);
  }
}

function walkTree(nodes, callback) {
  for (const node of nodes) {
    callback(node);
    if (node.children?.length) walkTree(node.children, callback);
  }
}

function findNodeById(id) {
  let result = null;
  walkTree(categories.value, node => {
    if (node.id === id) result = node;
  });
  return result;
}

function findTopLevelAncestor(node) {
  if (!node) return null;
  let current = node;
  while (current.parent_id) {
    current = findNodeById(current.parent_id) || current;
    if (!current.parent_id) break;
  }
  return current;
}

function expandPathToNode(node) {
  let current = node;
  while (current?.parent_id) {
    expandedNodeIds.value.add(current.parent_id);
    current = findNodeById(current.parent_id);
  }
}

async function loadCategories(isUpdate = false) {
  loading.value = true;
  loadingText.value = '加载中...';
  try {
    const res = await getCategoryTree(true);
    categories.value = res.data || [];
    categories.value.forEach(node => expandedNodeIds.value.add(node.id));
    const selectedNode = selectedNodeId.value ? findNodeById(selectedNodeId.value) : null;
    if (selectedNode) expandPathToNode(selectedNode);
    await nextTick();
    scrollToSelectedNode();
    if (isUpdate) notifyExtensionMenusUpdated();
  } catch (error) {
    alert('加载失败: ' + (error.response?.data?.error || error.message));
  } finally {
    loading.value = false;
  }
}

function scrollToSelectedNode() {
  const selectedElement = document.querySelector('.menu-manage .tree-node.selected');
  selectedElement?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}

function selectNode(node) {
  selectedNodeId.value = node.id;
  expandPathToNode(node);
}

function toggleNode(node) {
  if (expandedNodeIds.value.has(node.id)) expandedNodeIds.value.delete(node.id);
  else expandedNodeIds.value.add(node.id);
  expandedNodeIds.value = new Set(expandedNodeIds.value);
}

function openCreateModal(node = null, type = 'root') {
  modalMode.value = 'create';
  modalTargetType.value = type;
  modalTargetNode.value = node;
  modalForm.value = { name: '' };
  showCategoryModal.value = true;
}

function openEditModal(node) {
  modalMode.value = 'edit';
  modalTargetType.value = 'edit';
  modalTargetNode.value = node;
  modalForm.value = { name: node.name };
  showCategoryModal.value = true;
}

function closeModal() {
  showCategoryModal.value = false;
  modalTargetNode.value = null;
  modalForm.value = { name: '' };
}

async function createRootCategory() {
  if (!newRootName.value.trim()) return;
  loading.value = true;
  loadingText.value = '添加中...';
  try {
    const anchor = selectedNodeId.value ? findTopLevelAncestor(findNodeById(selectedNodeId.value)) : null;
    const res = await addCategory({ name: newRootName.value.trim(), parentId: null, afterId: anchor?.id || null });
    selectedNodeId.value = res.data?.id || null;
    newRootName.value = '';
    await loadCategories(true);
  } catch (error) {
    alert('添加失败: ' + (error.response?.data?.error || error.message));
    loading.value = false;
  }
}

async function submitModal() {
  if (!modalForm.value.name.trim()) return;

  loading.value = true;
  loadingText.value = modalMode.value === 'edit' ? '保存中...' : '添加中...';
  const targetNode = modalTargetNode.value;
  const name = modalForm.value.name.trim();
  closeModal();

  try {
    let result = null;
    if (modalMode.value === 'edit' && targetNode) {
      await updateCategory(targetNode.id, { name });
      selectedNodeId.value = targetNode.id;
    } else if (modalTargetType.value === 'child' && targetNode) {
      result = await addCategory({ name, parentId: targetNode.id, afterId: null });
      selectedNodeId.value = result.data?.id || null;
      expandedNodeIds.value.add(targetNode.id);
    } else if (modalTargetType.value === 'sibling' && targetNode) {
      result = await addCategory({ name, parentId: targetNode.parent_id || null, afterId: targetNode.id });
      selectedNodeId.value = result.data?.id || null;
      if (targetNode.parent_id) expandedNodeIds.value.add(targetNode.parent_id);
    } else {
      result = await addCategory({ name, parentId: null, afterId: null });
      selectedNodeId.value = result.data?.id || null;
    }

    await loadCategories(true);
  } catch (error) {
    alert('操作失败: ' + (error.response?.data?.error || error.message));
    loading.value = false;
  }
}

async function confirmDeleteCategory(node) {
  if (!confirm(`确定删除分类「${node.name}」吗？\n将同时删除其下所有子分类和卡片！`)) return;
  loading.value = true;
  loadingText.value = '删除中...';
  try {
    await deleteCategory(node.id);
    if (selectedNodeId.value === node.id) selectedNodeId.value = null;
    await loadCategories(true);
  } catch (error) {
    alert('删除失败: ' + (error.response?.data?.error || error.message));
    loading.value = false;
  }
}
</script>

<style scoped>
.menu-manage {
  max-width: 980px;
  width: 95%;
  margin: 0 auto;
  position: relative;
}

.loading-overlay {
  position: fixed;
  inset: 0;
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

.menu-header {
  background: linear-gradient(135deg, #1890ff 0%, #69c0ff 100%);
  border-radius: 14px;
  padding: 24px;
  margin-bottom: 20px;
  color: white;
}

.page-title {
  font-size: 1.4rem;
  font-weight: 600;
  margin: 0 0 16px;
  text-align: center;
}

.menu-add {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.insert-tip {
  margin-top: 12px;
  text-align: center;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.92);
}

.menu-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #999;
  background: white;
  border-radius: 12px;
}

.tree-panel {
  background: white;
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.tree-node-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tree-children {
  margin-left: 20px;
  padding-left: 14px;
  border-left: 2px solid #eef4ff;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tree-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid #edf2f7;
  border-radius: 12px;
  background: #fbfdff;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}

.tree-node.selected {
  border-color: #91caff;
  background: #f0f7ff;
  box-shadow: 0 8px 20px rgba(24, 144, 255, 0.12);
}

.tree-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.tree-toggle {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: #eef4ff;
  color: #3b82f6;
  cursor: pointer;
}

.tree-toggle.empty {
  color: #bbb;
  cursor: default;
}

.tree-name {
  font-weight: 600;
  color: #1f2937;
}

.tree-meta {
  font-size: 0.82rem;
  color: #7b8794;
}

.tree-actions {
  display: flex;
  gap: 6px;
}

.btn,
.input,
.btn-icon-sm {
  font: inherit;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary { background: #1890ff; color: white; }
.btn-cancel { background: #f0f0f0; color: #666; }

.btn-icon-sm {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-add { background: #f6ffed; color: #52c41a; }
.btn-edit { background: #e6f7ff; color: #1890ff; }
.btn-delete { background: #fff1f0; color: #ff4d4f; }

.input {
  padding: 10px 14px;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  font-size: 0.95rem;
  background: white;
}

.menu-add .input {
  flex: 1;
  max-width: 320px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
}

.modal {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 420px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.modal-header,
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.modal-footer {
  justify-content: flex-end;
  gap: 12px;
  border-bottom: none;
  border-top: 1px solid #eee;
}

.modal-body { padding: 20px; }

.modal-close {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  font-size: 24px;
  color: #999;
  cursor: pointer;
}

.form-group { margin-bottom: 16px; }

.insert-hint {
  padding: 10px 12px;
  border-radius: 8px;
  background: #f6ffed;
  color: #389e0d;
  font-size: 0.88rem;
}

@media (max-width: 640px) {
  .menu-add {
    flex-direction: column;
  }

  .tree-node {
    flex-direction: column;
    align-items: flex-start;
  }

  .tree-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
