/* ========== Agent 会话 ========== */

export type AgentSessionStatus = 'idle' | 'running' | 'waiting_approval' | 'waiting_plan' | 'waiting_choice' | 'completed' | 'completed_unread' | 'cancelled' | 'error'
export type AgentMode = 'agent' | 'read_only' | 'plan' | 'break_glass'
export type ToolSource = 'current_mcp' | 'stdio'

export interface McpServerSpec {
  name: string
  command: string[]
  cwd?: string
}

export interface AgentSession {
  sessionId: string
  title: string
  mode: AgentMode
  status: AgentSessionStatus
  /** 会话来源：manual / scheduled / inspection（调度触发的巡检会话对登录用户可见） */
  source?: 'manual' | 'scheduled' | 'inspection' | string
  profileId: number | null
  toolSource: ToolSource
  safetyPolicy: string
  summary: string | null
  lastError: string | null
  mcpServers?: McpServerSpec[]
  createdAt: string
  updatedAt: string
  finishedAt: string | null
}

export interface AgentSessionListData {
  total: number
  items: AgentSession[]
}

/** GET /agent/status 返回的首页状态摘要。 */
export interface AgentStatusItem {
  sessionId: string
  title: string
  status: string
  source: string | null
  summary: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
  finishedAt: string | null
}

export interface AgentStatusListData {
  total: number
  items: AgentStatusItem[]
}

export interface AgentSessionCreateRequest {
  title?: string
  mode?: AgentMode
  profileId?: number
  toolSource?: ToolSource
  safetyPolicy?: string
  mcpServers?: McpServerSpec[]
}

/* ========== 消息历史 ========== */

export type AgentMessageRole = 'user' | 'assistant' | 'tool'

export interface AgentMessage {
  messageId: number
  sessionId: string
  role: AgentMessageRole
  content: string | null
  traceId: string | null
  roundIndex: number
  metadata: Record<string, unknown> | null
  toolCallId: string | null
  createdAt: string
}

export interface AgentMessageListData {
  total: number
  items: AgentMessage[]
}

/* ========== Trace 事件 ========== */

export type TraceEventType =
  | 'input.received'
  | 'llm.request'
  | 'llm.response'
  | 'safety.check'
  | 'approval.requested'
  | 'approval.resolved'
  | 'elevation.requested'
  | 'elevation.resolved'
  | 'title.updated'
  | 'tool.result'
  | 'injection.detected'
  | 'session.done'
  | 'thinking.start'
  | 'thinking.delta'
  | 'thinking.end'
  | 'text.delta'
  | 'text.done'
  | 'done'
  | string

export interface TraceEvent {
  id: number
  traceId: string
  sessionId: string
  eventType: TraceEventType
  timestamp: number
  data: Record<string, unknown>
  entryHash: string | null
  prevHash: string | null
  createdAt: string
  stage?: string
}

export interface TraceListData {
  total: number
  items: TraceEvent[]
}

export interface SessionTraceSummary {
  sessionId: string
  totalEvents: number
  toolCalls: number
  approvalCount: number
  hasInjection: boolean
  traces: string[]
}

export interface TimelineEvent {
  id: number
  traceId: string
  sessionId: string
  eventType: TraceEventType
  stage: string
  timestamp: number
  data: Record<string, unknown>
}

export interface TimelineData {
  total: number
  items: TimelineEvent[]
}

/* ========== WebSocket 事件 ========== */

export interface WsAgentReady {
  type: 'agent.ready'
  sessionId: string
  traceId: string | null
  timestamp: number
  data: {
    sessionId: string
    agentRunning: boolean
    status: string
  }
}

export interface WsSessionCreated {
  type: 'session.created'
  sessionId: string
  traceId: string | null
  timestamp: number
  data: { session: AgentSession }
}

export interface WsThinkingStart {
  type: 'thinking.start'
  sessionId: string
  traceId: string
  timestamp: number
  data: { round: number }
}

export interface WsThinkingDelta {
  type: 'thinking.delta'
  sessionId: string
  traceId: string
  timestamp: number
  data: { content: string }
}

export interface WsThinkingEnd {
  type: 'thinking.end'
  sessionId: string
  traceId: string
  timestamp: number
  data: { duration?: number }
}

export interface WsTextDelta {
  type: 'text.delta'
  sessionId: string
  traceId: string
  timestamp: number
  data: { content: string }
}

export interface WsTextDone {
  type: 'text.done'
  sessionId: string
  traceId: string
  timestamp: number
  data: Record<string, never>
}

