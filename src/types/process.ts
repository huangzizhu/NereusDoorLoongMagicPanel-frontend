export const PROCESS_SORT_BY = {
  CPU: 0,
  MEMORY: 1,
  PID: 2,
} as const

export type ProcessSortBy = typeof PROCESS_SORT_BY[keyof typeof PROCESS_SORT_BY]

export interface ProcessPortInfo {
  listenAddress: string
  protocol: string
  port: number
}

export interface ProcessInfo {
  pid: number
  processName: string
  userName: string
  cpuPercent: number
  memoryPercent: number
  status: string
  command: string
  ports: ProcessPortInfo[] | null
}

export interface ProcessDetail extends ProcessInfo {
  parentPid: number
  startTime: string
  exePath: string
  threadCount: number
  fdCount: number
  workDir: string
  rss: number
  vms: number
}

export interface ProcessActionResult {
  success: boolean
  pid: number
  errorMessage: string | null
}

export interface ProcessBatchActionResult {
  results: ProcessActionResult[]
  totalRequested: number
  totalSuccess: number
  totalFailed: number
}

export interface ProcessAutoCleanRequest {
  cpuThreshold?: number
  memoryThreshold?: number
}

export interface ProcessAutoCleanResult {
  killedProcesses: number[]
  totalScanned: number
  totalKilled: number
}

export interface ProcessLogItem {
  operationType: string
  targetPids: string
  operator: string
  reason: string
  result: string
  detail: string | null
  logId: number
  createTime: string
}

export interface ProcessLogPage {
  total: number
  items: ProcessLogItem[]
}

export interface ProcessSseQuery {
  sortedBy?: ProcessSortBy
  keyword?: string
}

export type ProcessZombieData = ProcessInfo[]
