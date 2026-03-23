<template>
  <Teleport to="body">
    <transition name="drawer-overlay">
      <div v-if="visible" class="drawer-overlay" @click="close" @contextmenu.prevent></div>
    </transition>

    <transition name="drawer-slide">
      <div v-if="visible" class="mobile-drawer" @contextmenu.prevent>
        <div class="drawer-header">
          <span class="drawer-title">导航菜单</span>
          <button class="drawer-close" @click="close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="drawer-content">
          <DrawerNode
            v-for="node in menus"
            :key="node.id"
            :node="node"
            :active-path-ids="activePathIds"
            :expanded-ids="expandedIds"
            @toggle="toggleExpand"
            @select="handleNodeSelect"
          />
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { computed, defineComponent, h, ref, watch } from 'vue';

const props = defineProps({
  visible: Boolean,
  menus: { type: Array, default: () => [] },
  activePathIds: { type: Array, default: () => [] }
});

const emit = defineEmits(['close', 'select']);

const expandedIds = ref(new Set());

const activePathSet = computed(() => new Set(props.activePathIds || []));

watch(
  () => props.activePathIds,
  ids => {
    const next = new Set(expandedIds.value);
    (ids || []).forEach(id => next.add(id));
    expandedIds.value = next;
  },
  { immediate: true }
);

const DrawerNode = defineComponent({
  name: 'DrawerNode',
  props: {
    node: { type: Object, required: true },
    activePathIds: { type: Object, required: true },
    expandedIds: { type: Object, required: true },
    depth: { type: Number, default: 0 }
  },
  emits: ['toggle', 'select'],
  setup(nodeProps, { emit: nodeEmit }) {
    const childNodes = computed(() => nodeProps.node.children || nodeProps.node.subMenus || []);
    const hasChildren = computed(() => childNodes.value.length > 0);
    const isExpanded = computed(() => nodeProps.expandedIds.has(nodeProps.node.id));
    const isActive = computed(() => nodeProps.activePathIds.has(nodeProps.node.id));

    return () => h('div', { class: 'drawer-node-wrap' }, [
      h('div', {
        class: ['drawer-menu-header', { active: isActive.value }],
        style: { paddingLeft: `${16 + nodeProps.depth * 18}px` },
        onClick: () => nodeEmit('select', nodeProps.node)
      }, [
        h('span', { class: 'menu-name' }, nodeProps.node.name),
        h('div', { class: 'menu-actions' }, [
          hasChildren.value ? h('span', { class: 'sub-count' }, String(childNodes.value.length)) : null,
          hasChildren.value
            ? h('button', {
                class: ['expand-btn', { expanded: isExpanded.value }],
                onClick: event => {
                  event.stopPropagation();
                  nodeEmit('toggle', nodeProps.node.id);
                }
              }, [
                h('svg', { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
                  h('polyline', { points: '6 9 12 15 18 9' })
                ])
              ])
            : null
        ])
      ]),
      hasChildren.value && isExpanded.value
        ? h('div', { class: 'drawer-submenu' }, childNodes.value.map(child =>
            h(DrawerNode, {
              key: child.id,
              node: child,
              depth: nodeProps.depth + 1,
              activePathIds: nodeProps.activePathIds,
              expandedIds: nodeProps.expandedIds,
              onToggle: id => nodeEmit('toggle', id),
              onSelect: selected => nodeEmit('select', selected)
            })
          ))
        : null
    ]);
  }
});

function close() {
  emit('close');
}

function toggleExpand(id) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

function handleNodeSelect(node) {
  emit('select', node);
  const children = node.children || node.subMenus || [];
  if (!children.length) {
    close();
  }
}
</script>

<style scoped>
.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 9998;
}

.mobile-drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 260px;
  max-width: 72vw;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 32px rgba(0, 0, 0, 0.12);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.drawer-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.drawer-close {
  width: 36px;
  height: 36px;
  border: none;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 10px;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
}

.drawer-node-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.drawer-menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #333;
  margin: 0 12px;
}

.drawer-menu-header.active {
  background: linear-gradient(135deg, rgba(24, 144, 255, 0.12) 0%, rgba(64, 169, 255, 0.08) 100%);
  color: #1890ff;
}

.menu-name {
  font-size: 15px;
  font-weight: 500;
}

.menu-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sub-count {
  font-size: 12px;
  color: #999;
  background: rgba(0, 0, 0, 0.04);
  padding: 2px 8px;
  border-radius: 10px;
}

.expand-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}

.expand-btn svg {
  transition: transform 0.25s ease;
}

.expand-btn.expanded svg {
  transform: rotate(180deg);
}

.drawer-submenu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
