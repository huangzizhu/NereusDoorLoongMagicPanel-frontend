<script setup lang="ts">
defineProps<{
  icon: string
  title: string
  description?: string
  navigable?: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <div class="setting-row" :class="{ navigable }" @click="$emit('click')">
    <div class="row-icon" v-html="icon"></div>
    <div class="row-content">
      <div class="row-title">{{ title }}</div>
      <div class="row-desc" v-if="description">{{ description }}</div>
    </div>
    <div class="row-action">
      <slot name="action"></slot>
      <svg v-if="navigable" class="nav-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.setting-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-radius: 14px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  transition: all 0.2s ease;
}

.setting-row.navigable {
  cursor: pointer;
}

.setting-row.navigable:hover {
  background: var(--color-bg-hover);
  border-color: var(--color-primary-light);
  transform: translateX(2px);
}

.row-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-end));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.row-icon :deep(svg) {
  width: 20px;
  height: 20px;
}

.row-content {
  flex: 1;
  min-width: 0;
}

.row-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.row-desc {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 2px;
  line-height: 1.4;
}

.row-action {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.nav-arrow {
  color: var(--color-text-muted);
  transition: transform 0.2s ease, color 0.2s ease;
}

.setting-row.navigable:hover .nav-arrow {
  color: var(--color-primary);
  transform: translateX(3px);
}

@media (max-width: 768px) {
  .setting-row {
    padding: 14px 16px;
    gap: 12px;
  }
}
</style>
