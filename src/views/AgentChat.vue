<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNotification } from '../composables/useNotification'
import {
  getAgentSessions,
  createAgentSession,
  deleteAgentSession,
  getAgentMessages,
  getAgentSession,
  buildWsUrl,
  getAgentUsage,
  getAgentBilling,
  getSessionTimeline,
  getSessionTraceSummary,
  switchToolSource as apiSwitchToolSource,
  switchModel as apiSwitchModel,
  markSessionRead,
} from '../api/agent'
import { getLlmProfiles } from '../api/config'
import type { AgentSession, AgentMessage, AgentSessionStatus, ToolSource } from '../types/agent'
import type { McpServerSpec, TokenUsageItem, BillingSummary } from '../types/agent'
import type { LlmProfileItem } from '../types/config'
import type {
  ChatMessage,
  ToolCallDisplay,
  WsServerEvent,
  TimelineEvent,
  SessionTraceSummary,
} from '../types/agent'
import { renderMarkdown } from '../utils/markdown'

const router = useRouter()
const route = useRoute()
const notify = useNotification()

/* ========== 状态 ========== */

// 会话列表
const sessions = ref<AgentSession[]>([])
const activeSessionId = ref<string | null>(null)
const sessionsLoading = ref(false)

// LLM Profile 列表
const profiles = ref<LlmProfileItem[]>([])
const activeProfileId = ref<number | null>(null)
const profilesLoading = ref(false)

// 工具来源
const toolSource = ref<ToolSource>('current_mcp')
const mcpServers = ref<McpServerSpec[]>([])
const showMcpConfig = ref(false)

// 聊天消息
const messages = ref<ChatMessage[]>([])
const messagesLoading = ref(false)

// 输入
const inputText = ref('')
const sending = ref(false)
const queued = ref(false)
const regenerating = ref(false)
const deleteTargetMsgId = ref<number | null>(null)

// Agent 后台运行状态（从 agent.ready / pong 更新）
const agentRunning = ref(false)
const sessionStatus = ref<string>('idle')

// WebSocket
const ws = ref<WebSocket | null>(null)
const wsConnected = ref(false)
const wsReconnectTimer = ref<ReturnType<typeof setTimeout> | null>(null)

// 当前流式累积
const streamingMessageId = ref<string | null>(null)
const currentToolCalls = ref<ToolCallDisplay[]>([])

// 工具调用提示
const callingToolName = ref<string | null>(null)

// 计费面板
const showBillingDialog = ref(false)
const billingLoading = ref(false)
const tokenUsage = ref<TokenUsageItem[]>([])
const billingSummary = ref<BillingSummary | null>(null)

// 审计时间线
const traceDialogVisible = ref(false)
const traceDialogLoading = ref(false)
const traceSessionId = ref('')
const timelineItems = ref<TimelineEvent[]>([])
const traceSummary = ref<SessionTraceSummary | null>(null)
const expandedTraceEventId = ref<number | null>(null)

// 切换状态
const switchingToolSource = ref(false)
const switchingModel = ref(false)

// 创建会话弹窗
const showCreateDialog = ref(false)
const createForm = reactive({
  title: '',
  toolSource: 'stdio' as ToolSource,
  profileId: null as number | null,
  mode: 'agent' as string,
  safetyPolicy: 'default' as string,
})
const createDialogLoading = ref(false)

// 审批弹窗
const approvalDialog = ref<{
  visible: boolean
  toolName: string
  args: Record<string, unknown>
  actionId: string
  reason: string
  aiReason: string
  rejectReason: string
}>({
  visible: false,
  toolName: '',
  args: {},
  actionId: '',
  reason: '',
  aiReason: '',
  rejectReason: '',
})

// WS 重连恢复弹窗（approval.resume）
const resumeDialog = ref<{
  visible: boolean
  message: string
  actionId: string
  toolName: string
  arguments: Record<string, unknown>
  reason: string
  aiReason: string
}>({
  visible: false,
  message: '',
  actionId: '',
  toolName: '',
  arguments: {},
  reason: '',
  aiReason: '',
})

// 计划审批弹窗
const planDialog = ref<{
  visible: boolean
  plan: import('../types/agent').WsAgentPlan | null
  rejectedReason: string
  timerSeconds: number
}>({
  visible: false,
  plan: null,
  rejectedReason: '',
  timerSeconds: 300,
})
let planTimerInterval: ReturnType<typeof setInterval> | null = null

// Choice 选择题弹窗（新增）
const choiceDialog = ref<{
  visible: boolean
  question: string
  options: import('../types/agent').ChoiceOption[]
  allowCustom: boolean
  actionId: string
  customInput: string
  selectedId: string | null
}>({
  visible: false,
  question: '',
  options: [],
  allowCustom: false,
  actionId: '',
  customInput: '',
  selectedId: null,
})

// 特权提权弹窗
type ElevationStatus = 'idle' | 'pending_approval' | 'approved' | 'rejected' | 'expired'

const elevationDialog = ref<{
  visible: boolean
  status: ElevationStatus
  code: string
  commands: import('../types/agent').ElevationCommand[]
  reason: string
  message: string
  codeCopied: boolean
}>({
  visible: false,
  status: 'idle',
  code: '',
  commands: [],
  reason: '',
  message: '',
  codeCopied: false,
})

// 当前会话模式显示
const sessionMode = ref<string>('agent')

// 删除确认
const deleteConfirmId = ref<string | null>(null)

// 侧栏折叠
const sidebarCollapsed = ref(false)

// 会话滚动容器
const messageListRef = ref<HTMLElement | null>(null)

// 审批弹窗 DOM 引用（用于键盘焦点）
const approvalOverlayRef = ref<HTMLElement | null>(null)

// 重连标记
let reconnectAttempts = 0
const MAX_RECONNECT = 5

/* ========== 计算属性 ========== */

const activeSession = computed(() => sessions.value.find(s => s.sessionId === activeSessionId.value) || null)

const activeProfile = computed(() => profiles.value.find(p => p.profileId === activeProfileId.value) || null)

const defaultProfile = computed(() => profiles.value.find(p => p.isDefault) || profiles.value[0] || null)

const sessionListSorted = computed(() =>
  [...sessions.value]
    .filter((s) => sourceFilter.value === 'all' || (s.source || 'manual') === sourceFilter.value)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
)

/** 会话来源筛选：all / manual / scheduled / inspection */
const sourceFilter = ref<'all' | 'manual' | 'scheduled' | 'inspection'>('all')

function formatSessionSource(source: string | undefined): { label: string; cls: string } {
  // 仅 scheduled / inspection 显示来源标签；manual 与未知来源返回空 label（不显示标签）
  const map: Record<string, { label: string; cls: string }> = {
    scheduled: { label: '定时任务', cls: 'source-scheduled' },
    inspection: { label: '巡检', cls: 'source-inspection' },
  }
  return map[source || 'manual'] || { label: '', cls: '' }
}

const wsStatusText = computed(() => {
  if (wsConnected.value) return '已连接'
  if (ws.value) return '连接中…'
  return '未连接'
})

const wsStatusClass = computed(() => {
  if (wsConnected.value) return 'connected'
  if (ws.value) return 'connecting'
  return 'disconnected'
})

const canSend = computed(() => {
  // queued 时不再重复发送（消息已在排队队列中）
  return wsConnected.value && activeSessionId.value && inputText.value.trim() && !sending.value && !queued.value && !choiceDialog.value.visible
})

/* ========== 会话管理 ========== */

async function loadSessions() {
  sessionsLoading.value = true
  try {
    const res = await getAgentSessions({ pageSize: 50 })
    if (res.data.code === 1) {
      sessions.value = res.data.data.items
    }
  } catch (e: any) {
    // 静默处理
  } finally {
    sessionsLoading.value = false
  }
}

async function loadProfiles() {
  profilesLoading.value = true
  try {
    const res = await getLlmProfiles()
    if (res.data.code === 1) {
      profiles.value = res.data.data.items
      if (!activeProfileId.value && defaultProfile.value) {
        activeProfileId.value = defaultProfile.value.profileId
      }
    }
  } catch (e: any) {
    // 静默
  } finally {
    profilesLoading.value = false
  }
}

/* ========== 快速创建（默认 stdio + 推荐模式） ========== */

