<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import type { FileItem } from '../../types/file'

const props = defineProps<{
  visible: boolean
  item: FileItem | null
}>()

const emit = defineEmits<{
  confirm: [path: string, permissions: string]
  cancel: []
}>()

interface PermGroup {
  read: boolean
  write: boolean
  execute: boolean
}

const perms = reactive<{ owner: PermGroup; group: PermGroup; others: PermGroup }>({
  owner: { read: false, write: false, execute: false },
  group: { read: false, write: false, execute: false },
  others: { read: false, write: false, execute: false },
})

const octalInput = ref('')
const octalError = ref('')

function parsePermissionsString(permStr: string) {
  if (!permStr || permStr.length < 9) return
  const groups: (keyof typeof perms)[] = ['owner', 'group', 'others']
  const keys: (keyof PermGroup)[] = ['read', 'write', 'execute']
  groups.forEach((g, gi) => {
    keys.forEach((k, ki) => {
      perms[g][k] = permStr[gi * 3 + ki] !== '-'
    })
  })
  syncOctalFromPerms()
}

function syncOctalFromPerms() {
  const groups: (keyof typeof perms)[] = ['owner', 'group', 'others']
  const val = groups.map(g => {
    let v = 0
    if (perms[g].read) v += 4
    if (perms[g].write) v += 2
    if (perms[g].execute) v += 1
    return v
    }).join('')
  octalInput.value = val
  octalError.value = ''
}

function syncPermsFromOctal() {
  const val = octalInput.value.trim()
  if (!/^[0-7]{3}$/.test(val)) {
    octalError.value = val.length > 0 ? '请输入3位八进制数（如 755）' : ''
    return
  }
  octalError.value = ''
  const groups: (keyof typeof perms)[] = ['owner', 'group', 'others']
  groups.forEach((g, i) => {
    const digit = parseInt(val[i], 8)
    perms[g].read = (digit & 4) !== 0
    perms[g].write = (digit & 2) !== 0
    perms[g].execute = (digit & 1) !== 0
  })
}

watch(() => props.visible, (val) => {
  if (val && props.item) {
    parsePermissionsString(props.item.permissions)
  }
})

watch(perms, () => {
  syncOctalFromPerms()
}, { deep: true })

function handleOctalInput() {
  syncPermsFromOctal()
}

function handleConfirm() {
  if (!props.item) return
  const val = octalInput.value.trim()
  if (!/^[0-7]{3}$/.test(val)) {
    octalError.value = '请输入有效的3位八进制权限值'
    return
  }
  emit('confirm', props.item.path, val)
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
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div>
              <h3 class="dialog-title">权限管理</h3>
              <p class="dialog-subtitle">{{ item.name }}</p>
            </div>
          </div>
          <div class="dialog-body">
            <div class="perm-table">
              <div class="perm-row perm-header">
                <div class="perm-label"></div>
                <div class="perm-cell">读取</div>
                <div class="perm-cell">写入</div>
                <div class="perm-cell">执行</div>
              </div>
              <div class="perm-row">
                <div class="perm-label">所有者</div>
                <div class="perm-cell"><input type="checkbox" v-model="perms.owner.read" class="checkbox" /></div>
                <div class="perm-cell"><input type="checkbox" v-model="perms.owner.write" class="checkbox" /></div>
                <div class="perm-cell"><input type="checkbox" v-model="perms.owner.execute" class="checkbox" /></div>
              </div>
              <div class="perm-row">
                <div class="perm-label">用户组</div>
                <div class="perm-cell"><input type="checkbox" v-model="perms.group.read" class="checkbox" /></div>
                <div class="perm-cell"><input type="checkbox" v-model="perms.group.write" class="checkbox" /></div>
                <div class="perm-cell"><input type="checkbox" v-model="perms.group.execute" class="checkbox" /></div>
              </div>
              <div class="perm-row">
                <div class="perm-label">其他人</div>
                <div class="perm-cell"><input type="checkbox" v-model="perms.others.read" class="checkbox" /></div>
                <div class="perm-cell"><input type="checkbox" v-model="perms.others.write" class="checkbox" /></div>
                <div class="perm-cell"><input type="checkbox" v-model="perms.others.execute" class="checkbox" /></div>
              </div>
            </div>
            <div class="octal-input-row">
              <span class="octal-label">权限值</span>
              <input
                v-model="octalInput"
                class="octal-input"
                placeholder="如 755"
                maxlength="3"
                @input="handleOctalInput"
                spellcheck="false"
              />
            </div>
            <p v-if="octalError" class="octal-error">{{ octalError }}</p>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-cancel" @click="emit('cancel')">取消</button>
            <button class="btn btn-primary" @click="handleConfirm">应用</button>
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
  max-width: 420px;
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
}

.perm-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border-radius: 10px;
  background: var(--color-bg-inset);
}

.perm-row {
  display: flex;
  align-items: center;
  padding: 4px 0;
}

.perm-row.perm-header {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-divider);
  margin-bottom: 4px;
}

.perm-label {
  width: 70px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.perm-cell {
  flex: 1;
  display: flex;
  justify-content: center;
}

.checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.octal-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--color-bg-inset);
}

.octal-label {
  font-size: 13px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.octal-input {
  flex: 1;
  padding: 6px 10px;
  border: 1.5px solid var(--color-border-solid);
  border-radius: 8px;
  background: var(--color-bg-surface);
  color: var(--color-primary);
  font-size: 18px;
  font-weight: 800;
  font-family: 'SF Mono', 'Fira Code', monospace;
  letter-spacing: 4px;
  text-align: center;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.octal-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.octal-input::placeholder {
  color: var(--color-text-faint);
  letter-spacing: 1px;
  font-weight: 400;
  font-size: 13px;
}

.octal-error {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--color-danger);
  text-align: center;
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

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
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
