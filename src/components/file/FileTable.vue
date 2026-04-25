<script setup lang="ts">
import { computed } from 'vue'
import type { FileItem } from '../../types/file'
import { FILE_TYPE_FOLDER, FILE_TYPE_FILE, FILE_TYPE_LINK } from '../../types/file'

const props = defineProps<{
  fileList: FileItem[]
  selectedPaths: Set<string>
}>()

const emit = defineEmits<{
  toggleSelect: [path: string, multi: boolean]
  selectAll: []
  open: [item: FileItem]
  dragStart: [item: FileItem]
  dropOn: [target: FileItem, source: FileItem]
  contextmenu: [e: MouseEvent, item?: FileItem]
}>()

const sortedList = computed(() => {
  return [...props.fileList].sort((a, b) => {
    if (a.type === FILE_TYPE_FOLDER && b.type !== FILE_TYPE_FOLDER) return -1
    if (a.type !== FILE_TYPE_FOLDER && b.type === FILE_TYPE_FOLDER) return 1
    return a.name.localeCompare(b.name)
  })
})

const allSelected = computed(() => {
  return props.fileList.length > 0 && props.fileList.every(f => props.selectedPaths.has(f.path))
})

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / Math.pow(1024, i)
  return val.toFixed(i === 0 ? 0 : 1) + ' ' + units[i]
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getFileIcon(item: FileItem) {
  if (item.type === FILE_TYPE_FOLDER) {
    return { icon: 'folder', color: 'var(--color-primary)' }
  }
  if (item.type === FILE_TYPE_LINK) {
    return { icon: 'link', color: 'var(--color-info)' }
  }
  const ext = item.name.split('.').pop()?.toLowerCase() || ''
  const name = item.name.toLowerCase()
  if (name.endsWith('.tar.gz') || name.endsWith('.tar') || name.endsWith('.zip')) {
    return { icon: 'archive', color: 'var(--color-warning)' }
  }
  const textExts = ['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'sh', 'bash', 'zsh', 'py', 'js', 'ts', 'vue', 'css', 'html', 'sql', 'log', 'env', 'gitignore', 'dockerfile', 'makefile']
  if (textExts.includes(ext) || item.type === FILE_TYPE_FILE) {
    return { icon: 'text', color: 'var(--color-success)' }
  }
  return { icon: 'binary', color: 'var(--color-warning)' }
}

let dragItem: FileItem | null = null
let dragOverPath: string | null = null

function onDragStart(e: DragEvent, item: FileItem) {
  dragItem = item
  e.dataTransfer!.effectAllowed = 'move'
  e.dataTransfer!.setData('text/plain', item.path)
  emit('dragStart', item)
}

function onDragOver(e: DragEvent, item: FileItem) {
  if (item.type !== FILE_TYPE_FOLDER) return
  if (dragItem && dragItem.path === item.path) return
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
  dragOverPath = item.path
}

function onDragLeave() {
  dragOverPath = null
}

function onDrop(e: DragEvent, item: FileItem) {
  e.preventDefault()
  dragOverPath = null
  if (item.type !== FILE_TYPE_FOLDER || !dragItem || dragItem.path === item.path) return
  emit('dropOn', item, dragItem)
  dragItem = null
}

function onDragEnd() {
  dragItem = null
  dragOverPath = null
}
</script>

<template>
  <div class="file-table-wrapper">
    <div class="file-table-header">
      <div class="col col-check">
        <input
          type="checkbox"
          :checked="allSelected"
          @change="emit('selectAll')"
          class="checkbox"
        />
      </div>
      <div class="col col-name">名称</div>
      <div class="col col-size">大小</div>
      <div class="col col-time">创建时间</div>
      <div class="col col-time">修改时间</div>
      <div class="col col-perm">权限</div>
      <div class="col col-owner">所有者</div>
    </div>
    <div class="file-table-body">
      <div
        v-for="item in sortedList"
        :key="item.path"
        class="file-row"
        :class="{
          selected: selectedPaths.has(item.path),
          'drop-target': dragOverPath === item.path,
          'is-folder': item.type === FILE_TYPE_FOLDER,
        }"
        :draggable="true"
        @dragstart="onDragStart($event, item)"
        @dragover="onDragOver($event, item)"
        @dragleave="onDragLeave"
        @drop="onDrop($event, item)"
        @dragend="onDragEnd"
        @click.exact="emit('toggleSelect', item.path, false)"
        @click.ctrl="emit('toggleSelect', item.path, true)"
        @click.meta="emit('toggleSelect', item.path, true)"
        @dblclick="emit('open', item)"
        @contextmenu.prevent="emit('contextmenu', $event, item)"
      >
        <div class="col col-check" @click.stop>
          <input
            type="checkbox"
            :checked="selectedPaths.has(item.path)"
            @change="emit('toggleSelect', item.path, true)"
            class="checkbox"
          />
        </div>
        <div class="col col-name">
          <svg
            class="file-type-icon"
            :style="{ color: getFileIcon(item).color }"
            width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          >
            <template v-if="getFileIcon(item).icon === 'folder'">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </template>
            <template v-else-if="getFileIcon(item).icon === 'link'">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </template>
            <template v-else-if="getFileIcon(item).icon === 'text'">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </template>
            <template v-else-if="getFileIcon(item).icon === 'archive'">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="12" y1="12" x2="12" y2="14"/>
              <line x1="12" y1="16" x2="12" y2="18"/>
              <line x1="12" y1="10" x2="12.01" y2="10"/>
            </template>
            <template v-else>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </template>
          </svg>
          <span class="file-name">{{ item.name }}</span>
        </div>
        <div class="col col-size">{{ formatSize(item.size) }}</div>
        <div class="col col-time">{{ formatDate(item.createdTime) }}</div>
        <div class="col col-time">{{ formatDate(item.modifiedTime) }}</div>
        <div class="col col-perm"><code>{{ item.permissions }}</code></div>
        <div class="col col-owner">{{ item.owner }}</div>
      </div>
      <div v-if="fileList.length === 0" class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span>此目录为空</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-table-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.file-table-header {
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: 40px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-inset);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  user-select: none;
  flex-shrink: 0;
}

