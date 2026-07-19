export type ScheduledTaskStatus = 'active' | 'paused' | 'deleted' | 'pending_approval'
export type BackgroundRunStatus = 'running' | 'success' | 'error'
export type ScheduledTaskApprovalStatus = 'pending' | 'approved' | 'rejected' | string
export type InspectionFindingLevel = 'info' | 'warning' | 'error' | string

export interface TokenUsageSummary {
  sessionId: string
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  callCount: number
}

export interface ScheduledTask {
  id: number
  name: string
  cronExpression: string
  taskDescription: string
  status: ScheduledTaskStatus
  createdBy: number
  approvalPolicy: ScheduledTaskApprovalPolicy | null
  approvalCode: string | null
  approvalStatus: ScheduledTaskApprovalStatus | null
  approvalApprovedAt: string | null
  approvalApprovedBy: string | null
  approvalTokenId: string | null
  approvalRejectedReason: string | null
  nextRunAt: string | null
  lastRunAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ScheduledTaskListData {
  total: number
  items: ScheduledTask[]
}

export interface ScheduledTaskCreateRequest {
  name: string
  cronExpression: string
  taskDescription: string
  approvalPolicy?: ScheduledTaskApprovalPolicy
}

export interface ScheduledTaskUpdateRequest {
  name?: string
  cronExpression?: string
  taskDescription?: string
  approvalPolicy?: ScheduledTaskApprovalPolicy | null
}

export interface ScheduledTaskApprovalPolicy {
  allowedTools?: string[]
  allowedPaths?: string[]
  deniedPaths?: string[]
  allowedPrivilegedCommands?: string[]
  ttlSeconds?: number
  maxRuns?: number
}

export interface ScheduledTaskApprovalDetail {
  taskId?: number
  approvalPolicy: ScheduledTaskApprovalPolicy | null
  approvalCode: string | null
  approvalStatus: ScheduledTaskApprovalStatus | null
  approvalApprovedAt: string | null
  approvalApprovedBy: string | null
  approvalTokenId: string | null
  approvalRejectedReason: string | null
}

export interface ScheduledTaskRun {
  id: number
  taskId: number
  sessionId: string | null
  status: BackgroundRunStatus
  startedAt: string | null
  finishedAt: string | null
  resultSummary: string | null
  errorMessage: string | null
  tokenUsage: TokenUsageSummary | null
}

export interface ScheduledTaskRunListData {
  total: number
  items: ScheduledTaskRun[]
}

export interface InspectionFinding {
  level: InspectionFindingLevel
  title: string
  detail: string
}

export interface InspectionReport {
  id: number
  sessionId: string | null
  status: BackgroundRunStatus
  summary: string | null
  findings: InspectionFinding[]
  fullReport: string | null
  durationMs: number | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface InspectionReportListData {
  total: number
  items: InspectionReport[]
}

export interface InspectionConfig {
  inspectionIntervalMinutes: number
  inspectionDocPath: string
  timezone: string
  schedulerStarted: boolean
}

export interface InspectionConfigUpdateRequest {
  intervalMinutes: number
}