export interface WsToolResult {
  type: 'tool.result'
  sessionId: string
  traceId: string
  timestamp: number
  data: {
    call_id: string
    tool_name: string
    success: boolean
    output: string
  }
}

export interface WsApprovalRequired {
  type: 'approval.required'
  sessionId: string
  traceId: string
  timestamp: number
  data: {
    tool_name: string
    arguments: Record<string, unknown>
    action_id: string
    reason: string
    ai_reason?: string
  }
}

export interface WsApprovalResolved {
  type: 'approval.resolved'
  sessionId: string
  traceId: string
  timestamp: number
  data: {
    action_id: string
    approved: boolean
    reason: string
  }
}

export interface WsApprovalResume {
  type: 'approval.resume'
  sessionId: string
  traceId: string | null
  timestamp: number
  data: {
    message: string
    approval: {
      action_id: string
      tool_name: string
      arguments: Record<string, unknown>
      reason: string
      ai_reason: string
    }
  }
}

/* ========== 特权提权事件 ========== */

export interface ElevationCommand {
  command: string
  args: string[]
}

export interface WsElevationRequested {
  type: 'elevation.requested'
  sessionId: string
  traceId: string | null
  timestamp: number
  data: {
    code: string
    commands: ElevationCommand[]
    reason: string
    ttl_seconds: number
    max_ops: number
    message: string
  }
}

export interface WsElevationResolved {
  type: 'elevation.resolved'
  sessionId: string
  traceId: string | null
  timestamp: number
  data: {
    status: 'approved' | 'rejected' | 'expired'
    code: string
    token_id?: string
    message: string
  }
}

/* ========== 新增 WS 事件（改动二/六） ========== */

export interface WsToolCalling {
  type: 'tool.calling'
  sessionId: string
  traceId: string
  timestamp: number
  data: {
    tool_calls: Array<{
      id: string
      type: string
      function: {
        name: string
        arguments: string
      }
    }>
    usage?: {
      prompt_tokens: number
      completion_tokens: number
      total_tokens: number
    }
  }
}

export interface WsTitleUpdated {
  type: 'title.updated'
  sessionId: string
  traceId: string | null
  timestamp: number
  data: {
    title: string
  }
}

export interface WsAgentQueued {
  type: 'agent.queued'
  sessionId: string
  traceId: string | null
  timestamp: number
  data: {
    message: string
  }
}

export interface WsSafetyChecked {
  type: 'safety.checked'
  sessionId: string
  traceId: string
  timestamp: number
  data: Record<string, unknown>
}

export interface WsSessionUpdated {
  type: 'session.updated'
  sessionId: string
  traceId: string | null
  timestamp: number
  data: {
    session: AgentSession
  }
}

export interface WsDone {
  type: 'done'
  sessionId: string
  traceId: string | null
  timestamp: number
  data: { reason?: string }
}

export interface WsAgentBusy {
  type: 'agent.busy'
  sessionId: string
  traceId: string | null
  timestamp: number
  data: { message: string }
}

export interface WsError {
  type: 'error'
  sessionId: string
  traceId: string | null
  timestamp: number
  data: { message: string; code?: string }
}

export interface WsPong {
  type: 'pong'
  sessionId: string
  traceId: string | null
  timestamp: number
  data: {
    agentRunning: boolean
    status: string
  }
}

/* ========== 消息删除 / 重新生成事件 ========== */

export interface WsMessagesDeleted {
  type: 'messages.deleted'
  sessionId: string
  traceId: string | null
  timestamp: number
  data: {
    messageId: number
    deletedCount: number
  }
}

/* ========== Plan 事件 ========== */

export interface WsPlanStep {
  step_id: string
  title: string
  action: string
  tool?: string | null
  target?: string | null
  risk: string
}

export interface WsAgentPlan {
  summary: string
  steps: WsPlanStep[]
  risks: string[]
  files: string[]
}

export interface WsPlanProposed {
  type: 'plan.proposed'
  sessionId: string
  traceId: string
  timestamp: number
  data: { plan: WsAgentPlan }
}

export interface WsPlanApproved {
  type: 'plan.approved'
  sessionId: string
  traceId: string
  timestamp: number
  data: { plan: WsAgentPlan }
}

export interface WsPlanRejected {
  type: 'plan.rejected'
  sessionId: string
  traceId: string
  timestamp: number
  data: { reason: string }
}

export interface WsModeChanged {
  type: 'mode_changed'
  sessionId: string
  traceId: string | null
  timestamp: number
  data: { mode: string }
}

/* ========== Choice 事件（新增） ========== */

