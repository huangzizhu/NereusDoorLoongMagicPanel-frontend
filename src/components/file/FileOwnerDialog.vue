<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { FileItem } from '../../types/file'

const props = defineProps<{
  visible: boolean
  item: FileItem | null
}>()

const emit = defineEmits<{
  confirm: [path: string, owner: string, group: string, recursive: boolean]
  cancel: []
}>()

const owner = ref('')
const group = ref('')
const recursive = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

watch(() => props.visible, async (val) => {
  if (val && props.item) {
    owner.value = props.item.owner || ''
    group.value = ''
    recursive.value = false
    await nextTick()
    inputRef.value?.focus()
  }
})

function handleConfirm() {
  if (!props.item) return
  const o = owner.value.trim()
  const g = group.value.trim()
  if (!o || !g) return
  emit('confirm', props.item.path, o, g, recursive.value)
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
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div>
              <h3 class="dialog-title">更改所有者</h3>
              <p class="dialog-subtitle">{{ item.name }}</p>
            </div>
          </div>
          <div class="dialog-body">
            <div class="form-row">
              <label class="input-label">所有者</label>
              <input
                ref="inputRef"
                v-model="owner"
                class="input-field"
                placeholder="请输入新的所有者"
                @keydown="handleKeydown"
                spellcheck="false"
              />
            </div>
            <div class="form-row">
              <label class="input-label">用户组</label>
              <input
                v-model="group"
                class="input-field"
                placeholder="请输入新的用户组"
                @keydown="handleKeydown"
                spellcheck="false"
              />
            </div>
            <div class="form-row checkbox-row" v-if="item.type === 1">
              <input type="checkbox" v-model="recursive" class="checkbox" id="recursive-check" />
              <label for="recursive-check" class="checkbox-label">递归应用到所有子文件和文件夹</label>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-cancel" @click="emit('cancel')">取消</button>
            <button class="btn btn-primary" :disabled="!owner.trim() || !group.trim()" @click="handleConfirm">应用</button>
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

.dialog-subtitle {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}

.dialog-body {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
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

.checkbox-row {
  flex-direction: row !important;
  align-items: center;
  gap: 8px !important;
}

.checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.checkbox-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
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