async function quickCreateSession() {
  try {
    const payload: any = {
      title: `新 Agent 会话`,
      mode: 'agent',
      profileId: activeProfileId.value || undefined,
      toolSource: 'stdio',
    }
    const res = await createAgentSession(payload)
    if (res.data.code === 1) {
      sessions.value.unshift(res.data.data)
      await switchSession(res.data.data.sessionId)
      notify.info('新会话已创建（运维 + agent 核心）')
    } else {
      notify.warning('创建失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('创建会话失败', e?.message || '请稍后重试')
  }
}

/* ========== 详细创建弹窗 ========== */

function openCreateDialog() {
  createForm.title = ''
  createForm.toolSource = 'stdio'
  createForm.profileId = activeProfileId.value || defaultProfile.value?.profileId || null
  createForm.mode = 'agent'
  createForm.safetyPolicy = 'default'
  showCreateDialog.value = true
}

async function submitCreateDialog() {
  if (createDialogLoading.value) return
  createDialogLoading.value = true
  try {
    const payload: any = {
      title: createForm.title.trim() || '新 Agent 会话',
      mode: createForm.mode,
      profileId: createForm.profileId || undefined,
      toolSource: createForm.toolSource,
      safetyPolicy: createForm.safetyPolicy,
    }
    const res = await createAgentSession(payload)
    if (res.data.code === 1) {
      sessions.value.unshift(res.data.data)
      await switchSession(res.data.data.sessionId)
      notify.info('会话已创建')
      showCreateDialog.value = false
    } else {
      notify.warning('创建失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('创建会话失败', e?.message || '请稍后重试')
  } finally {
    createDialogLoading.value = false
  }
}

async function switchSession(sessionId: string) {
  if (ws.value) {
    closeWs()
  }
  activeSessionId.value = sessionId
  messages.value = []
  currentToolCalls.value = []
  streamingMessageId.value = null
  callingToolName.value = null
  // 加载会话详情（含 toolSource、mcpServers、profileId）
  const [session] = await Promise.all([
    loadSessionDetail(sessionId),
    loadMessages(sessionId),
  ])
  // v2.2: 如果会话是 completed_unread，标记为已读（恢复 idle）
  if (session && session.status === 'completed_unread') {
    try {
      const res = await markSessionRead(sessionId)
      if (res.data.code === 1) {
        // 更新本地 sessions 列表中的状态
        const idx = sessions.value.findIndex(s => s.sessionId === sessionId)
        if (idx >= 0) {
          sessions.value[idx] = { ...sessions.value[idx], ...res.data.data }
        }
      }
    } catch (e: any) {
      // 静默失败（不影响使用）
    }
  }
  connectWs(sessionId)
}

function confirmDeleteSession(sessionId: string) {
  deleteConfirmId.value = sessionId
}

async function doDeleteSession() {
  if (!deleteConfirmId.value) return
  const sid = deleteConfirmId.value
  try {
    const res = await deleteAgentSession(sid)
    if (res.data.code === 1) {
      sessions.value = sessions.value.filter(s => s.sessionId !== sid)
      if (activeSessionId.value === sid) {
        if (ws.value) closeWs()
        activeSessionId.value = null
        messages.value = []
        if (sessions.value.length > 0) {
          await switchSession(sessions.value[0].sessionId)
        }
      }
      notify.info('会话已删除')
    } else {
      notify.warning('删除失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('删除失败', e?.message || '请稍后重试')
  } finally {
    deleteConfirmId.value = null
  }
}

/* ========== 消息历史 ========== */

async function loadMessages(sessionId: string) {
  messagesLoading.value = true
  try {
    const res = await getAgentMessages(sessionId)
    if (res.data.code === 1) {
      messages.value = res.data.data.items.map((msg: AgentMessage) => {
        // 解析 tool_calls 元数据（历史消息中 assistant 的 tool_calls）
        let toolCalls: ToolCallDisplay[] = []
        if (msg.role === 'assistant' && msg.metadata?.tool_calls) {
          const rawCalls = msg.metadata.tool_calls as Array<{
            id: string
            function: { name: string; arguments: string }
          }>
          toolCalls = rawCalls.map((tc) => ({
            callId: tc.id,
            toolName: tc.function?.name || 'unknown',
            success: true,
            output: tc.function?.arguments || '',
            expanded: false,
            timestamp: new Date(msg.createdAt).getTime(),
          }))
        }

        const base = {
          messageId: msg.messageId,
          roundIndex: msg.roundIndex,
          timestamp: new Date(msg.createdAt).getTime(),
        }

        // tool 角色的消息：通过 toolCallId 关联到之前的 assistant 消息
        if (msg.role === 'tool') {
          const toolName = (msg.metadata?.tool_name as string) || 'unknown'
          return {
            ...base,
            id: `msg-${msg.messageId}`,
            role: 'tool' as const,
            content: msg.content || '(空)',
            toolCallId: msg.toolCallId || undefined,
            toolName,
            toolCalls: [],
          }
        }

        // assistant 角色：content 可能为 null（纯工具调用消息）
        if (msg.role === 'assistant') {
          return {
            ...base,
            id: `msg-${msg.messageId}`,
            role: 'assistant',
            content: msg.content || (toolCalls.length > 0 ? '' : '(无文本回复)'),
            toolCalls,
          }
        }

        // user 角色
        return {
          ...base,
          id: `msg-${msg.messageId}`,
          role: msg.role,
          content: msg.content || '',
          toolCalls: [],
        }
      })
    }
  } catch (e: any) {
    // 静默
  } finally {
    messagesLoading.value = false
    scrollToBottom()
  }
}

async function loadSessionDetail(sessionId: string): Promise<AgentSession | null> {
  try {
    const res = await getAgentSession(sessionId)
    if (res.data.code === 1) {
      const session = res.data.data
      const idx = sessions.value.findIndex(s => s.sessionId === session.sessionId)
      if (idx >= 0) {
        sessions.value[idx] = { ...sessions.value[idx], ...session }
      } else {
        sessions.value.unshift(session)
      }
      toolSource.value = session.toolSource || 'current_mcp'
      if (session.profileId) {
        activeProfileId.value = session.profileId
      }
      if (session.mcpServers) {
        mcpServers.value = session.mcpServers
      }
      // 更新会话模式
      if (session.mode) {
        sessionMode.value = session.mode
      }
      return session
    }
  } catch (e: any) {
    // 静默
  }
  return null
}

/* ========== WebSocket ========== */

function connectWs(sessionId: string) {
  if (ws.value) closeWs()
  reconnectAttempts = 0

  const url = buildWsUrl(sessionId)
  const socket = new WebSocket(url)
  ws.value = socket

  socket.onopen = () => {
    wsConnected.value = true
    reconnectAttempts = 0
  }

  socket.onmessage = (event: MessageEvent) => {
    try {
      const payload: WsServerEvent = JSON.parse(event.data)
      handleWsEvent(payload)
    } catch {
      // 忽略非 JSON 消息
    }
  }

  socket.onclose = (event: CloseEvent) => {
    wsConnected.value = false
    ws.value = null
    // 1000 = normal close, 不重连
    if (event.code !== 1000 && reconnectAttempts < MAX_RECONNECT) {
      scheduleReconnect(sessionId)
    }
  }

  socket.onerror = () => {
    // onclose 会随后触发
  }
}

function scheduleReconnect(sessionId: string) {
  if (wsReconnectTimer.value) clearTimeout(wsReconnectTimer.value)
  reconnectAttempts++
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000)
  wsReconnectTimer.value = setTimeout(() => {
    if (activeSessionId.value === sessionId) {
      connectWs(sessionId)
    }
  }, delay)
}

function closeWs() {
  if (wsReconnectTimer.value) {
    clearTimeout(wsReconnectTimer.value)
    wsReconnectTimer.value = null
  }
  if (ws.value) {
    ws.value.close(1000)
    ws.value = null
  }
  wsConnected.value = false
  sending.value = false
}

function sendPing() {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(JSON.stringify({ type: 'ping' }))
  }
}

/* ========== WebSocket 事件处理 ========== */

function handleWsEvent(event: WsServerEvent) {
  switch (event.type) {
    case 'agent.ready':
      // 连接就绪：获取 Agent 后台运行状态
      if ('agentRunning' in event.data) {
        agentRunning.value = event.data.agentRunning
        sessionStatus.value = event.data.status || 'idle'
      }
      break

    case 'pong':
      // 心跳响应：更新 Agent 运行状态指示灯
      if ('agentRunning' in event.data) {
        agentRunning.value = event.data.agentRunning
        sessionStatus.value = event.data.status || sessionStatus.value
      }
      break

    case 'session.created':
      // 自动创建了 session，更新 ID（data: {sessionId}）
      const newSessionId = (event.data as any).sessionId
      if (newSessionId) {
        activeSessionId.value = newSessionId
      }
      loadSessions()
      break

    case 'thinking.start':
      // 开始思考：创建新的 assistant 消息
      callingToolName.value = null
      const msgId = `stream-${Date.now()}`
      streamingMessageId.value = msgId
      currentToolCalls.value = []
      messages.value.push({
        id: msgId,
        messageId: 0,
        roundIndex: 0,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
        toolCalls: [],
      })
      break

    case 'thinking.delta':
      // 思考过程增量（暂不展示明细，后续可扩展为可折叠思考面板）
      break

    case 'thinking.end':
      // 思考完成：显示耗时
      if (streamingMessageId.value && event.data.duration) {
        const msg = messages.value.find(m => m.id === streamingMessageId.value)
        if (msg && !msg.content) {
          msg.content = `💭 思考了 ${event.data.duration} 秒\n\n`
        }
      }
      break

    case 'text.delta':
      // 文本增量（真流式：逐 token）
      if (streamingMessageId.value) {
        const msg = messages.value.find(m => m.id === streamingMessageId.value)
        if (msg) {
          msg.content += event.data.content
          scrollToBottom()
        }
      }
      break

    case 'text.done':
      // 文本完成
      if (streamingMessageId.value) {
        const msg = messages.value.find(m => m.id === streamingMessageId.value)
        if (msg) {
          msg.isStreaming = false
        }
      }
      break

    case 'tool.calling':
      // 新增事件：模型决定调用工具
      const toolNames = event.data.tool_calls.map((tc: any) => tc.function?.name || tc.id).join(', ')
      callingToolName.value = toolNames
      // 在流式消息上显示工具调用提示
      if (streamingMessageId.value) {
        const msg = messages.value.find(m => m.id === streamingMessageId.value)
        if (msg && !msg.content) {
          msg.content = `🔧 正在调用工具: ${toolNames}…`
        }
      }
      break

    case 'safety.checked':
      // 安全校验通过
      break

    case 'tool.result':
      // 工具结果：添加到当前 toolCalls
      callingToolName.value = null
      const tc: ToolCallDisplay = {
        callId: event.data.call_id,
        toolName: event.data.tool_name,
        success: event.data.success,
        output: event.data.output,
        expanded: false,
        timestamp: Date.now(),
      }
      currentToolCalls.value.push(tc)
      if (streamingMessageId.value) {
        // 正常流式消息：同步到当前消息
        const msg = messages.value.find(m => m.id === streamingMessageId.value)
        if (msg) {
          msg.toolCalls = [...currentToolCalls.value]
          if (msg.content.startsWith('🔧 正在调用')) {
            msg.content = ''
          }
        }
      } else {
        // 无流式消息（如 WS 重连恢复后的 tool.result）：创建专用展示消息
        const toolMsgId = `tools-${Date.now()}`
        messages.value.push({
          id: toolMsgId,
          messageId: 0,
          roundIndex: 0,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          isStreaming: false,
          toolCalls: [...currentToolCalls.value],
        })
        currentToolCalls.value = []
      }
      scrollToBottom()
      break

    case 'approval.required':
      // 需要审批
      approvalDialog.value = {
        visible: true,
        toolName: event.data.tool_name,
        args: event.data.arguments,
        actionId: event.data.action_id,
        reason: event.data.reason,
        aiReason: event.data.ai_reason || '',
        rejectReason: '',
      }
      break

    case 'approval.resolved':
      // 审批结果
      approvalDialog.value.visible = false
      break

    case 'approval.resume':
      // WS 重连恢复：检测到上次断连时有待审批操作
      resumeDialog.value = {
        visible: true,
        message: event.data.message || '检测到上次断连时有待审批操作，请确认是否继续',
        actionId: event.data.approval.action_id,
        toolName: event.data.approval.tool_name,
        arguments: event.data.approval.arguments,
        reason: event.data.approval.reason,
        aiReason: event.data.approval.ai_reason || '',
      }
      addSystemMessage('⚠️ 检测到上次断连时有待审批操作，请确认处理')
      break

    case 'plan.proposed':
      // 计划提交待审批
      planDialog.value = {
        visible: true,
        plan: (event.data as any).plan,
        rejectedReason: '',
        timerSeconds: 300,
      }
      // 追加系统消息
      addSystemMessage('📋 Agent 提交了执行计划，等待审批')
      // 倒计时
      if (planTimerInterval) clearInterval(planTimerInterval)
      planTimerInterval = setInterval(() => {
        if (planDialog.value.visible && planDialog.value.timerSeconds > 0) {
          planDialog.value.timerSeconds--
        } else if (planDialog.value.timerSeconds <= 0) {
          if (planTimerInterval) clearInterval(planTimerInterval)
        }
      }, 1000)
      break

    case 'plan.approved':
      // 计划已批准
      planDialog.value.visible = false
      if (planTimerInterval) {
        clearInterval(planTimerInterval)
        planTimerInterval = null
      }
      notify.info('计划已批准，开始执行')
      // 追加系统消息
      addSystemMessage('✅ 计划已批准，Agent 开始按步骤执行')
      break

    case 'plan.rejected':
      // 计划被拒绝
      const rejectReason = (event.data as any).reason || ''
      planDialog.value.visible = false
      if (planTimerInterval) {
        clearInterval(planTimerInterval)
        planTimerInterval = null
      }
      if (rejectReason === '审批超时') {
        notify.warning('计划审批超时', '300 秒内未操作，计划已自动拒绝')
        addSystemMessage('⏰ 计划审批超时，已自动拒绝')
      } else {
        notify.info('计划已拒绝', rejectReason || undefined)
        const reasonText = rejectReason ? `原因：${rejectReason}` : ''
        addSystemMessage(`❌ 计划已拒绝${reasonText ? ' — ' + reasonText : ''}`)
      }
      break

    case 'choice.required':
      // 选择题：LLM 需要用户做出选择
      // 兼容两种 options 格式：对象数组 [{id,title}] 或扁平字符串数组 ["Python","Go"]
      const rawOptions = event.data.options as unknown[]
      const normalizedOptions = rawOptions.map((opt: any, idx: number) => {
        if (typeof opt === 'string') {
          // 字符串数组 → 自动生成 id 标签（A, B, C…）
          const label = String.fromCharCode(65 + idx) // A, B, C...
          return { id: label, title: opt, summary: undefined }
        }
        // 已经是对象格式
        return opt
      })
      choiceDialog.value = {
        visible: true,
        question: event.data.question,
        options: normalizedOptions,
        allowCustom: event.data.allow_custom,
        actionId: event.data.action_id,
        customInput: '',
        selectedId: null,
      }
      // 追加系统消息提示用户
      addSystemMessage('📋 Agent 提出了一个问题，请选择回答')
      // 确保输入框禁用
      break

    case 'choice.resolved':
      // 选择题已处理（内部流转，可忽略）
      choiceDialog.value.visible = false
      choiceDialog.value.selectedId = null
      choiceDialog.value.customInput = ''
      break

    case 'choice.resume':
      // WS 重连恢复：检测到上次断连时有待回复选择题
      {
        const resumeChoice = event.data.choice
        // 兼容两种 options 格式：对象数组或扁平字符串数组
        const rawOpts = resumeChoice.options as unknown[]
        const normalized = rawOpts.map((opt: any, idx: number) => {
          if (typeof opt === 'string') {
            const label = String.fromCharCode(65 + idx)
            return { id: label, title: opt, summary: undefined }
          }
          return opt
        })
        choiceDialog.value = {
          visible: true,
          question: resumeChoice.question,
          options: normalized,
          allowCustom: resumeChoice.allow_custom ?? true,
          actionId: resumeChoice.action_id,
          customInput: '',
          selectedId: null,
        }
        addSystemMessage('📋 检测到上次断连时有待回复选择题，请继续回答')
      }
      break

    case 'elevation.requested':
      // 特权提权请求
      elevationDialog.value = {
        visible: true,
        status: 'pending_approval',
        code: event.data.code,
        commands: event.data.commands,
        reason: event.data.reason,
        message: event.data.message,
        codeCopied: false,
      }
      addSystemMessage(`🔐 Agent 请求特权操作 — ${event.data.reason}，请在 SSH 执行: sudo nereus approve ${event.data.code}`)
      break

    case 'elevation.resolved':
      // 特权提权结果
      elevationDialog.value.status = event.data.status as ElevationStatus
      elevationDialog.value.message = event.data.message
      // 已批准时追加系统消息
      if (event.data.status === 'approved') {
        addSystemMessage('✅ 特权请求已批准，Agent 正在继续执行…')
      } else if (event.data.status === 'rejected') {
        addSystemMessage('❌ 特权请求已被拒绝')
      } else if (event.data.status === 'expired') {
        addSystemMessage('⏰ 特权请求已过期')
      }
      break

    case 'mode_changed':
      // 模式已切换
      sessionMode.value = (event.data as any).mode || 'agent'
      const modeNames: Record<string, string> = {
        agent: '标准 Agent',
        read_only: '只读',
        plan: '计划',
        break_glass: '紧急',
        executing: '执行中',
      }
      notify.info(`模式已切换为 ${modeNames[sessionMode.value] || sessionMode.value}`)
      // 追加系统消息
      addSystemMessage(`🔄 模式已切换为 ${modeNames[sessionMode.value] || sessionMode.value}`)
      // 刷新会话列表获取最新状态
      loadSessions()
      break

    case 'title.updated':
      // 标题自动更新（LLM 总结后推送）
      if (event.data.title) {
        const idx = sessions.value.findIndex(s => s.sessionId === event.sessionId)
        if (idx >= 0) {
          sessions.value[idx] = { ...sessions.value[idx], title: event.data.title }
        }
      }
      break

    case 'session.updated':
      // 会话信息变更（spread 合并：后端推送可能不含 source 等字段，避免覆盖丢失）
      if (event.data.session) {
        const idx = sessions.value.findIndex(s => s.sessionId === event.data.session.sessionId)
        if (idx >= 0) {
          sessions.value[idx] = { ...sessions.value[idx], ...event.data.session }
        }
      }
      break

    case 'done':
      // 本轮结束
      sending.value = false
      queued.value = false
      regenerating.value = false
      agentRunning.value = false
      callingToolName.value = null
      streamingMessageId.value = null
      // 关闭可能残留的弹窗
      if (planDialog.value.visible) {
        planDialog.value.visible = false
        if (planTimerInterval) {
          clearInterval(planTimerInterval)
          planTimerInterval = null
        }
      }
      choiceDialog.value.visible = false
      approvalDialog.value.visible = false
      resumeDialog.value.visible = false
      // 注意：elevationDialog 不在 done 时关闭 —— elevation 是跨轮异步流程，
      // 用户需要看到弹窗后去 SSH 执行 sudo nereus approve，done 事件不应将其关闭。
      // 刷新会话列表（状态更新 + 自动标题总结）
      loadSessions()
      break

    case 'agent.queued':
      // 消息已排队：Agent 正在处理上一轮，消息进入队列等待
      queued.value = true
      notify.info('消息已排队', event.data.message || 'Agent 正在处理上一轮任务，消息已自动排队，完成后将自动处理')
      // 保持 sending 为 true（等待排队消息被消费），但输入框保持可用（queued=true 时不禁用）
      // 排队消息完成后会自动触发新一轮 event flow
      break

    case 'messages.deleted':
      // 消息截断删除成功：从本地移除 messageId 及之后的所有消息
      {
        const deletedId = event.data.messageId
        const deletedCount = event.data.deletedCount
        messages.value = messages.value.filter(m => m.messageId < deletedId)
        if (deletedCount > 0) {
          notify.info(`已删除 ${deletedCount} 条消息`)
        }
        // 刷新会话列表 + 消息列表（获取最新状态）
        loadSessions()
        if (activeSessionId.value) {
          loadMessages(activeSessionId.value)
        }
      }
      break

    case 'agent.busy':
      // 拒绝操作（regenerate / deleteMessage 时 Agent 忙）
      notify.warning('操作被拒绝', event.data.message || 'Agent 正在运行中，请稍后再试')
      regenerating.value = false
      deleteTargetMsgId.value = null
      break

    case 'error':
      notify.error('错误', event.data.message || '未知错误')
      sending.value = false
      queued.value = false
      regenerating.value = false
      callingToolName.value = null
      if (streamingMessageId.value) {
        const msg = messages.value.find(m => m.id === streamingMessageId.value)
        if (msg) {
          msg.isStreaming = false
        }
        streamingMessageId.value = null
      }
      break
  }
}

/* ========== 重新生成 / 消息删除 ========== */

function regenerateLastRound(newMessage?: string) {
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN || agentRunning.value) return
  regenerating.value = true
  // 仅移除最后一批 assistant + tool 消息，保留最后一条 user 消息
  const msgs = messages.value
  // 找到最后一条 user 消息的位置
  let lastUserIdx = -1
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') {
      lastUserIdx = i
      break
    }
  }
  if (lastUserIdx >= 0) {
    // 保留 user 消息及其之前的所有消息，删除 user 之后的所有 assistant/tool
    messages.value = msgs.slice(0, lastUserIdx + 1)
  }
  ws.value.send(JSON.stringify({
    type: 'regenerate',
    ...(newMessage ? { message: newMessage } : {}),
  }))
}

function deleteMessagesFrom(msgId: number) {
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN || agentRunning.value) return
  if (msgId < 1) {
    notify.warning('消息尚未持久化', '请稍后再试或刷新页面')
    deleteTargetMsgId.value = null
    return
  }
  ws.value.send(JSON.stringify({
    type: 'deleteMessage',
    messageId: msgId,
  }))
  // 关闭确认弹窗
  deleteTargetMsgId.value = null
}

/* ========== 发送消息 ========== */

