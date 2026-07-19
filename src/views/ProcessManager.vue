<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as processApi from '../api/process'
import {
  PROCESS_SORT_BY,
  type ProcessActionResult,
  type ProcessAutoCleanResult,
  type ProcessDetail,
  type ProcessInfo,
  type ProcessLogItem,
  type ProcessSortBy,
  type ProcessZombieData,
} from '../types/process'
import { useLoadingOverlay } from '../composables/useLoadingOverlay'
import { useNotification } from '../composables/useNotification'
import { parse422Errors } from '../utils/errorParser'


type ProcessTab = 'process' | 'maintenance' | 'logs'
type KillMode = 'normal' | 'force'

const notify = useNotification()
const { show: showLoading, hide: hideLoading } = useLoadingOverlay()

const activeTab = ref<ProcessTab>('process')
const processList = ref<ProcessInfo[]>([])
const connected = ref(false)
const reconnecting = ref(false)
const lastUpdatedText = ref('尚未收到推送')

const sortedBy = ref<ProcessSortBy>(PROCESS_SORT_BY.CPU)
const keywordInput = ref('')
const keywordApplied = ref('')
const processPage = ref(1)
const processPageSize = ref(20)
const processPortFilter = ref<number | null>(null)

const selectedPids = ref<number[]>([])

const portInput = ref('')
const portSelectedPids = ref<number[]>([])

const killConfirmDialog = ref({
  visible: false,
  mode: 'normal' as KillMode,
  pids: [] as number[],
  reason: '',
  sourceLabel: '',
})

const forceRetryDialog = ref({
  visible: false,
  pids: [] as number[],
  reason: '',
})

const detailState = ref({
  visible: false,
  loading: false,
  data: null as ProcessDetail | null,
})

const logDetailDialog = ref({
  visible: false,
  logId: 0,
  detail: '',
  result: '',
  targetPids: '',
})

const logs = ref<ProcessLogItem[]>([])
const logsLoading = ref(false)
const logsLoaded = ref(false)
const logsPage = ref(1)
const logsPageSize = ref(10)
const logsTotal = ref(0)

const autoCleanLoading = ref(false)
const autoCleanForm = ref({
  cpuThreshold: 90,
  memoryThreshold: 90,
})
const autoCleanResult = ref<ProcessAutoCleanResult | null>(null)

const zombieLoading = ref(false)
const zombieData = ref<ProcessZombieData>([])

let eventSource: EventSource | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

const sortOptions = [
  { label: 'CPU 占用优先', value: PROCESS_SORT_BY.CPU },
  { label: '内存占用优先', value: PROCESS_SORT_BY.MEMORY },
  { label: 'PID 排序', value: PROCESS_SORT_BY.PID },
]

const processPageSizeOptions = [20, 50, 100, 200]

const selectedCount = computed(() => selectedPids.value.length)

const filteredProcessList = computed(() => {
  if (processPortFilter.value === null) return processList.value
  return processList.value.filter((process) => {
    return (process.ports || []).some((portInfo) => portInfo.port === processPortFilter.value)
  })
})

const processTotalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredProcessList.value.length / processPageSize.value))
})

const paginatedProcesses = computed(() => {
  const start = (processPage.value - 1) * processPageSize.value
  return filteredProcessList.value.slice(start, start + processPageSize.value)
})

const isAllSelected = computed(() => {
  return paginatedProcesses.value.length > 0
    && paginatedProcesses.value.every((item) => selectedPids.value.includes(item.pid))
})

const parsedPort = computed(() => {
  const text = String(portInput.value ?? '').trim()
  if (!text) return null
  if (!/^\d+$/.test(text)) return null
  const value = Number.parseInt(text, 10)
  if (!Number.isInteger(value) || value < 1 || value > 65535) return null
  return value
})

const portMatchedProcesses = computed(() => {
  if (parsedPort.value === null) return []
  return processList.value.filter((process) => {
    return (process.ports || []).some((portInfo) => portInfo.port === parsedPort.value)
  })
})

const logsTotalPages = computed(() => {
  return Math.max(1, Math.ceil(logsTotal.value / logsPageSize.value))
})

const portSelectedCount = computed(() => portSelectedPids.value.length)

const isPortAllSelected = computed(() => {
  return portMatchedProcesses.value.length > 0 && portSelectedPids.value.length === portMatchedProcesses.value.length
})

const killModeLabel = computed(() => {
  return killConfirmDialog.value.mode === 'normal' ? '温和终止' : '强制终止'
})

function syncSelectedPids() {
  const validSet = new Set(processList.value.map((item) => item.pid))
  selectedPids.value = selectedPids.value.filter((pid) => validSet.has(pid))
}

function syncProcessPage() {
  processPage.value = Math.min(processPage.value, processTotalPages.value)
  if (processPage.value < 1) {
    processPage.value = 1
  }
}

function closeSse() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnecting.value = true
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectSse()
  }, 4000)
}

function connectSse() {
  closeSse()
  connected.value = false

  const url = processApi.createProcessSseUrl({
    sortedBy: sortedBy.value,
    keyword: keywordApplied.value,
  })

  eventSource = new EventSource(url)

  eventSource.onopen = () => {
    connected.value = true
    reconnecting.value = false
  }

  eventSource.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data)
      const incoming = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : []
      processList.value = incoming.map(normalizeProcessInfo)
      syncSelectedPids()
      const now = new Date()
      lastUpdatedText.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
    } catch {
      // Some SSE backends may send heartbeat lines that are not JSON payloads.
      return
    }
  }

  eventSource.onerror = () => {
    connected.value = false
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    scheduleReconnect()
  }
}

function normalizeProcessInfo(raw: Partial<ProcessInfo>): ProcessInfo {
  return {
    pid: Number(raw.pid || 0),
    processName: raw.processName || 'unknown',
    userName: raw.userName || '-',
    cpuPercent: Number(raw.cpuPercent || 0),
    memoryPercent: Number(raw.memoryPercent || 0),
    status: raw.status || 'unknown',
    command: raw.command || '-',
    ports: raw.ports || [],
  }
}

