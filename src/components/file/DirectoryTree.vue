<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type { FileTreeNode } from '../../types/file'
import * as fileApi from '../../api/file'
import { useNotification } from '../../composables/useNotification'

const props = defineProps<{
  currentPath: string
}>()

const emit = defineEmits<{
  navigate: [path: string]
  dropToFolder: [targetPath: string, sourcePath: string]
}>()

const notify = useNotification()

interface DisplayNode {
  fileName: string
  absolutePath: string
  children: DisplayNode[]
  expanded: boolean
  loaded: boolean
  loading: boolean
}

const treeData = ref<DisplayNode[]>([])
const loading = ref(false)

function toDisplayNode(node: FileTreeNode, expanded = false): DisplayNode {
  return {
    fileName: node.fileName,
    absolutePath: normalizePath(node.absolutePath),
    children: node.children.map(c => toDisplayNode(c, false)),
    expanded,
    loaded: node.children.length > 0,
    loading: false,
  }
}

function normalizePath(path: string): string {
  if (!path || path === '/') return '/'
  const withLeadingSlash = path.startsWith('/') ? path : '/' + path
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash
}

function isSameOrParentPath(parent: string, path: string): boolean {
  if (parent === '/') return path.startsWith('/')
  return path === parent || path.startsWith(parent + '/')
}