function sendMessage() {
  if (!canSend.value) return
  const text = inputText.value.trim()
  if (!text || !ws.value || ws.value.readyState !== WebSocket.OPEN) return

  // 添加用户消息
  messages.value.push({
    id: `user-${Date.now()}`,
    messageId: 0,
    roundIndex: 0,
    role: 'user',
    content: text,
    timestamp: Date.now(),
  })

  // 发送到 WS
  ws.value.send(JSON.stringify({ type: 'user_message', message: text }))
  inputText.value = ''
  sending.value = true
  queued.value = false
  scrollToBottom()
}

function cancelTurn() {
  if (ws.value && ws.value.readyState === WebSocket.OPEN) {
    ws.value.send(JSON.stringify({ type: 'cancel' }))
    sending.value = false
  }
}

/* ========== 审批键盘操作 ========== */

function handleApprovalKeydown(e: KeyboardEvent) {
  // Enter → 批准
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    approveAction()
  }
  // Shift+Enter → 拒绝
  if (e.key === 'Enter' && e.shiftKey) {
    e.preventDefault()
    rejectAction()
  }
}

// 审批弹窗打开时自动聚焦，关闭时归还焦点到输入框
watch(() => approvalDialog.value.visible, (visible) => {
  if (visible) {
    nextTick(() => {
      approvalOverlayRef.value?.focus()
    })
  } else {
    // 归还焦点到输入框
    nextTick(() => {
      const input = document.querySelector('.chat-input') as HTMLTextAreaElement | null
      input?.focus()
    })
  }
})

/* ========== 审批操作 ========== */

function approveAction() {
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return
  ws.value.send(JSON.stringify({
    type: 'approval',
    actionId: approvalDialog.value.actionId,
    approved: true,
  }))
  approvalDialog.value.visible = false
}

function rejectAction() {
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return
  const reason = approvalDialog.value.rejectReason.trim() || '用户拒绝'
  ws.value.send(JSON.stringify({
    type: 'approval',
    actionId: approvalDialog.value.actionId,
    approved: false,
    reason,
  }))
  approvalDialog.value.visible = false
}

/* ========== 重连恢复操作 ========== */

function handleResumeApprove() {
  // 将恢复数据转入标准审批弹窗，让用户做最终决定
  approvalDialog.value = {
    visible: true,
    toolName: resumeDialog.value.toolName,
    args: resumeDialog.value.arguments,
    actionId: resumeDialog.value.actionId,
    reason: resumeDialog.value.reason,
    aiReason: resumeDialog.value.aiReason,
    rejectReason: '',
  }
  resumeDialog.value.visible = false
}

function handleResumeCancel() {
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return
  ws.value.send(JSON.stringify({ type: 'cancel' }))
  resumeDialog.value.visible = false
  addSystemMessage('ℹ️ 已取消待审批操作，会话回到初始状态')
  // 刷新列表获取最新状态
  loadSessions()
}

/* ========== Plan 审批操作 ========== */

function approvePlan() {
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return
  ws.value.send(JSON.stringify({
    type: 'plan',
    sessionId: activeSessionId.value,
    approved: true,
  }))
  planDialog.value.visible = false
  if (planTimerInterval) {
    clearInterval(planTimerInterval)
    planTimerInterval = null
  }
}

function rejectPlan() {
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return
  const reason = planDialog.value.rejectedReason.trim() || '用户拒绝'
  ws.value.send(JSON.stringify({
    type: 'plan',
    sessionId: activeSessionId.value,
    approved: false,
    reason,
  }))
  planDialog.value.visible = false
  if (planTimerInterval) {
    clearInterval(planTimerInterval)
    planTimerInterval = null
  }
}

/* ========== Choice 操作（新增） ========== */

function sendChoice(selectionId: string) {
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) return
  if (!choiceDialog.value.actionId) return

  const payload: Record<string, unknown> = {
    type: 'choice',
    actionId: choiceDialog.value.actionId,
    selectionId,
  }

  // 自定义输入时附带用户输入
  if (selectionId === '__custom__') {
    payload.customInput = choiceDialog.value.customInput.trim()
  }

  ws.value.send(JSON.stringify(payload))
  choiceDialog.value.visible = false
  choiceDialog.value.selectedId = null
  choiceDialog.value.customInput = ''
}

function selectChoiceOption(optionId: string) {
  choiceDialog.value.selectedId = optionId
  if (optionId !== '__custom__') {
    // 非自定义选项直接发送
    sendChoice(optionId)
  }
  // 自定义选项需要用户点击提交按钮再发送
}

function submitCustomChoice() {
  if (!choiceDialog.value.customInput.trim()) {
    notify.warning('请输入自定义答案')
    return
  }
  sendChoice('__custom__')
}

/* ========== 模式切换 ========== */

async function switchSessionMode(mode: string) {
  if (!activeSessionId.value || !ws.value || ws.value.readyState !== WebSocket.OPEN) return
  // switch_mode 走 WS 即时生效
  ws.value.send(JSON.stringify({
    type: 'switch_mode',
    sessionId: activeSessionId.value,
    mode,
  }))
}

function formatModeName(mode: string): string {
  const names: Record<string, string> = {
    agent: '标准 Agent',
    read_only: '只读',
    plan: '计划',
    break_glass: '紧急',
    executing: '执行中',
  }
  return names[mode] || mode || '标准 Agent'
}

function formatModeIcon(mode: string): string {
  const icons: Record<string, string> = {
    agent: '🤖',
    read_only: '👁️',
    plan: '📋',
    break_glass: '🚨',
    executing: '⚡',
  }
  return icons[mode] || '🤖'
}

/** 判断某条消息是否为最后一条 user 或最后一条 assistant 消息（regenerate 按钮限定） */
function isLastMessage(msg: ChatMessage): boolean {
  let lastUserId: string | null = null
  let lastAssistantId: string | null = null
  for (const m of messages.value) {
    if (m.role === 'user') lastUserId = m.id
    if (m.role === 'assistant') lastAssistantId = m.id
  }
  // 只要是自己角色的最后一条就显示
  if (msg.role === 'user' && msg.id === lastUserId) return true
  if (msg.role === 'assistant' && msg.id === lastAssistantId) return true
  return false
}

/* ========== 工具来源切换（改动四） ========== */

async function handleToolSourceChange(newSource: ToolSource) {
  if (!activeSessionId.value || switchingToolSource.value) return
  if (newSource === toolSource.value) return
  switchingToolSource.value = true
  try {
    const payload: any = { toolSource: newSource }
    if (newSource === 'stdio' && mcpServers.value.length > 0) {
      payload.mcpServers = mcpServers.value.map(s => ({
        name: s.name,
        command: s.command,
        cwd: s.cwd,
      }))
    }
    const res = await apiSwitchToolSource(activeSessionId.value, payload)
    if (res.data.code === 1) {
      toolSource.value = newSource
      notify.info(`工具来源已切换为 ${newSource === 'stdio' ? '外部 MCP' : '内置工具'}，下次消息生效`)
    } else {
      notify.warning('切换失败', res.data.msg)
      // 回退
      toolSource.value = toolSource.value
    }
  } catch (e: any) {
    notify.error('切换工具来源失败', e?.message || '请稍后重试')
  } finally {
    switchingToolSource.value = false
  }
}

/* ========== 模型切换（改动五） ========== */

async function handleModelChange(newProfileId: number) {
  if (!activeSessionId.value || switchingModel.value) return
  if (newProfileId === activeProfileId.value) return
  switchingModel.value = true
  try {
    const res = await apiSwitchModel(activeSessionId.value, { profileId: newProfileId })
    if (res.data.code === 1) {
      activeProfileId.value = newProfileId
      notify.info('模型已切换，下次消息生效')
    } else {
      notify.warning('切换失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('切换模型失败', e?.message || '请稍后重试')
  } finally {
    switchingModel.value = false
  }
}

/* ========== 计费面板（改动三） ========== */

async function openBillingDialog() {
  if (!activeSessionId.value) return
  showBillingDialog.value = true
  billingLoading.value = true
  try {
    const [usageRes, billingRes] = await Promise.all([
      getAgentUsage(activeSessionId.value),
      getAgentBilling(activeSessionId.value),
    ])
    if (usageRes.data.code === 1) {
      // 后端 /usage 返回裸数组，兼容两种格式
      const data = usageRes.data.data
      tokenUsage.value = Array.isArray(data) ? data : (data as any)?.items || []
    }
    if (billingRes.data.code === 1) {
      billingSummary.value = billingRes.data.data
    }
  } catch (e: any) {
    notify.error('加载计费数据失败', e?.message || '请稍后重试')
  } finally {
    billingLoading.value = false
  }
}

function closeBillingDialog() {
  showBillingDialog.value = false
  tokenUsage.value = []
  billingSummary.value = null
}

/* ========== 审计时间线（改动二） ========== */

function getDotColor(eventType: string): string {
  if (eventType.startsWith('input')) return 'blue'
  if (eventType.startsWith('llm.')) return 'purple'
  if (eventType.startsWith('safety')) return 'amber'
  if (eventType.startsWith('approval')) return 'orange'
  if (eventType.startsWith('tool')) return 'green'
  if (eventType === 'injection.detected') return 'red'
  if (eventType === 'session.done') return 'emerald'
  if (eventType.startsWith('thinking')) return 'indigo'
  if (eventType.startsWith('text.')) return 'cyan'
  if (eventType.startsWith('plan.')) return 'gold'
  if (eventType === 'session.created') return 'teal'
  if (eventType.startsWith('mode.')) return 'pink'
  if (eventType === 'message.regenerated') return 'teal'
  if (eventType === 'message.deleted') return 'red'
  return 'gray'
}

function getStageIcon(eventType: string): string {
  if (eventType.startsWith('input')) return '📥'
  if (eventType.startsWith('llm.')) return '🧠'
  if (eventType.startsWith('safety')) return '🛡️'
  if (eventType.startsWith('approval')) return '👤'
  if (eventType.startsWith('tool')) return '🔧'
  if (eventType === 'injection.detected') return '🚨'
  if (eventType === 'session.done') return '✅'
  if (eventType.startsWith('thinking')) return '💭'
  if (eventType.startsWith('text.')) return '💬'
  if (eventType.startsWith('plan.')) return '📋'
  if (eventType === 'session.created') return '🆕'
  if (eventType.startsWith('mode.')) return '🔄'
  if (eventType === 'message.regenerated') return '♻️'
  if (eventType === 'message.deleted') return '🗑️'
  return '📋'
}

const EVENT_TYPE_NAMES: Record<string, string> = {
  'session.created': '会话创建',
  'session.done': '会话结束',
  'agent.ready': 'Agent 就绪',
  'thinking.start': '开始推理',
  'thinking.delta': '推理增量',
  'thinking.end': '推理完成',
  'text.delta': '文本增量',
  'text.done': '文本完成',
  'tool.calling': '工具调用',
  'tool.result': '工具结果',
  'safety.checked': '安全检查',
  'safety.check': '安全检查',
  'approval.required': '需要审批',
  'approval.resolved': '审批已处理',
  'plan.proposed': '计划提交',
  'plan.approved': '计划已批准',
  'plan.rejected': '计划被拒绝',
  'choice.required': '用户选择题',
  'choice.resolved': '选择题已作答',
  'choice.timeout': '选择题超时',
  'elevation.requested': '特权提权请求',
  'elevation.resolved': '特权提权结果',
  'title.updated': '标题更新',
  'mode_changed': '模式切换',
  'mode.switch': '模式切换',
  'input.received': '输入接收',
  'approval.requested': '请求审批',
  'llm.request': 'LLM 请求',
  'llm.response': 'LLM 响应',
  'injection.detected': '注入检测',
  'message.regenerated': '消息重新生成',
  'message.deleted': '消息删除',
}

function formatEventTypeName(eventType: string): string {
  return EVENT_TYPE_NAMES[eventType] || eventType
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatEventData(data: Record<string, unknown>): string {
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

function toggleTraceEvent(id: number) {
  expandedTraceEventId.value = expandedTraceEventId.value === id ? null : id
}

async function openTraceDialog(sessionId: string) {
  traceSessionId.value = sessionId
  traceDialogVisible.value = true
  traceDialogLoading.value = true
  timelineItems.value = []
  traceSummary.value = null
  expandedTraceEventId.value = null

  try {
    const [tlRes, sumRes] = await Promise.all([
      getSessionTimeline(sessionId, 500),
      getSessionTraceSummary(sessionId),
    ])
    if (tlRes.data.code === 1) {
      const items = tlRes.data.data.items || []
      // 按时间戳升序排列（后端可能未排序）
      items.sort((a, b) => a.timestamp - b.timestamp)
      timelineItems.value = items
    }
    if (sumRes.data.code === 1) {
      traceSummary.value = sumRes.data.data
    }
  } catch (e: any) {
    notify.error('加载审计链失败', e?.message || '请稍后重试')
  } finally {
    traceDialogLoading.value = false
  }
}

function closeTraceDialog() {
  traceDialogVisible.value = false
  traceSessionId.value = ''
  timelineItems.value = []
  traceSummary.value = null
  expandedTraceEventId.value = null
}

/* ========== MCP Server 配置辅助 ========== */

function addMcpServer() {
  mcpServers.value.push({ name: '', command: ['', ''], cwd: '' })
}

function ensureCmdArray(srv: { name: string; command: string[]; cwd?: string }) {
  if (typeof srv.command === 'string') {
    srv.command = [srv.command as any]
  }
}

function updateMcpArg(srv: { name: string; command: string[]; cwd?: string }, index: number, value: string) {
  while (srv.command.length <= index) {
    srv.command.push('')
  }
  srv.command[index] = value
}

/* ========== 工具调用折叠切换 ========== */

function toggleToolCall(msgId: string, callId: string) {
  const msg = messages.value.find(m => m.id === msgId)
  if (!msg?.toolCalls) return
  const tc = msg.toolCalls.find(t => t.callId === callId)
  if (tc) tc.expanded = !tc.expanded
}

/* ========== 系统消息辅助 ========== */

/* ========== 特权提权复制 ========== */

function copyElevationCode() {
  if (!elevationDialog.value.code) return
  navigator.clipboard.writeText(elevationDialog.value.code).then(() => {
    elevationDialog.value.codeCopied = true
    notify.info('已复制', '审批 Code 已复制到剪贴板')
    setTimeout(() => {
      elevationDialog.value.codeCopied = false
    }, 3000)
  }).catch(() => {
    notify.warning('复制失败', '请手动复制 Code')
  })
}

/* ========== 系统消息辅助 ========== */

function addSystemMessage(text: string) {
  messages.value.push({
    id: `sys-${Date.now()}`,
    messageId: 0,
    roundIndex: 0,
    role: 'assistant',
    content: text,
    timestamp: Date.now(),
    isStreaming: false,
    toolCalls: [],
  })
  scrollToBottom()
}

/* ========== 工具函数 ========== */

function scrollToBottom() {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  })
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatSessionTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatSessionStatus(status: AgentSessionStatus): { label: string; unread: boolean } {
  const map: Record<string, { label: string; unread: boolean }> = {
    idle: { label: '就绪', unread: false },
    running: { label: '运行中', unread: false },
    waiting_approval: { label: '等待审批', unread: false },
    waiting_plan: { label: '等待计划审批', unread: false },
    waiting_choice: { label: '等待选择', unread: false },
    completed: { label: '已完成', unread: false },
    completed_unread: { label: '已完成', unread: true },
    cancelled: { label: '已取消', unread: false },
    error: { label: '错误', unread: false },
  }
  return map[status] || { label: status || '未知', unread: false }
}

function truncateOutput(output: string, maxLen = 120): string {
  if (!output || output.length <= maxLen) return output || '(空)'
  return output.slice(0, maxLen) + '…'
}

/* ========== 输入框自动增高 ========== */

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

/* ========== 快捷键 ========== */

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
    // 发送后重置高度
    nextTick(() => {
      const el = document.querySelector('.chat-input') as HTMLTextAreaElement | null
      if (el) el.style.height = 'auto'
    })
  }
}

/* ========== 生命周期 ========== */

function getRouteSessionId(): string {
  const queryValue = route.query.sessionId
  if (Array.isArray(queryValue)) return queryValue[0] || ''
  return queryValue || ''
}

onMounted(async () => {
  await Promise.all([loadSessions(), loadProfiles()])
  const routeSessionId = getRouteSessionId()
  if (routeSessionId) {
    await switchSession(routeSessionId)
  } else if (sessions.value.length > 0) {
    await switchSession(sessions.value[0].sessionId)
  }
})

// 心跳定时器
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  heartbeatTimer = setInterval(sendPing, 30000)
})

