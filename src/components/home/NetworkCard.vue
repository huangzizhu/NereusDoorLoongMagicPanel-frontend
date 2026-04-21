<script setup lang="ts">
import { ref, watch } from 'vue'
import type { NetworkInfo } from '../../types/system'

const props = defineProps<{
  networkInfos: NetworkInfo[]
}>()

const selectedIndex = ref(0)

watch(() => props.networkInfos, (infos) => {
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

function formatRate(bytesPerSec: number): string {
  if (bytesPerSec === 0) return '0 B/s'
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  const i = Math.floor(Math.log(bytesPerSec) / Math.log(1024))
  return (bytesPerSec / Math.pow(1024, i)).toFixed(2) + ' ' + units[i]
}

function handleSelect(e: Event) {
  const target = e.target as HTMLSelectElement
  selectedIndex.value = parseInt(target.value)
}
</script>

<template>
  <div class="card network-card">
    <div class="card-header">
      <div class="card-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
          <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
          <circle cx="12" cy="20" r="1" fill="currentColor"/>
        </svg>
      </div>
      <span class="card-title">网络</span>
      <div class="device-selector" v-if="networkInfos.length > 0">
        <select class="device-select" :value="selectedIndex" @change="handleSelect">
          <option v-for="(nic, idx) in networkInfos" :key="nic.interfaceName" :value="idx">
            {{ nic.interfaceName }}
          </option>
        </select>
        <svg class="select-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
    </div>

    <div v-if="networkInfos.length === 0" class="network-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
        <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
        <circle cx="12" cy="20" r="1" fill="currentColor"/>
      </svg>
      <span>未检测到网络设备</span>
    </div>

    <template v-else>
      <div class="network-detail" v-if="networkInfos[selectedIndex]">
        <div class="nic-name-block">
          <span class="nic-name">{{ networkInfos[selectedIndex].interfaceName }}</span>
          <span class="nic-status-badge" :class="{ up: networkInfos[selectedIndex].isUp, down: !networkInfos[selectedIndex].isUp }">
            <span class="status-dot"></span>
            {{ networkInfos[selectedIndex].isUp ? '在线' : '离线' }}
          </span>
        </div>

        <div class="nic-ip" v-if="networkInfos[selectedIndex].ipAddress">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
          {{ networkInfos[selectedIndex].ipAddress }}
        </div>

        <div class="nic-stats">
          <div class="stat-card sent">
            <div class="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"/>
                <polyline points="5 12 12 5 19 12"/>
              </svg>
            </div>
            <div class="stat-info">
              <span class="stat-label">发送</span>
              <span class="stat-rate">{{ formatRate(networkInfos[selectedIndex].sentBytesPerSec) }}</span>
            </div>
          </div>
          <div class="stat-card recv">
            <div class="stat-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <polyline points="19 12 12 19 5 12"/>
              </svg>
            </div>
            <div class="stat-info">
              <span class="stat-label">接收</span>
              <span class="stat-rate">{{ formatRate(networkInfos[selectedIndex].recvBytesPerSec) }}</span>
            </div>
          </div>
        </div>

        <div class="nic-traffic">
          <div class="traffic-row">
            <div class="traffic-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"/>
                <polyline points="5 12 12 5 19 12"/>
              </svg>
              发送总量
            </div>
            <span class="traffic-value">{{ formatBytes(networkInfos[selectedIndex].totalSentBytes) }}</span>
          </div>
          <div class="traffic-divider"></div>
          <div class="traffic-row">
            <div class="traffic-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <polyline points="19 12 12 19 5 12"/>
              </svg>
              接收总量
            </div>
            <span class="traffic-value">{{ formatBytes(networkInfos[selectedIndex].totalRecvBytes) }}</span>
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
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-light));
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

.network-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 0;
  color: var(--color-text-muted);
  font-size: 14px;
}

.network-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nic-name-block {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nic-name {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  flex: 1;
}

.nic-status-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.nic-status-badge.up {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.nic-status-badge.down {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 2s infinite;
}

.nic-ip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--color-bg-inset);
  border-radius: 10px;
  font-size: 14px;
  color: var(--color-text-secondary);
  font-family: monospace;
}

.nic-stats {
  display: flex;
  gap: 12px;
}

.stat-card {
  flex: 1;
  padding: 16px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  overflow: hidden;
  background: var(--color-bg-inset);
}

.stat-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  border-radius: 4px 0 0 4px;
}

.stat-card.sent::before {
  background: var(--color-success);
}

.stat-card.recv::before {
  background: var(--color-primary);
}

.stat-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-card.sent .stat-icon {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.stat-card.recv .stat-icon {
  background: var(--color-primary-bg);
  color: var(--color-primary);
}

.stat-info {
  flex: 1;
  min-width: 0;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 2px;
}

.stat-rate {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.nic-traffic {
  padding: 12px;
  background: var(--color-bg-inset);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.traffic-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.traffic-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.traffic-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.traffic-divider {
  height: 1px;
  background: var(--color-border);
  margin: 4px 0;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@media (max-width: 768px) {
  .nic-stats {
    flex-direction: column;
  }
  .stat-card {
    width: 100%;
  }
}
</style>
