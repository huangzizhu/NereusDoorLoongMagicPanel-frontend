<script setup lang="ts">
import { ref, watch } from 'vue'
import type { FileItem, FileInfoData } from '../../types/file'
import * as fileApi from '../../api/file'
import { useNotification } from '../../composables/useNotification'

const props = defineProps<{
  visible: boolean
  item: FileItem | null
}>()

const emit = defineEmits<{
  cancel: []
}>()

const notify = useNotification()
const detail = ref<FileInfoData | null>(null)
const loading = ref(false)

watch(() => props.visible, async (val) => {
  if (val && props.item) {
    loading.value = true
    try {
      const res = await fileApi.getFileInfo(props.item.path)
      if (res.data.code === 1) {
        detail.value = res.data.data
      } else {
        notify.warning('获取详情失败', res.data.msg)
      }
    } catch (e: any) {
      notify.error('获取详情失败', e.message)
    } finally {
      loading.value = false
    }
  } else {
    detail.value = null
  }
})

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i]
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function getTypeName(type: number): string {
  if (type === 0) return '文件'
  if (type === 1) return '文件夹'
  if (type === 2) return '链接'
  return '未知'
}

async function copyPath(path: string) {
  if (!path) return

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(path)
      notify.info('路径已复制', path)
      return
    }
  } catch {
    // Fallback below.
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = path
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)

    if (copied) {
      notify.info('路径已复制', path)
    } else {
      notify.warning('复制失败', '浏览器不支持或权限受限，请手动复制')
    }
  } catch {
    notify.warning('复制失败', '浏览器不支持或权限受限，请手动复制')
  }
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
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </div>
            <div>
              <h3 class="dialog-title">文件详情</h3>
              <p class="dialog-subtitle">{{ item.name }}</p>
            </div>
          </div>
          <div class="dialog-body">
            <div v-if="loading" class="loading-state">
              <svg class="spin-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              <span>加载中...</span>
            </div>
            <div v-else-if="detail" class="detail-grid">
              <div class="detail-row">
                <span class="detail-label">名称</span>
                <span class="detail-value">{{ detail.name }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">路径</span>
                <div class="detail-value detail-path-wrap">
                  <code class="mono">{{ detail.path }}</code>
                  <button class="copy-path-btn" type="button" title="复制路径" @click="copyPath(detail.path)">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="detail-row">
                <span class="detail-label">类型</span>
                <span class="detail-value">{{ getTypeName(detail.type) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">大小</span>
                <span class="detail-value">{{ formatSize(detail.size) }} <span class="size-bytes">({{ detail.size }} 字节)</span></span>
              </div>
              <div class="detail-row">
                <span class="detail-label">创建时间</span>
                <span class="detail-value">{{ formatDate(detail.createdTime) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">修改时间</span>
                <span class="detail-value">{{ formatDate(detail.modifiedTime) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">所有者</span>
                <span class="detail-value">{{ detail.owner }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">用户组</span>
                <span class="detail-value">{{ detail.group }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">权限</span>
                <span class="detail-value">{{ detail.permissions }}</span>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-cancel" @click="emit('cancel')">关闭</button>
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

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 30px 0;
  color: var(--color-text-faint);
  font-size: 13px;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.detail-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  border-radius: 10px;
  background: var(--color-bg-inset);
}

.detail-row {
  display: flex;
  align-items: baseline;
  padding: 8px 10px;
  border-radius: 6px;
  gap: 12px;
}

.detail-row:hover {
  background: var(--color-bg-hover);
}

.detail-label {
  width: 80px;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.detail-value {
  flex: 1;
  font-size: 14px;
  color: var(--color-text);
  word-break: break-all;
  min-width: 0;
}

.detail-value.mono {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 12px;
}

.detail-path-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.detail-path-wrap .mono {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.copy-path-btn {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 8px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.copy-path-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.size-bytes {
  font-size: 12px;
  color: var(--color-text-muted);
}

.type-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
}

.type-badge.folder {
  background: var(--color-primary-ghost);
  color: var(--color-primary);
}

.perm-code {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--color-bg-surface);
  color: var(--color-primary);
  font-weight: 600;
  letter-spacing: 1px;
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