onUnmounted(() => {
  closeWs()
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  if (planTimerInterval) {
    clearInterval(planTimerInterval)
    planTimerInterval = null
  }
})

watch(activeProfileId, (newVal) => {
  if (newVal && sessions.value.length === 0) {
    // 如果还没有会话，稍后创建时会使用这个 profile
  }
})

watch(() => route.query.sessionId, async () => {
  const routeSessionId = getRouteSessionId()
  if (routeSessionId && routeSessionId !== activeSessionId.value) {
    await switchSession(routeSessionId)
  }
})
</script>

<template>
  <div class="agent-page">
    <!-- ====== 左侧会话列表 ====== -->
    <aside class="session-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <div class="sidebar-header">
        <button class="new-chat-btn" @click="quickCreateSession" title="默认模型 + 运维+agent核心">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span v-show="!sidebarCollapsed">新对话</span>
        </button>

        <button class="collapse-sidebar-btn" @click="sidebarCollapsed = !sidebarCollapsed" :title="sidebarCollapsed ? '展开' : '收起'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline :points="sidebarCollapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6'" />
          </svg>
        </button>
      </div>

      <div v-show="!sidebarCollapsed" class="session-source-filter">
        <button
          v-for="opt in [{ v: 'all', label: '全部' }, { v: 'manual', label: '手动' }, { v: 'scheduled', label: '定时任务' }, { v: 'inspection', label: '巡检' }]"
          :key="opt.v"
          class="source-filter-btn"
          :class="{ active: sourceFilter === opt.v }"
          @click="sourceFilter = opt.v as typeof sourceFilter"
        >{{ opt.label }}</button>
      </div>

      <div class="session-list">
        <div v-if="sessionsLoading" class="list-loading">加载中…</div>
        <div v-else-if="sessions.length === 0" class="list-empty">
          <span v-show="!sidebarCollapsed">暂无会话，点击上方创建</span>
        </div>
        <div
          v-for="s in sessionListSorted"
          :key="s.sessionId"
          class="session-item"
          :class="{ active: s.sessionId === activeSessionId, deleting: deleteConfirmId === s.sessionId }"
          @click="switchSession(s.sessionId)"
        >
          <div class="session-item-main">
            <div class="session-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div class="session-info" v-show="!sidebarCollapsed">
              <div class="session-title">
                {{ s.title }}
                <span v-if="formatSessionStatus(s.status).unread" class="unread-badge" title="有未查看的结果">●</span>
              </div>
              <div class="session-meta">
                <span v-if="formatSessionSource(s.source).label" class="source-badge" :class="formatSessionSource(s.source).cls">{{ formatSessionSource(s.source).label }}</span>
                <span>{{ formatSessionTime(s.updatedAt) }} · {{ formatSessionStatus(s.status).label }}</span>
              </div>
            </div>
          </div>
          <button
            v-show="!sidebarCollapsed"
            class="session-delete-btn"
            @click.stop="confirmDeleteSession(s.sessionId)"
            title="删除会话"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>

      <!-- 删除确认浮层 -->
      <Transition name="fade">
        <div v-if="deleteConfirmId" class="delete-overlay" @click.self="deleteConfirmId = null">
          <div class="delete-dialog">
            <p>确认删除此会话？消息也将被移除。</p>
            <div class="delete-actions">
              <button class="cancel-btn" @click="deleteConfirmId = null">取消</button>
              <button class="danger-btn" @click="doDeleteSession">删除</button>
            </div>
          </div>
        </div>
      </Transition>
    </aside>

    <!-- ====== 主聊天区域 ====== -->
    <main class="chat-main" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <!-- 顶部栏 -->
      <header class="chat-header">
        <div class="chat-header-left">
          <h1 class="chat-title">{{ activeSession?.title || 'Agent 对话' }}</h1>
          <div class="ws-status" :class="wsStatusClass">
            <span class="ws-dot"></span>
            <span>{{ wsStatusText }}</span>
          </div>
          <!-- 模式指示器 -->
          <div v-if="activeSessionId && sessionMode" class="mode-indicator" :class="'mode-' + sessionMode">
            <span class="mode-icon">{{ formatModeIcon(sessionMode) }}</span>
            <span class="mode-name">{{ formatModeName(sessionMode) }}</span>
            <div class="mode-switcher-dropdown">
              <button
                v-for="m in ['agent', 'read_only', 'plan', 'break_glass']"
                :key="m"
                class="mode-option"
                :class="{ active: m === sessionMode }"
                @click="switchSessionMode(m)"
              >
                <span class="mode-option-icon">{{ formatModeIcon(m) }}</span>
                <div class="mode-option-text">
                  <div class="mode-option-name">{{ formatModeName(m) }}</div>
                  <div class="mode-option-desc">{{
                    m === 'agent' ? '低风险自动，中高风险需审批' :
                    m === 'read_only' ? '仅可查询诊断' :
                    m === 'plan' ? '仅生成方案不执行' :
                    '跳过审批，强审计日志'
                  }}</div>
                </div>
              </button>
            </div>
          </div>
          <button
            class="header-audit-btn"
            title="审计时间线"
            :disabled="!activeSessionId"
            @click="activeSessionId && openTraceDialog(activeSessionId)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>审计</span>
          </button>
          <button
            class="header-new-btn"
            title="新建会话"
            @click="openCreateDialog"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>新建会话（高级）</span>
          </button>
        </div>

        <div class="chat-header-right">
          <!-- 模型选择 -->
          <div class="model-selector">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <select
              :value="activeProfileId"
              @change="handleModelChange(Number(($event.target as HTMLSelectElement).value))"
              :disabled="profilesLoading || switchingModel || !activeSessionId"
            >
              <option value="" disabled>选择模型</option>
              <option v-if="profilesLoading" value="" disabled>加载中…</option>
              <option v-for="p in profiles" :key="p.profileId" :value="p.profileId">
                {{ p.name || p.model }} {{ p.isDefault ? '★' : '' }}
              </option>
            </select>
          </div>

          <!-- 工具来源选择 -->
          <div class="tool-source-picker">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
            <select
              :value="toolSource"
              @change="handleToolSourceChange(($event.target as HTMLSelectElement).value as ToolSource)"
              :disabled="switchingToolSource || !activeSessionId"
            >
              <option value="current_mcp">内置工具</option>
              <option value="stdio">MCP Server</option>
            </select>
            <button
              v-if="toolSource === 'stdio'"
              class="mcp-config-btn"
              :class="{ active: showMcpConfig }"
              @click="showMcpConfig = !showMcpConfig"
              title="配置 MCP Server"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            </button>
          </div>

          <button
            class="header-btn"
            title="Token 用量与计费"
            @click="openBillingDialog"
            :disabled="!activeSessionId"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </button>
          <button class="header-btn" title="设置" @click="router.push('/settings/apikey')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        <!-- MCP Server 配置面板 -->
        <Transition name="slide-down">
          <div v-if="showMcpConfig && toolSource === 'stdio'" class="mcp-config-panel">
            <div class="mcp-config-header">
              <span>MCP Server 配置</span>
              <button class="add-mcp-btn" @click="addMcpServer">+ 添加 Server</button>
            </div>
            <div v-if="mcpServers.length === 0" class="mcp-empty-hint">暂无配置，新建会话时将自动从 pyproject.toml 发现。</div>
            <div v-for="(srv, idx) in mcpServers" :key="idx" class="mcp-server-row">
              <div class="mcp-server-fields">
                <input v-model="srv.name" type="text" placeholder="server 名称 (如 ndlmpanel-mcp)" class="mcp-input name" />
                <input v-model="srv.command[0]" type="text" placeholder="命令 (如 python)" class="mcp-input cmd" @blur="ensureCmdArray(srv)" />
                <input
                  v-for="(arg, ai) in srv.command.slice(1)"
                  :key="ai"
                  :value="arg"
                  @input="updateMcpArg(srv, ai + 1, ($event.target as HTMLInputElement).value)"
                  type="text"
                  :placeholder="'参数 ' + (ai + 1)"
                  class="mcp-input arg"
                />
                <input v-model="srv.cwd" type="text" placeholder="工作目录 (可选)" class="mcp-input cwd" />
              </div>
              <button class="remove-mcp-btn" @click="mcpServers.splice(idx, 1)" title="移除此 Server">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        </Transition>
      </header>

      <!-- Agent 后台运行提示条 -->
      <Transition name="slide-down">
        <div v-if="agentRunning && activeSessionId" class="agent-busy-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>Agent 正在后台运行中，消息将自动排队</span>
        </div>
      </Transition>

      <!-- 消息列表 -->
      <div class="message-list" ref="messageListRef">
        <!-- 空状态 -->
        <div v-if="!activeSessionId" class="empty-state">
          <div class="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h2>Agent 对话</h2>
          <p>选择一个会话，或创建新会话开始与 AI 助手对话。</p>
          <div class="empty-actions">
            <button class="primary-btn" @click="quickCreateSession">快速创建</button>

          </div>
        </div>

        <!-- 加载中 -->
        <div v-else-if="messagesLoading" class="loading-msgs">加载消息历史…</div>

        <!-- 消息列表 -->
        <template v-else>
          <div v-for="msg in messages" :key="msg.id" class="message-row" :class="msg.role">
            <div class="message-avatar">
              <div v-if="msg.role === 'user'" class="avatar user-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div v-else-if="msg.role === 'tool'" class="avatar tool-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="16 3 21 3 21 8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" />
                  <line x1="15" y1="15" x2="21" y2="21" />
                  <line x1="4" y1="4" x2="9" y2="9" />
                </svg>
              </div>
              <div v-else class="avatar assistant-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2a8 8 0 0 0-8 8c0 3.5 2 6.5 5 8l-1 4h8l-1-4c3-1.5 5-4.5 5-8a8 8 0 0 0-8-8z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
            </div>

            <div class="message-body">
              <div class="message-sender">{{
                msg.role === 'user' ? '你' :
                msg.role === 'tool' ? (msg.toolName || '工具') :
                'Agent'
              }}</div>

              <!-- User 消息: 渲染为 Markdown -->
              <div v-if="msg.role === 'user'" class="message-bubble user-bubble">
                <div class="message-text markdown-body" v-html="renderMarkdown(msg.content)"></div>
                <div class="message-time">{{ formatTime(msg.timestamp) }}</div>
                <div v-if="!agentRunning" class="message-actions">
                  <button
                    v-if="isLastMessage(msg) && !regenerating"
                    class="msg-action-btn regenerate-btn"
                    title="重新生成回复"
                    @click.stop="regenerateLastRound()"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    重新生成
                  </button>
                  <button class="msg-action-btn delete-msg-btn" title="删除本条及后续消息" @click.stop="deleteTargetMsgId = msg.messageId">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Tool 消息: 显示工具返回结果 -->
              <div v-else-if="msg.role === 'tool'" class="message-bubble tool-bubble">
                <div class="tool-call-header inline">
                  <span class="tool-call-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span class="tool-call-id" title="toolCallId">{{ msg.toolCallId ? '#' + msg.toolCallId.slice(0, 12) : '' }}</span>
                </div>
                <pre class="tool-result-output"><code>{{ msg.content }}</code></pre>
                <div class="message-time">{{ formatTime(msg.timestamp) }}</div>
                <div v-if="!agentRunning" class="message-actions">
                  <button class="msg-action-btn delete-msg-btn" title="删除本条及后续消息" @click.stop="deleteTargetMsgId = msg.messageId">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Assistant 消息: 文本(Markdown) + 工具调用 -->
              <div v-else class="message-bubble assistant-bubble">
                <!-- 文本内容 (渲染为 Markdown) -->
                <div v-if="msg.content" class="message-text markdown-body" v-html="renderMarkdown(msg.content)"></div>
                <div v-if="msg.isStreaming && !msg.content" class="streaming-cursor">
                  <span class="thinking-dots">
                    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
                  </span>
                </div>
                <div v-if="msg.isStreaming && msg.content" class="streaming-cursor">
                  <span class="cursor-blink">▍</span>
                </div>

                <!-- 工具调用列表 -->
                <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="tool-calls-section">
                  <div
                    v-for="tc in msg.toolCalls"
                    :key="tc.callId"
                    class="tool-call-card"
                    :class="{ success: tc.success, failed: !tc.success }"
                    @click="toggleToolCall(msg.id, tc.callId)"
                  >
                    <div class="tool-call-header">
                      <span class="tool-call-icon">
                        <svg v-if="tc.success" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </span>
                      <code class="tool-call-name">{{ tc.toolName }}</code>
                      <span class="tool-call-status">{{ tc.success ? '成功' : '失败' }}</span>
                      <span class="tool-call-toggle">
                        <svg
                          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                          :class="{ rotated: tc.expanded }"
                          style="transition: transform 0.2s"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </span>
                    </div>
                    <Transition name="expand">
                      <div v-if="tc.expanded" class="tool-call-detail">
                        <pre class="tool-call-output"><code>{{ tc.output }}</code></pre>
                      </div>
                    </Transition>
                  </div>
                </div>

                <div class="message-time">{{ formatTime(msg.timestamp) }}</div>
                <!-- 操作按钮 -->
                <div v-if="!msg.isStreaming && !agentRunning" class="message-actions">
                  <!-- Regenerate: 仅最后一条消息显示 -->
                  <template v-if="isLastMessage(msg)">
                    <button
                      v-if="!regenerating"
                      class="msg-action-btn regenerate-btn"
                      title="重新生成回复"
                      @click.stop="regenerateLastRound()"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10" />
                        <polyline points="1 20 1 14 7 14" />
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                      </svg>
                      重新生成
                    </button>
                    <button
                      v-else
                      class="msg-action-btn regenerating-btn"
                      disabled
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin-icon">
                        <line x1="12" y1="2" x2="12" y2="6" />
                        <line x1="12" y1="18" x2="12" y2="22" />
                        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                        <line x1="2" y1="12" x2="6" y2="12" />
                        <line x1="18" y1="12" x2="22" y2="12" />
                        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                      </svg>
                      生成中…
                    </button>
                  </template>
                  <button class="msg-action-btn delete-msg-btn" title="删除本条及后续消息" @click.stop="deleteTargetMsgId = msg.messageId">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 底部留白 -->
          <div class="scroll-anchor" ref="scrollAnchor"></div>
        </template>
      </div>

      <!-- 输入区域 -->
      <div v-if="activeSessionId" class="input-area">
        <div class="input-wrapper">
          <textarea
            v-model="inputText"
            class="chat-input"
            placeholder="输入消息… (Enter 发送, Shift+Enter 换行)"
            :disabled="!wsConnected || choiceDialog.visible || (sending && !queued)"
            @keydown="handleKeydown"
            @input="autoResize"
            rows="1"
          ></textarea>
          <div class="input-actions">
            <button
              v-if="sending"
              class="stop-btn"
              @click="cancelTurn"
              title="停止生成"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              停止
            </button>
            <button
              v-else
              class="send-btn"
              :disabled="!canSend"
              @click="sendMessage"
              title="发送"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- ====== 删除消息确认弹窗 ====== -->
    <Transition name="fade">
      <div v-if="deleteTargetMsgId" class="approval-overlay" @click.self="deleteTargetMsgId = null">
        <div class="delete-dialog" @click.stop>
          <div class="approval-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2l7 3v6c0 5-3.5 9-7 11-3.5-2-7-6-7-11V5l7-3z" />
            </svg>
            <span>确认删除</span>
          </div>
          <div class="approval-body">
            <p>将删除此消息及之后的所有消息，此操作不可撤销。</p>
          </div>
          <div class="approval-actions">
            <button class="reject-btn" @click="deleteTargetMsgId = null">取消</button>
            <button class="approve-btn danger-btn-style" @click="deleteTargetMsgId && deleteMessagesFrom(deleteTargetMsgId)">确认删除</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ====== 审批弹窗 ====== -->
    <Transition name="fade">
      <div
        v-if="approvalDialog.visible"
        class="approval-overlay"
        @keydown="handleApprovalKeydown"
        tabindex="-1"
        ref="approvalOverlayRef"
      >
        <div class="approval-dialog" @click.stop>
          <div class="approval-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2l7 3v6c0 5-3.5 9-7 11-3.5-2-7-6-7-11V5l7-3z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <span>需要审批</span>
          </div>
          <div class="approval-body">
            <div class="approval-field">
              <span class="field-label">工具</span>
              <code class="field-value">{{ approvalDialog.toolName }}</code>
            </div>
            <div class="approval-field">
              <span class="field-label">原因</span>
              <span class="field-value">{{ approvalDialog.reason }}</span>
            </div>
            <!-- AI 意图说明（亮点） -->
            <div v-if="approvalDialog.aiReason" class="approval-ai-section">
              <div class="approval-ai-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2a4 4 0 0 1 4 4c0 2-2 3-4 5-2-2-4-3-4-5a4 4 0 0 1 4-4z"/>
                  <path d="M12 11v4"/>
                  <path d="M12 17v1"/>
                </svg>
                <span>AI 意图说明</span>
              </div>
              <div class="approval-ai-body">{{ approvalDialog.aiReason }}</div>
            </div>
            <div class="approval-field">
              <span class="field-label">参数</span>
              <pre class="field-json"><code>{{ JSON.stringify(approvalDialog.args, null, 2) }}</code></pre>
            </div>
          </div>
          <!-- 拒绝理由输入（可选） -->
          <div class="approval-reject-section" v-if="approvalDialog.visible">
            <div class="approval-reject-label">拒绝理由（可选）</div>
            <textarea
              v-model="approvalDialog.rejectReason"
              class="approval-reject-input"
              placeholder="如需修改操作，请说明修改建议…"
              rows="2"
            ></textarea>
          </div>
          <div class="approval-actions">
            <button class="reject-btn" @click="rejectAction">拒绝</button>
            <button class="approve-btn" @click="approveAction">批准</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ====== WS 重连恢复弹窗 ====== -->
    <Transition name="fade">
      <div
        v-if="resumeDialog.visible"
        class="approval-overlay"
        tabindex="-1"
        ref="approvalOverlayRef"
        @keydown="handleApprovalKeydown"
      >
        <div class="resume-dialog" @click.stop>
          <div class="resume-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            <span>检测到待恢复操作</span>
          </div>
          <div class="resume-body">
            <!-- 提示文本 -->
            <div class="resume-message">{{ resumeDialog.message }}</div>
            <!-- 工具信息 -->
            <div class="resume-field">
              <span class="field-label">工具</span>
              <code class="field-value">{{ resumeDialog.toolName }}</code>
            </div>
            <div class="resume-field">
              <span class="field-label">原因</span>
              <span class="field-value">{{ resumeDialog.reason }}</span>
            </div>
            <!-- AI 意图说明 -->
            <div v-if="resumeDialog.aiReason" class="resume-ai-section">
              <div class="resume-ai-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2a4 4 0 0 1 4 4c0 2-2 3-4 5-2-2-4-3-4-5a4 4 0 0 1 4-4z"/>
                  <path d="M12 11v4"/>
                  <path d="M12 17v1"/>
                </svg>
                <span>AI 意图说明</span>
              </div>
              <div class="resume-ai-body">{{ resumeDialog.aiReason }}</div>
            </div>
            <!-- 参数 -->
            <div class="resume-field">
              <span class="field-label">参数</span>
              <pre class="field-json"><code>{{ JSON.stringify(resumeDialog.arguments, null, 2) }}</code></pre>
            </div>
            <!-- 上下文丢失提示 -->
            <div class="resume-context-warning">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>注意：重连后 Agent 运行时上下文已丢失，继续审批后需要重新发送需求</span>
            </div>
          </div>
          <div class="resume-actions">
            <button class="reject-btn" @click="handleResumeCancel">取消操作</button>
            <button class="approve-btn" @click="handleResumeApprove">继续审批</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ====== 计划审批弹窗 ====== -->
    <Transition name="fade">
      <div v-if="planDialog.visible" class="approval-overlay" @click.self="planDialog.visible = false">
        <div class="plan-dialog" @click.stop>
          <div class="approval-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span>计划审批</span>
            <span v-if="planDialog.timerSeconds > 0" class="plan-timer" :class="{ urgent: planDialog.timerSeconds <= 60 }">
              {{ Math.floor(planDialog.timerSeconds / 60) }}:{{ String(planDialog.timerSeconds % 60).padStart(2, '0') }}
            </span>
          </div>

          <div v-if="planDialog.plan" class="plan-body">
            <!-- 概述 -->
            <div class="plan-section">
              <div class="plan-section-title">概述</div>
              <div class="plan-summary-text">{{ planDialog.plan.summary }}</div>
            </div>

            <!-- 执行步骤 -->
            <div class="plan-section">
              <div class="plan-section-title">执行步骤 ({{ planDialog.plan.steps.length }})</div>
              <div v-for="(step, idx) in planDialog.plan.steps" :key="step.step_id" class="plan-step-card">
                <div class="plan-step-number">{{ idx + 1 }}</div>
                <div class="plan-step-body">
                  <div class="plan-step-header">
                    <span class="plan-step-title">{{ step.title }}</span>
                    <span class="plan-step-risk" :class="'risk-' + step.risk">{{
                      ({ low: '低', medium: '中', high: '高' } as Record<string, string>)[step.risk] || step.risk
                    }}</span>
                  </div>
                  <div class="plan-step-action">{{ step.action }}</div>
                  <div v-if="step.tool || step.target" class="plan-step-meta">
                    <span v-if="step.tool" class="plan-step-tag">🔧 {{ step.tool }}</span>
                    <span v-if="step.target" class="plan-step-tag">📁 {{ step.target }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 风险 -->
            <div v-if="planDialog.plan.risks.length > 0" class="plan-section">
              <div class="plan-section-title">风险提示</div>
              <div class="plan-risks">
                <div v-for="(risk, idx) in planDialog.plan.risks" :key="idx" class="plan-risk-item">
                  <span class="plan-risk-icon">⚠️</span>
                  <span>{{ risk }}</span>
                </div>
              </div>
            </div>

            <!-- 涉及文件 -->
            <div v-if="planDialog.plan.files.length > 0" class="plan-section">
              <div class="plan-section-title">涉及文件</div>
              <div class="plan-files">
                <div v-for="(file, idx) in planDialog.plan.files" :key="idx" class="plan-file-item">
                  <code>{{ file }}</code>
                </div>
              </div>
            </div>

            <!-- 拒绝理由输入 -->
            <div class="plan-section">
              <div class="plan-section-title">拒绝理由（可选）</div>
              <textarea
                v-model="planDialog.rejectedReason"
                class="plan-reason-input"
                placeholder="如需修改计划，请说明修改建议…"
                rows="2"
              ></textarea>
            </div>
          </div>

          <div class="approval-actions">
            <button class="reject-btn" @click="rejectPlan">拒绝</button>
            <button class="approve-btn" @click="approvePlan">批准计划</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ====== 选择题弹窗（新增） ====== -->
    <Transition name="fade">
      <div v-if="choiceDialog.visible" class="approval-overlay" @click.self="choiceDialog.visible = false">
        <div class="choice-dialog" @click.stop>
          <div class="choice-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>Agent 提问</span>
          </div>

          <div class="choice-body">
            <!-- 问题描述 -->
            <div class="choice-question">{{ choiceDialog.question }}</div>

            <!-- 选项列表 -->
            <div class="choice-options">
              <button
                v-for="opt in choiceDialog.options"
                :key="opt.id"
                class="choice-option-btn"
                :class="{ selected: choiceDialog.selectedId === opt.id }"
                :disabled="choiceDialog.selectedId !== null"
                @click="selectChoiceOption(opt.id)"
              >
                <span class="choice-option-id">{{ opt.id }}</span>
                <span class="choice-option-text">
                  <span class="choice-option-title">{{ opt.title }}</span>
                  <span v-if="opt.summary" class="choice-option-summary">{{ opt.summary }}</span>
                </span>
              </button>
            </div>

            <!-- 自定义输入 -->
            <div v-if="choiceDialog.allowCustom" class="choice-custom-section">
              <div class="choice-custom-label">或自定义输入：</div>
              <textarea
                v-model="choiceDialog.customInput"
                class="choice-custom-input"
                placeholder="输入你的自定义答案…"
                rows="2"
                :disabled="choiceDialog.selectedId !== null && choiceDialog.selectedId !== '__custom__'"
              ></textarea>
              <button
                class="choice-custom-submit"
                :disabled="!choiceDialog.customInput.trim() || choiceDialog.selectedId === '__custom__'"
                @click="submitCustomChoice"
              >提交自定义答案</button>
            </div>

            <!-- 等待提示 -->
            <div v-if="choiceDialog.selectedId" class="choice-waiting">
              <span class="choice-waiting-spinner"></span>
              <span>正在处理你的选择…</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ====== 特权提权弹窗 ====== -->
    <Transition name="fade">
      <div
        v-if="elevationDialog.visible"
        class="elevation-overlay"
        tabindex="-1"
        @keydown.esc="elevationDialog.visible = false"
      >
        <div class="elevation-dialog" @click.stop>
          <!-- 头部 — 根据状态显示不同图标 -->
          <div class="elevation-header">
            <!-- 等待审批中 -->
            <template v-if="elevationDialog.status === 'pending_approval'">
              <div class="elevation-icon elevation-icon-pending">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <span>🔐 新特权请求</span>
            </template>
            <!-- 已批准 -->
            <template v-else-if="elevationDialog.status === 'approved'">
              <div class="elevation-icon elevation-icon-approved">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <span>✅ 特权请求已批准</span>
            </template>
            <!-- 已拒绝 -->
            <template v-else-if="elevationDialog.status === 'rejected'">
              <div class="elevation-icon elevation-icon-rejected">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <span>❌ 特权请求已拒绝</span>
            </template>
            <!-- 已过期 -->
            <template v-else>
              <div class="elevation-icon elevation-icon-expired">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <span>⏰ 特权请求已过期</span>
            </template>
            <button class="elevation-close-btn" @click="elevationDialog.visible = false">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div class="elevation-body">
            <!-- 原因 -->
            <div class="elevation-field">
              <span class="elevation-field-label">原因</span>
              <span class="elevation-field-value">{{ elevationDialog.reason }}</span>
            </div>

            <!-- Code 复制区域 — 仅在 pending_approval 时需要用户操作 -->
            <div v-if="elevationDialog.status === 'pending_approval'" class="elevation-code-section">
              <span class="elevation-field-label">审批 Code</span>
              <div class="elevation-code-box">
                <code class="elevation-code-text">{{ elevationDialog.code }}</code>
                <button
                  class="elevation-copy-btn"
                  :class="{ copied: elevationDialog.codeCopied }"
                  @click="copyElevationCode"
                >
                  <template v-if="!elevationDialog.codeCopied">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>复制</span>
                  </template>
                  <template v-else>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>已复制</span>
                  </template>
                </button>
              </div>
            </div>

            <!-- 已批准/拒绝/过期时显示消息 -->
            <div v-else class="elevation-status-message">
              <span>{{ elevationDialog.message }}</span>
            </div>

            <!-- 操作列表 — 仅在 pending_approval 时显示 -->
            <div v-if="elevationDialog.status === 'pending_approval' && elevationDialog.commands.length" class="elevation-commands-section">
              <span class="elevation-field-label">操作列表（{{ elevationDialog.commands.length }}）</span>
              <div class="elevation-commands-list">
                <div
                  v-for="(cmd, idx) in elevationDialog.commands"
                  :key="idx"
                  class="elevation-command-item"
                >
                  <span class="elevation-command-index">{{ idx + 1 }}</span>
                  <code class="elevation-command-text">{{ cmd.command }} {{ cmd.args.join(' ') }}</code>
                </div>
              </div>
            </div>

            <!-- SSH 提示 — 仅在 pending_approval 时 -->
            <div v-if="elevationDialog.status === 'pending_approval'" class="elevation-ssh-hint">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <strong>⚠️ 请在 SSH 终端执行以下命令完成审批：</strong>
                <code class="elevation-ssh-command">sudo nereus approve {{ elevationDialog.code }}</code>
                <span class="elevation-ssh-note">审批后 Agent 将自动继续执行</span>
              </div>
            </div>
          </div>

          <!-- 底部 — 仅 pending_approval 有关闭按钮 -->
          <div v-if="elevationDialog.status === 'pending_approval'" class="elevation-footer">
            <span class="elevation-footer-hint">等待 SSH 审批中…</span>
            <button class="elevation-dismiss-btn" @click="elevationDialog.visible = false">最小化</button>
          </div>
          <!-- 已决状态：关闭按钮 -->
          <div v-else class="elevation-footer">
            <button class="elevation-ok-btn" @click="elevationDialog.visible = false">知道了</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ====== 自定义创建弹窗 ====== -->
    <Transition name="fade">
      <div v-if="showCreateDialog" class="approval-overlay" @keydown.esc="showCreateDialog = false">
        <div class="create-dialog" @click.stop>
          <div class="create-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>自定义创建会话</span>
          </div>

          <div class="create-body">
            <!-- 会话标题 -->
            <div class="create-field">
              <span class="create-label">会话标题</span>
              <input v-model="createForm.title" type="text" placeholder="新 Agent 会话" class="create-input" />
            </div>

            <!-- 工具来源 -->
            <div class="create-field">
              <span class="create-label">工具来源</span>
              <div class="tool-options">
                <label
                  class="tool-option"
                  :class="{ active: createForm.toolSource === 'stdio' }"
                  @click="createForm.toolSource = 'stdio'"
                >
                  <div class="tool-option-top">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="16 3 21 3 21 8" />
                      <line x1="4" y1="20" x2="21" y2="3" />
                      <polyline points="21 16 21 21 16 21" />
                      <line x1="15" y1="15" x2="21" y2="21" />
                      <line x1="4" y1="4" x2="9" y2="9" />
                    </svg>
                    <div>
                      <div class="tool-option-title">运维 + agent 核心 <span class="recommend-tag">推荐</span></div>
                      <div class="tool-option-desc">功能最全面：系统观测、Docker、Nginx、防火墙、文件读写、Git 操作、命令执行</div>
                    </div>
                  </div>
                  <div class="tool-radio">
                    <div class="radio-circle" :class="{ checked: createForm.toolSource === 'stdio' }"></div>
                  </div>
                </label>
                <label
                  class="tool-option"
                  :class="{ active: createForm.toolSource === 'current_mcp' }"
                  @click="createForm.toolSource = 'current_mcp'"
                >
                  <div class="tool-option-top">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    <div>
                      <div class="tool-option-title">仅运维</div>
                      <div class="tool-option-desc">内置工具：系统观测、进程、Docker、Nginx、防火墙，不包含文件读写等 agent 核心能力</div>
                    </div>
                  </div>
                  <div class="tool-radio">
                    <div class="radio-circle" :class="{ checked: createForm.toolSource === 'current_mcp' }"></div>
                  </div>
                </label>
              </div>
            </div>

            <!-- 模型 -->
            <div class="create-field">
              <span class="create-label">对话模型</span>
              <select v-model="createForm.profileId" class="create-select">
                <option v-if="profilesLoading" value="" disabled>加载中…</option>
                <option v-for="p in profiles" :key="p.profileId" :value="p.profileId">
                  {{ p.name || p.model }} {{ p.isDefault ? '★ 默认' : '' }}
                </option>
              </select>
            </div>

            <!-- 运行模式 -->
            <div class="create-field">
              <span class="create-label">运行模式</span>
              <select v-model="createForm.mode" class="create-select">
                <option value="agent">标准 Agent — 低风险自动执行，中高风险需审批</option>
                <option value="read_only">只读 — 仅可查询诊断，禁止写入</option>
                <option value="plan">计划 — 生成方案但不执行，等待批准</option>
                <option value="break_glass">紧急 — 跳过审批，强制审计日志</option>
              </select>
            </div>

            <!-- 安全策略 -->
            <div class="create-field">
              <span class="create-label">安全策略</span>
              <select v-model="createForm.safetyPolicy" class="create-select">
                <option value="default">默认 — 平衡安全与可用性</option>
                <option value="strict">严格 — 用于生产/高风险环境</option>
              </select>
            </div>
          </div>

          <div class="create-actions">
            <button class="reject-btn" @click="showCreateDialog = false">取消</button>
            <button class="approve-btn" :disabled="createDialogLoading" @click="submitCreateDialog">
              {{ createDialogLoading ? '创建中…' : '创建会话' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ====== 计费面板弹窗（改动三：Token 计费） ====== -->
    <Transition name="fade">
      <div v-if="showBillingDialog" class="approval-overlay" @click.self="closeBillingDialog">
        <div class="billing-dialog" @click.stop>
          <div class="billing-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span>Token 用量与计费</span>
            <button class="billing-close-btn" @click="closeBillingDialog">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div v-if="billingLoading" class="billing-loading">加载中…</div>

          <template v-else>
            <!-- 汇总卡片 -->
            <div v-if="billingSummary" class="billing-summary">
              <div class="billing-summary-row">
                <div class="billing-summary-item">
                  <span class="billing-summary-label">总计 Tokens</span>
                  <span class="billing-summary-value">{{ billingSummary.totalTokens.toLocaleString() }}</span>
                </div>
                <div class="billing-summary-item">
                  <span class="billing-summary-label">总计费用</span>
                  <span class="billing-summary-value currency">¥{{ billingSummary.totalCost.toFixed(4) }}</span>
                </div>
                <div class="billing-summary-item">
                  <span class="billing-summary-label">调用次数</span>
                  <span class="billing-summary-value">{{ billingSummary.callCount }}</span>
                </div>
                <div class="billing-summary-item">
                  <span class="billing-summary-label">缓存命中率</span>
                  <span class="billing-summary-value cache-hit">{{ (billingSummary.totalCachedInputTokens / (billingSummary.totalCachedInputTokens + billingSummary.totalNonCachedInputTokens) * 100).toFixed(1) }}%</span>
                </div>
              </div>
              <div class="billing-summary-detail">
                <span>输入 {{ billingSummary.totalInputTokens.toLocaleString() }} tokens / ¥{{ billingSummary.totalInputCost.toFixed(4) }}</span>
                <span class="sep">·</span>
                <span>输出 {{ billingSummary.totalOutputTokens.toLocaleString() }} tokens / ¥{{ billingSummary.totalOutputCost.toFixed(4) }}</span>
              </div>
              <div class="billing-summary-detail cache-detail">
                <span class="cache-hit-label">缓存输入</span>
                <span>{{ billingSummary.totalCachedInputTokens.toLocaleString() }} tokens / ¥{{ billingSummary.totalCachedInputCost.toFixed(4) }}</span>
                <span class="sep">·</span>
                <span class="cache-miss-label">非缓存输入</span>
                <span>{{ billingSummary.totalNonCachedInputTokens.toLocaleString() }} tokens / ¥{{ billingSummary.totalNonCachedInputCost.toFixed(4) }}</span>
              </div>
            </div>

            <!-- 明细表格 -->
            <div class="billing-table-wrapper">
              <table v-if="tokenUsage.length > 0" class="billing-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>模型</th>
                    <th>输入</th>
                    <th>缓存</th>
                    <th>非缓存</th>
                    <th>缓存率</th>
                    <th>输出</th>
                    <th>总计</th>
                    <th>费用(¥)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in tokenUsage" :key="item.id">
                    <td>{{ new Date(item.createdAt).toLocaleTimeString() }}</td>
                    <td><code>{{ item.model }}</code></td>
                    <td>{{ item.inputTokens.toLocaleString() }}</td>
                    <td class="cache-cell">{{ item.cachedInputTokens.toLocaleString() }}</td>
                    <td class="cache-miss-cell">{{ item.nonCachedInputTokens.toLocaleString() }}</td>
                    <td class="cache-rate-cell">{{ (item.cachedInputTokens / (item.cachedInputTokens + item.nonCachedInputTokens) * 100).toFixed(1) }}%</td>
                    <td>{{ item.outputTokens.toLocaleString() }}</td>
                    <td><strong>{{ item.totalTokens.toLocaleString() }}</strong></td>
                    <td class="currency">{{ item.totalCost.toFixed(4) }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-else class="billing-empty">暂无 Token 用量记录</div>
            </div>
          </template>
        </div>
      </div>
    </Transition>

    <!-- ====== 审计时间线弹窗 ====== -->
    <Transition name="fade">
      <div v-if="traceDialogVisible" class="approval-overlay" @click.self="closeTraceDialog">
        <div class="trace-dialog" @click.stop>
          <div class="trace-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>审计时间线</span>
            <span class="trace-session-id">会话 {{ traceSessionId.slice(0, 19) }}…</span>
            <button class="trace-close-btn" @click="closeTraceDialog">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div v-if="traceDialogLoading" class="trace-loading">
            <div class="trace-loading-spinner"></div>
            <span>正在加载审计链…</span>
          </div>

          <template v-else>
            <!-- 摘要卡片 -->
            <div v-if="traceSummary" class="trace-summary">
              <div class="trace-summary-item">
                <span class="trace-summary-icon">📊</span>
                <span class="trace-summary-value">{{ traceSummary.totalEvents }}</span>
                <span class="trace-summary-label">事件总数</span>
              </div>
              <div class="trace-summary-item">
                <span class="trace-summary-icon">🔧</span>
                <span class="trace-summary-value">{{ traceSummary.toolCalls }}</span>
                <span class="trace-summary-label">工具调用</span>
              </div>
              <div class="trace-summary-item">
                <span class="trace-summary-icon">👤</span>
                <span class="trace-summary-value">{{ traceSummary.approvalCount }}</span>
                <span class="trace-summary-label">审批次数</span>
              </div>
              <div class="trace-summary-item" :class="{ danger: traceSummary.hasInjection }">
                <span class="trace-summary-icon">🚨</span>
                <span class="trace-summary-value">{{ traceSummary.hasInjection ? '是' : '否' }}</span>
                <span class="trace-summary-label">注入风险</span>
              </div>
            </div>

            <!-- 时间线主体 -->
            <div v-if="timelineItems.length > 0" class="timeline-body">
              <div class="timeline-scroll">
                <div class="timeline-rail">
                  <div
                    v-for="(evt, idx) in timelineItems"
                    :key="evt.id"
                    class="timeline-node"
                    :class="{
                      expanded: expandedTraceEventId === evt.id,
                      first: idx === 0,
                      last: idx === timelineItems.length - 1
                    }"
                  >
                    <!-- 时间线轴点 -->
                    <div class="timeline-dot" :class="'dot-' + getDotColor(evt.eventType)">
                      <span class="timeline-icon">{{ getStageIcon(evt.eventType) }}</span>
                    </div>

                    <!-- 连线 -->
                    <div v-if="idx < timelineItems.length - 1" class="timeline-line"></div>

                    <!-- 卡片 -->
                    <div class="timeline-card" @click="toggleTraceEvent(evt.id)">
                      <div class="timeline-card-header">
                        <span class="timeline-stage">{{ formatEventTypeName(evt.eventType) }}</span>
                        <span class="timeline-time">{{ formatTimestamp(evt.timestamp) }}</span>
                      </div>
                      <div class="timeline-card-meta">
                        <span class="timeline-trace-id">Trace: {{ evt.traceId }}</span>
                        <span class="timeline-event-type">{{ formatEventTypeName(evt.eventType) }}</span>
                      </div>

                      <!-- AI 推理理由高亮（无需展开即可查看） -->
                      <div
                        v-if="evt.data && (evt.eventType === 'safety.checked' || evt.eventType === 'approval.requested') && (evt.data as Record<string, unknown>).ai_reason"
                        class="trace-ai-reason"
                      >
                        <div class="trace-ai-header">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 2a4 4 0 0 1 4 4c0 2-2 3-4 5-2-2-4-3-4-5a4 4 0 0 1 4-4z"/>
                            <path d="M12 11v4"/>
                            <path d="M12 17v1"/>
                          </svg>
                          <span>AI 推理理由</span>
                        </div>
                        <div class="trace-ai-body">{{ (evt.data as Record<string, unknown>).ai_reason }}</div>
                      </div>

                      <!-- 展开详情 -->
                      <Transition name="slide">
                        <div v-if="expandedTraceEventId === evt.id" class="timeline-detail">
                          <pre class="timeline-json">{{ formatEventData(evt.data) }}</pre>
                        </div>
                      </Transition>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="trace-empty">该会话暂无审计记录。</div>
          </template>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* =========================================================
   AgentChat.vue — 仿 ChatGPT 风格的 Agent 对话页面
   ========================================================= */

.agent-page {
  display: flex;
  height: calc(100vh - 60px);
  background: var(--color-bg);
  overflow: hidden;
}

/* ==================== 会话侧栏 ==================== */

.session-sidebar {
  width: 300px;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  transition: width 0.25s ease, min-width 0.25s ease;
  position: relative;
}

.session-sidebar.collapsed {
  width: 60px;
  min-width: 60px;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 14px 12px;
  border-bottom: 1px solid var(--color-border);
}

.new-chat-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  border: 1px solid var(--color-border-solid);
  border-radius: 12px;
  background: var(--color-bg-surface);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.new-chat-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-ghost);
  color: var(--color-primary);
}



.collapse-sidebar-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-solid);
  border-radius: 12px;
  background: var(--color-bg-surface);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.18s ease;
  flex-shrink: 0;
}

