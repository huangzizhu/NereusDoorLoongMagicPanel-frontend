<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import * as dockerApi from '../api/docker'
import DockerContainerTable from '../components/docker/DockerContainerTable.vue'
import DockerDetailDrawer from '../components/docker/DockerDetailDrawer.vue'
import DockerEmptyState from '../components/docker/DockerEmptyState.vue'
import DockerLogsDialog from '../components/docker/DockerLogsDialog.vue'
import DockerStatusCard from '../components/docker/DockerStatusCard.vue'
import DockerImageSearch from '../components/docker/DockerImageSearch.vue'
import DockerPullDialog from '../components/docker/DockerPullDialog.vue'
import DockerCreateDialog from '../components/docker/DockerCreateDialog.vue'
import DockerMirrorPanel from '../components/docker/DockerMirrorPanel.vue'
import { useNotification } from '../composables/useNotification'
import type {
  DockerContainerDetail,
  DockerContainerSummary,
  DockerImageInfo,
  DockerInstallInfo,
} from '../types/docker'

type ContainerFilter = 'all' | 'running' | 'stopped'
type ContainerAction = 'start' | 'stop' | 'restart' | 'delete'
type DockerViewTab = 'containers' | 'images' | 'market' | 'create' | 'mirror'

const notify = useNotification()

const installInfo = ref<DockerInstallInfo | null>(null)
const containers = ref<DockerContainerSummary[]>([])
const images = ref<DockerImageInfo[]>([])
const loading = ref(true)
const refreshing = ref(false)
const selectedContainerId = ref('')
const activeTab = ref<DockerViewTab>('containers')
const containerFilter = ref<ContainerFilter>('all')
const searchInput = ref('')
const actionLoadingId = ref('')
const lastUpdatedText = ref('尚未刷新')

const detailVisible = ref(false)
const detailLoading = ref(false)
const detailData = ref<DockerContainerDetail | null>(null)

const logsDialog = ref({
  visible: false,
  loading: false,
  containerId: '',
  tailLines: 200,
  logs: '',
  errors: '',
})

/* ===== v2.0 新功能状态 ===== */
const pullDialogVisible = ref(false)
const pullImageName = ref('')
const createDialogVisible = ref(false)
const createDefaultImage = ref('')
const marketSearchQuery = ref('')

const confirmDialog = ref({
  visible: false,
  action: 'stop' as ContainerAction,
  containerId: '',
  title: '',
  message: '',
  confirmText: '',
  danger: false,
})

const resultDialog = ref({
  visible: false,
  title: '',
  containerId: '',
  containerName: '',
  action: '',
  previousStatus: '',
  currentStatus: '',
  previousRunning: false,
  currentRunning: false,
  returnCode: 0 as number | null,
  stdout: '',
  stderr: '',
})

let pollTimer: ReturnType<typeof setInterval> | null = null

const runningCount = computed(() => containers.value.filter((item) => isRunning(item.status)).length)
const filteredContainers = computed(() => {
  const keyword = searchInput.value.trim().toLowerCase()
  return containers.value.filter((item) => {
    if (containerFilter.value === 'running' && !isRunning(item.status)) return false
    if (containerFilter.value === 'stopped' && isRunning(item.status)) return false
    if (!keyword) return true
    return item.imageName.toLowerCase().includes(keyword)
      || item.containerId.toLowerCase().includes(keyword)
      || item.status.toLowerCase().includes(keyword)
  })
})

const dockerInstalled = computed(() => installInfo.value?.isInstalled === true)

function isRunning(status: string) {
  return /^up\b/i.test(status.trim())
}

function summarizeStatusTone(info: DockerInstallInfo | null) {
  if (!info) return 'default' as const
  return info.isInstalled ? 'success' as const : 'danger' as const
}

function formatVersion() {
  if (!installInfo.value) return '--'
  return installInfo.value.version || '未安装'
}

function markUpdated() {
  const now = new Date()
  lastUpdatedText.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
}

function syncSelection() {
  if (!containers.value.length) {
    selectedContainerId.value = ''
    detailVisible.value = false
    detailData.value = null
    return
  }

  if (!selectedContainerId.value || !containers.value.some((item) => item.containerId === selectedContainerId.value)) {
    selectedContainerId.value = containers.value[0].containerId
  }
}

