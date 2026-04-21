<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { AlertItem } from '../../types/system'
import { getAlerts, markAlertRead, markAlertProcessed } from '../../api/system'

const alerts = ref<AlertItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const includeProcessed = ref(false)

const levelMap: Record<number, { label: string; cls: string }> = {
  0: { label: '信息', cls: 'info' },
  1: { label: '警告', cls: 'warning' },
  2: { label: '严重', cls: 'danger' },
}

const statusMap: Record<number, { label: string; cls: string }> = {
  0: { label: '未读', cls: 'unread' },
  1: { label: '已读', cls: 'read' },
  2: { label: '已处理', cls: 'processed' },
}

async function fetchAlerts() {
  loading.value = true
  try {
    const res = await getAlerts(page.value - 0, pageSize.value, !includeProcessed.value)
    if (res.data.code === 1) {
      alerts.value = res.data.data.items
      total.value = res.data.data.total
    }
  } catch {
  } finally {
    loading.value = false
  }
}

async function handleRead(id: number) {
  try {
    const res = await markAlertRead(id)
    if (res.data.code === 1) {
      await fetchAlerts()
    }
  } catch {
  }
}

async function handleProcess(id: number) {
  try {
    const res = await markAlertProcessed(id)
    if (res.data.code === 1) {
      await fetchAlerts()
    }
  } catch {
  }
}

function formatTime(timeStr: string): string {
  const d = new Date(timeStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}:${s}`
}

onMounted(() => {
  fetchAlerts()
})
</script>

<template>
  <div class="card alert-card">
    <div class="card-header">
      <div class="card-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
      </div>
      <span class="card-title">系统告警</span>
      <span class="alert-count" v-if="total > 0">{{ total }}</span>
      <div class="processed-toggle">
        <span class="toggle-label">显示已处理</span>
        <label class="toggle-switch">
          <input type="checkbox" v-model="includeProcessed" @change="fetchAlerts">
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div v-if="loading" class="alert-loading">加载中...</div>

    <div v-else-if="alerts.length === 0" class="alert-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <span>暂无告警</span>
    </div>

    <div v-else class="alert-list">
      <div v-for="alert in alerts" :key="alert.id" class="alert-item">
        <div class="alert-left">
          <span class="alert-level" :class="levelMap[alert.level]?.cls">
            {{ levelMap[alert.level]?.label || '未知' }}
          </span>
          <div class="alert-content">
            <span class="alert-message">{{ alert.message }}</span>
            <span class="alert-time">{{ formatTime(alert.createTime) }}</span>
          </div>
        </div>
        <div class="alert-right">
          <span class="alert-status" :class="statusMap[alert.status]?.cls">
            {{ statusMap[alert.status]?.label || '未知' }}
          </span>
          <div class="alert-actions">
            <button
              v-if="alert.status === 0"
              class="action-btn read-btn"
              @click="handleRead(alert.id)"
            >已读</button>
            <button
              v-if="alert.status < 2"
              class="action-btn process-btn"
              @click="handleProcess(alert.id)"
            >已处理</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  background: var(--color-bg-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  padding: 20px;
  transition: background 0.3s ease, border-color 0.3s ease;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.card-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--color-danger), var(--color-danger-hover));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.card-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
}

.alert-count {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: var(--color-danger);
  padding: 2px 8px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
}

.processed-toggle {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 20px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-bg-inset);
  border: 1px solid var(--color-border-solid);
  border-radius: 20px;
  transition: all 0.2s ease;
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 2px;
  bottom: 2px;
  background-color: var(--color-text-secondary);
  border-radius: 50%;
  transition: all 0.2s ease;
}

input:checked + .toggle-slider {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
}

input:checked + .toggle-slider:before {
  transform: translateX(20px);
  background-color: #fff;
}

.alert-loading,
.alert-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.alert-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.alert-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--color-bg-inset);
  border-radius: 12px;
  transition: background 0.3s ease;
}

.alert-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.alert-level {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  flex-shrink: 0;
  letter-spacing: 0.3px;
}

.alert-level.info {
  color: var(--color-info);
  background: var(--color-info-bg);
}

.alert-level.warning {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.alert-level.danger {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.alert-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.alert-message {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.alert-time {
  font-size: 12px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.alert-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.alert-status {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
}

.alert-status.unread {
  color: var(--color-text-secondary);
  background: var(--color-bg-inset);
}

.alert-status.read {
  color: var(--color-info);
  background: var(--color-info-bg);
}

.alert-status.processed {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.alert-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  border: none;
  border-radius: 8px;
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.read-btn {
  background: var(--color-info-bg);
  color: var(--color-info);
}

.read-btn:hover {
  background: var(--color-info);
  color: #fff;
}

.process-btn {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.process-btn:hover {
  background: var(--color-success);
  color: #fff;
}

@media (max-width: 768px) {
  .card-header {
    flex-wrap: wrap;
  }
  .processed-toggle {
    order: 4;
    width: 100%;
    justify-content: flex-end;
    margin-left: 0;
  }
  .alert-item {
    flex-direction: column;
    align-items: flex-start;
  }
  .alert-right {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