.collapse-sidebar-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-source-filter {
  display: flex;
  gap: 6px;
  padding: 8px 10px 2px;
  flex-wrap: wrap;
}

.source-filter-btn {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg);
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.source-filter-btn:hover {
  color: var(--color-text);
  border-color: var(--color-primary);
}

.source-filter-btn.active {
  background: var(--color-primary-ghost);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.list-loading,
.list-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-muted);
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 10px 10px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}

.session-item:hover {
  background: var(--color-bg-hover);
}

.session-item.active {
  background: var(--color-bg-active);
}

.session-item.deleting {
  opacity: 0.5;
}

.session-item-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.session-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--color-bg-inset);
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.session-item.active .session-icon {
  background: var(--color-primary-ghost);
  color: var(--color-primary);
}

.session-info {
  min-width: 0;
  flex: 1;
}

.session-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-meta {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.unread-badge {
  color: var(--color-danger, #ef4444);
  font-size: 14px;
  margin-left: 4px;
  vertical-align: middle;
  animation: unread-pulse 2s ease-in-out infinite;
}

.source-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  vertical-align: 1px;
  white-space: nowrap;
}

.source-badge.source-scheduled {
  color: var(--color-info);
  background: var(--color-info-bg);
}

.source-badge.source-inspection {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

@keyframes unread-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}



/* 删除确认浮层 */
.delete-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  border-radius: 12px;
}

