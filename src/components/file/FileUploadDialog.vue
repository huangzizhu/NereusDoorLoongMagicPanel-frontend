<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  currentPath: string
}>()

const emit = defineEmits<{
  confirm: [files: File[]]
  cancel: []
}>()

const selectedFiles = ref<File[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

watch(() => props.visible, (val) => {
  if (val) {
    selectedFiles.value = []
  }
})

function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  const newFiles = Array.from(input.files)
  const remaining = 10 - selectedFiles.value.length
  const toAdd = newFiles.slice(0, remaining)
  selectedFiles.value = [...selectedFiles.value, ...toAdd]
  input.value = ''
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function removeFile(index: number) {
  selectedFiles.value.splice(index, 1)
}

function handleConfirm() {
  if (selectedFiles.value.length === 0) return
  emit('confirm', [...selectedFiles.value])
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i]
}

const canAddMore = computed(() => selectedFiles.value.length < 10)
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="visible" class="dialog-overlay" @click.self="emit('cancel')">
        <div class="dialog-card">
          <div class="dialog-header">
            <div class="dialog-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <h3 class="dialog-title">上传文件</h3>
              <p class="dialog-subtitle">目标目录：{{ currentPath }}</p>
            </div>
          </div>
          <div class="dialog-body">
            <input
              ref="fileInputRef"
              type="file"
              class="hidden-input"
              multiple
              @change="handleFileChange"
            />
            <div v-if="selectedFiles.length > 0" class="file-list">
              <div v-for="(file, idx) in selectedFiles" :key="idx" class="file-list-item">
                <svg class="file-list-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span class="file-list-name">{{ file.name }}</span>
                <span class="file-list-size">{{ formatSize(file.size) }}</span>
                <button class="file-list-remove" @click="removeFile(idx)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            <div
              class="upload-zone"
              :class="{ disabled: !canAddMore }"
              @click="canAddMore && triggerFileInput()"
            >
              <svg class="upload-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span class="upload-hint">{{ canAddMore ? '点击添加文件' : '已达上限（10个）' }}</span>
              <span class="upload-count">{{ selectedFiles.length }} / 10</span>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-cancel" @click="emit('cancel')">取消</button>
            <button class="btn btn-primary" :disabled="selectedFiles.length === 0" @click="handleConfirm">
              上传 {{ selectedFiles.length > 0 ? `(${selectedFiles.length})` : '' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

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
  max-width: 500px;
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
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.dialog-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.hidden-input {
  display: none;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
  max-height: 200px;
  overflow-y: auto;
  padding: 6px;
  border-radius: 10px;
  background: var(--color-bg-inset);
}

.file-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.file-list-item:hover {
  background: var(--color-bg-hover);
}

.file-list-icon {
  flex-shrink: 0;
  color: var(--color-primary);
}

.file-list-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.file-list-size {
  font-size: 12px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.file-list-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.file-list-item:hover .file-list-remove {
  opacity: 1;
}

.file-list-remove:hover {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 20px;
  border: 2px dashed var(--color-border-solid);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--color-bg-inset);
}

.upload-zone:hover:not(.disabled) {
  border-color: var(--color-primary-light);
  background: var(--color-primary-ghost);
}

.upload-zone.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.upload-icon {
  color: var(--color-text-faint);
  transition: color 0.2s ease;
}

.upload-zone:hover:not(.disabled) .upload-icon {
  color: var(--color-primary);
}

.upload-hint {
  font-size: 14px;
  color: var(--color-text-muted);
}

.upload-count {
  font-size: 12px;
  color: var(--color-text-faint);
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--color-bg-surface);
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
