<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { SystemHealth } from '../types/system'
import CpuCard from '../components/home/CpuCard.vue'
import MemoryCard from '../components/home/MemoryCard.vue'
import NetworkCard from '../components/home/NetworkCard.vue'
import GpuCard from '../components/home/GpuCard.vue'
import DiskCard from '../components/home/DiskCard.vue'
import AlertTable from '../components/home/AlertTable.vue'
import AgentStatus from '../components/home/AgentStatus.vue'

const health = ref<SystemHealth | null>(null)
const connected = ref(false)
let eventSource: EventSource | null = null

const statusMap: Record<number, { label: string; cls: string }> = {
  0: { label: '正常', cls: 'status-ok' },
  1: { label: '警告', cls: 'status-warn' },
  2: { label: '异常', cls: 'status-error' },
}

function connectSSE() {
  eventSource = new EventSource('/api/system/health')

  eventSource.onopen = () => {
    connected.value = true
  }

  eventSource.onmessage = (event) => {
    try {
      health.value = JSON.parse(event.data)
    } catch {
    }
  }

  eventSource.onerror = () => {
    connected.value = false
    eventSource?.close()
    eventSource = null
    setTimeout(connectSSE, 5000)
  }
}

onMounted(() => {
  connectSSE()
})

onUnmounted(() => {
  eventSource?.close()
  eventSource = null
})
</script>

<template>
  <div class="home-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Dashboard</p>
        <h1 class="page-title">系统概览</h1>
        <p class="page-subtitle">实时系统健康监测，包括 CPU、内存、网络、磁盘和 GPU 状态</p>
      </div>
      <div class="header-right" v-if="health">
        <div class="health-score">
          <span class="score-label">健康评分</span>
          <span class="score-value" :class="{ good: health.healthScore >= 80, warn: health.healthScore >= 50 && health.healthScore < 80, bad: health.healthScore < 50 }">
            {{ health.healthScore }}
          </span>
        </div>
        <span class="status-badge" :class="statusMap[health.status]?.cls">
          {{ statusMap[health.status]?.label || '未知' }}
        </span>
        <span class="connection-badge" :class="{ connected, disconnected: !connected }">
          <span class="conn-dot"></span>
          {{ connected ? '已连接' : '未连接' }}
        </span>
      </div>
    </header>

    <div v-if="!health" class="loading-state">
      <div class="loading-spinner"></div>
      <span>正在连接系统监控...</span>
    </div>

    <template v-else>
      <section class="layer layer-1">
        <div class="layer-inner">
          <CpuCard :cpuInfo="health.cpuInfo" />
          <MemoryCard :memoryInfo="health.memoryInfo" />
        </div>
      </section>

      <section class="layer layer-2">
        <div class="layer-inner">
          <NetworkCard :networkInfos="health.networkInfos" />
          <GpuCard :gpuInfos="health.gpuInfos" />
          <DiskCard :diskInfos="health.diskInfos" />
        </div>
      </section>

      <section class="layer layer-3">
        <div class="layer-inner">
          <AlertTable />
          <AgentStatus />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.home-page {
  padding: 24px;
  max-width: 1440px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 22px;
  margin-bottom: 24px;
  border: 1px solid var(--color-border);
  border-radius: 24px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
}

.header-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-primary);
}

.page-title {
  margin-top: 6px;
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.05em;
  color: var(--color-text);
}

.page-subtitle {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  max-width: 700px;
}

.hostname {
  font-size: 14px;
  color: var(--color-text-muted);
  font-family: monospace;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.health-score {
  display: flex;
  align-items: center;
  gap: 6px;
}

.score-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.score-value {
  font-size: 20px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.score-value.good {
  color: var(--color-success);
}

.score-value.warn {
  color: var(--color-warning);
}

.score-value.bad {
  color: var(--color-danger);
}

.status-badge {
  font-size: 12px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 8px;
  letter-spacing: 0.3px;
}

.status-badge.status-ok {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.status-badge.status-warn {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.status-badge.status-error {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.connection-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
}

.conn-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.connection-badge.connected {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.connection-badge.connected .conn-dot {
  background: var(--color-success);
  box-shadow: 0 0 6px var(--color-success);
}

.connection-badge.disconnected {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.connection-badge.disconnected .conn-dot {
  background: var(--color-danger);
}

.layer {
  margin-bottom: 24px;
}

.layer-inner {
  display: grid;
  gap: 20px;
}

.layer-1 .layer-inner {
  grid-template-columns: 1fr 1fr;
}

.layer-2 .layer-inner {
  grid-template-columns: 1fr 1fr 1fr;
}

.layer-3 .layer-inner {
  grid-template-columns: 3fr 2fr;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 80px 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--color-border-solid);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 1200px) {
  .layer-2 .layer-inner {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 1024px) {
  .layer-1 .layer-inner {
    grid-template-columns: 1fr;
  }
  .layer-2 .layer-inner {
    grid-template-columns: 1fr;
  }
  .layer-3 .layer-inner {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .home-page {
    padding: 16px;
  }
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