.delete-dialog {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 20px;
  margin: 16px;
  box-shadow: var(--shadow-lg);
}

.delete-dialog p {
  font-size: 14px;
  color: var(--color-text);
  margin-bottom: 16px;
  line-height: 1.6;
}

.delete-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.cancel-btn,
.danger-btn {
  min-height: 36px;
  border-radius: 10px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
  border: 1px solid var(--color-border-solid);
}

.cancel-btn {
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
}

.cancel-btn:hover {
  background: var(--color-bg-hover);
}

.danger-btn {
  background: var(--color-danger);
  color: #fff;
  border-color: var(--color-danger);
}

.danger-btn:hover {
  opacity: 0.85;
}

/* ==================== 主聊天区 ==================== */

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  transition: margin-left 0.25s ease;
}

/* ===== 顶部栏 ===== */

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  flex-shrink: 0;
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.chat-title {
  font-size: 18px;
  font-weight: 800;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ws-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}

.ws-status.connected {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.ws-status.connecting {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.ws-status.disconnected {
  color: var(--color-text-muted);
  background: var(--color-bg-inset);
}

.ws-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.chat-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.model-selector {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--color-border-solid);
  border-radius: 10px;
  background: var(--color-bg);
  color: var(--color-text-muted);
}

.model-selector select {
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 12px;
  font-weight: 600;
  outline: none;
  max-width: 180px;
  cursor: pointer;
}

.model-selector select option {
  background: var(--color-bg-elevated);
}

.header-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-solid);
  border-radius: 10px;
  background: var(--color-bg-surface);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.18s ease;
}

.header-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

/* ===== 工具来源选择器 ===== */

.tool-source-picker {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tool-source-picker svg {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.tool-source-picker select {
  border: 1px solid var(--color-border-solid);
  border-radius: 8px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  padding: 6px 24px 6px 8px;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  cursor: pointer;
  transition: border-color 0.18s ease;
}

.tool-source-picker select:hover {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.mcp-config-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-solid);
  border-radius: 8px;
  background: var(--color-bg-surface);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.18s ease;
}

.mcp-config-btn:hover,
.mcp-config-btn.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

/* ===== MCP Server 配置面板 ===== */

.mcp-config-panel {
  border-top: 1px solid var(--color-border);
  padding: 16px 24px;
  background: var(--color-bg-elevated);
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.mcp-config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
}

.add-mcp-btn {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--color-border-solid);
  border-radius: 8px;
  background: var(--color-bg-surface);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.add-mcp-btn:hover {
  background: var(--color-primary-ghost);
  border-color: var(--color-primary);
}

.mcp-empty-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 8px 0;
}

