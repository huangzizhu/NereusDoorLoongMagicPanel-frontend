<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as scheduledApi from '../api/scheduledInspection'
import { useNotification } from '../composables/useNotification'
import type {
  BackgroundRunStatus,
  InspectionConfig,
  InspectionConfigUpdateRequest,
  InspectionReport,
  ScheduledTask,
  ScheduledTaskApprovalDetail,
  ScheduledTaskApprovalPolicy,
  ScheduledTaskRun,
  ScheduledTaskStatus,
} from '../types/scheduledInspection'

type PageTab = 'tasks' | 'inspection'
type TaskStatusFilter = 'all' | 'active' | 'paused' | 'pending_approval' | 'deleted'
type TaskFormMode = 'create' | 'edit'

const router = useRouter()
const notify = useNotification()

const activeTab = ref<PageTab>('tasks')

const tasks = ref<ScheduledTask[]>([])
const tasksLoading = ref(false)
const tasksRefreshing = ref(false)
const taskStatusFilter = ref<TaskStatusFilter>('all')
const includeDeletedTasks = ref(false)
const taskActionId = ref('')
const taskTriggerId = ref('')

const taskForm = reactive({
  visible: false,
  mode: 'create' as TaskFormMode,
  taskId: null as number | null,
  name: '',
  cronExpression: '',
  taskDescription: '',
  approvalEnabled: false,
  allowedTools: '',
  commandsEnabled: false,
  allowedCommands: '',
  allowedPaths: '',
  deniedPaths: '',
  allowedPrivilegedCommands: '',
  ttlSeconds: 3600,
  maxRuns: 100,
  saving: false,
})

const deleteDialog = reactive({
  visible: false,
  taskId: null as number | null,
  taskName: '',
  deleting: false,
})

const runsDialog = reactive({
  visible: false,
  task: null as ScheduledTask | null,
  loading: false,
  runs: [] as ScheduledTaskRun[],
})

const approvalDialog = reactive({
  visible: false,
  task: null as ScheduledTask | null,
  loading: false,
  reissuing: false,
  detail: null as ScheduledTaskApprovalDetail | null,
})

const reports = ref<InspectionReport[]>([])
const latestReport = ref<InspectionReport | null>(null)
const selectedReport = ref<InspectionReport | null>(null)
const inspectionConfig = ref<InspectionConfig | null>(null)
const inspectionLoading = ref(false)
const inspectionRefreshing = ref(false)
const inspectionTriggering = ref(false)
const reportPage = ref(1)
const reportPageSize = 20
const reportTotal = ref(0)

const configDialog = reactive({
  visible: false,
  intervalMinutes: 30,
  saving: false,
  // 预授权策略编辑区
  approvalEnabled: true,
  allowedTools: '',
  commandsEnabled: true,
  allowedCommands: '',
  allowedPaths: '',
  deniedPaths: '',
  allowedPrivilegedCommands: '',
  ttlSeconds: 25200,
  maxRuns: 100,
})

const latestStatusText = computed(() => latestReport.value ? statusLabel(latestReport.value.status) : '暂无报告')
const taskActiveCount = computed(() => tasks.value.filter((task) => task.status === 'active').length)
const taskPausedCount = computed(() => tasks.value.filter((task) => task.status === 'paused').length)
const taskPendingApprovalCount = computed(() => tasks.value.filter((task) => task.status === 'pending_approval').length)
const taskDeletedCount = computed(() => tasks.value.filter((task) => task.status === 'deleted').length)
const reportTotalPages = computed(() => Math.max(1, Math.ceil(reportTotal.value / reportPageSize)))

function statusLabel(status: ScheduledTaskStatus | BackgroundRunStatus): string {
  const labels: Record<string, string> = {
    active: '启用',
    paused: '暂停',
    deleted: '已删除',
    pending_approval: '待审批',
    running: '执行中',
    success: '成功',
    error: '失败',
  }
  return labels[status] || status
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs == null) return '--'
  if (durationMs < 1000) return `${durationMs} ms`
  return `${(durationMs / 1000).toFixed(1)} s`
}

function formatTokens(run: ScheduledTaskRun): string {
  if (!run.tokenUsage) return '--'
  return `${run.tokenUsage.totalTokens} tokens / ${run.tokenUsage.callCount} 次`
}

function normalizeError(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback
  return fallback
}

function validateTaskForm(): string | null {
  if (!taskForm.name.trim()) return '请输入任务名称'
  if (!taskForm.cronExpression.trim()) return '请输入 cron 表达式'
  if (taskForm.cronExpression.trim().split(/\s+/).length !== 5) return 'cron 表达式需要 5 段'
  if (!taskForm.taskDescription.trim()) return '请输入任务描述'
  if (taskForm.approvalEnabled) {
    if (!Number.isInteger(Number(taskForm.ttlSeconds)) || Number(taskForm.ttlSeconds) <= 0) return '审批码有效期需要大于 0 秒'
    if (!Number.isInteger(Number(taskForm.maxRuns)) || Number(taskForm.maxRuns) <= 0) return '最大授权次数需要大于 0'
  }
  return null
}

