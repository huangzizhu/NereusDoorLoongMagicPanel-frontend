<script setup lang="ts">
defineProps<{
  checking: boolean
}>()

defineEmits<{
  retry: []
}>()
</script>

<template>
  <section class="empty-state">
    <div class="empty-icon">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 12.5V16a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 4 16v-3.5" />
        <path d="M20 8 12 3 4 8l8 5 8-5Z" />
        <path d="M12 22V13" />
      </svg>
    </div>
    <div class="empty-copy">
      <h2>当前主机未检测到 Docker</h2>
      <p>Docker 管理页会在检测到 Docker 安装后展示容器、镜像与运行控制能力。</p>
    </div>
    <button class="primary-btn" :disabled="checking" @click="$emit('retry')">
      {{ checking ? '重新检测中...' : '重新检测 Docker' }}
    </button>
  </section>
</template>

<style scoped>
.empty-state {
  border: 1px solid var(--color-border);
  border-radius: 24px;
  padding: 48px 24px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 20px;
}

.empty-icon {
  width: 88px;
  height: 88px;
  border-radius: 24px;
  background: var(--color-bg-inset);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 1px var(--color-border);
}

.empty-copy h2 {
  font-size: 24px;
  font-weight: 800;
  color: var(--color-text);
}

.empty-copy p {
  margin-top: 8px;
  max-width: 560px;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.7;
}

.primary-btn {
  min-width: 180px;
  min-height: 44px;
  border: 1px solid var(--color-border-solid);
  border-radius: 14px;
  padding: 0 18px;
  background: var(--color-bg-surface);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease, opacity 0.18s ease;
}

.primary-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.primary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