.mcp-server-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-surface);
}

.mcp-server-fields {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mcp-input {
  min-height: 32px;
  border: 1px solid var(--color-border-solid);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0 8px;
  font-size: 12px;
  outline: none;
  transition: border-color 0.18s ease;
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
}

.mcp-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-ghost);
}

.mcp-input.name { width: 160px; }
.mcp-input.cmd  { width: 120px; }
.mcp-input.arg  { width: 100px; }
.mcp-input.cwd  { width: 140px; }

.remove-mcp-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.18s ease;
}

.remove-mcp-btn:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

/* slide-down 过渡 */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: max-height 0.3s ease, opacity 0.25s ease;
  max-height: 500px;
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
}

/* ===== Agent 后台运行提示条 ===== */

.agent-busy-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  margin: 0 16px 8px;
  background: var(--color-warning-bg);
  color: var(--color-warning);
  border: 1px solid var(--color-warning);
  border-radius: 8px;
  font-size: 13px;
  flex-shrink: 0;
  animation: banner-pulse 3s ease-in-out infinite;
}

.agent-busy-banner svg {
  flex-shrink: 0;
  animation: spin 2s linear infinite;
}

@keyframes banner-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ===== 消息列表 ===== */

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.message-list::-webkit-scrollbar {
  width: 6px;
}

.message-list::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 3px;
}

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--color-text-muted);
}

.empty-icon {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 24px;
  background: var(--color-bg-inset);
  color: var(--color-text-faint);
  margin-bottom: 8px;
}

.empty-state h2 {
  font-size: 22px;
  font-weight: 800;
  color: var(--color-text);
  margin: 0;
}

.empty-state p {
  font-size: 14px;
  color: var(--color-text-muted);
  text-align: center;
  max-width: 320px;
  line-height: 1.6;
}

.empty-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.empty-actions .primary-btn,
.empty-actions .secondary-btn {
  min-height: 42px;
  border-radius: 12px;
  padding: 0 20px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.empty-actions .primary-btn {
  border: 1px solid var(--color-border-solid);
  color: var(--color-text);
  background: var(--color-bg-surface);
}

.empty-actions .primary-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-ghost);
  color: var(--color-primary);
}

.empty-actions .secondary-btn {
  border: 1px solid var(--color-border-solid);
  color: var(--color-text-secondary);
  background: var(--color-bg-surface);
}

.empty-actions .secondary-btn:hover {
  color: var(--color-text);
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.loading-msgs {
  padding: 40px;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-muted);
}

/* 消息行 */
.message-row {
  display: flex;
  gap: 14px;
  max-width: 820px;
}

.message-row.assistant {
  align-self: flex-start;
}

.message-row.user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message-avatar {
  flex-shrink: 0;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-avatar {
  background: var(--color-primary-ghost);
  color: var(--color-primary);
}

.assistant-avatar {
  background: var(--color-bg-inset);
  color: var(--color-text-secondary);
}

.message-body {
  min-width: 0;
  max-width: 720px;
}

.message-sender {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  margin-bottom: 6px;
  padding: 0 4px;
}

.message-bubble {
  padding: 14px 18px;
  border-radius: 16px;
  line-height: 1.7;
  font-size: 14px;
}

.user-bubble {
  background: var(--color-primary-ghost);
  border: 1px solid var(--color-primary-border);
  color: var(--color-text);
  border-bottom-right-radius: 4px;
}

.assistant-bubble {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-bottom-left-radius: 4px;
}

.message-text {
  word-break: break-word;
}

/* ===================================================
   Markdown 样式 (作用域在 .markdown-body 下)
   =================================================== */
.message-text.markdown-body {
  line-height: 1.75;
  font-size: 14px;
  color: var(--color-text);
}

.message-text.markdown-body :deep(p) {
  margin: 0.6em 0;
}

.message-text.markdown-body :deep(p:first-child) {
  margin-top: 0;
}

.message-text.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.message-text.markdown-body :deep(h1),
.message-text.markdown-body :deep(h2),
.message-text.markdown-body :deep(h3),
.message-text.markdown-body :deep(h4) {
  margin: 1em 0 0.5em;
  font-weight: 700;
  line-height: 1.4;
  color: var(--color-text);
}

.message-text.markdown-body :deep(h1) { font-size: 1.5em; }
.message-text.markdown-body :deep(h2) { font-size: 1.3em; }
.message-text.markdown-body :deep(h3) { font-size: 1.15em; }
.message-text.markdown-body :deep(h4) { font-size: 1.05em; }

.message-text.markdown-body :deep(strong) {
  font-weight: 700;
  color: var(--color-text);
}

.message-text.markdown-body :deep(em) {
  font-style: italic;
}

.message-text.markdown-body :deep(a) {
  color: var(--color-primary);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s ease;
}

.message-text.markdown-body :deep(a:hover) {
  border-bottom-color: var(--color-primary);
}

/* 行内代码 */
.message-text.markdown-body :deep(code):not(pre code) {
  font-family: 'IBM Plex Mono', 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 13px;
  background: var(--color-bg-inset);
  color: var(--color-text);
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  word-break: break-word;
}

/* 代码块 */
.message-text.markdown-body :deep(pre) {
  margin: 12px 0;
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.6;
}

.message-text.markdown-body :deep(pre code) {
  font-family: 'IBM Plex Mono', 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 13px;
  background: none;
  padding: 0;
  border: none;
  color: var(--color-text);
  tab-size: 2;
}

/* 列表 */
.message-text.markdown-body :deep(ul),
.message-text.markdown-body :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.6em;
}

.message-text.markdown-body :deep(li) {
  margin: 0.25em 0;
}

.message-text.markdown-body :deep(li > p) {
  margin: 0.2em 0;
}

/* 块引用 */
.message-text.markdown-body :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 14px;
  border-left: 3px solid var(--color-primary);
  background: var(--color-bg-hover);
  border-radius: 0 8px 8px 0;
  color: var(--color-text-secondary);
}

.message-text.markdown-body :deep(blockquote p) {
  margin: 0;
}

/* 水平分割线 */
.message-text.markdown-body :deep(hr) {
  margin: 20px 0;
  border: none;
  border-top: 1px solid var(--color-border);
}

/* 表格 */
.message-text.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 13px;
  overflow: hidden;
  border-radius: 10px;
}

.message-text.markdown-body :deep(th),
.message-text.markdown-body :deep(td) {
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  text-align: left;
}

.message-text.markdown-body :deep(th) {
  background: var(--color-bg-inset);
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.message-text.markdown-body :deep(td) {
  color: var(--color-text);
}

.message-text.markdown-body :deep(tr:nth-child(even)) {
  background: var(--color-bg-hover);
}

/* 图片 */
.message-text.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 10px;
  margin: 12px 0;
}

/* 任务列表 */
.message-text.markdown-body :deep(input[type="checkbox"]) {
  margin-right: 6px;
  accent-color: var(--color-primary);
}

/* KaTeX 数学公式 */
.message-text.markdown-body :deep(.katex) {
  font-size: 1.05em;
}

.message-text.markdown-body :deep(.katex-display) {
  margin: 16px 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 8px 0;
}

.message-text.markdown-body :deep(.katex-display > .katex) {
  font-size: 1.15em;
}

/* 流式内容闪烁光标 */
.streaming-cursor {
  display: inline;
}

.message-time {
  font-size: 11px;
  color: var(--color-text-faint);
  margin-top: 6px;
}

/* 消息操作按钮 */
.message-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  opacity: 0.35;
  transition: opacity 0.2s ease;
}

.message-bubble:hover .message-actions {
  opacity: 1;
}

.msg-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
  line-height: 1;
}

.msg-action-btn:hover {
  background: var(--color-bg-hover, rgba(128, 128, 128, 0.08));
  color: var(--color-text);
  border-color: var(--color-text-faint);
}

.msg-action-btn.delete-msg-btn:hover {
  color: var(--color-danger);
  border-color: var(--color-danger);
  background: var(--color-danger-bg);
}

.msg-action-btn.regenerating-btn {
  cursor: not-allowed;
  opacity: 0.6;
}

@keyframes spin-icon {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spin-icon {
  animation: spin-icon 1.2s linear infinite;
}

.danger-btn-style {
  background: var(--color-danger) !important;
  border-color: var(--color-danger) !important;
}

.danger-btn-style:hover {
  background: var(--color-danger-hover) !important;
}

/* 流式光标 */
.streaming-cursor {
  display: inline;
}

.thinking-dots {
  display: inline-flex;
  gap: 4px;
  padding: 4px 0;
}

.thinking-dots .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-text-muted);
  animation: thinking-bounce 1.2s ease-in-out infinite;
}

.thinking-dots .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.thinking-dots .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes thinking-bounce {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.cursor-blink {
  font-size: 16px;
  color: var(--color-primary);
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

/* ===== 工具调用卡片 ===== */

.tool-calls-section {
  margin-top: 12px;
  border-top: 1px solid var(--color-border);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tool-call-card {
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-inset);
  cursor: pointer;
  transition: border-color 0.18s ease;
  overflow: hidden;
}

.tool-call-card:hover {
  border-color: var(--color-primary-border);
}

.tool-call-card.success {
  border-left: 3px solid var(--color-success);
}

.tool-call-card.failed {
  border-left: 3px solid var(--color-danger);
}

.tool-call-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
}

.tool-call-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.tool-call-card.success .tool-call-icon {
  color: var(--color-success);
}

.tool-call-card.failed .tool-call-icon {
  color: var(--color-danger);
}

.tool-call-name {
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text);
  flex: 1;
}

.tool-call-status {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.tool-call-toggle {
  display: flex;
  align-items: center;
  color: var(--color-text-muted);
}

.tool-call-detail {
  border-top: 1px solid var(--color-border);
}

.tool-call-output {
  padding: 12px;
  margin: 0;
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 展开动画 */
.expand-enter-active {
  transition: max-height 0.25s ease, opacity 0.2s ease;
  max-height: 400px;
  opacity: 1;
}

.expand-leave-active {
  transition: max-height 0.2s ease, opacity 0.15s ease;
  max-height: 0;
  opacity: 0;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
}

/* ===== 输入区域 ===== */

.input-area {
  flex-shrink: 0;
  padding: 16px 24px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  max-width: 820px;
  margin: 0 auto;
  border: 1px solid var(--color-border-solid);
  border-radius: 16px;
  background: var(--color-bg);
  padding: 8px 8px 8px 16px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.input-wrapper:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.chat-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 14px;
  line-height: 1.6;
  outline: none;
  resize: none;
  min-height: 24px;
  max-height: 200px;
  font-family: inherit;
}

.chat-input::placeholder {
  color: var(--color-text-faint);
}

.chat-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.stop-btn,
.send-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  border-radius: 10px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
  border: none;
}

.send-btn {
  background: var(--color-primary);
  color: #fff;
}

.send-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.send-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.stop-btn {
  background: var(--color-danger-bg);
  color: var(--color-danger);
  border: 1px solid var(--color-danger-border);
}

.stop-btn:hover {
  background: var(--color-danger);
  color: #fff;
}

/* ===== 审批弹窗 ===== */

.approval-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.approval-dialog {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  width: 440px;
  max-width: 90vw;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.approval-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px;
  font-size: 16px;
  font-weight: 800;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.approval-body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.approval-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.field-value {
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.5;
}

.field-value code {
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
  font-size: 13px;
  font-weight: 600;
  background: var(--color-bg-inset);
  padding: 2px 8px;
  border-radius: 6px;
}

.field-json {
  margin: 0;
  padding: 12px;
  border-radius: 10px;
  background: var(--color-bg-inset);
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.6;
  max-height: 200px;
  overflow-y: auto;
  color: var(--color-text-secondary);
}

/* 拒绝理由输入 */
.approval-reject-section {
  padding: 0 20px 12px;
}

.approval-reject-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin-bottom: 6px;
}

.approval-reject-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-inset);
  color: var(--color-text);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  transition: border-color 0.15s ease;
  box-sizing: border-box;
}

.approval-reject-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

/* AI 意图说明（亮点） */
.approval-ai-section {
  padding: 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--color-primary-bg), rgba(99, 102, 241, 0.08));
  border: 1px solid rgba(99, 102, 241, 0.25);
}

.approval-ai-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 8px;
}

.approval-ai-body {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
}

.approval-actions {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border);
  justify-content: flex-end;
}

.approve-btn,
.reject-btn {
  min-height: 40px;
  padding: 0 20px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
  border: none;
}

.approve-btn {
  background: var(--color-success);
  color: #fff;
}

.approve-btn:hover {
  opacity: 0.85;
}

.reject-btn {
  background: var(--color-bg-inset);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border-solid);
}

.reject-btn:hover {
  background: var(--color-danger-bg);
  color: var(--color-danger);
  border-color: var(--color-danger-border);
}

/* ===== WS 重连恢复弹窗 ===== */

.resume-dialog {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  width: 480px;
  max-width: 90vw;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.resume-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px;
  font-size: 16px;
  font-weight: 800;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.resume-body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.resume-message {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-divider);
  margin-bottom: 4px;
}

.resume-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* AI 意图说明 */
.resume-ai-section {
  padding: 14px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--color-primary-bg), rgba(99, 102, 241, 0.08));
  border: 1px solid rgba(99, 102, 241, 0.25);
}

.resume-ai-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 8px;
}

.resume-ai-body {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
}

/* 上下文丢失提示 */
.resume-context-warning {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning-border);
  color: var(--color-warning);
  font-size: 13px;
  line-height: 1.5;
}

.resume-context-warning svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.resume-actions {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border);
  justify-content: flex-end;
}

/* ===== 计划审批弹窗 ===== */

.plan-dialog {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  width: 560px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.plan-timer {
  margin-left: auto;
  font-size: 13px;
  font-weight: 700;
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
  padding: 2px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
}

.plan-timer.urgent {
  background: var(--color-danger-bg);
  color: var(--color-danger);
  animation: pulse 1s ease-in-out infinite;
}

.plan-body {
  padding: 0 20px 10px;
}

.plan-section {
  padding: 14px 0;
  border-bottom: 1px solid var(--color-border);
}

.plan-section:last-child {
  border-bottom: none;
}

.plan-section-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin-bottom: 10px;
}

.plan-summary-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.5;
}

.plan-step-card {
  display: flex;
  gap: 12px;
  padding: 10px 12px;
  margin-bottom: 8px;
  border-radius: 12px;
  background: var(--color-bg-inset);
  transition: background 0.15s ease;
}

.plan-step-card:hover {
  background: var(--color-bg-hover);
}

.plan-step-number {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--color-primary-ghost);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 800;
  flex-shrink: 0;
  margin-top: 1px;
}

.plan-step-body {
  flex: 1;
  min-width: 0;
}

.plan-step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.plan-step-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
}