function splitPolicyInput(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function joinPolicyInput(value: string[] | undefined): string {
  return (value || []).join('\n')
}

function buildApprovalPolicy(): ScheduledTaskApprovalPolicy | undefined {
  if (!taskForm.approvalEnabled) return undefined
  const policy: ScheduledTaskApprovalPolicy = {
    allowedTools: splitPolicyInput(taskForm.allowedTools),
    allowedPaths: splitPolicyInput(taskForm.allowedPaths),
    deniedPaths: splitPolicyInput(taskForm.deniedPaths),
    allowedPrivilegedCommands: splitPolicyInput(taskForm.allowedPrivilegedCommands),
    ttlSeconds: Number(taskForm.ttlSeconds),
    maxRuns: Number(taskForm.maxRuns),
  }
  if (taskForm.commandsEnabled) {
    policy.allowedCommands = splitPolicyInput(taskForm.allowedCommands)
  }
  return policy
}

async function loadTasks(showFullLoading = false) {
  try {
    if (showFullLoading) {
      tasksLoading.value = true
    } else {
      tasksRefreshing.value = true
    }

    const res = await scheduledApi.getAllScheduledTasks({
      includeDeleted: includeDeletedTasks.value || taskStatusFilter.value === 'deleted',
    })
    if (res.data.code !== 1) {
      notify.warning('定时任务加载失败', res.data.msg)
      return
    }
    const items = res.data.data.items || []
    tasks.value = taskStatusFilter.value === 'all'
      ? items
      : items.filter((task) => task.status === taskStatusFilter.value)
  } catch (error) {
    notify.error('定时任务加载失败', normalizeError(error, '请稍后重试'))
  } finally {
    tasksLoading.value = false
    tasksRefreshing.value = false
  }
}

async function handleIncludeDeletedChange() {
  if (!includeDeletedTasks.value && taskStatusFilter.value === 'deleted') {
    taskStatusFilter.value = 'all'
  }
  await loadTasks()
}

function openCreateTask() {
  taskForm.visible = true
  taskForm.mode = 'create'
  taskForm.taskId = null
  taskForm.name = ''
  taskForm.cronExpression = '0 8 * * *'
  taskForm.taskDescription = ''
  taskForm.approvalEnabled = false
  taskForm.allowedTools = ''
  taskForm.commandsEnabled = false
  taskForm.allowedCommands = ''
  taskForm.allowedPaths = ''
  taskForm.deniedPaths = ''
  taskForm.allowedPrivilegedCommands = ''
  taskForm.ttlSeconds = 3600
  taskForm.maxRuns = 100
}

function openEditTask(task: ScheduledTask) {
  const policy = task.approvalPolicy
  taskForm.visible = true
  taskForm.mode = 'edit'
  taskForm.taskId = task.id
  taskForm.name = task.name
  taskForm.cronExpression = task.cronExpression
  taskForm.taskDescription = task.taskDescription
  taskForm.approvalEnabled = Boolean(policy)
  taskForm.allowedTools = joinPolicyInput(policy?.allowedTools)
  taskForm.commandsEnabled = Array.isArray(policy?.allowedCommands)
  taskForm.allowedCommands = joinPolicyInput(policy?.allowedCommands)
  taskForm.allowedPaths = joinPolicyInput(policy?.allowedPaths)
  taskForm.deniedPaths = joinPolicyInput(policy?.deniedPaths)
  taskForm.allowedPrivilegedCommands = joinPolicyInput(policy?.allowedPrivilegedCommands)
  taskForm.ttlSeconds = policy?.ttlSeconds || 3600
  taskForm.maxRuns = policy?.maxRuns || 100
}

function closeTaskForm() {
  if (taskForm.saving) return
  taskForm.visible = false
}

async function saveTaskForm() {
  const validationError = validateTaskForm()
  if (validationError) {
    notify.warning('表单校验失败', validationError)
    return
  }

  taskForm.saving = true
  const basePayload = {
    name: taskForm.name.trim(),
    cronExpression: taskForm.cronExpression.trim(),
    taskDescription: taskForm.taskDescription.trim(),
  }
  const updatePayload: {
    name: string
    cronExpression: string
    taskDescription: string
    approvalPolicy: ScheduledTaskApprovalPolicy | null
  } = {
    ...basePayload,
    approvalPolicy: buildApprovalPolicy() || null,
  }
  const approvalPolicy = buildApprovalPolicy()
  const createPayload = approvalPolicy ? { ...basePayload, approvalPolicy } : basePayload

  try {
    const res = taskForm.mode === 'create'
      ? await scheduledApi.createScheduledTask(createPayload)
      : await scheduledApi.updateScheduledTask(taskForm.taskId as number, updatePayload)

    if (res.data.code !== 1) {
      notify.warning(taskForm.mode === 'create' ? '创建失败' : '更新失败', res.data.msg)
      return
    }
    notify.info(
      taskForm.mode === 'create' ? '定时任务已创建' : '定时任务已更新',
      res.data.data.status === 'pending_approval' ? approvalCommand(res.data.data.approvalCode) : undefined,
    )
    taskForm.visible = false
    await loadTasks()
  } catch (error) {
    notify.error('保存定时任务失败', normalizeError(error, '请稍后重试'))
  } finally {
    taskForm.saving = false
  }
}

function openDeleteTask(task: ScheduledTask) {
  deleteDialog.visible = true
  deleteDialog.taskId = task.id
  deleteDialog.taskName = task.name
}

function closeDeleteTask() {
  if (deleteDialog.deleting) return
  deleteDialog.visible = false
}

async function confirmDeleteTask() {
  if (!deleteDialog.taskId) return
  deleteDialog.deleting = true
  try {
    const res = await scheduledApi.deleteScheduledTask(deleteDialog.taskId)
    if (res.data.code !== 1) {
      notify.warning('删除失败', res.data.msg)
      return
    }
    notify.info('定时任务已删除')
    deleteDialog.visible = false
    await loadTasks()
  } catch (error) {
    notify.error('删除定时任务失败', normalizeError(error, '请稍后重试'))
  } finally {
    deleteDialog.deleting = false
  }
}

async function changeTaskStatus(task: ScheduledTask) {
  taskActionId.value = `${task.id}:${task.status}`
  try {
    const res = task.status === 'active'
      ? await scheduledApi.pauseScheduledTask(task.id)
      : await scheduledApi.resumeScheduledTask(task.id)
    if (res.data.code !== 1) {
      notify.warning('状态切换失败', res.data.msg)
      return
    }
    const index = tasks.value.findIndex((item) => item.id === task.id)
    if (index >= 0) tasks.value[index] = res.data.data
    notify.info(task.status === 'active' ? '任务已暂停' : '任务已恢复')
  } catch (error) {
    notify.error('状态切换失败', normalizeError(error, '请稍后重试'))
  } finally {
    taskActionId.value = ''
  }
}

async function triggerTask(task: ScheduledTask) {
  taskTriggerId.value = String(task.id)
  try {
    const res = await scheduledApi.triggerScheduledTask(task.id)
    if (res.data.code !== 1) {
      notify.warning('触发失败', res.data.msg)
      return
    }
    const run = res.data.data
    notify.info(run.status === 'success' ? '任务执行成功' : '任务执行完成', run.resultSummary || run.errorMessage || undefined)
    await loadTasks()
    if (runsDialog.visible && runsDialog.task?.id === task.id) {
      await loadTaskRuns(task)
    }
  } catch (error) {
    notify.error('触发定时任务失败', normalizeError(error, '后台执行可能需要更长时间，请稍后查看历史'))
  } finally {
    taskTriggerId.value = ''
  }
}

async function loadTaskRuns(task: ScheduledTask) {
  runsDialog.loading = true
  try {
    const res = await scheduledApi.getScheduledTaskRuns(task.id, 100)
    if (res.data.code !== 1) {
      notify.warning('执行历史加载失败', res.data.msg)
      return
    }
    runsDialog.runs = res.data.data.items || []
  } catch (error) {
    notify.error('执行历史加载失败', normalizeError(error, '请稍后重试'))
  } finally {
    runsDialog.loading = false
  }
}

async function openTaskRuns(task: ScheduledTask) {
  runsDialog.visible = true
  runsDialog.task = task
  runsDialog.runs = []
  await loadTaskRuns(task)
}

function closeTaskRuns() {
  runsDialog.visible = false
  runsDialog.task = null
  runsDialog.runs = []
}

function approvalCommand(code: string | null | undefined): string {
  return code ? `sudo nereus approve ${code}` : ''
}

function formatPolicyList(value: string[] | undefined): string {
  if (!value || value.length === 0) return '--'
  return value.join(', ')
}

/**
 * 从报告/运行记录文本中提取授权请求审批码（authorization.requested 事件
 * 会以「[授权请求已提交] ... 审批命令: sudo nereus approve CODE」形式
 * 出现在 agent 输出中，随 fullReport / resultSummary 返回）。
 */
const APPROVAL_CODE_RE = /sudo\s+nereus\s+approve\s+([A-Z0-9-]+)/g

function extractApprovalCodes(text: string | null | undefined): string[] {
  if (!text) return []
  const seen = new Set<string>()
  const codes: string[] = []
  const re = new RegExp(APPROVAL_CODE_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const code = match[1]
    if (!seen.has(code)) {
      seen.add(code)
      codes.push(code)
    }
  }
  return codes
}

/** 当前选中巡检报告中的待审批授权请求（审批码去重） */
const reportApprovalCodes = computed(() => {
  const report = selectedReport.value
  if (!report) return []
  return extractApprovalCodes([report.fullReport, report.summary, report.errorMessage].join('\n'))
})

/** 定时任务某次运行记录中的待审批授权请求 */
function runApprovalCodes(run: ScheduledTaskRun): string[] {
  return extractApprovalCodes([run.resultSummary, run.errorMessage].join('\n'))
}

async function openApprovalDialog(task: ScheduledTask) {
  approvalDialog.visible = true
  approvalDialog.task = task
  approvalDialog.detail = {
    taskId: task.id,
    approvalPolicy: task.approvalPolicy,
    approvalCode: task.approvalCode,
    approvalStatus: task.approvalStatus,
    approvalApprovedAt: task.approvalApprovedAt,
    approvalApprovedBy: task.approvalApprovedBy,
    approvalTokenId: task.approvalTokenId,
    approvalRejectedReason: task.approvalRejectedReason,
  }
  approvalDialog.loading = true

  try {
    const res = await scheduledApi.getScheduledTaskApproval(task.id)
    if (res.data.code !== 1) {
      notify.warning('审批详情加载失败', res.data.msg)
      return
    }
    approvalDialog.detail = res.data.data
  } catch (error) {
    notify.error('审批详情加载失败', normalizeError(error, '请稍后重试'))
  } finally {
    approvalDialog.loading = false
  }
}

function closeApprovalDialog() {
  if (approvalDialog.reissuing) return
  approvalDialog.visible = false
  approvalDialog.task = null
  approvalDialog.detail = null
}

async function reissueApprovalCode() {
  if (!approvalDialog.task) return
  approvalDialog.reissuing = true
  try {
    const res = await scheduledApi.reissueScheduledTaskApproval(approvalDialog.task.id)
    if (res.data.code !== 1) {
      notify.warning('重新生成失败', res.data.msg)
      return
    }
    approvalDialog.detail = res.data.data
    const taskIndex = tasks.value.findIndex((task) => task.id === approvalDialog.task?.id)
    if (taskIndex >= 0) {
      tasks.value[taskIndex] = {
        ...tasks.value[taskIndex],
        approvalCode: res.data.data.approvalCode,
        approvalStatus: res.data.data.approvalStatus,
        approvalPolicy: res.data.data.approvalPolicy,
        approvalRejectedReason: res.data.data.approvalRejectedReason,
      }
    }
    notify.info('审批码已重新生成', approvalCommand(res.data.data.approvalCode))
  } catch (error) {
    notify.error('重新生成审批码失败', normalizeError(error, '请稍后重试'))
  } finally {
    approvalDialog.reissuing = false
  }
}

async function loadInspection(showFullLoading = false) {
  try {
    if (showFullLoading) {
      inspectionLoading.value = true
    } else {
      inspectionRefreshing.value = true
    }

    const [configRes, latestRes, reportsRes] = await Promise.all([
      scheduledApi.getInspectionConfig(),
      scheduledApi.getLatestInspectionReport(),
      scheduledApi.getInspectionReports({ page: reportPage.value, pageSize: reportPageSize }),
    ])

    if (configRes.data.code === 1) {
      inspectionConfig.value = configRes.data.data
    } else {
      notify.warning('巡检配置加载失败', configRes.data.msg)
    }

    if (latestRes.data.code === 1) {
      latestReport.value = latestRes.data.data
      if (!selectedReport.value) selectedReport.value = latestRes.data.data
    } else {
      notify.warning('最新巡检报告加载失败', latestRes.data.msg)
    }

    if (reportsRes.data.code === 1) {
      reports.value = reportsRes.data.data.items || []
      reportTotal.value = reportsRes.data.data.total || 0
      if (!selectedReport.value && reports.value.length) selectedReport.value = reports.value[0]
    } else {
      notify.warning('巡检报告列表加载失败', reportsRes.data.msg)
    }
  } catch (error) {
    notify.error('巡检数据加载失败', normalizeError(error, '请稍后重试'))
  } finally {
    inspectionLoading.value = false
    inspectionRefreshing.value = false
  }
}

async function loadReportsPage(page: number) {
  reportPage.value = Math.min(Math.max(1, page), reportTotalPages.value)
  try {
    inspectionRefreshing.value = true
    const res = await scheduledApi.getInspectionReports({ page: reportPage.value, pageSize: reportPageSize })
    if (res.data.code !== 1) {
      notify.warning('巡检报告列表加载失败', res.data.msg)
      return
    }
    reports.value = res.data.data.items || []
    reportTotal.value = res.data.data.total || 0
  } catch (error) {
    notify.error('巡检报告列表加载失败', normalizeError(error, '请稍后重试'))
  } finally {
    inspectionRefreshing.value = false
  }
}

async function openReport(report: InspectionReport) {
  selectedReport.value = report
  try {
    const res = await scheduledApi.getInspectionReport(report.id)
    if (res.data.code === 1) {
      selectedReport.value = res.data.data
    }
  } catch (error) {
    notify.warning('报告详情加载失败', normalizeError(error, '当前显示列表中的摘要信息'))
  }
}

async function triggerInspectionRun() {
  inspectionTriggering.value = true
  try {
    const res = await scheduledApi.triggerInspection()
    if (res.data.code !== 1) {
      notify.warning('巡检触发失败', res.data.msg)
      return
    }
    latestReport.value = res.data.data
    selectedReport.value = res.data.data
    notify.info(res.data.data.status === 'success' ? '巡检完成' : '巡检已结束', res.data.data.summary || res.data.data.errorMessage || undefined)
    reportPage.value = 1
    await loadReportsPage(1)
  } catch (error) {
    notify.error('触发巡检失败', normalizeError(error, '后台执行可能需要更长时间，请稍后刷新报告'))
  } finally {
    inspectionTriggering.value = false
  }
}

function openConfigDialog() {
  const policy = inspectionConfig.value?.approvalPolicy
  configDialog.intervalMinutes = inspectionConfig.value?.inspectionIntervalMinutes || 30
  configDialog.approvalEnabled = Boolean(policy)
  configDialog.allowedTools = joinPolicyInput(policy?.allowedTools)
  // 数组存在即视为显式配置（空数组 = 拒绝一切命令）
  configDialog.commandsEnabled = Array.isArray(policy?.allowedCommands)
  configDialog.allowedCommands = joinPolicyInput(policy?.allowedCommands)
  configDialog.allowedPaths = joinPolicyInput(policy?.allowedPaths)
  configDialog.deniedPaths = joinPolicyInput(policy?.deniedPaths)
  configDialog.allowedPrivilegedCommands = joinPolicyInput(policy?.allowedPrivilegedCommands)
  configDialog.ttlSeconds = policy?.ttlSeconds || 25200
  configDialog.maxRuns = policy?.maxRuns || 100
  configDialog.visible = true
}

function closeConfigDialog() {
  if (configDialog.saving) return
  configDialog.visible = false
}

async function saveInspectionConfig() {
  const interval = Number(configDialog.intervalMinutes)
  if (!Number.isInteger(interval) || interval < 1 || interval > 1440) {
    notify.warning('配置校验失败', '巡检间隔需要在 1 到 1440 分钟之间')
    return
  }
  if (configDialog.approvalEnabled) {
    if (!Number.isInteger(Number(configDialog.ttlSeconds)) || Number(configDialog.ttlSeconds) <= 0) {
      notify.warning('配置校验失败', '审批码有效期需要大于 0 秒')
      return
    }
    if (!Number.isInteger(Number(configDialog.maxRuns)) || Number(configDialog.maxRuns) <= 0) {
      notify.warning('配置校验失败', '最大授权次数需要大于 0')
      return
    }
  }

  configDialog.saving = true
  try {
    const payload: InspectionConfigUpdateRequest = { intervalMinutes: interval }
    if (configDialog.approvalEnabled) {
      const policy: ScheduledTaskApprovalPolicy = {
        allowedTools: splitPolicyInput(configDialog.allowedTools),
        allowedPaths: splitPolicyInput(configDialog.allowedPaths),
        deniedPaths: splitPolicyInput(configDialog.deniedPaths),
        allowedPrivilegedCommands: splitPolicyInput(configDialog.allowedPrivilegedCommands),
        ttlSeconds: Number(configDialog.ttlSeconds),
        maxRuns: Number(configDialog.maxRuns),
      }
      if (configDialog.commandsEnabled) {
        policy.allowedCommands = splitPolicyInput(configDialog.allowedCommands)
      }
      payload.approvalPolicy = policy
    }

    const res = await scheduledApi.updateInspectionConfig(payload)
    if (res.data.code !== 1) {
      notify.warning('配置更新失败', res.data.msg)
      return
    }
    inspectionConfig.value = res.data.data
    configDialog.visible = false
    notify.info('巡检配置已更新')
  } catch (error) {
    notify.error('配置更新失败', normalizeError(error, '请稍后重试'))
  } finally {
    configDialog.saving = false
  }
}

async function copyText(text: string | null | undefined) {
  if (!text) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    notify.info('已复制')
  } catch (error) {
    notify.warning('复制失败', normalizeError(error, '请手动复制'))
  }
}

