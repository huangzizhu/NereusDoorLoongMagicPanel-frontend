<script setup lang="ts">
import { ref, watch } from 'vue'
import type { GpuInfo } from '../../types/system'

const props = defineProps<{
  gpuInfos: GpuInfo[]
}>()

const selectedIndex = ref(0)

watch(() => props.gpuInfos, (infos) => {
  if (infos.length > 0 && selectedIndex.value >= infos.length) {
    selectedIndex.value = 0
  }
})

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

function getUsageGradient(percent: number): string {
  if (percent >= 90) return 'linear-gradient(180deg, var(--color-danger) 0%, var(--color-danger-hover) 100%)'
  if (percent >= 70) return 'linear-gradient(180deg, var(--color-warning-light) 0%, var(--color-warning) 100%)'
  return 'linear-gradient(180deg, var(--color-primary-light) 0%, var(--color-primary) 100%)'
}
void getUsageGradient

function handleSelect(e: Event) {
  const target = e.target as HTMLSelectElement
  selectedIndex.value = parseInt(target.value)
}
</script>

<template>
  <div class="card gpu-card">
    <div class="card-header">
      <div class="card-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2"/>
          <circle cx="12" cy="12" r="2"/>
          <line x1="6" y1="12" x2="6.01" y2="12"/>
          <line x1="18" y1="12" x2="18.01" y2="12"/>
          <line x1="6" y1="6" x2="6" y2="2"/>
          <line x1="10" y1="6" x2="10" y2="2"/>
          <line x1="14" y1="6" x2="14" y2="2"/>
          <line x1="18" y1="6" x2="18" y2="2"/>
        </svg>
      </div>
      <span class="card-title">GPU</span>
      <div class="device-selector" v-if="gpuInfos.length > 0">
        <select class="device-select" :value="selectedIndex" @change="handleSelect">
          <option v-for="(gpu, idx) in gpuInfos" :key="gpu.index" :value="idx">
            GPU {{ gpu.index }}
          </option>
        </select>
        <svg class="select-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
    </div>

    <div v-if="gpuInfos.length === 0" class="gpu-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2"/>
        <circle cx="12" cy="12" r="2"/>
        <line x1="6" y1="12" x2="6.01" y2="12"/>
        <line x1="18" y1="12" x2="18.01" y2="12"/>
        <line x1="6" y1="6" x2="6" y2="2"/>
        <line x1="10" y1="6" x2="10" y2="2"/>
        <line x1="14" y1="6" x2="14" y2="2"/>
        <line x1="18" y1="6" x2="18" y2="2"/>
      </svg>
      <span>未检测到 GPU 设备</span>
    </div>

    <template v-else>
      <div class="gpu-detail" v-if="gpuInfos[selectedIndex]">
        <div class="gpu-main">
          <div class="gpu-usage-ring">
            <svg viewBox="0 0 100 100">
              <circle class="ring-bg" cx="50" cy="50" r="42" />
              <circle
                class="ring-fill"
                cx="50" cy="50" r="42"
                :style="{
                  strokeDasharray: `${gpuInfos[selectedIndex].usagePercent * 2.64} ${264 - gpuInfos[selectedIndex].usagePercent * 2.64}`,
                  stroke: getUsageColor(gpuInfos[selectedIndex].usagePercent)
                }"
              />
            </svg>
            <div class="ring-center">
              <span class="ring-value">{{ gpuInfos[selectedIndex].usagePercent.toFixed(0) }}</span>
              <span class="ring-unit">%</span>
            </div>
          </div>
          <div class="gpu-name-block">
            <span class="gpu-name">{{ gpuInfos[selectedIndex].name }}</span>
          </div>
        </div>

        <div class="gpu-stats">
          <div class="stat-row">
            <span class="stat-label">温度</span>
            <span class="stat-value" :style="{ color: gpuInfos[selectedIndex].temperatureC > 80 ? 'var(--color-danger)' : gpuInfos[selectedIndex].temperatureC > 60 ? 'var(--color-warning)' : 'var(--color-text)' }">
              {{ gpuInfos[selectedIndex].temperatureC }}°C
            </span>
          </div>
          <div class="stat-row">
            <span class="stat-label">显存</span>
            <span class="stat-value">{{ formatBytes(gpuInfos[selectedIndex].memoryUsedBytes) }} / {{ formatBytes(gpuInfos[selectedIndex].memoryTotalBytes) }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">风扇</span>
            <span class="stat-value">{{ gpuInfos[selectedIndex].fanSpeedPercent }}%</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">功耗</span>
            <span class="stat-value">{{ gpuInfos[selectedIndex].powerUsageWatts.toFixed(1) }}W</span>
          </div>
        </div>
      </div>
    </template>
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
  background: linear-gradient(135deg, var(--color-warning), var(--color-warning-light));
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

.device-selector {
  margin-left: auto;
  position: relative;
  display: flex;
  align-items: center;
}

.device-select {
  appearance: none;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border-solid);
  border-radius: 8px;
  padding: 6px 28px 6px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  font-family: monospace;
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 100px;
}

.device-select:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.device-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.device-select option {
  background: var(--color-bg-surface);
  color: var(--color-text);
  border: none;
  padding: 8px 12px;
}

.select-arrow {
  position: absolute;
  right: 8px;
  pointer-events: none;
  color: var(--color-text-secondary);
}

.gpu-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.gpu-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gpu-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--color-bg-inset);
  border-radius: 14px;
  transition: background 0.3s ease;
}

.gpu-usage-ring {
  position: relative;
  width: 100px;
  height: 100px;
}

.gpu-usage-ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring-bg {
  fill: none;
  stroke: var(--color-bg-surface);
  stroke-width: 8;
}

.ring-fill {
  fill: none;
  stroke: var(--color-primary);
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dasharray 0.6s ease, stroke 0.3s ease;
}

.ring-center {
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

.gpu-name-block {
  text-align: center;
}

.gpu-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.3;
}

.gpu-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.stat-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}
</style>