.file-table-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 8px;
}

.col {
  display: flex;
  align-items: center;
  padding: 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-check {
  width: 40px;
  flex-shrink: 0;
  justify-content: center;
}

.col-name {
  flex: 3;
  min-width: 0;
  gap: 8px;
}

.col-size {
  width: 90px;
  flex-shrink: 0;
  justify-content: flex-end;
}

.col-time {
  width: 150px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.col-perm {
  width: 100px;
  flex-shrink: 0;
}

.col-perm code {
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-bg-inset);
  color: var(--color-text-secondary);
}

.col-owner {
  width: 100px;
  flex-shrink: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.checkbox {
  width: 16px;
  height: 16px;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  border-radius: 4px;
  border: 1.5px solid var(--color-checkbox-border);
  background: var(--color-checkbox-bg);
  transition: all 0.15s ease;
  position: relative;
}

.checkbox:hover {
  border-color: var(--color-primary);
}

.checkbox:checked {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.checkbox:checked::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 8px;
  border: solid var(--color-checkbox-check);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.checkbox:indeterminate {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.checkbox:indeterminate::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 6px;
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: var(--color-checkbox-check);
}

.file-row {
  display: flex;
  align-items: center;
  height: 44px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.file-row:hover {
  background: var(--color-bg-hover);
}

.file-row.selected {
  background: var(--color-bg-active);
}

.file-row.drop-target {
  background: var(--color-primary-ghost);
  outline: 2px dashed var(--color-primary);
  outline-offset: -2px;
}

.file-type-icon {
  flex-shrink: 0;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.file-row.is-folder .file-name {
  font-weight: 600;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 0;
  color: var(--color-text-faint);
  font-size: 14px;
}

@media (max-width: 900px) {
  .col-time {
    display: none;
  }
}

@media (max-width: 640px) {
  .col-perm,
  .col-owner {
    display: none;
  }
  .col-size {
    width: 70px;
  }
}
</style>
