<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { Notification } from '../../composables/useNotification'
import { useNotification } from '../../composables/useNotification'

const props = defineProps<{
  notification: Notification
}>()

const { remove } = useNotification()

const progress = ref(100)
let startTime = 0
let rafId = 0

const typeIconMap: Record<string, string> = {
  info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
}

const typeClass = `type-${props.notification.type}`

function handleClose() {
  remove(props.notification.id)
}

function animateProgress() {
  const elapsed = Date.now() - startTime
  const remaining = Math.max(0, 100 - (elapsed / props.notification.duration) * 100)
  progress.value = remaining
  if (remaining > 0) {
    rafId = requestAnimationFrame(animateProgress)
  } else {
    remove(props.notification.id)
  }
}

onMounted(() => {
  startTime = Date.now()
  rafId = requestAnimationFrame(animateProgress)
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
  <div class="notification-card" :class="typeClass">
    <div class="progress-bar" :style="{ width: progress + '%' }"></div>
    <div class="card-body">
      <div class="icon-wrapper" :class="typeClass" v-html="typeIconMap[notification.type]"></div>
      <div class="content">
        <div class="title">{{ notification.title }}</div>
        <div class="message" v-if="notification.message">{{ notification.message }}</div>
      </div>
      <button class="close-btn" @click="handleClose">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.notification-card {
  position: relative;
  border-radius: 12px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  pointer-events: auto;
  border: 1px solid var(--color-border);
  transition: background 0.3s ease, border-color 0.3s ease;
}

.progress-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 3px;
  border-radius: 3px 3px 0 0;
  transition: width 0.1s linear;
}

.notification-card.type-info .progress-bar {
  background: var(--color-info);
}

.notification-card.type-warning .progress-bar {
  background: var(--color-warning);
}

.notification-card.type-error .progress-bar {
  background: var(--color-danger);
}

.card-body {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
}

.icon-wrapper {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-wrapper.type-info {
  background: var(--color-info-bg);
  color: var(--color-info);
}

.icon-wrapper.type-warning {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.icon-wrapper.type-error {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.content {
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.4;
  transition: color 0.3s ease;
}

.message {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-top: 2px;
  transition: color 0.3s ease;
}

.close-btn {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  margin-top: 2px;
}

.close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}
</style>
