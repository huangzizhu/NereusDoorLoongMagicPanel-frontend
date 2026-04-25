<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { FileItem } from '../../types/file'

const props = defineProps<{
  visible: boolean
  mode: 'rename' | 'move'
  item: FileItem | null
}>()

const emit = defineEmits<{
  confirm: [sourcePath: string, destinationPath: string]
  cancel: []
}>()

const inputValue = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const dialogTitle = computed(() => props.mode === 'rename' ? '重命名' : '移动')

watch(() => props.visible, async (val) => {
  if (val && props.item) {
    if (props.mode === 'rename') {
      inputValue.value = props.item.name
    } else {
      inputValue.value = props.item.path
    }
    await nextTick()
    inputRef.value?.focus()
    if (props.mode === 'rename') {
      const dotIdx = inputValue.value.lastIndexOf('.')
      if (dotIdx > 0) {
        inputRef.value?.setSelectionRange(0, dotIdx)
      } else {
        inputRef.value?.select()
      }
    } else {
      inputRef.value?.select()
    }
  }
})

const canConfirm = computed(() => {
  if (!props.item) return false
  if (props.mode === 'rename') {
    return inputValue.value.trim().length > 0 && inputValue.value.trim() !== props.item.name
  }
  return inputValue.value.trim().length > 0 && inputValue.value.trim() !== props.item.path
})

const destinationPath = computed(() => {
  if (!props.item) return ''
  if (props.mode === 'rename') {
    const parentPath = props.item.path.substring(0, props.item.path.lastIndexOf('/'))
    return parentPath + '/' + inputValue.value.trim()
  }
  return inputValue.value.trim()
})

function handleConfirm() {
  if (!canConfirm.value || !props.item) return
  emit('confirm', props.item.path, destinationPath.value)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') handleConfirm()
  if (e.key === 'Escape') emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="visible && item" class="dialog-overlay" @click.self="emit('cancel')">
        <div class="dialog-card">
          <div class="dialog-header">
            <div class="dialog-icon">
              <svg v-if="mode === 'rename'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <polyline points="9 14 12 11 15 14"/>
              </svg>
            </div>
            <div>
              <h3 class="dialog-title">{{ dialogTitle }}</h3>
              <p class="dialog-subtitle">{{ item.name }}</p>
            </div>
          </div>
          <div class="dialog-body">
            <label class="input-label">{{ mode === 'rename' ? '新名称' : '目标路径' }}</label>
            <input
              ref="inputRef"
              v-model="inputValue"
              class="input-field"
              :placeholder="mode === 'rename' ? '请输入新名称' : '请输入目标完整路径'"
              @keydown="handleKeydown"
              spellcheck="false"
            />
            <div class="preview-row" v-if="canConfirm">
              <span class="preview-label">目标：</span>
              <code class="preview-value">{{ destinationPath }}</code>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-cancel" @click="emit('cancel')">取消</button>
            <button class="btn btn-primary" :disabled="!canConfirm" @click="handleConfirm">
              {{ mode === 'rename' ? '重命名' : '移动' }}
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
  max-width: 480px;
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
}

.input-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
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

.preview-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--color-bg-inset);
}

.preview-label {
  font-size: 12px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.preview-value {
  font-size: 12px;
  color: var(--color-primary);
  font-family: 'SF Mono', 'Fira Code', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-divider);
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
