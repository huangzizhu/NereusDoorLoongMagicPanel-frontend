<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import type { FileItem, ClipboardState } from '../../types/file'
import { FILE_TYPE_FOLDER } from '../../types/file'

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  hasTarget: boolean
  item: FileItem | null
  clipboard: ClipboardState | null
}>()

const emit = defineEmits<{
  refresh: []
  upload: []
  createFile: []
  createFolder: []
  copyPath: []
  download: []
  permissions: []
  rename: []
  move: []
  copy: []
  cut: []
  paste: []
  compress: []
  decompress: []
  changeOwner: []
  detail: []
  delete: []
  close: []
}>()

const menuRef = ref<HTMLElement | null>(null)
const pos = ref({ x: 0, y: 0 })

const isCompressedFile = computed(() => {
  if (!props.item) return false
  const name = props.item.name.toLowerCase()
  return name.endsWith('.tar.gz') || name.endsWith('.tar') || name.endsWith('.zip')
})

const canPaste = computed(() => props.clipboard !== null && props.clipboard.paths.length > 0)

watch(() => props.visible, async (val) => {
  if (val) {
    await nextTick()
    if (!menuRef.value) return
    const rect = menuRef.value.getBoundingClientRect()
    let x = props.x
    let y = props.y
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8
    pos.value = { x, y }
  }
})

function handleAction(action: string) {
  emit(action as any)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="context-menu-overlay" @click="emit('close')" @contextmenu.prevent="emit('close')">
      <div
        ref="menuRef"
        class="context-menu"
        :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
        @click.stop
      >
        <button class="menu-item" @click="handleAction('refresh')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          <span>刷新</span>
        </button>
        <button class="menu-item" @click="handleAction('upload')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>上传文件</span>
        </button>
        <div class="menu-divider"></div>
        <button class="menu-item" @click="handleAction('createFile')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          <span>新建文件</span>
        </button>
        <button class="menu-item" @click="handleAction('createFolder')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
          <span>新建文件夹</span>
        </button>
        <div class="menu-divider"></div>
        <button v-if="canPaste" class="menu-item" @click="handleAction('paste')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
          </svg>
          <span>粘贴{{ clipboard ? ` (${clipboard.paths.length}项)` : '' }}</span>
        </button>
        <template v-if="hasTarget">
          <div class="menu-divider"></div>
          <button class="menu-item" @click="handleAction('copy')" v-if="item && item.type !== FILE_TYPE_FOLDER">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <span>复制</span>
          </button>
          <button class="menu-item" @click="handleAction('cut')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="6" cy="6" r="3"/>
              <circle cx="6" cy="18" r="3"/>
              <line x1="20" y1="4" x2="8.12" y2="15.88"/>
              <line x1="14.47" y1="14.48" x2="20" y2="20"/>
              <line x1="8.12" y1="8.12" x2="12" y2="12"/>
            </svg>
            <span>剪切</span>
          </button>
          <button class="menu-item" @click="handleAction('copyPath')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 1 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span>复制文件路径</span>
          </button>
          <div class="menu-divider"></div>
          <button class="menu-item" @click="handleAction('rename')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <span>重命名</span>
          </button>
          <button class="menu-item" @click="handleAction('move')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              <line x1="12" y1="11" x2="12" y2="17"/>
              <polyline points="9 14 12 11 15 14"/>
            </svg>
            <span>移动</span>
          </button>
          <button class="menu-item" @click="handleAction('download')" v-if="item && item.type !== FILE_TYPE_FOLDER">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>下载</span>
          </button>
          <div class="menu-divider"></div>
          <button class="menu-item" @click="handleAction('compress')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 8v13H3V8"/>
              <path d="M1 3h22v5H1z"/>
              <path d="M10 12h4"/>
            </svg>
            <span>压缩</span>
          </button>
          <button v-if="isCompressedFile" class="menu-item" @click="handleAction('decompress')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 8v13H3V8"/>
              <path d="M1 3h22v5H1z"/>
              <polyline points="8 12 12 16 16 12"/>
              <line x1="12" y1="16" x2="12" y2="21"/>
            </svg>
            <span>解压</span>
          </button>
          <div class="menu-divider"></div>
          <button class="menu-item" @click="handleAction('permissions')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <span>权限管理</span>
          </button>
          <button class="menu-item" @click="handleAction('changeOwner')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>更改所有者</span>
          </button>
          <button class="menu-item" @click="handleAction('detail')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span>查看详情</span>
          </button>
          <div class="menu-divider"></div>
          <button class="menu-item danger" @click="handleAction('delete')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            <span>删除</span>
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.context-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
}

.context-menu {
  position: fixed;
  z-index: 9001;
  min-width: 180px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 6px;
  border-radius: 12px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  backdrop-filter: var(--backdrop-blur);
  -webkit-backdrop-filter: var(--backdrop-blur);
  animation: menu-in 0.15s ease;
}

@keyframes menu-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  border-radius: 8px;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.menu-item:hover {
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.menu-item.danger:hover {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.menu-divider {
  height: 1px;
  margin: 4px 8px;
  background: var(--color-divider);
}
</style>