export interface ChoiceOption {
  id: string
  title: string
  summary?: string
}

export interface WsChoiceRequired {
  type: 'choice.required'
  sessionId: string
  traceId: string
  timestamp: number
  data: {
    question: string
    options: ChoiceOption[]
    allow_custom: boolean
    action_id: string
  }
}

export interface WsChoiceResolved {
  type: 'choice.resolved'
  sessionId: string
  traceId: string
  timestamp: number
  data: {
    action_id: string
    selection_id: string
    custom_input: string
  }
}

export interface WsChoiceResume {
  type: 'choice.resume'
  sessionId: string
  traceId: string | null
  timestamp: number
  data: {
    message: string
    choice: {
      action_id: string
      question: string
      options: ChoiceOption[]
      allow_custom: boolean
      call_id: string
    }
  }
}

export type WsServerEvent =
  | WsAgentReady
  | WsSessionCreated
  | WsThinkingStart
  | WsThinkingDelta
  | WsThinkingEnd
  | WsTextDelta
  | WsTextDone
  | WsToolCalling
  | WsTitleUpdated
  | WsSafetyChecked
  | WsToolResult
  | WsApprovalRequired
  | WsApprovalResume
  | WsApprovalResolved
  | WsElevationRequested
  | WsElevationResolved
  | WsPlanProposed
  | WsPlanApproved
  | WsPlanRejected
  | WsModeChanged
  | WsChoiceRequired
  | WsChoiceResolved
  | WsChoiceResume
  | WsSessionUpdated
  | WsAgentQueued
  | WsMessagesDeleted
  | WsAgentBusy
  | WsDone
  | WsError
  | WsPong

/* ========== 客户端 WebSocket 消息 ========== */

export interface WsUserMessage {
  type: 'user_message'
  message: string
}

export interface WsApproval {
  type: 'approval'
  actionId: string
  approved: boolean
  reason?: string
}

export interface WsCancel {
  type: 'cancel'
}

export interface WsPing {
  type: 'ping'
}

export interface WsPlanMessage {
  type: 'plan'
  sessionId: string
  approved: boolean
  reason?: string
}

export interface WsSwitchModeMessage {
  type: 'switch_mode'
  sessionId: string
  mode: string
}

export interface WsChoiceMessage {
  type: 'choice'
  actionId: string
  selectionId: string
  customInput?: string
}

/* ========== 重新生成 / 消息删除 ========== */

export interface WsRegenerate {
  type: 'regenerate'
  message?: string
}

export interface WsDeleteMessage {
  type: 'deleteMessage'
  messageId: number
}

export type WsClientMessage = WsUserMessage | WsApproval | WsPlanMessage | WsSwitchModeMessage | WsChoiceMessage | WsCancel | WsPing | WsRegenerate | WsDeleteMessage

/* ========== Token 计费（改动三） ========== */

export interface TokenUsageItem {
  id: number
  sessionId: string
  model: string
  inputTokens: number
  cachedInputTokens: number
  nonCachedInputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputCost: number
  nonCachedInputCost: number
  inputCost: number
  outputCost: number
  totalCost: number
  createdAt: string
}

export type TokenUsageListData = TokenUsageItem[]

export interface BillingSummary {
  sessionId: string
  totalInputTokens: number
  totalCachedInputTokens: number
  totalNonCachedInputTokens: number
  totalOutputTokens: number
  totalCachedInputCost: number
  totalNonCachedInputCost: number
  totalInputCost: number
  totalOutputCost: number
  totalCost: number
  callCount: number
}

/* ========== 工具来源/模型切换请求（改动四/五） ========== */

export interface ToolSourceSwitchRequest {
  toolSource: ToolSource
  mcpServers?: McpServerSpec[]
}

export interface ToolSourceSwitchResponse {
  sessionId: string
  toolSource: ToolSource
  mcpServers: McpServerSpec[]
  updatedAt: string
}

export interface SwitchModelRequest {
  profileId: number
}

export interface SwitchModelResponse {
  sessionId: string
  profileId: number
  updatedAt: string
}

/* ========== 前端展示模型 ========== */

export interface ChatMessage {
  id: string
  messageId: number       // from backend AgentMessage.messageId
  roundIndex: number      // from backend AgentMessage.roundIndex
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: number
  isStreaming?: boolean
  toolCalls?: ToolCallDisplay[]
  toolCallId?: string
  toolName?: string
}

export interface ToolCallDisplay {
  callId: string
  toolName: string
  success: boolean
  output: string
  expanded: boolean
  timestamp: number
}