function openAgentSession(sessionId: string | null | undefined) {
  if (!sessionId) return
  router.push({ path: '/agent', query: { sessionId } })
}

function findingClass(level: string) {
  if (level === 'error') return 'danger'
  if (level === 'warning') return 'warning'
  return 'info'
}

onMounted(async () => {
  await Promise.all([
    loadTasks(true),
    loadInspection(true),
  ])
})
</script>

<template>
  <div class="scheduled-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Automation</p>
        <h1 class="page-title">任务巡检</h1>
        <p class="page-subtitle">管理后台 Agent 的定时执行任务，并查看自动巡检报告与运行配置。</p>
      </div>

      <div class="header-actions">
        <div class="connection-badge" :class="{ connected: inspectionConfig?.schedulerStarted, disconnected: !inspectionConfig?.schedulerStarted }">
          <span class="dot"></span>
          {{ inspectionConfig?.schedulerStarted ? '调度器运行中' : '调度器状态未知' }}
        </div>
        <button class="secondary-btn" :disabled="tasksRefreshing || inspectionRefreshing" @click="activeTab === 'tasks' ? loadTasks() : loadInspection()">
          {{ tasksRefreshing || inspectionRefreshing ? '刷新中...' : '刷新数据' }}
        </button>
      </div>
    </header>

    <div class="tabs-wrap">
      <button class="tab-btn" :class="{ active: activeTab === 'tasks' }" @click="activeTab = 'tasks'">
        定时任务
      </button>
      <button class="tab-btn" :class="{ active: activeTab === 'inspection' }" @click="activeTab = 'inspection'">
        自动巡检
      </button>
    </div>

    <section class="status-grid">
      <article class="status-card">
        <span class="status-label">任务总数</span>
        <strong class="status-value">{{ tasks.length }}</strong>
        <span class="status-helper">当前筛选结果</span>
      </article>
      <article class="status-card success">
        <span class="status-label">启用任务</span>
        <strong class="status-value">{{ taskActiveCount }}</strong>
        <span class="status-helper">会被 scheduler 加载</span>
      </article>
      <article class="status-card warning">
        <span class="status-label">暂停任务</span>
        <strong class="status-value">{{ taskPausedCount }}</strong>
        <span class="status-helper">不会自动触发</span>
      </article>
      <article class="status-card pending">
        <span class="status-label">待审批</span>
        <strong class="status-value">{{ taskPendingApprovalCount }}</strong>
        <span class="status-helper">等待 SSH CLI 批准</span>
      </article>
      <article class="status-card deleted">
        <span class="status-label">历史任务</span>
        <strong class="status-value">{{ taskDeletedCount }}</strong>
        <span class="status-helper">{{ includeDeletedTasks ? '已包含删除记录' : '默认隐藏已删除' }}</span>
      </article>
      <article class="status-card" :class="latestReport?.status || 'default'">
        <span class="status-label">最新巡检</span>
        <strong class="status-value compact">{{ latestStatusText }}</strong>
        <span class="status-helper">{{ formatDate(latestReport?.createdAt) }}</span>
      </article>
    </section>

    <template v-if="activeTab === 'tasks'">
      <section class="content-panel">
        <div class="toolbar-card">
          <div class="toolbar-intro">
            <h2>定时任务</h2>
            <p>通过 cron 触发后台 Agent 执行任务描述，执行结果会保留在历史记录中。</p>
          </div>

          <div class="toolbar-controls">
            <label class="field">
              <span>状态筛选</span>
              <select v-model="taskStatusFilter" @change="loadTasks()">
                <option value="all">全部</option>
                <option value="active">启用</option>
                <option value="paused">暂停</option>
                <option value="pending_approval">待审批</option>
                <option value="deleted" :disabled="!includeDeletedTasks">已删除</option>
              </select>
            </label>

            <label class="history-toggle">
              <input v-model="includeDeletedTasks" type="checkbox" @change="handleIncludeDeletedChange" />
              <span class="toggle-control"></span>
              <span class="toggle-copy">
                <strong>查看历史任务</strong>
                <small>包含已删除任务定义，可继续查看执行记录</small>
              </span>
            </label>

            <button class="primary-btn" @click="openCreateTask">新建任务</button>
          </div>
        </div>

        <div v-if="tasksLoading" class="loading-panel">正在加载定时任务...</div>
        <div v-else-if="!tasks.length" class="empty-panel">暂无定时任务。</div>
        <div v-else class="table-card">
          <table class="task-table">
            <thead>
              <tr>
                <th>任务</th>
                <th>Cron</th>
                <th>状态</th>
                <th>下次执行</th>
                <th>上次执行</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in tasks" :key="task.id" :class="{ 'deleted-row': task.status === 'deleted' }">
                <td class="task-cell">
                  <strong>{{ task.name }}</strong>
                  <span>{{ task.taskDescription }}</span>
                  <div v-if="task.status === 'pending_approval'" class="approval-command-inline">
                    <code>{{ approvalCommand(task.approvalCode) || '审批码待返回' }}</code>
                    <button class="link-btn" :disabled="!task.approvalCode" @click="copyText(approvalCommand(task.approvalCode))">复制</button>
                  </div>
                </td>
                <td class="mono">{{ task.cronExpression }}</td>
                <td>
                  <span class="state-badge" :class="task.status">{{ statusLabel(task.status) }}</span>
                </td>
                <td>{{ formatDate(task.nextRunAt) }}</td>
                <td>{{ formatDate(task.lastRunAt) }}</td>
                <td>
                  <div class="action-row">
                    <button class="mini-btn" :disabled="task.status === 'deleted' || task.status === 'pending_approval' || taskActionId !== ''" @click="changeTaskStatus(task)">
                      {{ taskActionId === `${task.id}:${task.status}` ? '处理中' : task.status === 'active' ? '暂停' : '恢复' }}
                    </button>
                    <button class="mini-btn primary" :disabled="task.status === 'deleted' || task.status === 'pending_approval' || taskTriggerId !== ''" @click="triggerTask(task)">
                      {{ taskTriggerId === String(task.id) ? '执行中' : '触发' }}
                    </button>
                    <button class="mini-btn" @click="openTaskRuns(task)">历史</button>
                    <button v-if="task.status === 'pending_approval' || task.approvalPolicy" class="mini-btn warning" @click="openApprovalDialog(task)">审批</button>
                    <button class="mini-btn" :disabled="task.status === 'deleted'" @click="openEditTask(task)">编辑</button>
                    <button class="mini-btn danger" :disabled="task.status === 'deleted'" @click="openDeleteTask(task)">删除</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <template v-else>
      <section class="inspection-layout">
        <div class="report-main">
          <section class="panel-card">
            <div class="panel-head">
              <div>
                <h2>巡检报告</h2>
                <p>后端默认按配置间隔执行巡检，也可以在这里立即触发一次。</p>
              </div>
              <div class="panel-actions">
                <button class="secondary-btn" :disabled="inspectionRefreshing" @click="loadInspection()">刷新</button>
                <button class="secondary-btn" @click="openConfigDialog">配置间隔</button>
                <button class="primary-btn" :disabled="inspectionTriggering" @click="triggerInspectionRun">
                  {{ inspectionTriggering ? '巡检中...' : '手动巡检' }}
                </button>
              </div>
            </div>

            <div v-if="inspectionLoading" class="loading-panel inner">正在加载巡检报告...</div>
            <div v-else-if="!selectedReport" class="empty-panel inner">暂无巡检报告。</div>
            <div v-else class="report-detail">
              <div class="report-summary">
                <span class="state-badge" :class="selectedReport.status">{{ statusLabel(selectedReport.status) }}</span>
                <strong>{{ selectedReport.summary || selectedReport.errorMessage || '无摘要' }}</strong>
                <div class="report-meta">
                  <span>{{ formatDate(selectedReport.createdAt) }}</span>
                  <span>{{ formatDuration(selectedReport.durationMs) }}</span>
                  <button class="link-btn" :disabled="!selectedReport.sessionId" @click="openAgentSession(selectedReport.sessionId)">打开 Agent 会话</button>
                </div>
              </div>

              <div v-if="reportApprovalCodes.length" class="approval-hint-card">
                <div class="approval-hint-head">
                  <strong>存在待审批的授权请求</strong>
                  <span>工具不在预授权范围内，本次已跳过未执行；管理员批准后后续运行将自动放行。</span>
                </div>
                <div v-for="code in reportApprovalCodes" :key="code" class="approval-command-inline">
                  <code>{{ approvalCommand(code) }}</code>
                  <button class="link-btn" @click="copyText(approvalCommand(code))">复制命令</button>
                </div>
              </div>

              <div class="findings-list">
                <div v-if="!selectedReport.findings?.length" class="muted-copy">本次巡检没有结构化发现。</div>
                <article v-for="finding in selectedReport.findings" :key="`${finding.level}-${finding.title}-${finding.detail}`" class="finding-item" :class="findingClass(finding.level)">
                  <span>{{ finding.level }}</span>
                  <strong>{{ finding.title }}</strong>
                  <p>{{ finding.detail }}</p>
                </article>
              </div>

              <div class="full-report">
                <div class="full-report-head">
                  <h3>完整报告</h3>
                  <button class="mini-btn" :disabled="!selectedReport.fullReport" @click="copyText(selectedReport.fullReport)">复制</button>
                </div>
                <pre>{{ selectedReport.fullReport || '暂无完整报告文本。' }}</pre>
              </div>
            </div>
          </section>
        </div>

        <aside class="report-side">
          <section class="panel-card">
            <div class="panel-head compact-head">
              <div>
                <h2>历史报告</h2>
                <p>{{ reportTotal }} 条记录</p>
              </div>
            </div>

            <div v-if="!reports.length" class="empty-panel inner">暂无历史报告。</div>
            <div v-else class="report-list">
              <button
                v-for="report in reports"
                :key="report.id"
                class="report-item"
                :class="{ active: selectedReport?.id === report.id }"
                @click="openReport(report)"
              >
                <span class="state-badge" :class="report.status">{{ statusLabel(report.status) }}</span>
                <strong>{{ report.summary || report.errorMessage || '无摘要' }}</strong>
                <small>{{ formatDate(report.createdAt) }} · {{ formatDuration(report.durationMs) }}</small>
              </button>
            </div>

            <div class="pager">
              <button class="mini-btn" :disabled="reportPage <= 1 || inspectionRefreshing" @click="loadReportsPage(reportPage - 1)">上一页</button>
              <span>{{ reportPage }} / {{ reportTotalPages }}</span>
              <button class="mini-btn" :disabled="reportPage >= reportTotalPages || inspectionRefreshing" @click="loadReportsPage(reportPage + 1)">下一页</button>
            </div>
          </section>
        </aside>
      </section>
    </template>

    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="taskForm.visible" class="dialog-overlay" @click.self="closeTaskForm">
          <div class="dialog-card wide">
            <div class="dialog-head">
              <h3>{{ taskForm.mode === 'create' ? '新建定时任务' : '编辑定时任务' }}</h3>
              <p>cron 使用 5 段表达式，时区固定为 Asia/Shanghai。</p>
            </div>
            <div class="dialog-body">
              <label class="field">
                <span>任务名称</span>
                <input v-model="taskForm.name" maxlength="100" type="text" placeholder="每日备份检查" />
              </label>
              <label class="field">
                <span>Cron 表达式</span>
                <input v-model="taskForm.cronExpression" type="text" placeholder="0 8 * * *" />
              </label>
              <label class="field">
                <span>任务描述</span>
                <textarea v-model="taskForm.taskDescription" rows="7" placeholder="描述到点后交给后台 Agent 执行的任务。"></textarea>
              </label>
              <label class="approval-enable">
                <input v-model="taskForm.approvalEnabled" type="checkbox" />
                <span class="toggle-control"></span>
                <span class="toggle-copy">
                  <strong>启用定时任务预授权审批</strong>
                  <small>创建后进入待审批状态，需要在 SSH 执行 sudo nereus approve CODE 后才会启用</small>
                </span>
              </label>
              <div v-if="taskForm.approvalEnabled" class="policy-grid">
                <label class="field">
                  <span>允许工具</span>
                  <textarea v-model="taskForm.allowedTools" rows="4" placeholder="deletePath&#10;searchFiles&#10;runPrivileged"></textarea>
                </label>
                <div class="field">
                  <span>命令前缀白名单</span>
                  <label class="inline-toggle">
                    <input v-model="taskForm.commandsEnabled" type="checkbox" />
                    <span class="toggle-control"></span>
                    <span class="toggle-copy">
                      <strong>启用命令白名单</strong>
                      <small>对 runCommand / runShellCommand 生效，实际命令以条目为前缀即放行</small>
                    </span>
                  </label>
                  <textarea v-model="taskForm.allowedCommands" rows="4" placeholder="df -h&#10;free -h&#10;systemctl status" :disabled="!taskForm.commandsEnabled"></textarea>
                  <small class="field-hint">空列表 = 拒绝一切命令；关闭开关 = 仅工具名 + 路径匹配（旧行为）</small>
                </div>
                <label class="field">
                  <span>允许路径</span>
                  <textarea v-model="taskForm.allowedPaths" rows="4" placeholder="/tmp/report&#10;/var/log/nginx"></textarea>
                </label>
                <label class="field">
                  <span>禁止路径</span>
                  <textarea v-model="taskForm.deniedPaths" rows="4" placeholder="/tmp/report/secret"></textarea>
                </label>
                <label class="field">
                  <span>允许特权命令</span>
                  <textarea v-model="taskForm.allowedPrivilegedCommands" rows="4" placeholder="mkdir&#10;systemctl"></textarea>
                </label>
                <label class="field">
                  <span>审批码有效期秒</span>
                  <input v-model.number="taskForm.ttlSeconds" min="1" type="number" />
                </label>
                <label class="field">
                  <span>最大授权次数</span>
                  <input v-model.number="taskForm.maxRuns" min="1" type="number" />
                </label>
              </div>
            </div>
            <div class="dialog-actions">
              <button class="secondary-btn" :disabled="taskForm.saving" @click="closeTaskForm">取消</button>
              <button class="primary-btn" :disabled="taskForm.saving" @click="saveTaskForm">
                {{ taskForm.saving ? '保存中...' : '保存' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="deleteDialog.visible" class="dialog-overlay" @click.self="closeDeleteTask">
          <div class="dialog-card">
            <div class="dialog-head">
              <h3>删除定时任务</h3>
              <p>确认删除“{{ deleteDialog.taskName }}”？后端会软删除并移除调度器中的 job。</p>
            </div>
            <div class="dialog-actions">
              <button class="secondary-btn" :disabled="deleteDialog.deleting" @click="closeDeleteTask">取消</button>
              <button class="danger-btn" :disabled="deleteDialog.deleting" @click="confirmDeleteTask">
                {{ deleteDialog.deleting ? '删除中...' : '删除' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="runsDialog.visible" class="dialog-overlay" @click.self="closeTaskRuns">
          <div class="dialog-card history-card">
            <div class="dialog-head">
              <h3>执行历史</h3>
              <p>{{ runsDialog.task?.name }}</p>
            </div>
            <div class="dialog-body">
              <div v-if="runsDialog.loading" class="loading-panel inner">正在加载执行历史...</div>
              <div v-else-if="!runsDialog.runs.length" class="empty-panel inner">暂无执行记录。</div>
              <div v-else class="run-list">
                <article v-for="run in runsDialog.runs" :key="run.id" class="run-item">
                  <div class="run-head">
                    <span class="state-badge" :class="run.status">{{ statusLabel(run.status) }}</span>
                    <span>{{ formatDate(run.startedAt) }} - {{ formatDate(run.finishedAt) }}</span>
                  </div>
                  <p>{{ run.resultSummary || run.errorMessage || '无执行摘要' }}</p>
                  <div v-if="runApprovalCodes(run).length" class="run-approval-row">
                    <span class="approval-badge">待审批授权</span>
                    <template v-for="code in runApprovalCodes(run)" :key="code">
                      <code>{{ approvalCommand(code) }}</code>
                      <button class="link-btn" @click="copyText(approvalCommand(code))">复制</button>
                    </template>
                  </div>
                  <div class="run-foot">
                    <span>{{ formatTokens(run) }}</span>
                    <button class="link-btn" :disabled="!run.sessionId" @click="openAgentSession(run.sessionId)">打开 Agent 会话</button>
                  </div>
                </article>
              </div>
            </div>
            <div class="dialog-actions">
              <button class="secondary-btn" @click="closeTaskRuns">关闭</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="approvalDialog.visible" class="dialog-overlay" @click.self="closeApprovalDialog">
          <div class="dialog-card approval-card">
            <div class="dialog-head">
              <h3>定时任务审批</h3>
              <p>{{ approvalDialog.task?.name }}</p>
            </div>
            <div class="dialog-body">
              <div v-if="approvalDialog.loading" class="loading-panel inner">正在加载审批详情...</div>
              <template v-else>
                <div class="approval-command-box">
                  <span>SSH 审批命令</span>
                  <code>{{ approvalCommand(approvalDialog.detail?.approvalCode) || '暂无可用审批码' }}</code>
                  <button class="mini-btn" :disabled="!approvalDialog.detail?.approvalCode" @click="copyText(approvalCommand(approvalDialog.detail?.approvalCode))">复制命令</button>
                </div>

                <div class="approval-meta-grid">
                  <div>
                    <span>审批状态</span>
                    <strong>{{ approvalDialog.detail?.approvalStatus || '--' }}</strong>
                  </div>
                  <div>
                    <span>批准时间</span>
                    <strong>{{ formatDate(approvalDialog.detail?.approvalApprovedAt) }}</strong>
                  </div>
                  <div>
                    <span>批准人</span>
                    <strong>{{ approvalDialog.detail?.approvalApprovedBy || '--' }}</strong>
                  </div>
                  <div>
                    <span>拒绝原因</span>
                    <strong>{{ approvalDialog.detail?.approvalRejectedReason || '--' }}</strong>
                  </div>
                </div>

                <div class="policy-detail">
                  <h4>预授权策略</h4>
                  <div class="policy-detail-grid">
                    <div>
                      <span>允许工具</span>
                      <strong>{{ formatPolicyList(approvalDialog.detail?.approvalPolicy?.allowedTools) }}</strong>
                    </div>
                    <div>
                      <span>允许路径</span>
                      <strong>{{ formatPolicyList(approvalDialog.detail?.approvalPolicy?.allowedPaths) }}</strong>
                    </div>
                    <div>
                      <span>禁止路径</span>
                      <strong>{{ formatPolicyList(approvalDialog.detail?.approvalPolicy?.deniedPaths) }}</strong>
                    </div>
                    <div>
                      <span>允许特权命令</span>
                      <strong>{{ formatPolicyList(approvalDialog.detail?.approvalPolicy?.allowedPrivilegedCommands) }}</strong>
                    </div>
                    <div>
                      <span>有效期</span>
                      <strong>{{ approvalDialog.detail?.approvalPolicy?.ttlSeconds || '--' }} 秒</strong>
                    </div>
                    <div>
                      <span>最大授权次数</span>
                      <strong>{{ approvalDialog.detail?.approvalPolicy?.maxRuns || '--' }}</strong>
                    </div>
                  </div>
                </div>
              </template>
            </div>
            <div class="dialog-actions">
              <button class="secondary-btn" :disabled="approvalDialog.reissuing" @click="closeApprovalDialog">关闭</button>
              <button
                class="primary-btn"
                :disabled="approvalDialog.task?.status !== 'pending_approval' || approvalDialog.reissuing"
                @click="reissueApprovalCode"
              >
                {{ approvalDialog.reissuing ? '生成中...' : '重新生成审批码' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="configDialog.visible" class="dialog-overlay" @click.self="closeConfigDialog">
          <div class="dialog-card wide">
            <div class="dialog-head">
              <h3>巡检配置</h3>
              <p>自动巡检间隔范围为 1 到 1440 分钟；预授权策略决定无人值守巡检可自动执行的工具与命令。</p>
            </div>
            <div class="dialog-body">
              <label class="field">
                <span>间隔分钟</span>
                <input v-model.number="configDialog.intervalMinutes" min="1" max="1440" type="number" />
              </label>
              <div class="config-readonly">
                <span>巡检文档</span>
                <strong>{{ inspectionConfig?.inspectionDocPath || '--' }}</strong>
              </div>

              <label class="approval-enable">
                <input v-model="configDialog.approvalEnabled" type="checkbox" />
                <span class="toggle-control"></span>
                <span class="toggle-copy">
                  <strong>自定义预授权策略</strong>
                  <small>关闭时保持后端当前策略不变；默认基线为只读诊断命令（df / free / systemctl status 等）</small>
                </span>
              </label>

              <div v-if="configDialog.approvalEnabled" class="policy-grid">
                <label class="field">
                  <span>允许工具</span>
                  <textarea v-model="configDialog.allowedTools" rows="4" placeholder="runCommand&#10;runShellCommand"></textarea>
                </label>
                <div class="field">
                  <span>命令前缀白名单</span>
                  <label class="inline-toggle">
                    <input v-model="configDialog.commandsEnabled" type="checkbox" />
                    <span class="toggle-control"></span>
                    <span class="toggle-copy">
                      <strong>启用命令白名单</strong>
                      <small>对 runCommand / runShellCommand 生效，实际命令以条目为前缀即放行（如 df -h 可放行 df -h /）</small>
                    </span>
                  </label>
                  <textarea v-model="configDialog.allowedCommands" rows="5" placeholder="uname -a&#10;df -h&#10;free -h&#10;systemctl status&#10;docker ps" :disabled="!configDialog.commandsEnabled"></textarea>
                  <small class="field-hint">空列表 = 拒绝一切命令；关闭开关 = 仅工具名 + 路径匹配（旧行为）。runShellCommand 预授权放行时拒绝 ; & | 反引号 $ () 换行等控制字符。</small>
                </div>
                <label class="field">
                  <span>允许路径</span>
                  <textarea v-model="configDialog.allowedPaths" rows="4" placeholder="/tmp/report&#10;/var/log/nginx"></textarea>
                </label>
                <label class="field">
                  <span>禁止路径</span>
                  <textarea v-model="configDialog.deniedPaths" rows="4" placeholder="/tmp/report/secret"></textarea>
                </label>
                <label class="field">
                  <span>允许特权命令</span>
                  <textarea v-model="configDialog.allowedPrivilegedCommands" rows="4" placeholder="mkdir&#10;systemctl"></textarea>
                </label>
                <label class="field">
                  <span>审批码有效期秒</span>
                  <input v-model.number="configDialog.ttlSeconds" min="60" max="2592000" type="number" />
                  <small class="field-hint">默认 25200 秒（7 小时），范围 60 ~ 2592000（30 天）</small>
                </label>
                <label class="field">
                  <span>最大授权次数</span>
                  <input v-model.number="configDialog.maxRuns" min="1" max="100000" type="number" />
                </label>
              </div>
            </div>
            <div class="dialog-actions">
              <button class="secondary-btn" :disabled="configDialog.saving" @click="closeConfigDialog">取消</button>
              <button class="primary-btn" :disabled="configDialog.saving" @click="saveInspectionConfig">
                {{ configDialog.saving ? '保存中...' : '保存' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.scheduled-page {
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
  color: var(--color-text);
}

.page-subtitle {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  max-width: 680px;
}

.header-actions,
.panel-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
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
  color: var(--color-warning);
  background: var(--color-warning-bg);
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

.status-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
}

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

.status-card.success .status-value,
.status-card.success .status-label {
  color: var(--color-success);
}

.status-card.warning .status-value,
.status-card.warning .status-label {
  color: var(--color-warning);
}

.status-card.pending .status-value,
.status-card.pending .status-label {
  color: var(--color-info);
}

.status-card.error .status-value,
.status-card.error .status-label {
  color: var(--color-danger);
}

.status-card.info .status-value,
.status-card.info .status-label {
  color: var(--color-info);
}

.status-card.deleted .status-value,
.status-card.deleted .status-label {
  color: var(--color-text-muted);
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
  line-height: 1.1;
  font-weight: 800;
  color: var(--color-text);
}

.status-value.compact {
  font-size: 20px;
}

.status-helper {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.content-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar-card,
.panel-card,
.table-card {
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
  grid-template-columns: minmax(180px, 240px) minmax(280px, 1fr) auto;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}

.history-toggle {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--color-border-solid);
  border-radius: 14px;
  background: var(--color-bg);
  cursor: pointer;
}

.approval-enable {
  min-height: 54px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-solid);
  border-radius: 14px;
  background: var(--color-bg);
  cursor: pointer;
}

.approval-enable input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.history-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.toggle-control {
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border-solid);
  position: relative;
  flex-shrink: 0;
  transition: background 0.18s ease, border-color 0.18s ease;
}

.toggle-control::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--color-text-muted);
  transition: transform 0.18s ease, background 0.18s ease;
}

.history-toggle input:checked + .toggle-control {
  background: var(--color-primary-ghost);
  border-color: var(--color-primary);
}

.history-toggle input:checked + .toggle-control::after,
.approval-enable input:checked + .toggle-control::after {
  transform: translateX(16px);
  background: var(--color-primary);
}

.approval-enable input:checked + .toggle-control {
  background: var(--color-primary-ghost);
  border-color: var(--color-primary);
}

.toggle-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toggle-copy strong {
  color: var(--color-text);
  font-size: 13px;
  line-height: 1.2;
}

.toggle-copy small {
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.3;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field span {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  border-radius: 14px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0 14px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.field input,
.field select {
  min-height: 44px;
}

.field textarea {
  min-height: 150px;
  padding: 12px 14px;
  resize: vertical;
  line-height: 1.7;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.field textarea:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.field-hint {
  font-size: 12px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.inline-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 8px 10px;
  border: 1px solid var(--color-border-solid);
  border-radius: 12px;
  background: var(--color-bg);
}

.inline-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.inline-toggle input:checked + .toggle-control {
  background: var(--color-primary-ghost);
  border-color: var(--color-primary);
}

.inline-toggle input:checked + .toggle-control::after {
  transform: translateX(16px);
  background: var(--color-primary);
}

.policy-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-inset);
}

.policy-grid .field textarea {
  min-height: 100px;
}

.table-card {
  overflow: auto;
}

.task-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 980px;
}

.task-table th,
.task-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-divider);
  text-align: left;
  vertical-align: top;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.task-table th {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: var(--color-bg-inset);
}

.task-table tr:last-child td {
  border-bottom: none;
}

.task-table tr.deleted-row td {
  background: var(--color-bg-inset);
}

.task-cell {
  max-width: 420px;
}

.task-cell strong {
  display: block;
  color: var(--color-text);
  font-size: 14px;
}

.task-cell span {
  display: -webkit-box;
  margin-top: 6px;
  overflow: hidden;
  line-height: 1.6;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.approval-command-inline {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.approval-command-inline code {
  padding: 5px 8px;
  border-radius: 8px;
  background: var(--color-info-bg);
  color: var(--color-info);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  word-break: break-all;
}

.approval-hint-card {
  margin-top: 14px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid var(--color-warning-border, var(--color-border));
  background: var(--color-warning-bg);
}

.approval-hint-head {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.approval-hint-head strong {
  color: var(--color-warning);
  font-size: 14px;
}

.approval-hint-head span {
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.run-approval-row {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.run-approval-row code {
  padding: 5px 8px;
  border-radius: 8px;
  background: var(--color-info-bg);
  color: var(--color-info);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  word-break: break-all;
}

.approval-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  color: var(--color-warning);
  background: var(--color-warning-bg);
  white-space: nowrap;
}

.mono {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  color: var(--color-text);
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.state-badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.state-badge.active,
.state-badge.success {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.state-badge.paused,
.state-badge.running,
.state-badge.warning {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.state-badge.pending_approval {
  color: var(--color-info);
  background: var(--color-info-bg);
}

.state-badge.error,
.state-badge.danger {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.state-badge.deleted {
  color: var(--color-text-muted);
  background: var(--color-bg-inset);
}

.inspection-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 16px;
  align-items: start;
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

.compact-head {
  margin-bottom: 14px;
}

.report-detail {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.report-summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-inset);
}

.report-summary strong {
  color: var(--color-text);
  font-size: 16px;
  line-height: 1.7;
}

.report-meta,
.run-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  color: var(--color-text-muted);
  font-size: 12px;
}

.findings-list,
.report-list,
.run-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.finding-item {
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}

.finding-item span {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
}

.finding-item strong {
  display: block;
  margin-top: 4px;
  color: var(--color-text);
}

.finding-item p {
  margin-top: 6px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.finding-item.info span {
  color: var(--color-info);
}

.finding-item.warning span {
  color: var(--color-warning);
}

.finding-item.danger span {
  color: var(--color-danger);
}

.full-report {
  border: 1px solid var(--color-border);
  border-radius: 16px;
  overflow: hidden;
  background: var(--color-bg-surface);
}

.full-report-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-divider);
}

.full-report-head h3 {
  font-size: 15px;
  color: var(--color-text);
}

.full-report pre {
  margin: 0;
  padding: 14px;
  max-height: 420px;
  overflow: auto;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 13px;
}

.report-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-bg-surface);
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.report-item:hover,
.report-item.active {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.report-item strong {
  color: var(--color-text);
  line-height: 1.5;
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.report-item small {
  color: var(--color-text-muted);
}

.pager {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
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

.mini-btn.warning {
  color: var(--color-warning);
  background: var(--color-warning-bg);
  border-color: rgba(245, 158, 11, 0.18);
}

.mini-btn.danger {
  color: var(--color-danger);
  background: var(--color-danger-bg);
  border-color: rgba(239, 68, 68, 0.18);
}

.mini-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.primary-btn:disabled,
.secondary-btn:disabled,
.danger-btn:disabled,
.mini-btn:disabled,
.link-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.link-btn {
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-weight: 800;
  cursor: pointer;
  padding: 0;
}

.loading-panel,
.empty-panel {
  padding: 28px;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  text-align: center;
}

.loading-panel.inner,
.empty-panel.inner {
  padding: 18px;
  border-radius: 14px;
}

.muted-copy {
  font-size: 13px;
  color: var(--color-text-muted);
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
  max-height: min(860px, calc(100vh - 48px));
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.dialog-card.wide {
  width: min(680px, 100%);
}

.dialog-card.history-card {
  width: min(860px, 100%);
}

.dialog-card.approval-card {
  width: min(820px, 100%);
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

.dialog-body {
  padding: 0 22px 18px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dialog-actions {
  padding: 18px 22px 22px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid var(--color-divider);
}

.run-item {
  padding: 14px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}

.run-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.run-item p {
  margin: 10px 0;
  color: var(--color-text-secondary);
  line-height: 1.7;
}

.approval-command-box {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-inset);
}

.approval-command-box span {
  grid-column: 1 / -1;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.approval-command-box code {
  min-width: 0;
  padding: 11px 12px;
  border-radius: 12px;
  background: var(--color-bg-surface);
  color: var(--color-text);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  word-break: break-all;
}

.approval-meta-grid,
.policy-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.approval-meta-grid > div,
.policy-detail-grid > div {
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}

.approval-meta-grid span,
.policy-detail-grid span {
  display: block;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.approval-meta-grid strong,
.policy-detail-grid strong {
  display: block;
  margin-top: 6px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.policy-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.policy-detail h4 {
  color: var(--color-text);
  font-size: 15px;
}

.config-readonly {
  padding: 12px;
  border-radius: 14px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
}

.config-readonly span {
  display: block;
  font-size: 12px;
  font-weight: 800;
  color: var(--color-text-muted);
}

.config-readonly strong {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
  word-break: break-all;
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

@media (max-width: 1280px) {
  .status-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .inspection-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .scheduled-page {
    padding: 16px;
  }

  .page-header,
  .panel-head {
    flex-direction: column;
  }

  .header-actions,
  .panel-actions {
    width: 100%;
    align-items: stretch;
    justify-content: stretch;
  }

  .tabs-wrap {
    width: 100%;
  }

  .tab-btn {
    flex: 1;
  }

  .status-grid,
  .toolbar-controls {
    grid-template-columns: 1fr;
  }

  .policy-grid,
  .approval-meta-grid,
  .policy-detail-grid,
  .approval-command-box {
    grid-template-columns: 1fr;
  }
}
</style>