function applyKeywordFilter() {
  keywordApplied.value = keywordInput.value.trim()
  processPage.value = 1
}

function clearKeywordFilter() {
  keywordInput.value = ''
  keywordApplied.value = ''
  clearProcessPortFilter()
  processPage.value = 1
}

function reconnectSseNow() {
  reconnecting.value = true
  connectSse()
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    const pagePidSet = new Set(paginatedProcesses.value.map((item) => item.pid))
    selectedPids.value = selectedPids.value.filter((pid) => !pagePidSet.has(pid))
    return
  }
  const merged = new Set(selectedPids.value)
  paginatedProcesses.value.forEach((item) => merged.add(item.pid))
  selectedPids.value = [...merged]
}

function toggleRowSelection(pid: number) {
  if (selectedPids.value.includes(pid)) {
    selectedPids.value = selectedPids.value.filter((item) => item !== pid)
    return
  }
  selectedPids.value = [...selectedPids.value, pid]
}

function openKillConfirm(pids: number[], mode: KillMode, sourceLabel: string) {
  if (pids.length === 0) {
    notify.warning('未选择目标', '请先选择至少一个进程')
    return
  }

  killConfirmDialog.value = {
    visible: true,
    mode,
    pids,
    reason: '',
    sourceLabel,
  }
}

function closeKillConfirm() {
  killConfirmDialog.value.visible = false
}

function togglePortSelectAll() {
  if (isPortAllSelected.value) {
    portSelectedPids.value = []
    return
  }
  portSelectedPids.value = portMatchedProcesses.value.map((item) => item.pid)
}

function togglePortSelection(pid: number) {
  if (portSelectedPids.value.includes(pid)) {
    portSelectedPids.value = portSelectedPids.value.filter((item) => item !== pid)
    return
  }
  portSelectedPids.value = [...portSelectedPids.value, pid]
}

function syncPortSelectedPids() {
  const validSet = new Set(portMatchedProcesses.value.map((item) => item.pid))
  portSelectedPids.value = portSelectedPids.value.filter((pid) => validSet.has(pid))
}

function openForceRetryDialog(pids: number[]) {
  forceRetryDialog.value = {
    visible: true,
    pids,
    reason: '温和终止失败后执行强制终止',
  }
}

function closeForceRetryDialog() {
  forceRetryDialog.value.visible = false
}

async function runKill(mode: KillMode, pids: number[], reason: string): Promise<ProcessActionResult[]> {
  if (pids.length === 1) {
    const singleResponse = mode === 'normal'
      ? await processApi.killProcess(pids[0], reason)
      : await processApi.forceKillProcess(pids[0], reason)

    if (singleResponse.data.code !== 1) {
      throw new Error(singleResponse.data.msg || '终止失败')
    }

    return [singleResponse.data.data]
  }

  const batchResponse = mode === 'normal'
    ? await processApi.batchKillProcess(pids, reason)
    : await processApi.batchForceKillProcess(pids, reason)

  if (batchResponse.data.code !== 1) {
    throw new Error(batchResponse.data.msg || '批量终止失败')
  }

  return batchResponse.data.data.results
}

function summarizeKillResult(mode: KillMode, results: ProcessActionResult[]) {
  const failed = results.filter((item) => !item.success)
  const successCount = results.length - failed.length

  if (failed.length === 0) {
    const modeText = mode === 'normal' ? '温和终止成功' : '强制终止成功'
    notify.info(modeText, `共完成 ${successCount} 个进程`) 
    return { failedPids: [] as number[] }
  }

  const failedPids = failed.map((item) => item.pid)
  notify.warning(
    '存在失败项',
    `成功 ${successCount} 个，失败 ${failed.length} 个。失败 PID: ${failedPids.join(', ')}`
  )

  return { failedPids }
}

async function confirmKillAction() {
  const { mode, pids, reason } = killConfirmDialog.value
  killConfirmDialog.value.visible = false

  showLoading()
  try {
    const results = await runKill(mode, pids, reason.trim())
    const summary = summarizeKillResult(mode, results)

    if (mode === 'normal' && summary.failedPids.length > 0) {
      openForceRetryDialog(summary.failedPids)
    }

    selectedPids.value = selectedPids.value.filter((pid) => !pids.includes(pid))
  } catch (error) {
    const parsed = parse422Errors(error)
    notify.error('进程终止失败', parsed.join('\n'))
  } finally {
    hideLoading()
  }
}

async function confirmForceRetry() {
  const pids = forceRetryDialog.value.pids
  const reason = forceRetryDialog.value.reason.trim()
  forceRetryDialog.value.visible = false

  if (pids.length === 0) return

  showLoading()
  try {
    const results = await runKill('force', pids, reason)
    summarizeKillResult('force', results)
    selectedPids.value = selectedPids.value.filter((pid) => !pids.includes(pid))
  } catch (error) {
    notify.error('强制终止失败', parse422Errors(error).join('\n'))
  } finally {
    hideLoading()
  }
}

async function openProcessDetail(pid: number) {
  detailState.value.visible = true
  detailState.value.loading = true
  detailState.value.data = null

  try {
    const response = await processApi.getProcessDetail(pid)
    if (response.data.code !== 1) {
      notify.warning('获取进程详情失败', response.data.msg)
      return
    }
    detailState.value.data = response.data.data
  } catch (error) {
    notify.error('获取进程详情失败', parse422Errors(error).join('\n'))
  } finally {
    detailState.value.loading = false
  }
}

function closeProcessDetail() {
  detailState.value.visible = false
}

const autoCleanConfirmDialog = ref({
  visible: false,
  cpuThreshold: 0,
  memoryThreshold: 0,
})

function openAutoCleanConfirm() {
  const cpuThreshold = Number(autoCleanForm.value.cpuThreshold)
  const memoryThreshold = Number(autoCleanForm.value.memoryThreshold)

  if (cpuThreshold < 1 || cpuThreshold > 100 || memoryThreshold < 1 || memoryThreshold > 100) {
    notify.warning('阈值无效', 'CPU 与内存阈值必须在 1 到 100 之间')
    return
  }

  autoCleanConfirmDialog.value = {
    visible: true,
    cpuThreshold,
    memoryThreshold,
  }
}

