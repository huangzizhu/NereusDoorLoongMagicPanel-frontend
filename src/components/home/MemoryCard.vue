<script setup lang="ts">
import type { MemoryInfo } from '../../types/system'

defineProps<{
  memoryInfo: MemoryInfo
}>()

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i]
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return 'var(--color-danger)'
  if (percent >= 70) return 'var(--color-warning)'
  return 'var(--color-primary)'
}
</script>

<template>
  <div class="card memory-card">
    <div class="card-header">
      <div class="card-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="2"/>
          <line x1="6" y1="4" x2="6" y2="1"/>
          <line x1="10" y1="4" x2="10" y2="1"/>
          <line x1="14" y1="4" x2="14" y2="1"/>
          <line x1="18" y1="4" x2="18" y2="1"/>
          <line x1="6" y1="20" x2="6" y2="23"/>
          <line x1="10" y1="20" x2="10" y2="23"/>
          <line x1="14" y1="20" x2="14" y2="23"/>
          <line x1="18" y1="20" x2="18" y2="23"/>
          <rect x="6" y="8" width="3" height="8" rx="0.5"/>
          <rect x="10.5" y="8" width="3" height="8" rx="0.5"/>
        </svg>
      </div>
      <span class="card-title">内存</span>
    </div>

    <div class="usage-ring-wrapper">
      <svg class="usage-ring" viewBox="0 0 120 120">
        <circle class="ring-bg" cx="60" cy="60" r="50" />
        <circle
          class="ring-fill"
          cx="60" cy="60" r="50"
          :style="{
            strokeDasharray: `${memoryInfo.usagePercent * 3.14} ${314 - memoryInfo.usagePercent * 3.14}`,
            stroke: getUsageColor(memoryInfo.usagePercent)
          }"
        />
      </svg>
      <div class="ring-label">
        <span class="ring-value">{{ memoryInfo.usagePercent.toFixed(1) }}</span>
        <span class="ring-unit">%</span>
      </div>
    </div>

    <div class="mem-details">
      <div class="detail-row">
        <span class="detail-label">已用 / 总计</span>
        <span class="detail-value">{{ formatBytes(memoryInfo.usedBytes) }} / {{ formatBytes(memoryInfo.totalBytes) }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">可用</span>
        <span class="detail-value">{{ formatBytes(memoryInfo.availableBytes) }}</span>
      </div>
      <div class="swap-section">
        <div class="swap-title">Swap</div>
        <div class="detail-row">
          <span class="detail-label">已用 / 总计</span>
          <span class="detail-value">{{ formatBytes(memoryInfo.swapUsedBytes) }} / {{ formatBytes(memoryInfo.swapTotalBytes) }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">使用率</span>
          <span class="detail-value">{{ memoryInfo.swapUsagePercent.toFixed(1) }}%</span>
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
  margin-bottom: 12px;
}

.card-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--color-success), var(--color-success-light));
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

.usage-ring-wrapper {
  position: relative;
  width: 120px;
  height: 120px;
  margin: 0 auto 16px;
}

.usage-ring {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-bg {
  fill: none;
  stroke: var(--color-bg-inset);
  stroke-width: 8;
}

.ring-fill {
  fill: none;
  stroke: var(--color-primary);
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dasharray 0.6s ease, stroke 0.3s ease;
}

.ring-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.ring-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.ring-unit {
  font-size: 12px;
  color: var(--color-text-muted);
}

.mem-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.detail-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.swap-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-divider);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.swap-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
