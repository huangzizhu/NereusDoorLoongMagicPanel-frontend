<script setup lang="ts">
import { computed } from 'vue'
import type { DockerContainerSummary } from '../../types/docker'

const props = defineProps<{
  items: DockerContainerSummary[]
  selectedId: string
  actionLoadingId: string
}>()

const emit = defineEmits<{
  select: [containerId: string]
  start: [containerId: string]
  stop: [containerId: string]
  restart: [containerId: string]
  remove: [containerId: string]
  logs: [containerId: string]
}>()

function isRunning(status: string) {
  return /^up\b/i.test(status.trim())
}

function formatCpu(value: number) {
  return `${Number(value || 0).toFixed(2)}%`
}

function formatMemory(usedMB: number, limitMB: number) {
  const used = Number(usedMB || 0)
  const limit = Number(limitMB || 0)
  if (limit <= 0) return `${used.toFixed(1)} MB`
  return `${used.toFixed(1)} / ${limit.toFixed(0)} MB`
}

function healthLabel(status: string) {
  if (/healthy/i.test(status)) return 'healthy'
  if (/unhealthy/i.test(status)) return 'unhealthy'
  if (isRunning(status)) return 'running'
  if (/restart/i.test(status)) return 'restarting'
  return 'stopped'
}

function healthTone(status: string) {
  const label = healthLabel(status)
  if (label === 'healthy' || label === 'running') return 'success'
  if (label === 'restarting') return 'warning'
  if (label === 'unhealthy') return 'danger'
  return 'muted'
}

const hasItems = computed(() => props.items.length > 0)
</script>

<template>
  <div class="table-card">
    <div v-if="!hasItems" class="table-empty">
      <div class="empty-title">没有匹配的容器</div>
      <div class="empty-text">调整搜索条件或刷新列表后再试。</div>
    </div>

    <div v-else class="table-scroll">
      <table class="container-table">
        <thead>
          <tr>
            <th>容器</th>
            <th>状态</th>
            <th>端口映射</th>
            <th>CPU</th>
            <th>内存</th>
            <th class="actions-col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.containerId"
            :class="{ active: selectedId === item.containerId }"
            @click="emit('select', item.containerId)"
          >
            <td>
              <div class="container-main">
                <div class="container-name">{{ item.imageName }}</div>
                <div class="container-id">{{ item.containerId.slice(0, 12) }}</div>
              </div>
            </td>
            <td>
              <span class="status-pill" :class="healthTone(item.status)">{{ healthLabel(item.status) }}</span>
              <div class="status-text">{{ item.status }}</div>
            </td>
            <td>
              <div class="ports-text">{{ item.ports || '-' }}</div>
            </td>
            <td>
              <div class="metric-value">{{ formatCpu(item.cpuPercent) }}</div>
            </td>
            <td>
              <div class="metric-value">{{ formatMemory(item.memoryUsageMB, item.memoryLimitMB) }}</div>
            </td>
            <td class="actions-col">
              <div class="row-actions" @click.stop>
                <button class="mini-btn" @click="emit('logs', item.containerId)">日志</button>
                <button
                  v-if="isRunning(item.status)"
                  class="mini-btn warning-btn"
                  :disabled="actionLoadingId === item.containerId"
                  @click="emit('stop', item.containerId)"
                >
                  停止
                </button>
                <button
                  v-else
                  class="mini-btn primary"
                  :disabled="actionLoadingId === item.containerId"
                  @click="emit('start', item.containerId)"
                >
                  启动
                </button>
                <button
                  class="mini-btn info-btn"
                  :disabled="actionLoadingId === item.containerId"
                  @click="emit('restart', item.containerId)"
                >
                  重启
                </button>
                <button
                  class="mini-btn danger"
                  :disabled="isRunning(item.status) || actionLoadingId === item.containerId"
                  :title="isRunning(item.status) ? '请先停止容器再删除' : '删除容器'"
                  @click="emit('remove', item.containerId)"
                >
                  删除
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.table-card {
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.table-scroll {
  overflow-x: auto;
}

.container-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
}

.container-table th,
.container-table td {
  padding: 16px 18px;
  border-bottom: 1px solid var(--color-divider);
  text-align: left;
  vertical-align: top;
}

.container-table th {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: var(--color-bg-elevated);
}

.container-table tbody tr {
  cursor: pointer;
  transition: background 0.18s ease;
}

.container-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.container-table tbody tr.active {
  background: var(--color-bg-active);
}

.container-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.container-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  word-break: break-word;
}

.container-id {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  color: var(--color-text-muted);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.status-pill.success {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.status-pill.warning {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.status-pill.danger {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.status-pill.muted {
  background: var(--color-bg-inset);
  color: var(--color-text-secondary);
}

.status-text,
.ports-text {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  word-break: break-word;
}

.metric-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
}

.actions-col {
  width: 250px;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mini-btn {
  border: none;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
  color: var(--color-text-secondary);
  background: var(--color-bg-inset);
}

.mini-btn:hover {
  color: var(--color-text);
  transform: translateY(-1px);
}

.mini-btn.primary {
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.mini-btn.warning-btn {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.mini-btn.info-btn {
  color: var(--color-info);
  background: var(--color-info-bg);
}

.mini-btn.danger {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.mini-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  transform: none;
}

.table-empty {
  padding: 42px 24px;
  text-align: center;
}

.empty-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
}

.empty-text {
  margin-top: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}
</style>
