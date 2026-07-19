<script setup lang="ts">
const props = defineProps<{
  label: string
  value: string | number
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  helper?: string
}>()
</script>

<template>
  <article class="status-card" :class="props.tone || 'default'">
    <div class="status-label">{{ label }}</div>
    <div class="status-value">{{ value }}</div>
    <div v-if="helper" class="status-helper">{{ helper }}</div>
  </article>
</template>

<style scoped>
.status-card {
  min-height: 116px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
}

.status-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.status-value {
  font-size: 28px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--color-text);
}

.status-helper {
  font-size: 13px;
  color: var(--color-text-secondary);
}
</style>
