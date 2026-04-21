<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { DiskInfo } from '../../types/system'

const props = defineProps<{
  diskInfos: DiskInfo[]
}>()

const selectedIndex = ref(0)

watch(() => props.diskInfos, (infos) => {
  if (infos.length > 0 && selectedIndex.value >= infos.length) {
    selectedIndex.value = 0
  }
})

const currentDisk = computed(() => {
  return props.diskInfos[selectedIndex.value] || {
    mountPoint: '',
    totalBytes: 0,
    usedBytes: 0,
    usagePercent: 0,
    fileSystemType: '',
  }
})

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i]
}

function getBarColor(percent: number): string {
  if (percent >= 95) return 'var(--color-danger)'
  if (percent >= 80) return 'var(--color-warning)'
  return 'var(--color-primary)'
}

function getBarGradient(percent: number): string {
  if (percent >= 95) return 'linear-gradient(90deg, var(--color-danger) 0%, var(--color-danger-hover) 100%)'
  if (percent >= 80) return 'linear-gradient(90deg, var(--color-warning-light) 0%, var(--color-warning) 100%)'
  return 'linear-gradient(90deg, var(--color-primary-light) 0%, var(--color-primary) 100%)'
}

function handleSelect(e: Event) {
  const target = e.target as HTMLSelectElement
  selectedIndex.value = parseInt(target.value)
}
</script>

<template>
  <div class="card disk-card">
    <div class="card-header">
      <div class="card-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="3" width="20" height="18" rx="2"/>
          <line x1="2" y1="9" x2="22" y2="9"/>
          <circle cx="6" cy="6" r="1" fill="currentColor"/>
          <circle cx="10" cy="6" r="1" fill="currentColor"/>
          <rect x="6" y="13" width="12" height="4" rx="1"/>
        </svg>
      </div>
      <span class="card-title">磁盘</span>
      <div class="device-selector" v-if="diskInfos.length > 0">
        <select class="device-select" :value="selectedIndex" @change="handleSelect">
          <option v-for="(disk, idx) in diskInfos" :key="disk.mountPoint" :value="idx">
            {{ disk.mountPoint }}
          </option>
        </select>
        <svg class="select-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
    </div>

    <div v-if="diskInfos.length === 0" class="disk-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="18" rx="2"/>
        <line x1="2" y1="9" x2="22" y2="9"/>
        <circle cx="6" cy="6" r="1" fill="currentColor"/>
        <circle cx="10" cy="6" r="1" fill="currentColor"/>
        <rect x="6" y="13" width="12" height="4" rx="1"/>
      </svg>
      <span>未检测到磁盘设备</span>
    </div>

    <template v-else>
      <div class="disk-detail" v-if="currentDisk">
        <div class="mount-point">
          <span class="mount-label">挂载点</span>
          <span class="mount-path">{{ currentDisk.mountPoint }}</span>
        </div>

        <div class="usage-section">
          <div class="usage-header">
            <span class="usage-percent" :style="{ color: getBarColor(currentDisk.usagePercent) }">{{ currentDisk.usagePercent.toFixed(1) }}%</span>
            <span class="usage-label">使用率</span>
          </div>
          <div class="usage-bar-track" :class="{ critical: currentDisk.usagePercent >= 95 }">
            <div
              class="usage-bar-fill"
              :style="{ width: Math.min(currentDisk.usagePercent, 100) + '%', background: getBarGradient(currentDisk.usagePercent) }"
            >
              <div class="usage-bar-shine"></div>
            </div>
          </div>
          <div class="usage-scale">
            <span>0</span>
            <span>25</span>
            <span>50</span>
            <span>75</span>
            <span>100</span>
          </div>
        </div>

        <div class="disk-stats">
          <div class="stat-row">
            <span class="stat-label">已用</span>
            <span class="stat-value">{{ formatBytes(currentDisk.usedBytes) }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">总量</span>
            <span class="stat-value">{{ formatBytes(currentDisk.totalBytes) }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">文件系统</span>
            <span class="stat-value">{{ currentDisk.fileSystem }}</span>
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
  background: linear-gradient(135deg, var(--color-purple), var(--color-purple-light));
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

.disk-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.disk-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mount-point {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mount-label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.mount-path {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  font-family: monospace;
}

.usage-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: var(--color-bg-inset);
  border-radius: 14px;
}

.usage-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.usage-percent {
  font-size: 28px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  transition: color 0.3s ease;
}

.usage-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.usage-bar-track {
  width: 100%;
  height: 20px;
  background: var(--color-bg-surface);
  border-radius: 999px;
  overflow: hidden;
  position: relative;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.08);
}

.usage-bar-track.critical {
  animation: track-pulse 1.5s infinite;
}

.usage-bar-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.8s ease, background 0.3s ease;
  position: relative;
  overflow: hidden;
  min-width: 20px;
}

.usage-bar-shine {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0) 100%);
  border-radius: 999px 999px 0 0;
}

.usage-scale {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
  padding: 0 2px;
}

.disk-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--color-bg-inset);
  border-radius: 12px;
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

@keyframes track-pulse {
  0%, 100% { box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.08); }
  50% { box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.08), 0 0 8px var(--color-danger); }
}
</style>
