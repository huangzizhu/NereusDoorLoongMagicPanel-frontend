<script setup lang="ts">
import type { CpuInfo } from '../../types/system'

defineProps<{
  cpuInfo: CpuInfo
}>()

function getUsageColor(percent: number): string {
  if (percent >= 90) return 'var(--color-danger)'
  if (percent >= 70) return 'var(--color-warning)'
  return 'var(--color-primary)'
}
</script>

<template>
  <div class="card cpu-card">
    <div class="card-header">
      <div class="card-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>
          <rect x="9" y="9" width="6" height="6"/>
          <line x1="9" y1="1" x2="9" y2="4"/>
          <line x1="15" y1="1" x2="15" y2="4"/>
          <line x1="9" y1="20" x2="9" y2="23"/>
          <line x1="15" y1="20" x2="15" y2="23"/>
          <line x1="20" y1="9" x2="23" y2="9"/>
          <line x1="20" y1="14" x2="23" y2="14"/>
          <line x1="1" y1="9" x2="4" y2="9"/>
          <line x1="1" y1="14" x2="4" y2="14"/>
        </svg>
      </div>
      <span class="card-title">CPU</span>
    </div>

    <div class="cpu-model">{{ cpuInfo.modelName }}</div>

    <div class="usage-ring-wrapper">
      <svg class="usage-ring" viewBox="0 0 120 120">
        <circle class="ring-bg" cx="60" cy="60" r="50" />
        <circle
          class="ring-fill"
          cx="60" cy="60" r="50"
          :style="{
            strokeDasharray: `${cpuInfo.usagePercent * 3.14} ${314 - cpuInfo.usagePercent * 3.14}`,
            stroke: getUsageColor(cpuInfo.usagePercent)
          }"
        />
      </svg>
      <div class="ring-label">
        <span class="ring-value">{{ cpuInfo.usagePercent.toFixed(1) }}</span>
        <span class="ring-unit">%</span>
      </div>
    </div>

    <div class="cpu-details">
      <div class="detail-row">
        <span class="detail-label">核心数</span>
        <span class="detail-value">{{ cpuInfo.coreCount }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">负载 1min</span>
        <span class="detail-value">{{ cpuInfo.load1Min.toFixed(2) }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">负载 5min</span>
        <span class="detail-value">{{ cpuInfo.load5Min.toFixed(2) }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">负载 15min</span>
        <span class="detail-value">{{ cpuInfo.load15Min.toFixed(2) }}</span>
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
  background: linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-end));
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

.cpu-model {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: 16px;
  line-height: 1.4;
  word-break: break-all;
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

.cpu-details {
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
</style>
