<script setup lang="ts">
import type { DockerContainerDetail } from '../../types/docker'

defineProps<{
  visible: boolean
  loading: boolean
  detail: DockerContainerDetail | null
}>()

defineEmits<{
  close: []
}>()

function formatDate(value?: string) {
  if (!value || value.startsWith('0001-01-01')) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function detailRows(detail: DockerContainerDetail) {
  return [
    ['容器 ID', detail.Id],
    ['名称', detail.Name.replace(/^\//, '') || detail.Name],
    ['镜像', detail.Config?.Image || '-'],
    ['状态', detail.State?.Status || '-'],
    ['创建时间', formatDate(detail.Created)],
    ['启动时间', formatDate(detail.State?.StartedAt)],
    ['结束时间', formatDate(detail.State?.FinishedAt)],
    ['重启策略', detail.HostConfig?.RestartPolicy?.Name || '-'],
    ['网络模式', detail.HostConfig?.NetworkMode || '-'],
  ]
}

function portEntries(detail: DockerContainerDetail) {
  return Object.entries(detail.NetworkSettings?.Ports || {})
}

function networkEntries(detail: DockerContainerDetail) {
  return Object.entries(detail.NetworkSettings?.Networks || {})
}
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <aside v-if="visible" class="detail-drawer">
        <div class="drawer-head">
          <div>
            <h3>容器详情</h3>
            <p>查看运行状态、挂载、网络和环境配置。</p>
          </div>
          <button class="secondary-btn" @click="$emit('close')">关闭</button>
        </div>

        <div v-if="loading" class="drawer-loading">正在加载容器详情...</div>

        <div v-else-if="detail" class="drawer-content">
          <div class="detail-grid">
            <div v-for="[label, value] in detailRows(detail)" :key="label" class="detail-row">
              <span>{{ label }}</span>
              <strong>{{ value }}</strong>
            </div>
          </div>

          <section class="detail-block">
            <div class="block-title">启动命令</div>
            <code class="code-block">{{ (detail.Config?.Cmd || []).join(' ') || '-' }}</code>
          </section>

          <section class="detail-block">
            <div class="block-title">Entrypoint</div>
            <code class="code-block">{{ (detail.Config?.Entrypoint || []).join(' ') || '-' }}</code>
          </section>

          <section class="detail-block">
            <div class="block-title">端口映射</div>
            <div v-if="portEntries(detail).length" class="chip-list">
              <span v-for="[containerPort, bindings] in portEntries(detail)" :key="containerPort" class="chip">
                {{ containerPort }} -> {{ bindings?.map((item) => `${item.HostIp}:${item.HostPort}`).join(', ') || '未暴露' }}
              </span>
            </div>
            <div v-else class="muted-text">未发现端口映射</div>
          </section>

          <section class="detail-block">
            <div class="block-title">挂载卷</div>
            <div v-if="detail.Mounts?.length" class="stack-list">
              <div v-for="mount in detail.Mounts" :key="`${mount.Source}-${mount.Destination}`" class="stack-item">
                <strong>{{ mount.Destination }}</strong>
                <span>{{ mount.Source }}</span>
              </div>
            </div>
            <div v-else class="muted-text">未发现挂载卷</div>
          </section>

          <section class="detail-block">
            <div class="block-title">网络</div>
            <div v-if="networkEntries(detail).length" class="stack-list">
              <div v-for="[networkName, networkValue] in networkEntries(detail)" :key="networkName" class="stack-item">
                <strong>{{ networkName }}</strong>
                <span>IP {{ networkValue.IPAddress || '-' }} / 网关 {{ networkValue.Gateway || '-' }}</span>
              </div>
            </div>
            <div v-else class="muted-text">未发现网络信息</div>
          </section>

          <section class="detail-block">
            <div class="block-title">环境变量</div>
            <pre class="pre-block">{{ (detail.Config?.Env || []).join('\n') || '-' }}</pre>
          </section>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.detail-drawer {
  position: fixed;
  top: var(--topbar-height);
  right: 0;
  bottom: 0;
  width: min(520px, 100vw);
  z-index: 250;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  backdrop-filter: var(--backdrop-blur);
  -webkit-backdrop-filter: var(--backdrop-blur);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
}

.drawer-head {
  padding: 20px 22px 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.drawer-head h3 {
  font-size: 22px;
  font-weight: 800;
  color: var(--color-text);
}

.drawer-head p {
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

.drawer-loading {
  padding: 28px 22px;
  color: var(--color-text-secondary);
}

.drawer-content {
  padding: 20px 22px 26px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.detail-row,
.stack-item {
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-bg-surface);
  padding: 12px 14px;
}

.detail-row span,
.stack-item span,
.muted-text {
  display: block;
  font-size: 12px;
  color: var(--color-text-muted);
}

.detail-row strong,
.stack-item strong {
  display: block;
  margin-top: 6px;
  font-size: 14px;
  color: var(--color-text);
  word-break: break-word;
}

.detail-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.block-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.code-block,
.pre-block {
  display: block;
  border-radius: 14px;
  padding: 12px 14px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font-size: 12px;
  line-height: 1.7;
  overflow-x: auto;
}

.pre-block {
  white-space: pre-wrap;
  word-break: break-word;
}

.chip-list,
.stack-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 8px 10px;
  border-radius: 12px;
  background: var(--color-primary-ghost);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
}

@media (max-width: 900px) {
  .detail-drawer {
    top: 0;
    width: 100vw;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.26s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
