<script setup lang="ts">
defineProps<{
  visible: boolean
  loading: boolean
  containerId: string
  tailLines: number
  logs: string
  errors: string
}>()

defineEmits<{
  close: []
  tailChange: [tailLines: number]
}>()

const tailOptions = [100, 200, 500]
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="visible" class="dialog-overlay" @click.self="$emit('close')">
        <div class="dialog-card wide">
          <div class="dialog-head">
            <div>
              <h3>容器日志</h3>
              <p>{{ containerId ? `${containerId.slice(0, 12)} · 最近 ${tailLines} 行` : '按需查看日志输出' }}</p>
            </div>
            <div class="tail-switch">
              <button
                v-for="option in tailOptions"
                :key="option"
                class="tail-btn"
                :class="{ active: tailLines === option }"
                @click="$emit('tailChange', option)"
              >
                {{ option }}
              </button>
            </div>
          </div>

          <div v-if="loading" class="dialog-loading">正在加载日志...</div>

          <div v-else class="dialog-body logs-layout">
            <section class="log-block">
              <div class="log-title">stdout</div>
              <pre class="log-content">{{ logs || '暂无标准输出日志' }}</pre>
            </section>
            <section class="log-block">
              <div class="log-title">stderr</div>
              <pre class="log-content">{{ errors || '暂无错误输出日志' }}</pre>
            </section>
          </div>

          <div class="dialog-actions">
            <button class="secondary-btn" @click="$emit('close')">关闭</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 260;
}

.dialog-card {
  width: min(1120px, 100%);
  max-height: min(88vh, 880px);
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.dialog-card.wide {
  width: min(1240px, 100%);
}

.dialog-head,
.dialog-actions {
  padding: 18px 22px;
  border-bottom: 1px solid var(--color-border);
}

.dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.dialog-head h3 {
  font-size: 22px;
  font-weight: 800;
  color: var(--color-text);
}

.dialog-head p {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.secondary-btn {
  border: 1px solid var(--color-border-solid);
  border-radius: 12px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.secondary-btn:hover {
  color: var(--color-text);
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.tail-switch {
  display: inline-flex;
  gap: 6px;
  padding: 4px;
  border-radius: 999px;
  background: var(--color-bg-inset);
}

.tail-btn {
  border: none;
  border-radius: 999px;
  padding: 8px 12px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.tail-btn.active {
  background: var(--color-primary-ghost);
  color: var(--color-primary);
}

.dialog-loading {
  padding: 24px 22px;
  color: var(--color-text-secondary);
}

.dialog-body {
  padding: 22px;
  overflow: auto;
}

.logs-layout {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.log-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.log-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.log-content {
  min-height: 360px;
  border-radius: 16px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 14px;
  font-size: 12px;
  line-height: 1.65;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--color-border);
  border-bottom: none;
}

@media (max-width: 900px) {
  .dialog-overlay {
    padding: 0;
  }

  .dialog-card,
  .dialog-card.wide {
    width: 100vw;
    height: 100vh;
    max-height: none;
    border-radius: 0;
  }

  .logs-layout {
    grid-template-columns: 1fr;
  }
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.22s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .dialog-card,
.dialog-leave-to .dialog-card {
  transform: translateY(16px) scale(0.98);
}

.dialog-card {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
</style>
