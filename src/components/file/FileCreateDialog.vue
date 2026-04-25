<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  visible: boolean
  type: 'file' | 'folder'
  currentPath: string
}>()

const emit = defineEmits<{
  confirm: [name: string]
  cancel: []
}>()

const name = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

watch(() => props.visible, async (val) => {
  if (val) {
    name.value = ''
    await nextTick()
    inputRef.value?.focus()
  }
})

function handleConfirm() {
  const trimmed = name.value.trim()
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
              <svg v-if="type === 'folder'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
              <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
            </div>
            <h3 class="dialog-title">{{ type === 'folder' ? '新建文件夹' : '新建文件' }}</h3>
          </div>
          <div class="dialog-body">
            <label class="input-label">{{ type === 'folder' ? '文件夹名称' : '文件名称' }}</label>
            <div class="input-wrapper">
              <span class="input-prefix">{{ currentPath === '/' ? '/' : currentPath + '/' }}</span>
              <input
                ref="inputRef"
                v-model="name"
                class="input-field"
                :placeholder="type === 'folder' ? '请输入文件夹名称' : '请输入文件名称'"
                @keydown="handleKeydown"
                spellcheck="false"
              />
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-cancel" @click="emit('cancel')">取消</button>
            <button class="btn btn-primary" :disabled="!name.trim()" @click="handleConfirm">创建</button>
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
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}

.dialog-card {
  width: 90%;
  max-width: 440px;
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

.input-wrapper {
  display: flex;
  align-items: center;
  border: 1.5px solid var(--color-border-solid);
  border-radius: 10px;
  background: var(--color-bg-inset);
  overflow: hidden;
  transition: all 0.2s ease;
}

.input-wrapper:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.input-prefix {
  padding: 10px 12px;
  font-size: 13px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  color: var(--color-text-muted);
  background: var(--color-bg-inset);
  white-space: nowrap;
  border-right: 1px solid var(--color-border-solid);
  user-select: none;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.input-field {
  flex: 1;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 14px;
  outline: none;
  min-width: 0;
}

.input-field::placeholder {
  color: var(--color-text-faint);
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