async function loadInstallInfo() {
  const res = await dockerApi.getDockerInstallInfo()
  if (res.data.code !== 1) {
    throw new Error(res.data.msg || '获取 Docker 安装状态失败')
  }
  installInfo.value = res.data.data
}

async function loadContainers() {
  const res = await dockerApi.getAllContainers()
  if (res.data.code !== 1) {
    throw new Error(res.data.msg || '获取容器列表失败')
  }
  containers.value = res.data.data.list || []
  syncSelection()
}

async function loadImages() {
  const res = await dockerApi.getDockerImages()
  if (res.data.code !== 1) {
    throw new Error(res.data.msg || '获取镜像列表失败')
  }
  images.value = res.data.data.list || []
}

async function loadDashboard(showFullLoading = false) {
  try {
    if (showFullLoading) {
      loading.value = true
    } else {
      refreshing.value = true
    }

    await loadInstallInfo()

    if (installInfo.value?.isInstalled) {
      await Promise.all([
        loadContainers(),
        loadImages(),
      ])
    } else {
      containers.value = []
      images.value = []
      selectedContainerId.value = ''
      detailVisible.value = false
      detailData.value = null
    }

    markUpdated()
  } catch (error: any) {
    notify.error('Docker 数据加载失败', error?.message || '请稍后重试')
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

async function openDetail(containerId: string) {
  selectedContainerId.value = containerId
  detailVisible.value = true
  detailLoading.value = true
  detailData.value = null

  try {
    const res = await dockerApi.getContainerDetail(containerId)
    if (res.data.code !== 1) {
      notify.warning('获取容器详情失败', res.data.msg)
      return
    }
    detailData.value = res.data.data
  } catch (error: any) {
    notify.error('获取容器详情失败', error?.message || '请稍后再试')
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  detailVisible.value = false
}

async function openLogs(containerId: string) {
  logsDialog.value.visible = true
  logsDialog.value.loading = true
  logsDialog.value.containerId = containerId
  logsDialog.value.logs = ''
  logsDialog.value.errors = ''

  try {
    const res = await dockerApi.getContainerLogs(containerId, logsDialog.value.tailLines)
    if (res.data.code !== 1) {
      notify.warning('获取日志失败', res.data.msg)
      return
    }
    logsDialog.value.logs = res.data.data.logs || ''
    logsDialog.value.errors = res.data.data.errors || ''
  } catch (error: any) {
    notify.error('获取日志失败', error?.message || '请稍后再试')
  } finally {
    logsDialog.value.loading = false
  }
}

async function changeLogTailLines(tailLines: number) {
  logsDialog.value.tailLines = tailLines
  if (logsDialog.value.containerId) {
    await openLogs(logsDialog.value.containerId)
  }
}

function closeLogs() {
  logsDialog.value.visible = false
}

/* ===== v2.0 新功能方法 ===== */

/** 从镜像市场搜索结果点击拉取 */
function handleSearchPull(imageName: string) {
  pullImageName.value = imageName
  pullDialogVisible.value = true
}

/** 拉取成功后点击创建容器 */
function handlePullToCreate(imageName: string) {
  createDefaultImage.value = imageName
  createDialogVisible.value = true
}

/** 从拉取弹窗关闭 */
function closePullDialog() {
  pullDialogVisible.value = false
}

/** 容器创建成功 */
function handleContainerCreated(containerId: string, _containerName: string) {
  // 刷新容器列表
  loadDashboard()
}

function openActionConfirm(action: ContainerAction, containerId: string) {
  const summary = containers.value.find((item) => item.containerId === containerId)
  const titleMap: Record<ContainerAction, string> = {
    start: '启动容器',
    stop: '停止容器',
    restart: '重启容器',
    delete: '删除容器',
  }
  const confirmTextMap: Record<ContainerAction, string> = {
    start: '确认启动',
    stop: '确认停止',
    restart: '确认重启',
    delete: '确认删除',
  }

  confirmDialog.value = {
    visible: true,
    action,
    containerId,
    title: titleMap[action],
    message: `目标容器：${summary?.imageName || containerId.slice(0, 12)}。${action === 'delete' ? '删除后不可恢复，请确认。' : '请确认执行该操作。'}`,
    confirmText: confirmTextMap[action],
    danger: action === 'delete',
  }
}

function closeActionConfirm() {
  confirmDialog.value.visible = false
}

async function confirmAction() {
  const { action, containerId } = confirmDialog.value
  if (!containerId) return

  actionLoadingId.value = containerId
  try {
    const executor = {
      start: dockerApi.startContainer,
      stop: dockerApi.stopContainer,
      restart: dockerApi.restartContainer,
      delete: dockerApi.deleteContainer,
    }[action]

    const res = await executor(containerId)
    if (res.data.code !== 1) {
      notify.warning(`${confirmDialog.value.title}失败`, res.data.msg)
      return
    }

    const data = res.data.data
    closeActionConfirm()

    if (action === 'delete') {
      notify.info('删除容器', `容器 ${containerId.slice(0, 12)} 已删除`)
    } else {
      resultDialog.value = {
        visible: true,
        title: confirmDialog.value.title,
        containerId: data.containerId || containerId,
        containerName: data.containerName || '',
        action: data.action || action,
        previousStatus: data.previousStatus || '',
        currentStatus: data.currentStatus || '',
        previousRunning: data.previousRunning ?? false,
        currentRunning: data.currentRunning ?? false,
        returnCode: data.returnCode ?? null,
        stdout: data.stdout || '',
        stderr: data.stderr || '',
      }
    }

    await loadDashboard()

    if (detailVisible.value && selectedContainerId.value === containerId) {
      if (action === 'delete') {
        closeDetail()
      } else {
        await openDetail(containerId)
      }
    }
  } catch (error: any) {
    notify.error(`${confirmDialog.value.title}失败`, error?.message || '请稍后重试')
  } finally {
    actionLoadingId.value = ''
  }
}

function closeResultDialog() {
  resultDialog.value.visible = false
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(() => {
    loadDashboard()
  }, 12000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(async () => {
  await loadDashboard(true)
  startPolling()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="docker-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Container Operations</p>
        <h1 class="page-title">Docker 管理</h1>
        <p class="page-subtitle">围绕容器观测、日志排查与运行控制构建的单页操作台。</p>
      </div>

      <div class="header-actions">
        <div class="connection-badge" :class="{ connected: dockerInstalled, disconnected: !dockerInstalled }">
          <span class="dot"></span>
          {{ dockerInstalled ? 'Docker 已就绪' : 'Docker 未安装' }}
        </div>
        <button class="secondary-btn" :disabled="refreshing" @click="loadDashboard()">
          {{ refreshing ? '刷新中...' : '刷新数据' }}
        </button>
      </div>
    </header>

    <div v-if="dockerInstalled && !loading" class="tabs-wrap">
      <button class="tab-btn" :class="{ active: activeTab === 'containers' }" @click="activeTab = 'containers'">容器工作区</button>
      <button class="tab-btn" :class="{ active: activeTab === 'images' }" @click="activeTab = 'images'">镜像资产</button>
      <button class="tab-btn tab-btn-new" :class="{ active: activeTab === 'market' }" @click="activeTab = 'market'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        镜像市场
      </button>
      <button class="tab-btn tab-btn-new" :class="{ active: activeTab === 'create' }" @click="activeTab = 'create'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        创建容器
      </button>
      <button class="tab-btn tab-btn-new" :class="{ active: activeTab === 'mirror' }" @click="activeTab = 'mirror'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4z"/><path d="M20 8h2c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H10c-1.1 0-2-.9-2-2v-2"/></svg>
        加速站配置
      </button>
    </div>

    <section class="status-grid">
      <DockerStatusCard label="Docker 状态" :value="dockerInstalled ? 'Installed' : 'Missing'" :tone="summarizeStatusTone(installInfo)" />
      <DockerStatusCard label="版本" :value="formatVersion()" helper="来自安装检测接口" />
      <DockerStatusCard label="容器总数" :value="containers.length" helper="包含运行中与已停止容器" />
      <DockerStatusCard label="运行中" :value="runningCount" tone="success" helper="状态文本匹配 Up" />
      <DockerStatusCard label="镜像数" :value="images.length" tone="info" helper="当前为只读资产视图" />
      <DockerStatusCard label="最近刷新" :value="lastUpdatedText" helper="页面每 12 秒自动轮询" />
    </section>

    <div v-if="loading" class="skeleton-grid">
      <div v-for="i in 6" :key="i" class="skeleton-card"></div>
    </div>

    <template v-else-if="!dockerInstalled">
      <DockerEmptyState :checking="refreshing" @retry="loadDashboard()" />
    </template>

    <template v-else>
      <section v-if="activeTab === 'containers'" class="content-panel">
          <div class="toolbar-card">
            <div class="toolbar-intro">
              <h2>容器工作区</h2>
              <p>列表占满整行，先筛选和定位容器，再进入详情或日志排查。</p>
            </div>

            <div class="toolbar-controls">
              <label class="field">
                <span>状态筛选</span>
                <select v-model="containerFilter">
                  <option value="all">全部</option>
                  <option value="running">运行中</option>
                  <option value="stopped">已停止</option>
                </select>
              </label>

              <label class="field grow">
                <span>搜索容器</span>
                <input v-model="searchInput" type="text" placeholder="镜像名 / 容器 ID / 状态" />
              </label>
            </div>
          </div>

          <DockerContainerTable
            :items="filteredContainers"
            :selected-id="selectedContainerId"
            :action-loading-id="actionLoadingId"
            @select="openDetail"
            @logs="openLogs"
            @start="openActionConfirm('start', $event)"
            @stop="openActionConfirm('stop', $event)"
            @restart="openActionConfirm('restart', $event)"
            @remove="openActionConfirm('delete', $event)"
          />
      </section>


      <!-- 镜像资产 -->
      <section v-else-if="activeTab === 'images'" class="content-panel">
        <section class="panel-card image-card wide-card">
          <div class="panel-head">
            <div>
              <h2>镜像资产</h2>
              <p>保持只读，用于盘点本机已有镜像。</p>
            </div>
            <span class="pill">{{ images.length }} 个镜像</span>
          </div>

          <div v-if="images.length" class="image-list image-list-wide">
            <div v-for="image in images" :key="`${image.imageId}-${image.tag}`" class="image-item">
              <div class="image-row">
                <strong>{{ image.repository }}</strong>
                <span>{{ image.size }}</span>
              </div>
              <div class="image-row muted">
                <span>{{ image.tag }}</span>
                <span>{{ image.createdSince }}</span>
              </div>
              <div class="image-id">{{ image.imageId }} · {{ image.createdAt }}</div>
            </div>
          </div>

          <div v-else class="muted-copy">暂无镜像数据。</div>
        </section>
      </section>

      <!-- v2.0: 镜像市场 -->
      <section v-else-if="activeTab === 'market'" class="content-panel">
        <section class="panel-card wide-card">
          <div class="panel-head">
            <div>
              <h2>镜像市场</h2>
              <p>搜索 Docker Hub 官方镜像市场，找到目标镜像后一键拉取。</p>
            </div>
          </div>
          <DockerImageSearch @pull="handleSearchPull" />
        </section>
      </section>

      <!-- v2.0: 创建容器 -->
      <section v-else-if="activeTab === 'create'" class="content-panel">
        <section class="panel-card wide-card">
          <div class="panel-head">
            <div>
              <h2>创建容器</h2>
              <p>从指定镜像创建新容器。建议先从镜像市场拉取镜像，再回到这里创建。</p>
            </div>
          </div>
          <div class="create-container-body">
            <div class="form-grid">
              <div class="field full">
                <label>镜像名称</label>
                <div class="inline-row">
                  <input v-model="createDefaultImage" type="text" placeholder="nginx:latest" />
                  <button class="accent-btn" @click="activeTab = 'market'">去镜像市场搜索</button>
                </div>
                <p class="field-hint">输入已在本地或可从 Docker Hub 拉取的镜像名</p>
              </div>
            </div>
            <div class="quick-create-bar">
              <button class="primary-btn" :disabled="!createDefaultImage.trim()" @click="createDialogVisible = true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                创建容器
              </button>
            </div>
          </div>
        </section>
      </section>

      <!-- v2.0: 镜像加速站配置 -->
      <section v-else-if="activeTab === 'mirror'" class="content-panel">
        <section class="panel-card wide-card">
          <DockerMirrorPanel />
        </section>
      </section>
    </template>

    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="confirmDialog.visible" class="dialog-overlay" @click.self="closeActionConfirm">
          <div class="dialog-card">
            <div class="dialog-head">
              <h3>{{ confirmDialog.title }}</h3>
              <p>{{ confirmDialog.message }}</p>
            </div>

            <div class="dialog-actions">
              <button class="secondary-btn" @click="closeActionConfirm">取消</button>
              <button :class="confirmDialog.danger ? 'danger-btn' : 'primary-btn'" @click="confirmAction">
                {{ confirmDialog.confirmText }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 操作结果详情弹窗 -->
    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="resultDialog.visible" class="dialog-overlay" @click.self="closeResultDialog">
          <div class="dialog-card">
            <div class="dialog-head">
              <h3>{{ resultDialog.title }} — 操作完成</h3>
              <div class="result-body">
                <div class="result-grid">
                  <div class="result-item">
                    <span class="result-label">容器名称</span>
                    <span class="result-value mono">{{ resultDialog.containerName || '-' }}</span>
                  </div>
                  <div class="result-item">
                    <span class="result-label">容器 ID</span>
                    <span class="result-value mono">{{ resultDialog.containerId.slice(0, 19) }}…</span>
                  </div>
                  <div class="result-item">
                    <span class="result-label">操作类型</span>
                    <span class="result-value">{{ resultDialog.action }}</span>
                  </div>
                  <div class="result-item">
                    <span class="result-label">返回码</span>
                    <span class="result-value mono">{{ resultDialog.returnCode ?? '-' }}</span>
                  </div>
                </div>

                <div class="status-transition">
                  <div class="status-box before">
                    <span class="status-arrow-label">之前</span>
                    <span class="status-badge" :class="resultDialog.previousRunning ? 'badge-success' : 'badge-muted'">
                      {{ resultDialog.previousStatus || (resultDialog.previousRunning ? 'running' : 'exited') }}
                    </span>
                    <span class="arrow-icon">→</span>
                  </div>
                  <div class="status-box after">
                    <span class="status-arrow-label">之后</span>
                    <span class="status-badge" :class="resultDialog.currentRunning ? 'badge-success' : 'badge-muted'">
                      {{ resultDialog.currentStatus || (resultDialog.currentRunning ? 'running' : 'exited') }}
                    </span>
                  </div>
                </div>

                <div v-if="resultDialog.stderr" class="result-stderr">
                  <span class="result-label">错误输出</span>
                  <pre class="stderr-box">{{ resultDialog.stderr }}</pre>
                </div>
              </div>
            </div>

            <div class="dialog-actions">
              <button class="primary-btn" @click="closeResultDialog">确定</button>
              <button class="secondary-btn" @click="closeResultDialog">关闭</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <DockerDetailDrawer
      :visible="detailVisible"
      :loading="detailLoading"
      :detail="detailData"
      @close="closeDetail"
    />

    <DockerLogsDialog
      :visible="logsDialog.visible"
      :loading="logsDialog.loading"
      :container-id="logsDialog.containerId"
      :tail-lines="logsDialog.tailLines"
      :logs="logsDialog.logs"
      :errors="logsDialog.errors"
      @close="closeLogs"
      @tail-change="changeLogTailLines"
    />

    <!-- v2.0 新弹窗 -->
    <DockerPullDialog
      :visible="pullDialogVisible"
      :image-name="pullImageName"
      @close="closePullDialog"
      @create-container="handlePullToCreate"
    />

    <DockerCreateDialog
      :visible="createDialogVisible"
      :default-image-name="createDefaultImage"
      @close="createDialogVisible = false"
      @created="handleContainerCreated"
    />
  </div>
</template>

<style scoped>
.docker-page {
  padding: 24px;
  max-width: 1680px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 22px;
  border: 1px solid var(--color-border);
  border-radius: 24px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
}

.eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-primary);
}

.page-title {
  margin-top: 6px;
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.05em;
  color: var(--color-text);
  font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif;
}

.page-subtitle {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  max-width: 680px;
}

.header-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.connection-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.connection-badge.connected {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.connection-badge.disconnected {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.tabs-wrap {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  gap: 4px;
  padding: 4px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}

.tab-btn {
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.tab-btn.active {
  background: var(--color-bg-inset);
  color: var(--color-text);
}

.status-grid,
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
}

.skeleton-card {
  min-height: 116px;
  border-radius: 18px;
  background: linear-gradient(90deg, var(--color-bg-surface), var(--color-bg-hover), var(--color-bg-surface));
  background-size: 240px 100%;
  animation: loading-shimmer 1.4s linear infinite;
}

.content-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar-card,
.panel-card {
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
}

.toolbar-card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.toolbar-intro h2,
.panel-head h2 {
  font-size: 20px;
  font-weight: 800;
  color: var(--color-text);
}

.toolbar-intro p,
.panel-head p {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.toolbar-controls {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field.grow {
  min-width: 0;
}

.field span {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.field input,
.field select {
  width: 100%;
  min-height: 44px;
  border-radius: 14px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0 14px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.field input:focus,
.field select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.panel-card {
  padding: 18px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}



.pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--color-info-bg);
  color: var(--color-info);
  font-size: 12px;
  font-weight: 700;
}



.image-list {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 540px;
  overflow-y: auto;
}

.image-list-wide {
  max-height: none;
}

.image-item {
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}

.image-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.image-row strong {
  font-size: 14px;
  color: var(--color-text);
  word-break: break-word;
}

.image-row span {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.image-row.muted {
  margin-top: 8px;
}

.image-id,
.muted-copy {
  margin-top: 10px;
  font-size: 12px;
  color: var(--color-text-muted);
  word-break: break-word;
}

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
  width: min(460px, 100%);
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.dialog-head {
  padding: 20px 22px 16px;
}

.dialog-head h3 {
  font-size: 22px;
  font-weight: 800;
  color: var(--color-text);
}

.dialog-head p {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.dialog-actions {
  padding: 18px 22px 22px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.primary-btn,
.secondary-btn,
.danger-btn {
  min-height: 42px;
  border-radius: 12px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.primary-btn {
  border: 1px solid var(--color-border-solid);
  color: var(--color-text);
  background: var(--color-bg-surface);
}

.primary-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.secondary-btn {
  border: 1px solid var(--color-border-solid);
  color: var(--color-text-secondary);
  background: var(--color-bg-surface);
}

.secondary-btn:hover {
  color: var(--color-text);
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.danger-btn {
  border: 1px solid rgba(239, 68, 68, 0.18);
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.primary-btn:disabled,
.secondary-btn:disabled,
.danger-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  transform: none;
}

.mini-btn {
  border: 1px solid var(--color-border-solid);
  border-radius: 10px;
  padding: 8px 12px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, opacity 0.18s ease;
}

.mini-btn.primary {
  color: var(--color-primary);
  background: var(--color-primary-ghost);
  border-color: rgba(59, 130, 246, 0.16);
}

.mini-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.mini-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
  color: var(--color-text);
}

@keyframes loading-shimmer {
  0% {
    background-position: -240px 0;
  }
  100% {
    background-position: 240px 0;
  }
}

@media (max-width: 1280px) {
  .status-grid,
  .skeleton-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

}

@media (max-width: 768px) {
  .docker-page {
    padding: 16px;
  }

  .page-header {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    align-items: stretch;
  }

  .status-grid,
  .skeleton-grid,
  .toolbar-controls,
  .panel-head {
    flex-direction: column;
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

/* ===== v2.0 新功能样式 ===== */

.tab-btn-new {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tab-btn-new svg {
  flex-shrink: 0;
}

.create-container-body {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.inline-row {
  display: flex;
  gap: 8px;
}

.inline-row input {
  flex: 1;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.inline-row input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.field-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.accent-btn {
  flex-shrink: 0;
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid var(--color-primary);
  border-radius: 14px;
  background: var(--color-primary-ghost);
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
}

.accent-btn:hover {
  background: var(--color-primary);
  color: #fff;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.quick-create-bar {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
}

/* ===== 操作结果详情弹窗 ===== */

.result-body {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.result-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.result-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.result-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  word-break: break-word;
}

.status-transition {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 14px 0;
  border-top: 1px solid var(--color-divider);
  border-bottom: 1px solid var(--color-divider);
}

.status-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.status-box.before {
  align-items: flex-start;
}

.status-box.after {
  align-items: flex-end;
}

.status-arrow-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.badge-success {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.badge-muted {
  color: var(--color-text-secondary);
  background: var(--color-bg-inset);
}

.arrow-icon {
  padding: 0 8px;
  color: var(--color-text-muted);
  font-size: 16px;
}

.result-stderr {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stderr-box {
  background: var(--color-danger-bg);
  color: var(--color-danger);
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: 10px;
  padding: 10px 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 180px;
  overflow-y: auto;
  margin: 0;
}
</style>