function closeAutoCleanConfirm() {
  autoCleanConfirmDialog.value.visible = false
}

async function runAutoClean() {
  const { cpuThreshold, memoryThreshold } = autoCleanConfirmDialog.value
  autoCleanConfirmDialog.value.visible = false

  autoCleanLoading.value = true
  showLoading()
  try {
    const response = await processApi.autoCleanProcess({
      cpuThreshold,
      memoryThreshold,
    })

    if (response.data.code !== 1) {
      notify.warning('自动清理失败', response.data.msg)
      return
    }

    autoCleanResult.value = response.data.data
    notify.info('自动清理已执行', `扫描 ${response.data.data.totalScanned} 个进程，终止 ${response.data.data.totalKilled} 个`)
  } catch (error) {
    notify.error('自动清理失败', parse422Errors(error).join('\n'))
  } finally {
    autoCleanLoading.value = false
    hideLoading()
  }
}

async function refreshZombieData() {
  zombieLoading.value = true
  try {
    const response = await processApi.getZombieProcesses()
    if (response.data.code !== 1) {
      notify.warning('获取僵尸进程失败', response.data.msg)
      return
    }
    zombieData.value = response.data.data.map(normalizeProcessInfo)
    notify.info('僵尸/孤儿进程数据已更新')
  } catch (error) {
    notify.error('获取僵尸进程失败', parse422Errors(error).join('\n'))
  } finally {
    zombieLoading.value = false
  }
}

async function loadProcessLogs() {
  logsLoading.value = true
  try {
    const response = await processApi.getProcessLogs(logsPage.value, logsPageSize.value)
    if (response.data.code !== 1) {
      notify.warning('获取日志失败', response.data.msg)
      return
    }

    logs.value = response.data.data.items
    logsTotal.value = response.data.data.total
    logsLoaded.value = true
  } catch (error) {
    notify.error('获取日志失败', parse422Errors(error).join('\n'))
  } finally {
    logsLoading.value = false
  }
}

function prevLogsPage() {
  if (logsPage.value <= 1) return
  logsPage.value -= 1
  loadProcessLogs()
}

function nextLogsPage() {
  if (logsPage.value >= logsTotalPages.value) return
  logsPage.value += 1
  loadProcessLogs()
}

function prevProcessPage() {
  if (processPage.value <= 1) return
  processPage.value -= 1
}

function nextProcessPage() {
  if (processPage.value >= processTotalPages.value) return
  processPage.value += 1
}

function updateProcessPageSize(pageSize: number) {
  processPageSize.value = pageSize
  processPage.value = 1
}

function applyProcessPortFilter() {
  if (parsedPort.value === null) {
    notify.warning('端口无效', '请输入 1 到 65535 之间的端口号')
    return
  }

  processPortFilter.value = parsedPort.value
  processPage.value = 1
  activeTab.value = 'process'
}

function clearProcessPortFilter() {
  processPortFilter.value = null
  processPage.value = 1
}

function updateLogsPageSize(pageSize: number) {
  logsPageSize.value = pageSize
  logsPage.value = 1
  loadProcessLogs()
}

function hasLogDetail(log: ProcessLogItem) {
  return Boolean(log.detail || log.result || log.targetPids)
}

function openLogDetail(log: ProcessLogItem) {
  logDetailDialog.value = {
    visible: true,
    logId: log.logId,
    detail: log.detail || '',
    result: log.result || '',
    targetPids: log.targetPids || '',
  }
}

