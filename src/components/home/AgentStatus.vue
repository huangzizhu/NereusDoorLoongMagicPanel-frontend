<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { isAxiosError } from 'axios'
import { getAgentStatus } from '../../api/agent'
import type { AgentStatusItem } from '../../types/agent'

const sessions = ref<AgentStatusItem[]>([])
const total = ref(0)
const loading = ref(true)
const loadFailed = ref(false)
const errorMessage = ref('')

const statusMap: Record<string, { label: string; cls: string }> = {
  idle: { label: '空闲', cls: 'idle' },
  running: { label: '运行中', cls: 'running' },
  waiting_approval: { label: '等待审批', cls: 'waiting' },
  waiting_plan: { label: '等待计划', cls: 'waiting' },
  waiting_choice: { label: '等待选择', cls: 'waiting' },
  completed: { label: '已完成', cls: 'completed' },
  completed_unread: { label: '完成未读', cls: 'unread' },
  cancelled: { label: '已取消', cls: 'cancelled' },
  error: { label: '异常', cls: 'error' },
}

const sourceMap: Record<string, string> = {
  manual: '手动对话',
  scheduled: '定时任务',
  inspection: '自动巡检',
}

function statusInfo(status: string) {
  return statusMap[status] || { label: status || '未知', cls: 'unknown' }
}

function sourceLabel(source: string | null) {
  return source ? sourceMap[source] || source : '未知来源'
}

function formatTime(time: string) {
  if (!time) return '-'
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return time
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function fetchAgentStatus() {
  loading.value = true
  loadFailed.value = false
  errorMessage.value = ''
  try {
    const res = await getAgentStatus(5)
    if (res.data.code !== 1) {
      throw new Error(res.data.msg || '获取 Agent 状态失败')
    }
    sessions.value = res.data.data.items
    total.value = res.data.data.total
  } catch (error: unknown) {
    sessions.value = []
    total.value = 0
    loadFailed.value = true
    if (isAxiosError(error) && error.response) {
      errorMessage.value = `请求失败（HTTP ${error.response.status}）`
    } else if (isAxiosError(error) && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT')) {
      errorMessage.value = '接口响应超时，请检查后端服务'
    } else if (error instanceof Error && error.message) {
      errorMessage.value = error.message
    } else {
      errorMessage.value = '网络异常，请稍后重试'
    }
  } finally {
    loading.value = false
  }
}

onMounted(fetchAgentStatus)
</script>

<template>
  <div class="card agent-card">
    <div class="card-header">
      <div class="card-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      </div>
      <span class="card-title">Agent 状态</span>
      <span v-if="total > 0" class="agent-count">{{ total }}</span>
    </div>

    <div v-if="loading" class="agent-placeholder">
      <span>加载中...</span>
    </div>

    <div v-else-if="loadFailed" class="agent-placeholder agent-error">
      <span>Agent 状态加载失败</span>
      <small>{{ errorMessage }}</small>
      <button class="agent-retry" type="button" @click="fetchAgentStatus">重试</button>
    </div>

    <div v-else-if="sessions.length === 0" class="agent-placeholder">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span>暂无 Agent 会话</span>
    </div>

    <div v-else class="agent-list">
      <div v-for="session in sessions" :key="session.sessionId" class="agent-item">
        <div class="agent-item-head">
          <span class="agent-item-title" :title="session.title">{{ session.title || '未命名会话' }}</span>
          <span class="agent-status" :class="statusInfo(session.status).cls">
            {{ statusInfo(session.status).label }}
          </span>
        </div>
        <div class="agent-item-meta">
          <span>{{ sourceLabel(session.source) }}</span>
          <span>{{ formatTime(session.updatedAt) }}</span>
        </div>
        <p v-if="session.lastError || session.summary" class="agent-item-summary" :class="{ 'has-error': session.lastError }">
          {{ session.lastError || session.summary }}
        </p>
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

.agent-count {
  min-width: 20px;
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--color-info-bg);
  color: var(--color-info);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.card-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--color-info), var(--color-info-light));
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

.agent-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.agent-error {
  color: var(--color-danger);
}

.agent-error small {
  color: var(--color-text-muted);
  font-size: 12px;
}

.agent-retry {
  border: 1px solid var(--color-border-solid);
  border-radius: 8px;
  padding: 5px 12px;
  background: var(--color-bg-inset);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 12px;
}

.agent-retry:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.agent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 2px;
}

.agent-item {
  min-width: 0;
  padding: 11px 12px;
  border-radius: 12px;
  background: var(--color-bg-inset);
}

.agent-item-head,
.agent-item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.agent-item-title {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-status {
  flex-shrink: 0;
  padding: 3px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.agent-status.idle,
.agent-status.completed,
.agent-status.cancelled,
.agent-status.unknown {
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
}

.agent-status.running {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.agent-status.waiting {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.agent-status.unread {
  background: var(--color-info-bg);
  color: var(--color-info);
}

.agent-status.error {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.agent-item-meta {
  margin-top: 5px;
  color: var(--color-text-muted);
  font-size: 11px;
}

.agent-item-summary {
  margin: 7px 0 0;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-item-summary.has-error {
  color: var(--color-danger);
}
</style>
