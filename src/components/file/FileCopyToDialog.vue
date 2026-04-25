<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { FileTreeNode } from '../../types/file'
import * as fileApi from '../../api/file'
import { useNotification } from '../../composables/useNotification'

const props = defineProps<{
  visible: boolean
  sourcePath: string
  sourceName: string
}>()

const emit = defineEmits<{
  confirm: [destinationPath: string]
  cancel: []
}>()

const notify = useNotification()
const destinationPath = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

interface SimpleNode {
  fileName: string
  absolutePath: string
  children: SimpleNode[]
  expanded: boolean
  loading: boolean
}

const treeData = ref<SimpleNode[]>([])
const treeLoading = ref(false)

function toSimpleNode(node: FileTreeNode, expanded = false): SimpleNode {
  return {
    fileName: node.fileName,
    absolutePath: node.absolutePath,
    children: node.children.map(c => toSimpleNode(c, false)),
    expanded,
    loading: false,
  }
}

async function loadTree(rootPath: string) {
  treeLoading.value = true
  try {
    const res = await fileApi.getFileTree(rootPath, 2)
    if (res.data.code === 1 && res.data.data.tree) {
      treeData.value = [toSimpleNode(res.data.data.tree, true)]
    }
  } catch (e: any) {
    notify.error('加载目录树失败', e.message)
  } finally {
    treeLoading.value = false
  }
}

async function toggleNode(node: SimpleNode) {
  if (node.expanded) {
    node.expanded = false
    return
  }
  if (node.children.length === 0 && !node.loading) {
    node.loading = true
    try {
      const res = await fileApi.getFileTree(node.absolutePath, 2)
      if (res.data.code === 1 && res.data.data.tree) {
        const loaded = toSimpleNode(res.data.data.tree, false)
        node.children = loaded.children
      }
    } catch (e: any) {
      notify.error('加载子目录失败', e.message)
    } finally {
      node.loading = false
    }
  }
  node.expanded = true
}

function selectPath(path: string) {
  destinationPath.value = path
}

watch(() => props.visible, async (val) => {
  if (val) {
    destinationPath.value = ''
    await nextTick()
    inputRef.value?.focus()
    loadTree('/')
  }
})

function handleConfirm() {
  const trimmed = destinationPath.value.trim()
  if (!trimmed) return
  emit('confirm', trimmed)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') handleConfirm()
  if (e.key === 'Escape') emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="visible" class="dialog-overlay" @click.self="emit('cancel')">
        <div class="dialog-card">
          <div class="dialog-header">
            <div class="dialog-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            </div>
            <div>
              <h3 class="dialog-title">复制到</h3>
              <p class="dialog-subtitle">{{ sourceName }}</p>
            </div>
          </div>
          <div class="dialog-body">
            <label class="input-label">目标路径</label>
            <input
              ref="inputRef"
              v-model="destinationPath"
              class="input-field"
              placeholder="请输入或选择目标目录路径"
              @keydown="handleKeydown"
              spellcheck="false"
            />
            <div class="tree-container">
              <div class="tree-title">选择目录</div>
              <div class="tree-scroll" v-if="!treeLoading">
                <template v-for="node in treeData" :key="node.absolutePath">
                  <CopyTreeNode
                    :node="node"
                    :selectedPath="destinationPath"
                    :depth="0"
                    @toggle="toggleNode"
                    @select="selectPath"
                  />
                </template>
              </div>
              <div class="tree-loading" v-else>
                <svg class="spin-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                <span>加载中...</span>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-cancel" @click="emit('cancel')">取消</button>
            <button class="btn btn-primary" :disabled="!destinationPath.trim()" @click="handleConfirm">复制</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts">
import { defineComponent, h } from 'vue'

const CopyTreeNode = defineComponent({
  name: 'CopyTreeNode',
  props: {
    node: { type: Object as () => any, required: true },
    selectedPath: { type: String, default: '' },
    depth: { type: Number, default: 0 },
  },
  emits: ['toggle', 'select'],
  setup(props, { emit }) {
    return () => {
      const indent = props.depth * 16 + 8
      const isSelected = props.node.absolutePath === props.selectedPath
      const hasChildren = props.node.children.length > 0

      const childVNodes = props.node.expanded && props.node.children.length > 0
        ? props.node.children.map((child: any) =>
            h(CopyTreeNode, {
              node: child,
              selectedPath: props.selectedPath,
              depth: props.depth + 1,
              onToggle: (n: any) => emit('toggle', n),
              onSelect: (p: string) => emit('select', p),
              key: child.absolutePath,
            })
          )
        : []

      return h('div', [
        h('div', {
          class: ['copy-tree-node', { selected: isSelected }],
          style: { paddingLeft: indent + 'px' },
        }, [
          h('button', {
            class: 'copy-tree-toggle',
            onClick: (e: MouseEvent) => { e.stopPropagation(); emit('toggle', props.node) },
          }, hasChildren
            ? h('svg', { width: 10, height: 10, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: { transform: props.node.expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' } }, [h('polyline', { points: '9 18 15 12 9 6' })])
            : h('span', { style: { display: 'inline-block', width: '10px' } })
          ),
          h('svg', { class: 'copy-tree-icon', width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
            h('path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' }),
          ]),
          h('span', {
            class: 'copy-tree-name',
            onClick: () => emit('select', props.node.absolutePath),
          }, props.node.fileName),
        ]),
        ...childVNodes,
      ])
    }
  },
})

export default { name: 'FileCopyToDialog' }
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 8000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}

.dialog-card {
  width: 90%;
  max-width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px 0;
  flex-shrink: 0;
}

.dialog-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-ghost);
  color: var(--color-primary);
  flex-shrink: 0;
}

.dialog-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
}

.dialog-subtitle {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}

.dialog-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.input-field {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid var(--color-border-solid);
  border-radius: 10px;
  background: var(--color-bg-inset);
  color: var(--color-text);
  font-size: 14px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.input-field:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.input-field::placeholder {
  color: var(--color-text-faint);
}

.tree-container {
  display: flex;
  flex-direction: column;
  border: 1.5px solid var(--color-border-solid);
  border-radius: 10px;
  overflow: hidden;
  min-height: 200px;
  max-height: 300px;
}

.tree-title {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  background: var(--color-bg-inset);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.tree-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.tree-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 30px 0;
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

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-divider);
  flex-shrink: 0;
}

.btn {
  padding: 9px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.btn-cancel {
  background: var(--color-bg-inset);
  color: var(--color-text-secondary);
}

.btn-cancel:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.btn-primary {
  background: linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-end));
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dialog-enter-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.dialog-leave-active {
  transition: all 0.2s ease;
}

.dialog-enter-from {
  opacity: 0;
}

.dialog-leave-to {
  opacity: 0;
}
</style>

<style>
.copy-tree-node {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  cursor: pointer;
  padding-right: 8px;
  transition: background 0.1s ease;
  user-select: none;
}

.copy-tree-node:hover {
  background: var(--color-bg-hover);
}

.copy-tree-node.selected {
  background: var(--color-bg-active);
}

.copy-tree-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}

.copy-tree-toggle:hover {
  background: var(--color-bg-inset);
}

.copy-tree-icon {
  flex-shrink: 0;
  color: var(--color-primary);
}

.copy-tree-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.copy-tree-node.selected .copy-tree-name {
  color: var(--color-primary);
  font-weight: 600;
}
</style>