.plan-step-risk {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.plan-step-risk.risk-low {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.plan-step-risk.risk-medium {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.plan-step-risk.risk-high {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.plan-step-action {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.plan-step-meta {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.plan-step-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--color-bg-surface);
  color: var(--color-text-muted);
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
}

.plan-risks {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.plan-risk-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: var(--color-warning);
  line-height: 1.5;
}

.plan-risk-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.plan-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.plan-file-item code {
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 8px;
  background: var(--color-bg-inset);
  color: var(--color-text-secondary);
}

.plan-reason-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-inset);
  color: var(--color-text);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  transition: border-color 0.15s ease;
  box-sizing: border-box;
}

.plan-reason-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

/* ===== 选择题弹窗（新增） ===== */

.choice-dialog {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  width: 480px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.choice-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px 14px;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  background: var(--color-bg-surface);
  z-index: 1;
  border-radius: 20px 20px 0 0;
}

.choice-body {
  padding: 0 20px 20px;
}

.choice-question {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  padding: 16px 0;
  line-height: 1.5;
}

.choice-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.choice-option-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-inset);
  color: var(--color-text);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
  font-family: inherit;
  font-size: inherit;
  width: 100%;
}

.choice-option-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
}

.choice-option-btn.selected {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
  opacity: 0.7;
  cursor: default;
}

.choice-option-btn:disabled {
  cursor: default;
  opacity: 0.6;
}

.choice-option-id {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-solid);
  font-size: 12px;
  font-weight: 800;
  flex-shrink: 0;
  color: var(--color-text-secondary);
}

.choice-option-btn.selected .choice-option-id {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.choice-option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.choice-option-title {
  font-size: 14px;
  font-weight: 600;
}

.choice-option-summary {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.4;
}

.choice-custom-section {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border);
}

.choice-custom-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.choice-custom-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-inset);
  color: var(--color-text);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  transition: border-color 0.15s ease;
  box-sizing: border-box;
}

.choice-custom-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.choice-custom-submit {
  margin-top: 8px;
  padding: 8px 18px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
  font-family: inherit;
}

.choice-custom-submit:disabled {
  opacity: 0.5;
  cursor: default;
}

.choice-custom-submit:hover:not(:disabled) {
  opacity: 0.85;
}

.choice-waiting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
  padding: 12px;
  border-radius: 10px;
  background: var(--color-bg-inset);
  color: var(--color-text-muted);
  font-size: 13px;
}

.choice-waiting-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border-solid);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: choice-spin 0.8s linear infinite;
}

@keyframes choice-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ===== 模式指示器 ===== */

.mode-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px 3px 8px;
  border-radius: 8px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border-solid);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  position: relative;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.mode-indicator:hover {
  border-color: var(--color-primary);
}

.mode-indicator:hover .mode-switcher-dropdown {
  display: flex;
}

.mode-indicator.mode-agent {
  color: var(--color-primary);
}
.mode-indicator.mode-read_only {
  color: var(--color-text-muted);
}
.mode-indicator.mode-plan {
  color: var(--color-warning);
}
.mode-indicator.mode-break_glass {
  color: var(--color-danger);
}

.mode-icon {
  font-size: 14px;
}

.mode-name {
  font-size: 12px;
}

.mode-switcher-dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  width: 280px;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border-radius: 12px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  z-index: 100;
}

.mode-indicator:hover .mode-switcher-dropdown {
  display: flex;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  transition: background 0.12s ease;
  text-align: left;
  width: 100%;
}

.mode-option:hover {
  background: var(--color-bg-hover);
}

.mode-option.active {
  background: var(--color-primary-ghost);
}

.mode-option-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.mode-option-text {
  flex: 1;
  min-width: 0;
}

.mode-option-name {
  font-size: 13px;
  font-weight: 700;
}

.mode-option-desc {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 1px;
  line-height: 1.3;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* ===== 特权提权弹窗 ===== */

.elevation-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.elevation-dialog {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  width: 480px;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xl);
  animation: elevation-enter 0.2s ease;
}

@keyframes elevation-enter {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.elevation-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
  border-radius: 20px 20px 0 0;
}

.elevation-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  flex-shrink: 0;
}

.elevation-icon-pending {
  background: #fef3c7;
  color: #d97706;
}

.elevation-icon-approved {
  background: #d1fae5;
  color: #059669;
}

.elevation-icon-rejected {
  background: #fee2e2;
  color: #dc2626;
}

.elevation-icon-expired {
  background: #f3f4f6;
  color: #6b7280;
}

.elevation-close-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.12s ease;
  flex-shrink: 0;
}

.elevation-close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.elevation-body {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  flex: 1;
}

.elevation-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.elevation-field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.elevation-field-value {
  font-size: 14px;
  color: var(--color-text);
  line-height: 1.5;
}

.elevation-code-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.elevation-code-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border-solid);
  border-radius: 10px;
}

.elevation-code-text {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--color-primary);
  flex: 1;
  user-select: all;
}

.elevation-copy-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--color-border-solid);
  border-radius: 8px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.elevation-copy-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-bg);
}

.elevation-copy-btn.copied {
  border-color: var(--color-success, #059669);
  color: var(--color-success, #059669);
  background: #d1fae5;
}

.elevation-status-message {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  padding: 8px 0;
}

.elevation-commands-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.elevation-commands-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.elevation-command-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.elevation-command-index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: var(--color-bg-elevated);
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.elevation-command-text {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 13px;
  color: var(--color-text);
  word-break: break-all;
  line-height: 1.5;
}

.elevation-ssh-hint {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 10px;
  color: #92400e;
  font-size: 13px;
  line-height: 1.5;
  align-items: flex-start;
}

.elevation-ssh-hint svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: #d97706;
}

.elevation-ssh-hint strong {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
}

.elevation-ssh-command {
  display: block;
  margin-top: 6px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 6px;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  user-select: all;
}

.elevation-ssh-note {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: #b45309;
}

.elevation-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border);
  border-radius: 0 0 20px 20px;
}

.elevation-footer-hint {
  font-size: 13px;
  color: var(--color-text-muted);
}

.elevation-dismiss-btn {
  padding: 8px 18px;
  border: 1px solid var(--color-border-solid);
  border-radius: 10px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s ease;
}

.elevation-dismiss-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.elevation-ok-btn {
  margin-left: auto;
  padding: 8px 24px;
  border: none;
  border-radius: 10px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.12s ease;
}

.elevation-ok-btn:hover {
  opacity: 0.85;
}

/* ===== 自定义创建弹窗 ===== */

.create-dialog {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  width: 540px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.create-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px;
  font-size: 16px;
  font-weight: 800;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
}

.create-body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.create-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.create-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.create-input,
.create-select {
  width: 100%;
  min-height: 44px;
  border-radius: 12px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0 14px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.create-input:focus,
.create-select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.create-select {
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23999' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}

/* 工具来源卡片选项 */
.tool-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-bg-surface);
  cursor: pointer;
  transition: all 0.18s ease;
}

.tool-option:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.tool-option.active {
  border-color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.tool-option-top {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.tool-option-top svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--color-primary);
}

.tool-option-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 6px;
}

.recommend-tag {
  font-size: 10px;
  font-weight: 800;
  background: var(--color-primary);
  color: #fff;
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: 0.02em;
}

.tool-option-desc {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-muted);
}

.tool-radio {
  flex-shrink: 0;
}

.radio-circle {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--color-border-solid);
  transition: all 0.18s ease;
  position: relative;
}

.radio-circle.checked {
  border-color: var(--color-primary);
  background: var(--color-primary);
}

.radio-circle.checked::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
}

.create-actions {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid var(--color-border);
  justify-content: flex-end;
}

/* ===== 过渡动画 ===== */

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ===== 滚动锚点 ===== */
.scroll-anchor {
  height: 1px;
  flex-shrink: 0;
}

/* ===== Tool 角色消息样式（改动一） ===== */

.tool-avatar {
  background: var(--color-bg-inset);
  color: var(--color-warning);
}

.tool-bubble {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-warning-border);
  border-bottom-left-radius: 4px;
}

.tool-call-header.inline {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--color-warning);
  font-weight: 700;
}

.tool-call-id {
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
  font-size: 11px;
  color: var(--color-text-faint);
  font-weight: 400;
}

.tool-result-output {
  margin: 0;
  padding: 0;
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  background: transparent;
  border: none;
  max-height: 300px;
  overflow-y: auto;
}

.tool-result-output code {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  background: transparent;
  padding: 0;
}

/* ===== 计费面板样式（改动三） ===== */

.billing-dialog {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  width: 680px;
  max-width: 92vw;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
}

.billing-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px;
  font-size: 16px;
  font-weight: 800;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
}

.billing-close-btn {
  margin-left: auto;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-solid);
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.18s ease;
}

.billing-close-btn:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.billing-loading {
  padding: 40px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 14px;
}

.billing-summary {
  padding: 20px;
  border-bottom: 1px solid var(--color-border);
}

.billing-summary-row {
  display: flex;
  gap: 20px;
}

.billing-summary-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-bg-surface);
}

.billing-summary-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.billing-summary-value {
  font-size: 22px;
  font-weight: 800;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.billing-summary-value.currency {
  color: var(--color-primary);
}

.billing-summary-detail {
  margin-top: 12px;
  font-size: 12px;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: 6px;
}

.billing-summary-detail .sep {
  color: var(--color-text-faint);
}

.billing-table-wrapper {
  padding: 0 20px 20px;
  overflow-x: auto;
}

.billing-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 16px;
  font-size: 13px;
}

.billing-table th,
.billing-table td {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  text-align: right;
  white-space: nowrap;
}

.billing-table th {
  background: var(--color-bg-inset);
  text-align: right;
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.billing-table th:first-child,
.billing-table td:first-child {
  text-align: left;
}

.billing-table td {
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

.billing-table td code {
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
  font-size: 12px;
  background: var(--color-bg-inset);
  padding: 1px 6px;
  border-radius: 4px;
}

.billing-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.billing-table td.currency {
  color: var(--color-primary);
  font-weight: 700;
}

.billing-empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 14px;
}

/* ===== 缓存命中率样式 ===== */

.billing-summary-value.cache-hit {
  color: var(--color-success);
}

.cache-detail {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.cache-hit-label {
  color: var(--color-success);
  font-weight: 600;
}

.cache-miss-label {
  color: var(--color-warning);
  font-weight: 600;
}

.billing-table td.cache-cell {
  color: var(--color-success);
  font-weight: 600;
}

.billing-table td.cache-miss-cell {
  color: var(--color-warning);
}

.billing-table td.cache-rate-cell {
  font-weight: 700;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

/* ===== 审计时间线弹窗 ===== */

.trace-dialog {
  width: min(720px, calc(100vw - 48px));
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.trace-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--color-divider);
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
  flex-shrink: 0;
}

.trace-header svg {
  color: var(--color-primary);
}

.trace-session-id {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-muted);
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
}

.trace-close-btn {
  margin-left: auto;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
  flex-shrink: 0;
}

.trace-close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.trace-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 60px 20px;
  color: var(--color-text-muted);
  font-size: 14px;
}

.trace-loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-divider);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: trace-spin 0.7s linear infinite;
}

@keyframes trace-spin {
  to { transform: rotate(360deg); }
}

/* 摘要卡片 */
.trace-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--color-divider);
  background: var(--color-bg-elevated);
  flex-shrink: 0;
}

.trace-summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px;
  border-radius: 14px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-solid);
}

.trace-summary-item.danger {
  border-color: rgba(239, 68, 68, 0.3);
  background: var(--color-danger-bg);
}

.trace-summary-icon {
  font-size: 20px;
  line-height: 1;
}

.trace-summary-value {
  font-size: 22px;
  font-weight: 800;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.trace-summary-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.trace-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--color-text-muted);
  font-size: 14px;
}

/* 时间线主体 */
.timeline-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 22px;
}

.timeline-scroll {
  min-height: 100%;
}

.timeline-rail {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* 节点 */
.timeline-node {
  position: relative;
  display: flex;
  align-items: flex-start;
  padding-left: 42px;
  padding-bottom: 6px;
}

/* 圆点 */
.timeline-dot {
  position: absolute;
  left: 0;
  top: 4px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  box-shadow: 0 0 0 4px var(--color-bg-surface);
  font-size: 14px;
}

.timeline-dot.dot-blue    { background: rgba(59, 130, 246, 0.18); }
.timeline-dot.dot-purple  { background: rgba(139, 92, 246, 0.18); }
.timeline-dot.dot-amber   { background: rgba(245, 158, 11, 0.18); }
.timeline-dot.dot-orange  { background: rgba(249, 115, 22, 0.18); }
.timeline-dot.dot-green   { background: rgba(34, 197, 94, 0.18); }
.timeline-dot.dot-red     { background: rgba(239, 68, 68, 0.18); }
.timeline-dot.dot-emerald { background: rgba(16, 185, 129, 0.18); }
.timeline-dot.dot-indigo  { background: rgba(99, 102, 241, 0.18); }
.timeline-dot.dot-cyan    { background: rgba(6, 182, 212, 0.18); }
.timeline-dot.dot-gray    { background: rgba(148, 163, 184, 0.18); }

.timeline-icon {
  line-height: 1;
}

/* 连线 */
.timeline-line {
  position: absolute;
  left: 15px;
  top: 36px;
  bottom: -6px;
  width: 2px;
  background: var(--color-divider);
  z-index: 1;
}

.timeline-node.last .timeline-line {
  display: none;
}

/* 卡片 */
.timeline-card {
  flex: 1;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  cursor: pointer;
  transition: all 0.18s ease;
  margin-bottom: 8px;
}

.timeline-card:hover {
  border-color: var(--color-primary-light);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.timeline-node.expanded .timeline-card {
  border-color: var(--color-primary);
  background: var(--color-bg-elevated);
}

.timeline-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.timeline-stage {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
}

.timeline-time {
  font-size: 12px;
  color: var(--color-text-muted);
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.timeline-card-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 6px;
}

.timeline-trace-id {
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
}

.timeline-event-type {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-bg-inset);
  color: var(--color-text-secondary);
}

/* 展开详情 */
.timeline-detail {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-divider);
}

.timeline-json {
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text);
  background: var(--color-bg-inset);
  border: 1px solid var(--color-divider);
  border-radius: 10px;
  padding: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
}

/* Trace AI 推理理由高亮 */
.trace-ai-reason {
  margin-bottom: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.10), rgba(139, 92, 246, 0.06));
  border: 1px solid rgba(99, 102, 241, 0.20);
}

.trace-ai-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
  margin-bottom: 6px;
}

.trace-ai-body {
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
}

/* 展开动画 */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
}

/* Header audit button */
.header-audit-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: 1px solid var(--color-border-solid);
  border-radius: 10px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: 8px;
}

.header-audit-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.header-audit-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.header-new-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: 1px solid var(--color-border-solid);
  border-radius: 10px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: 6px;
}

.header-new-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.session-delete-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.session-item:hover .session-delete-btn {
  opacity: 1;
}

.session-delete-btn:hover {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

/* ===== 响应式 ===== */

@media (max-width: 1024px) {
  .session-sidebar {
    width: 240px;
    min-width: 240px;
  }
}

@media (max-width: 768px) {
  .session-sidebar {
    width: 60px;
    min-width: 60px;
  }

  .session-sidebar .session-info {
    display: none;
  }

  .chat-header {
    padding: 12px 16px;
  }

  .message-list {
    padding: 16px;
  }

  .input-area {
    padding: 12px 16px 16px;
  }

  .message-row {
    max-width: 100%;
  }
}
</style>