function closeLogDetail() {
  logDetailDialog.value.visible = false
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(2)}%`
}

function statusClass(status: string) {
  const lower = status.toLowerCase()
  if (lower.includes('run')) return 'status-running'
  if (lower.includes('sleep')) return 'status-sleeping'
  if (lower.includes('zombie') || lower.includes('dead')) return 'status-danger'
  return 'status-neutral'
}

function statusLabel(status: string) {
  const lower = status.toLowerCase()
  if (lower.includes('run')) return '运行中'
  if (lower.includes('sleep')) return '休眠'
  if (lower.includes('zombie')) return '僵尸'
  if (lower.includes('stop')) return '已停止'
  return status || '未知'
}

function cpuClass(percent: number) {
  if (percent >= 80) return 'metric-hot'
  if (percent >= 40) return 'metric-warn'
  return 'metric-cool'
}

function memoryClass(percent: number) {
  if (percent >= 80) return 'metric-hot'
  if (percent >= 40) return 'metric-warn'
  return 'metric-cool'
}

function formatDateText(raw: string) {
  if (!raw) return '-'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, index)
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function getProcessPorts(process: ProcessInfo) {
  return process.ports || []
}

function usePortFromTag(port: number) {
  portInput.value = String(port)
  activeTab.value = 'maintenance'
  const tab = document.getElementById('port-diagnosis-panel')
  if (tab) {
    tab.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

watch(parsedPort, () => {
  portSelectedPids.value = []
})

watch(portMatchedProcesses, () => {
  syncPortSelectedPids()
})

watch(filteredProcessList, () => {
  syncProcessPage()
})

watch(sortedBy, () => {
  reconnectSseNow()
})

watch(keywordApplied, () => {
  reconnectSseNow()
})

watch(activeTab, (tab) => {
  if (tab === 'logs' && !logsLoaded.value) {
    loadProcessLogs()
  }
})

onMounted(() => {
  connectSse()
  refreshZombieData()
})

onUnmounted(() => {
  closeSse()
})
</script>

<template>
  <div class="process-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">System</p>
        <h1 class="page-title">进程管理</h1>
        <p class="page-subtitle">实时观察进程状态，快速定位端口占用并执行安全终止</p>
      </div>
      <div class="connection-group">
        <span class="connection-badge" :class="{ online: connected, offline: !connected }">
          <span class="dot"></span>
          {{ connected ? 'SSE 已连接' : reconnecting ? '重连中' : '未连接' }}
        </span>
        <span class="last-update">最后更新 {{ lastUpdatedText }}</span>
      </div>
    </header>

    <div class="tabs-wrap">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'process' }"
        @click="activeTab = 'process'"
      >
        实时进程
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'maintenance' }"
        @click="activeTab = 'maintenance'"
      >
        维护
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'logs' }"
        @click="activeTab = 'logs'"
      >
        操作日志
      </button>
    </div>

    <section v-if="activeTab === 'process'" class="process-panel">
      <div class="toolbar-row">
        <div class="input-group">
          <label>排序</label>
          <select v-model.number="sortedBy">
            <option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </div>

        <div class="input-group keyword-group">
          <label>关键词过滤</label>
          <input
            v-model="keywordInput"
            type="text"
            placeholder="命令或进程名"
            @keydown.enter="applyKeywordFilter"
          >
        </div>

        <div class="toolbar-actions">
          <button class="secondary-btn success-btn" @click="applyKeywordFilter">应用</button>
          <button class="secondary-btn neutral-btn" @click="clearKeywordFilter">清空</button>
          <button class="secondary-btn info-btn" @click="reconnectSseNow">重连</button>
        </div>
      </div>

      <div v-if="processPortFilter !== null" class="filter-banner">
        <span>当前仅查看监听端口 {{ processPortFilter }} 的进程</span>
        <button class="secondary-btn neutral-btn" @click="clearProcessPortFilter">取消筛选</button>
      </div>

      <div class="batch-row">
        <span>已选 {{ selectedCount }} 项</span>
        <div class="batch-actions">
          <button class="secondary-btn" @click="toggleSelectAll">{{ isAllSelected ? '取消全选' : '全选当前列表' }}</button>
          <button class="primary-btn" :disabled="selectedCount === 0" @click="openKillConfirm(selectedPids, 'normal', '批量操作')">温和终止选中</button>
          <button class="danger-btn" :disabled="selectedCount === 0" @click="openKillConfirm(selectedPids, 'force', '批量操作')">强制终止选中</button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="process-table">
          <thead>
            <tr>
              <th class="col-check">
                <input class="checkbox" type="checkbox" :checked="isAllSelected" @change="toggleSelectAll">
              </th>
              <th>PID</th>
              <th>进程名</th>
              <th>用户</th>
              <th>CPU</th>
              <th>内存</th>
              <th class="col-status">状态</th>
              <th>命令</th>
              <th>端口</th>
              <th class="col-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filteredProcessList.length === 0">
              <td colspan="10" class="empty-cell">
                {{ processPortFilter !== null ? `当前筛选下未找到监听端口 ${processPortFilter} 的进程。` : '暂未收到进程数据，请检查 SSE 连接状态。' }}
              </td>
            </tr>

            <tr v-for="item in paginatedProcesses" :key="item.pid">
              <td>
                <input
                  class="checkbox"
                  type="checkbox"
                  :checked="selectedPids.includes(item.pid)"
                  @change="toggleRowSelection(item.pid)"
                >
              </td>
              <td class="mono">{{ item.pid }}</td>
              <td>{{ item.processName }}</td>
              <td>{{ item.userName }}</td>
              <td>
                <span :class="cpuClass(item.cpuPercent)">{{ formatPercent(item.cpuPercent) }}</span>
              </td>
              <td>
                <span :class="memoryClass(item.memoryPercent)">{{ formatPercent(item.memoryPercent) }}</span>
              </td>
              <td>
                <span class="status-chip" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
              </td>
              <td class="cmd-cell" :title="item.command">{{ item.command }}</td>
              <td>
                <div class="port-tags">
                  <button
                    v-for="port in getProcessPorts(item)"
                    :key="`${item.pid}-${port.protocol}-${port.port}`"
                    class="port-tag"
                    @click="usePortFromTag(port.port)"
                  >
                    {{ port.protocol }}/{{ port.port }}
                  </button>
                  <span v-if="getProcessPorts(item).length === 0" class="text-muted">-</span>
                </div>
              </td>
              <td>
                <div class="row-actions">
                  <button class="mini-btn info-btn" @click="openProcessDetail(item.pid)">详情</button>
                  <button class="mini-btn warning-btn" @click="openKillConfirm([item.pid], 'normal', `PID ${item.pid}`)">温和</button>
                  <button class="mini-btn danger" @click="openKillConfirm([item.pid], 'force', `PID ${item.pid}`)">强制</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pagination-row">
        <label>
          每页
          <select :value="processPageSize" @change="updateProcessPageSize(Number(($event.target as HTMLSelectElement).value))">
            <option v-for="size in processPageSizeOptions" :key="size" :value="size">{{ size }}</option>
          </select>
        </label>
        <span class="page-text">第 {{ processPage }} / {{ processTotalPages }} 页，共 {{ filteredProcessList.length }} 项</span>
        <div class="pagination-actions">
          <button class="secondary-btn" :disabled="processPage <= 1" @click="prevProcessPage">上一页</button>
          <button class="secondary-btn" :disabled="processPage >= processTotalPages" @click="nextProcessPage">下一页</button>
        </div>
      </div>
    </section>

    <section v-else-if="activeTab === 'maintenance'" class="maintenance-panel">
      <div class="maintenance-grid">
        <article id="port-diagnosis-panel" class="card">
          <div class="card-head">
            <h3>端口占用快速诊断</h3>
          </div>

          <div class="card-body">
            <div class="port-input-row">
              <input v-model="portInput" type="number" min="1" max="65535" placeholder="输入端口，例如 8080">
              <div class="port-toolbar-actions">
                <button class="secondary-btn info-btn" @click="reconnectSseNow">刷新进程</button>
                <button class="secondary-btn primary-tone-btn" @click="applyProcessPortFilter">查看</button>
              </div>
            </div>

            <div v-if="parsedPort === null" class="desc-line">输入有效端口后，将实时匹配占用该端口的进程。</div>
            <div v-else class="desc-line">端口 {{ parsedPort }} 共匹配 {{ portMatchedProcesses.length }} 个进程。</div>

            <div v-if="parsedPort !== null && portMatchedProcesses.length === 0" class="empty-hint">
              该端口暂未发现占用进程。
            </div>

            <div v-if="portMatchedProcesses.length > 0" class="port-match-list">
              <div class="port-match-header">
                <label class="match-check">
                  <input class="checkbox" type="checkbox" :checked="isPortAllSelected" @change="togglePortSelectAll">
                  <span>全选</span>
                </label>
                <span class="text-muted">已选 {{ portSelectedCount }} 项</span>
                <div class="port-match-actions">
                  <button
                    class="primary-btn"
                    :disabled="portSelectedCount === 0"
                    @click="openKillConfirm(portSelectedPids, 'normal', `端口 ${parsedPort ?? '-'}`)"
                  >
                    温和终止所选
                  </button>
                  <button
                    class="danger-btn"
                    :disabled="portSelectedCount === 0"
                    @click="openKillConfirm(portSelectedPids, 'force', `端口 ${parsedPort ?? '-'}`)"
                  >
                    强制终止所选
                  </button>
                </div>
              </div>

              <div v-for="item in portMatchedProcesses" :key="`match-${item.pid}`" class="port-match-item">
                <label class="match-check">
                  <input
                    class="checkbox"
                    type="checkbox"
                    :checked="portSelectedPids.includes(item.pid)"
                    @change="togglePortSelection(item.pid)"
                  >
                </label>
                <div class="match-body">
                  <div class="match-title">
                    <span class="mono">PID {{ item.pid }}</span>
                    <strong>{{ item.processName }}</strong>
                    <span class="text-muted">{{ item.userName }}</span>
                    <span class="status-chip" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
                  </div>
                  <div class="match-meta" :title="item.command">
                    <span class="match-command">{{ item.command }}</span>
                    <div class="port-tags">
                      <span
                        v-for="port in getProcessPorts(item)"
                        :key="`${item.pid}-${port.protocol}-${port.port}`"
                        class="port-tag"
                      >
                        {{ port.protocol }}/{{ port.port }}
                      </span>
                      <span v-if="getProcessPorts(item).length === 0" class="text-muted">-</span>
                    </div>
                  </div>
                </div>
                <div class="match-actions">
                  <button class="mini-btn info-btn" @click="openProcessDetail(item.pid)">详情</button>
                  <button class="mini-btn warning-btn" @click="openKillConfirm([item.pid], 'normal', `端口 ${parsedPort ?? '-'}`)">温和</button>
                  <button class="mini-btn danger" @click="openKillConfirm([item.pid], 'force', `端口 ${parsedPort ?? '-'}`)">强制</button>
                </div>
              </div>
            </div>
          </div>
        </article>

        <article class="card">
          <div class="card-head">
            <h3>自动清理</h3>
          </div>

          <div class="card-body">
            <div class="auto-clean-grid">
              <div class="auto-clean-form">
                <label>
                  CPU 阈值 (%)
                  <input v-model.number="autoCleanForm.cpuThreshold" type="number" min="1" max="100">
                </label>
                <label>
                  内存阈值 (%)
                  <input v-model.number="autoCleanForm.memoryThreshold" type="number" min="1" max="100">
                </label>
                <button class="primary-btn warning-btn" :disabled="autoCleanLoading" @click="openAutoCleanConfirm">执行自动清理</button>
              </div>
              <div class="auto-clean-result">
                <div class="result-title">最近一次执行结果</div>
                <div v-if="autoCleanResult" class="result-box">
                  <div>扫描总数: {{ autoCleanResult.totalScanned }}</div>
                  <div>终止数量: {{ autoCleanResult.totalKilled }}</div>
                  <div class="mono">终止 PID: {{ autoCleanResult.killedProcesses.join(', ') || '无' }}</div>
                </div>
                <div v-else class="empty-hint">暂无执行记录</div>
              </div>
            </div>
          </div>
        </article>
      </div>

      <article class="card">
        <div class="card-head">
          <h3>僵尸 / 孤儿进程</h3>
          <button class="secondary-btn" :disabled="zombieLoading" @click="refreshZombieData">刷新</button>
        </div>

        <div class="card-body">
          <div v-if="zombieLoading" class="empty-hint">加载中...</div>
          <div v-else-if="zombieData.length === 0" class="empty-hint">暂无僵尸/孤儿进程</div>
          <div v-else class="zombie-list">
            <div v-for="item in zombieData" :key="`zombie-${item.pid}`" class="zombie-item">
              <div class="zombie-main">
                <div class="zombie-title">
                  <span class="mono">PID {{ item.pid }}</span>
                  <strong>{{ item.processName }}</strong>
                  <span class="text-muted">{{ item.userName }}</span>
                  <span class="status-chip" :class="statusClass(item.status)">{{ statusLabel(item.status) }}</span>
                </div>
                <div class="zombie-meta" :title="item.command">
                  <span class="zombie-command">{{ item.command }}</span>
                  <div class="port-tags">
                    <span
                      v-for="port in getProcessPorts(item)"
                      :key="`${item.pid}-${port.protocol}-${port.port}`"
                      class="port-tag"
                    >
                      {{ port.protocol }}/{{ port.port }}
                    </span>
                    <span v-if="getProcessPorts(item).length === 0" class="text-muted">-</span>
                  </div>
                </div>
              </div>
              <div class="zombie-actions">
                <button class="mini-btn info-btn" @click="openProcessDetail(item.pid)">详情</button>
                <button class="mini-btn warning-btn" @click="openKillConfirm([item.pid], 'normal', `僵尸 PID ${item.pid}`)">温和</button>
                <button class="mini-btn danger" @click="openKillConfirm([item.pid], 'force', `僵尸 PID ${item.pid}`)">强制</button>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>

    <section v-else class="logs-panel">
      <div class="logs-toolbar">
        <div class="left">
          <button class="secondary-btn success-btn" :disabled="logsLoading" @click="loadProcessLogs">刷新日志</button>
        </div>

        <div class="right">
          <label>
            每页
            <select :value="logsPageSize" @change="updateLogsPageSize(Number(($event.target as HTMLSelectElement).value))">
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
            </select>
          </label>
          <button class="secondary-btn primary-tone-btn" :disabled="logsLoading || logsPage <= 1" @click="prevLogsPage">上一页</button>
          <span class="page-text">第 {{ logsPage }} / {{ logsTotalPages }} 页</span>
          <button class="secondary-btn primary-tone-btn" :disabled="logsLoading || logsPage >= logsTotalPages" @click="nextLogsPage">下一页</button>
        </div>
      </div>

      <div class="table-wrap">
        <table class="process-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>操作类型</th>
              <th>目标 PID</th>
              <th>操作者</th>
              <th>原因</th>
              <th>结果</th>
              <th>详情</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="logs.length === 0">
              <td colspan="8" class="empty-cell">暂无日志数据</td>
            </tr>
            <tr v-for="log in logs" :key="log.logId">
              <td>{{ log.logId }}</td>
              <td>{{ log.operationType }}</td>
              <td class="mono">{{ log.targetPids || '-' }}</td>
              <td>{{ log.operator || '-' }}</td>
              <td>{{ log.reason || '-' }}</td>
              <td>{{ log.result || '-' }}</td>
              <td>
                <button v-if="hasLogDetail(log)" class="mini-btn info-btn" @click="openLogDetail(log)">查看</button>
                <span v-else class="text-muted">-</span>
              </td>
              <td class="mono">{{ formatDateText(log.createTime) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="autoCleanConfirmDialog.visible" class="dialog-overlay" @click.self="closeAutoCleanConfirm">
          <div class="dialog-card">
            <div class="dialog-head">
              <h3>确认执行自动清理</h3>
              <p>将按 CPU {{ autoCleanConfirmDialog.cpuThreshold }}% 与内存 {{ autoCleanConfirmDialog.memoryThreshold }}% 阈值扫描并终止匹配进程。</p>
            </div>

            <div class="dialog-body">
              <p class="warn">该操作会立即尝试终止高占用进程，请确认当前业务允许执行。</p>
            </div>

            <div class="dialog-actions">
              <button class="secondary-btn" @click="closeAutoCleanConfirm">取消</button>
              <button class="primary-btn warning-btn" @click="runAutoClean">确认执行</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="killConfirmDialog.visible" class="dialog-overlay" @click.self="closeKillConfirm">
          <div class="dialog-card">
            <div class="dialog-head">
              <h3>二次确认：{{ killModeLabel }}</h3>
              <p>
                来源：{{ killConfirmDialog.sourceLabel }}
                · 目标 PID: {{ killConfirmDialog.pids.join(', ') }}
              </p>
            </div>

            <div class="dialog-body">
              <label class="field">
                <span>终止原因（可选）</span>
                <textarea v-model="killConfirmDialog.reason" rows="3" placeholder="例如：端口冲突，准备发布新版本"></textarea>
              </label>
              <p class="warn">请确认以上进程可以安全终止。确认后将立即执行。</p>
            </div>

            <div class="dialog-actions">
              <button class="secondary-btn" @click="closeKillConfirm">取消</button>
              <button class="danger-btn" @click="confirmKillAction">确认{{ killModeLabel }}</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="forceRetryDialog.visible" class="dialog-overlay" @click.self="closeForceRetryDialog">
          <div class="dialog-card">
            <div class="dialog-head">
              <h3>温和终止存在失败项</h3>
              <p>失败 PID：{{ forceRetryDialog.pids.join(', ') }}。是否继续强制终止？</p>
            </div>

            <div class="dialog-body">
              <label class="field">
                <span>强制终止原因</span>
                <textarea v-model="forceRetryDialog.reason" rows="3"></textarea>
              </label>
            </div>

            <div class="dialog-actions">
              <button class="secondary-btn" @click="closeForceRetryDialog">取消</button>
              <button class="danger-btn" @click="confirmForceRetry">继续强制终止</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="logDetailDialog.visible" class="dialog-overlay" @click.self="closeLogDetail">
          <div class="dialog-card wide">
            <div class="dialog-head">
              <h3>日志详情</h3>
              <p>日志 ID {{ logDetailDialog.logId }}</p>
            </div>

            <div class="dialog-body">
              <div class="log-detail-block">
                <span class="log-detail-label">目标 PID</span>
                <pre class="log-detail-content">{{ logDetailDialog.targetPids || '-' }}</pre>
              </div>
              <div class="log-detail-block">
                <span class="log-detail-label">结果</span>
                <pre class="log-detail-content">{{ logDetailDialog.result || '-' }}</pre>
              </div>
              <div class="log-detail-block">
                <span class="log-detail-label">详情</span>
                <pre class="log-detail-content">{{ logDetailDialog.detail || '-' }}</pre>
              </div>
            </div>

            <div class="dialog-actions">
              <button class="secondary-btn" @click="closeLogDetail">关闭</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="drawer">
        <aside v-if="detailState.visible" class="detail-drawer">
          <div class="drawer-head">
            <h3>进程详情</h3>
            <button class="secondary-btn" @click="closeProcessDetail">关闭</button>
          </div>

          <div v-if="detailState.loading" class="drawer-loading">加载中...</div>

          <div v-else-if="detailState.data" class="drawer-content">
            <div class="detail-row"><span>PID</span><strong class="mono">{{ detailState.data.pid }}</strong></div>
            <div class="detail-row"><span>进程名</span><strong>{{ detailState.data.processName }}</strong></div>
            <div class="detail-row"><span>用户</span><strong>{{ detailState.data.userName }}</strong></div>
            <div class="detail-row"><span>父进程</span><strong>{{ detailState.data.parentPid }}</strong></div>
            <div class="detail-row"><span>状态</span><strong>{{ statusLabel(detailState.data.status) }}</strong></div>
            <div class="detail-row"><span>线程数</span><strong>{{ detailState.data.threadCount }}</strong></div>
            <div class="detail-row"><span>文件句柄</span><strong>{{ detailState.data.fdCount }}</strong></div>
            <div class="detail-row"><span>RSS</span><strong>{{ formatBytes(detailState.data.rss) }}</strong></div>
            <div class="detail-row"><span>VMS</span><strong>{{ formatBytes(detailState.data.vms) }}</strong></div>
            <div class="detail-row"><span>启动时间</span><strong>{{ formatDateText(detailState.data.startTime) }}</strong></div>
            <div class="detail-col">
              <span>命令</span>
              <code>{{ detailState.data.command }}</code>
            </div>
            <div class="detail-col">
              <span>工作目录</span>
              <code>{{ detailState.data.workDir }}</code>
            </div>
            <div class="detail-col">
              <span>可执行文件</span>
              <code>{{ detailState.data.exePath }}</code>
            </div>
          </div>
        </aside>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.process-page {
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background:
    radial-gradient(circle at top left, var(--color-primary-ghost), transparent 50%),
    linear-gradient(135deg, var(--color-bg-surface), var(--color-bg-elevated));
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
}

.page-subtitle {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  max-width: 700px;
}



.connection-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.connection-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.connection-badge.online {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.connection-badge.offline {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 8px currentColor;
}

.last-update {
  font-size: 12px;
  color: var(--color-text-muted);
}

.tabs-wrap {
  display: inline-flex;
  width: fit-content;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-solid);
  border-radius: 14px;
  padding: 4px;
  gap: 4px;
}

.tab-btn {
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 700;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn.active {
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.process-panel,
.maintenance-panel,
.logs-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.maintenance-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 12px;
}

.toolbar-row {
  display: grid;
  grid-template-columns: 220px minmax(240px, 1fr) auto;
  gap: 12px;
  align-items: end;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 12px;
  background: var(--color-bg-surface);
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-group label {
  font-size: 12px;
  color: var(--color-text-muted);
}

.input-group input,
.input-group select,
.auto-clean-form input,
.threshold-grid input,
.logs-toolbar select,
.pagination-row select,
.port-input-row input,
textarea {
  width: 100%;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-surface);
  color: var(--color-text);
  border-radius: 10px;
  padding: 9px 10px;
  outline: none;
  font-size: 13px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.input-group input:focus,
.input-group select:focus,
.auto-clean-form input:focus,
.threshold-grid input:focus,
.logs-toolbar select:focus,
.pagination-row select:focus,
.port-input-row input:focus,
textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.toolbar-actions,
.actions,
.batch-actions,
.row-actions,
.dialog-actions,
.logs-toolbar .right,
.pagination-actions,
.port-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.primary-btn,
.secondary-btn,
.danger-btn,
.mini-btn {
  border: none;
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.primary-btn {
  color: #fff;
  background: linear-gradient(135deg, var(--color-primary-dark), var(--color-primary));
  box-shadow: 0 6px 14px -8px var(--color-primary-shadow);
}

.primary-btn:hover {
  transform: translateY(-1px);
}

.secondary-btn {
  color: var(--color-text-secondary);
  background: var(--color-bg-inset);
}

.secondary-btn:hover {
  color: var(--color-text);
  background: var(--color-bg-hover);
}

.secondary-btn.success-btn,
.mini-btn.success-btn {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.secondary-btn.warning-btn,
.mini-btn.warning-btn,
.primary-btn.warning-btn {
  color: #fff;
  background: linear-gradient(135deg, var(--color-warning), var(--color-warning-light));
  box-shadow: 0 8px 18px -10px color-mix(in srgb, var(--color-warning) 70%, transparent);
}

.secondary-btn.info-btn,
.mini-btn.info-btn {
  color: #2563eb;
  background: rgba(37, 99, 235, 0.12);
}

.secondary-btn.primary-tone-btn {
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.secondary-btn.neutral-btn {
  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-bg-inset) 82%, var(--color-border-solid));
}

.danger-btn {
  color: #fff;
  background: linear-gradient(135deg, var(--color-danger-hover), var(--color-danger));
}

.danger-btn:disabled,
.primary-btn:disabled,
.secondary-btn:disabled,
.mini-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.mini-btn {
  padding: 6px 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
  background: var(--color-bg-inset);
}

.mini-btn.danger {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.mini-btn.warning-btn,
.mini-btn.info-btn,
.mini-btn.success-btn,
.secondary-btn.success-btn,
.secondary-btn.warning-btn,
.secondary-btn.info-btn,
.secondary-btn.primary-tone-btn,
.secondary-btn.neutral-btn {
  border: 1px solid transparent;
}

.secondary-btn.info-btn:hover,
.mini-btn.info-btn:hover {
  color: #1d4ed8;
  background: rgba(37, 99, 235, 0.18);
}

.secondary-btn.success-btn:hover,
.mini-btn.success-btn:hover {
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success-bg) 84%, var(--color-success) 16%);
}

.secondary-btn.primary-tone-btn:hover {
  color: var(--color-primary-dark);
  background: color-mix(in srgb, var(--color-primary-ghost) 80%, var(--color-primary) 20%);
}

.secondary-btn.neutral-btn:hover {
  color: var(--color-text);
}

.grid-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.card {
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
}

.card.full-width {
  grid-column: span 2;
}

.card-head {
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-divider);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-head h3 {
  font-size: 15px;
  color: var(--color-text);
}

.hint {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.card-body {
  padding: 12px 14px;
}

.empty-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 10px 0;
}

.port-input-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

.port-toolbar-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.desc-line {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 8px;
}

.port-match-list {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}

.port-match-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-divider);
  flex-wrap: wrap;
}

.port-match-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.port-match-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--color-divider);
  background: var(--color-bg-surface);
}

.match-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.match-body {
  display: grid;
  gap: 6px;
}

.match-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--color-text);
}

.match-meta {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.match-command {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-actions {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.matched-list {
  margin-top: 10px;
  border: 1px dashed var(--color-border-solid);
  border-radius: 10px;
  overflow: hidden;
}

.matched-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-divider);
}

.matched-item:last-child {
  border-bottom: none;
}

.matched-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.threshold-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.auto-clean-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.auto-clean-form {
  display: grid;
  gap: 10px;
}

.auto-clean-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.auto-clean-result {
  display: grid;
  gap: 8px;
}

.result-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.threshold-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.result-box {
  margin-top: 10px;
  padding: 10px;
  border-radius: 10px;
  background: var(--color-bg-inset);
  color: var(--color-text-secondary);
  font-size: 12px;
  display: grid;
  gap: 4px;
}

.zombie-box {
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border-solid);
  border-radius: 10px;
  padding: 10px;
  font-size: 12px;
  max-height: 200px;
  overflow: auto;
  color: var(--color-text-secondary);
}

.zombie-list {
  display: grid;
  gap: 10px;
}

.zombie-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--color-divider);
  background: var(--color-bg-surface);
}

.zombie-main {
  display: grid;
  gap: 6px;
}

.zombie-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--color-text);
}

.zombie-meta {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.zombie-command {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.zombie-actions {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.batch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--color-bg-surface);
}

.batch-row > span {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.filter-banner,
.pagination-row {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--color-bg-surface);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-banner {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-primary-ghost) 80%, transparent), transparent),
    var(--color-bg-surface);
}

.filter-banner span,
.pagination-row label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.pagination-row label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.table-wrap {
  border: 1px solid var(--color-border);
  border-radius: 14px;
  overflow: auto;
  background: var(--color-bg-surface);
}

.process-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 1100px;
}

.process-table th,
.process-table td {
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: left;
  border-bottom: 1px solid var(--color-divider);
  padding: 10px 8px;
  vertical-align: top;
}

.process-table thead th {
  color: var(--color-text-muted);
  background: var(--color-bg-inset);
  font-weight: 700;
}

.process-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.col-check {
  width: 36px;
}

.col-status {
  width: 88px;
}

.col-actions {
  width: 210px;
}

.empty-cell {
  text-align: center;
  padding: 30px 10px;
  color: var(--color-text-muted);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.cmd-cell,
.detail-cell {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  min-width: 64px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 700;
}

.status-running {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.status-sleeping {
  color: var(--color-info);
  background: var(--color-info-bg);
}

.status-danger {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.status-neutral {
  color: var(--color-text-muted);
  background: var(--color-bg-inset);
}

.metric-hot {
  color: var(--color-danger);
  font-weight: 700;
}

.metric-warn {
  color: var(--color-warning);
  font-weight: 700;
}

.metric-cool {
  color: var(--color-success);
  font-weight: 700;
}

.port-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.port-tag {
  border: none;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.text-muted {
  color: var(--color-text-muted);
}

.logs-toolbar {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--color-bg-surface);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.logs-toolbar label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.page-text {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.checkbox {
  width: 16px;
  height: 16px;
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  border-radius: 4px;
  border: 1.5px solid var(--color-checkbox-border);
  background: var(--color-checkbox-bg);
  transition: all 0.15s ease;
  position: relative;
  flex-shrink: 0;
}

.checkbox:hover {
  border-color: var(--color-primary);
}

.checkbox:checked {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.checkbox:checked::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 8px;
  border: solid var(--color-checkbox-check);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 8100;
  background: rgba(8, 11, 19, 0.52);
  backdrop-filter: blur(5px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.dialog-card {
  width: 100%;
  max-width: 480px;
  border-radius: 16px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.dialog-card.wide {
  max-width: 640px;
}

.dialog-head {
  padding: 16px;
  border-bottom: 1px solid var(--color-divider);
}

.dialog-head h3 {
  font-size: 18px;
  color: var(--color-text);
}

.dialog-head p {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.dialog-body {
  padding: 14px 16px;
  display: grid;
  gap: 10px;
  max-height: 48vh;
  overflow: auto;
}

.pick-item {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--color-divider);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field span {
  font-size: 12px;
  color: var(--color-text-muted);
}

.warn {
  font-size: 12px;
  color: var(--color-warning);
  background: var(--color-warning-bg);
  border-radius: 8px;
  padding: 8px;
}

.dialog-actions {
  padding: 0 16px 16px;
  justify-content: flex-end;
}

.log-detail-block {
  display: grid;
  gap: 6px;
}

.log-detail-label {
  font-size: 12px;
  color: var(--color-text-muted);
}

.log-detail-content {
  margin: 0;
  white-space: pre-wrap;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-divider);
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.detail-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(520px, 92vw);
  z-index: 8200;
  background: var(--color-bg-surface);
  border-left: 1px solid var(--color-border-solid);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px;
  border-bottom: 1px solid var(--color-divider);
}

.drawer-head h3 {
  font-size: 18px;
  color: var(--color-text);
}

.drawer-loading {
  padding: 18px;
  color: var(--color-text-muted);
}

.drawer-content {
  padding: 14px;
  display: grid;
  gap: 10px;
  overflow: auto;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px dashed var(--color-divider);
  padding-bottom: 8px;
  font-size: 13px;
}

.detail-row span,
.detail-col span {
  color: var(--color-text-muted);
}

.detail-row strong,
.detail-col code {
  color: var(--color-text);
}

.detail-col {
  display: grid;
  gap: 6px;
}

.detail-col code {
  display: block;
  word-break: break-all;
  white-space: pre-wrap;
  padding: 8px;
  border-radius: 8px;
  background: var(--color-bg-inset);
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.22s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}

@media (max-width: 1200px) {
  .grid-cards {
    grid-template-columns: 1fr;
  }

  .card.full-width {
    grid-column: span 1;
  }

  .maintenance-grid {
    grid-template-columns: 1fr;
  }

  .toolbar-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .process-page {
    padding: 14px;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .connection-group {
    align-items: flex-start;
  }

  .threshold-grid,
  .port-input-row {
    grid-template-columns: 1fr;
  }

  .auto-clean-grid {
    grid-template-columns: 1fr;
  }

  .batch-row,
  .logs-toolbar,
  .pagination-row,
  .filter-banner {
    flex-direction: column;
    align-items: flex-start;
  }

  .pick-item {
    grid-template-columns: auto 1fr;
    gap: 6px;
  }

  .port-match-item,
  .zombie-item {
    grid-template-columns: 1fr;
  }

  .match-actions,
  .zombie-actions {
    justify-content: flex-start;
  }
}
</style>
