<script setup lang="ts">
import type { ClipboardState } from '../../types/file'

defineProps<{
  selectedCount: number
  canGoBack: boolean
  canGoForward: boolean
  clipboard: ClipboardState | null
}>()

const emit = defineEmits<{
  upload: []
  createFile: []
  createFolder: []
  batchDelete: []
  batchDownload: []
  batchRename: []
  batchCopyTo: []
  batchCompress: []
  goBack: []
  goForward: []
}>()
</script>

<template>
  <div class="file-toolbar">
    <div class="toolbar-left">
      <div class="nav-group">
        <button
          class="nav-btn"
          :disabled="!canGoBack"
          @click="emit('goBack')"
          title="后退"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <button
          class="nav-btn"
          :disabled="!canGoForward"
          @click="emit('goForward')"
          title="前进"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>
      <div class="toolbar-sep"></div>
      <button class="toolbar-btn" @click="emit('upload')" title="上传文件">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span>上传</span>
      </button>
      <button class="toolbar-btn" @click="emit('createFile')" title="新建文件">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        <span>新建文件</span>
      </button>
      <button class="toolbar-btn" @click="emit('createFolder')" title="新建文件夹">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          <line x1="12" y1="11" x2="12" y2="17"/>
          <line x1="9" y1="14" x2="15" y2="14"/>
        </svg>
        <span>新建文件夹</span>
      </button>
      <button class="toolbar-btn" @click="emit('batchCompress')" title="压缩">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 8v13H3V8"/>
          <path d="M1 3h22v5H1z"/>
          <path d="M10 12h4"/>
        </svg>
        <span>压缩</span>
      </button>
    </div>
    <div class="toolbar-right">
      <template v-if="selectedCount > 0">
        <button class="toolbar-btn" @click="emit('batchCopyTo')" title="复制到">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <span>复制到</span>
        </button>
        <button class="toolbar-btn" @click="emit('batchDownload')" title="下载">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>下载</span>
        </button>
        <button class="toolbar-btn" @click="emit('batchRename')" title="重命名" v-if="selectedCount === 1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          <span>重命名</span>
        </button>
        <button class="toolbar-btn danger" @click="emit('batchDelete')" title="删除">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          <span>删除 ({{ selectedCount }})</span>
        </button>
      </template>
      <template v-if="clipboard && clipboard.paths.length > 0">
        <div class="toolbar-sep"></div>
        <span class="clipboard-hint">
          {{ clipboard.mode === 'copy' ? '复制' : '剪切' }}了 {{ clipboard.paths.length }} 项
        </span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.file-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  gap: 8px;
  background: var(--color-bg-elevated);
  backdrop-filter: var(--backdrop-blur);
  -webkit-backdrop-filter: var(--backdrop-blur);
  border-bottom: 1px solid var(--color-border);
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.nav-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.toolbar-sep {
  width: 1px;
  height: 20px;
  background: var(--color-divider);
  margin: 0 4px;
}

.toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1.5px solid var(--color-border-solid);
  border-radius: 10px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.toolbar-btn:hover {
  border-color: var(--color-primary-light);
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.toolbar-btn.danger {
  border-color: var(--color-danger);
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.toolbar-btn.danger:hover {
  background: var(--color-danger);
  color: #fff;
}

.clipboard-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--color-bg-inset);
  white-space: nowrap;
}

@media (max-width: 640px) {
  .toolbar-btn span {
    display: none;
  }
  .toolbar-btn {
    padding: 7px 10px;
  }
  .clipboard-hint {
    display: none;
  }
}
</style>
