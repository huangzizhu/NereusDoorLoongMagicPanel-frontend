import request from '../utils/request'
import type { ApiResponse } from '../types/config'
import type {
  AgentSession,
  AgentSessionListData,
  AgentSessionCreateRequest,
  AgentMessageListData,
  TraceListData,
  TimelineData,
  SessionTraceSummary,
  TokenUsageItem,
  BillingSummary,
  ToolSourceSwitchRequest,
  ToolSourceSwitchResponse,
  SwitchModelRequest,
  SwitchModelResponse,
} from '../types/agent'

/* ========== 会话 CRUD ========== */

export function getAgentSessions(params?: { page?: number; pageSize?: number; status?: string; keyword?: string }) {
  return request.get<ApiResponse<AgentSessionListData>>('/agent/sessions', { params })
}

export function createAgentSession(data: AgentSessionCreateRequest) {
  return request.post<ApiResponse<AgentSession>>('/agent/sessions', data)
}

export function getAgentSession(sessionId: string) {
  return request.get<ApiResponse<AgentSession>>(`/agent/sessions/${sessionId}`)
}

export function deleteAgentSession(sessionId: string) {
  return request.delete<ApiResponse<null>>(`/agent/sessions/${sessionId}`)
}

/** 标记 completed_unread 会话为已读，恢复为 idle */
export function markSessionRead(sessionId: string) {
  return request.put<ApiResponse<AgentSession>>(`/agent/sessions/${sessionId}/mark-read`)
}

/* ========== 消息历史 ========== */

export function getAgentMessages(sessionId: string) {
  return request.get<ApiResponse<AgentMessageListData>>(`/agent/sessions/${sessionId}/messages`)
}

/* ========== Trace & Timeline ========== */

export function queryTraces(params?: { sessionId?: string; traceId?: string; eventType?: string; limit?: number }) {
  return request.get<ApiResponse<TraceListData>>('/agent/traces', { params })
}

export function getSessionTimeline(sessionId: string, limit?: number) {
  return request.get<ApiResponse<TimelineData>>(`/agent/traces/${sessionId}/timeline`, {
    params: { limit },
  })
}

export function getSessionTraceSummary(sessionId: string) {
  return request.get<ApiResponse<SessionTraceSummary>>(`/agent/traces/${sessionId}/summary`)
}

/* ========== Token 计费（改动三） ========== */

export function getAgentUsage(sessionId: string) {
  return request.get<ApiResponse<TokenUsageItem[]>>(`/agent/sessions/${sessionId}/usage`)
}

export function getAgentBilling(sessionId: string) {
  return request.get<ApiResponse<BillingSummary>>(`/agent/sessions/${sessionId}/billing`)
}

/* ========== 工具来源切换（改动四） ========== */

export function switchToolSource(sessionId: string, data: ToolSourceSwitchRequest) {
  return request.put<ApiResponse<ToolSourceSwitchResponse>>(`/agent/sessions/${sessionId}/tool-source`, data)
}

/* ========== 模型切换（改动五） ========== */

export function switchModel(sessionId: string, data: SwitchModelRequest) {
  return request.put<ApiResponse<SwitchModelResponse>>(`/agent/sessions/${sessionId}/switch-model`, data)
}

/* ========== WebSocket 连接地址构建 ========== */

export function buildWsUrl(sessionId?: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  const base = `${protocol}//${host}/api`
  if (sessionId) {
    return `${base}/agent/ws?sessionId=${encodeURIComponent(sessionId)}`
  }
  return `${base}/agent/ws`
}