async function loadTree(rootPath: string) {
  loading.value = true
  try {
    const normalizedRoot = normalizePath(rootPath)
    const res = await fileApi.getFileTree(normalizedRoot, 2)
    if (res.data.code === 1 && res.data.data.tree) {
      treeData.value = [toDisplayNode(res.data.data.tree, true)]
    } else {
      notify.warning('加载目录树失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('加载目录树失败', e.message)
  } finally {
    loading.value = false
  }
}

async function toggleExpand(node: DisplayNode) {
  if (node.expanded) {
    node.expanded = false
    return
  }

  if (!node.loaded && !node.loading) {
    node.loading = true
    try {
      const res = await fileApi.getFileTree(node.absolutePath, 2)
      if (res.data.code === 1 && res.data.data.tree) {
        const loaded = toDisplayNode(res.data.data.tree, false)
        node.children = loaded.children
        node.loaded = true
      }
    } catch (e: any) {
      notify.error('加载子目录失败', e.message)
    } finally {
      node.loading = false
    }
  }

  node.expanded = true
}

async function loadChildren(node: DisplayNode) {
  if (node.loading || node.loaded) return
  node.loading = true
  try {
    const res = await fileApi.getFileTree(node.absolutePath, 2)
    if (res.data.code === 1 && res.data.data.tree) {
      const loaded = toDisplayNode(res.data.data.tree, false)
      node.children = loaded.children
      node.loaded = true
    }
  } catch (e: any) {
    notify.error('加载子目录失败', e.message)
  } finally {
    node.loading = false
  }
}

async function syncTreeToPath(rawPath: string) {
  const targetPath = normalizePath(rawPath)
  if (treeData.value.length === 0) {
    await loadTree('/')
  }

  const root = treeData.value[0]
  if (!root) return

  root.expanded = true
  if (!isSameOrParentPath(root.absolutePath, targetPath)) return

  if (targetPath === root.absolutePath) return

  const segments = targetPath.split('/').filter(Boolean)
  let current = root
  let accPath = ''

  for (const segment of segments) {
    accPath += '/' + segment
    if (!isSameOrParentPath(current.absolutePath, accPath)) {
      break
    }

    if (!current.loaded) {
      await loadChildren(current)
    }

    const next = current.children.find(child => normalizePath(child.absolutePath) === accPath)
    if (!next) {
      break
    }

    current.expanded = true
    next.expanded = true
    current = next
  }
}

function handleClick(path: string) {
  emit('navigate', path)
}

watch(
  () => props.currentPath,
  async (path) => {
    await syncTreeToPath(path)
  },
  { immediate: true }
)

onMounted(() => {
  syncTreeToPath(props.currentPath)
})
</script>

<template>
  <div class="directory-tree">
    <div class="tree-header">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span>目录树</span>
      <button class="refresh-btn" @click="loadTree('/')" title="刷新">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
      </button>
    </div>
    <div class="tree-body" v-if="!loading">
      <TreeLevel
        v-for="node in treeData"
        :key="node.absolutePath"
        :node="node"
        :currentPath="currentPath"
        :depth="0"
        @toggle="toggleExpand"
        @navigate="handleClick"
        @dropTo="emit('dropToFolder', $event.targetPath, $event.sourcePath)"
      />
    </div>
    <div class="tree-loading" v-else>
      <svg class="spin-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      <span>加载中...</span>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, h } from 'vue'

const TreeLevel: any = defineComponent({
  name: 'TreeLevel',
  props: {
    node: { type: Object as () => import('../../types/file').FileTreeNode & { expanded: boolean; loaded: boolean; loading: boolean; children: any[] }, required: true },
    currentPath: { type: String, required: true },
    depth: { type: Number, default: 0 },
  },
  emits: ['toggle', 'navigate', 'dropTo'],
  setup(props, { emit }) {
    return (): any => {
      const indent = props.depth * 16 + 12
      const isActive = props.node.absolutePath === props.currentPath
      const hasChildren = props.node.children.length > 0 || !props.node.loaded

      const childVNodes: any[] = props.node.expanded && props.node.children.length > 0
        ? props.node.children.map((child: any) =>
            h(TreeLevel, {
              node: child,
              currentPath: props.currentPath,
              depth: props.depth + 1,
              onToggle: (n: any) => emit('toggle', n),
              onNavigate: (p: string) => emit('navigate', p),
              key: child.absolutePath,
            })
          )
        : []

      return h('div', [
        h('div', {
          class: ['tree-node', { active: isActive }],
          style: { paddingLeft: indent + 'px' },
          onClick: (e: MouseEvent) => { e.stopPropagation(); emit('navigate', props.node.absolutePath) },
          onDragover: (e: DragEvent) => {
            const sourcePath = e.dataTransfer?.getData('text/plain') || ''
            if (!sourcePath || sourcePath === props.node.absolutePath) return
            e.preventDefault()
            if (e.currentTarget instanceof HTMLElement) {
              e.currentTarget.classList.add('tree-drop-target')
            }
          },
          onDragleave: (e: DragEvent) => {
            if (e.currentTarget instanceof HTMLElement) {
              e.currentTarget.classList.remove('tree-drop-target')
            }
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault()
            if (e.currentTarget instanceof HTMLElement) {
              e.currentTarget.classList.remove('tree-drop-target')
            }
            const sourcePath = e.dataTransfer?.getData('text/plain') || ''
            if (!sourcePath || sourcePath === props.node.absolutePath) return
            emit('dropTo', { targetPath: props.node.absolutePath, sourcePath })
          },
        }, [
          h('button', {
            class: 'tree-toggle',
            onClick: (e: MouseEvent) => { e.stopPropagation(); emit('toggle', props.node) },
          }, props.node.loading
            ? h('svg', { class: 'spin-icon', width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [h('path', { d: 'M21 12a9 9 0 1 1-6.219-8.56' })])
            : hasChildren
              ? h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: { transform: props.node.expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' } }, [h('polyline', { points: '9 18 15 12 9 6' })])
              : h('span', { class: 'tree-toggle-spacer' })
          ),
          h('svg', { class: 'tree-folder-icon', width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
            h('path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' }),
          ]),
          h('span', { class: 'tree-node-name' }, props.node.fileName),
        ]),
        ...childVNodes,
      ])
    }
  },
})

export default { name: 'DirectoryTree' }
</script>

<style scoped>
.directory-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tree-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.tree-header span {
  flex: 1;
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.refresh-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.tree-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.tree-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--color-text-faint);
  font-size: 12px;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

<style>
.tree-node {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  cursor: pointer;
  transition: background 0.1s ease;
  user-select: none;
  padding-right: 8px;
}

.tree-node:hover {
  background: var(--color-bg-hover);
}

.tree-node.active {
  background: var(--color-bg-active);
}

.tree-node.tree-drop-target {
  background: var(--color-primary-ghost);
  outline: 1px dashed var(--color-primary);
  outline-offset: -1px;
}

.tree-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  transition: all 0.1s ease;
}

.tree-toggle:hover {
  background: var(--color-bg-inset);
  color: var(--color-text);
}

.tree-toggle-spacer {
  display: inline-block;
  width: 18px;
  height: 18px;
}

.tree-folder-icon {
  flex-shrink: 0;
  color: var(--color-primary);
}

.tree-node.active .tree-folder-icon {
  color: var(--color-primary);
}

.tree-node-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.tree-node.active .tree-node-name {
  color: var(--color-text);
  font-weight: 600;
}
</style>
