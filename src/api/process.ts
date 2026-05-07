import request from '../utils/request'
import type { ApiResponse } from '../types/user'
import { PROCESS_SORT_BY, type ProcessActionResult, type ProcessAutoCleanRequest, type ProcessAutoCleanResult, type ProcessBatchActionResult, type ProcessDetail, type ProcessLogPage, type ProcessSseQuery, type ProcessZombieData } from '../types/process'

export function createProcessSseUrl(query: ProcessSseQuery = {}) {
  const params = new URLSearchParams()
  const sortedBy = query.sortedBy ?? PROCESS_SORT_BY.CPU

  params.set('sortedBy', String(sortedBy))
  if (query.keyword?.trim()) {
    params.set('keyword', query.keyword.trim())
  }

  return `/api/process/sse/?${params.toString()}`
}

export function killProcess(pid: number, reason?: string) {
  return request.delete<ApiResponse<ProcessActionResult>>('/process/kill', {
    data: { pid, reason },
  })
}

export function forceKillProcess(pid: number, reason?: string) {
  return request.delete<ApiResponse<ProcessActionResult>>('/process/force-kill', {
    data: { pid, reason },
  })
}

export function batchKillProcess(pids: number[], reason?: string) {
  return request.delete<ApiResponse<ProcessBatchActionResult>>('/process/batch-kill', {
    data: { pids, reason },
  })
}

export function batchForceKillProcess(pids: number[], reason?: string) {
  return request.delete<ApiResponse<ProcessBatchActionResult>>('/process/batch-force-kill', {
    data: { pids, reason },
  })
}

export function getProcessDetail(pid: number) {
  return request.get<ApiResponse<ProcessDetail>>('/process/' + pid)
}

export function autoCleanProcess(data: ProcessAutoCleanRequest) {
  return request.post<ApiResponse<ProcessAutoCleanResult>>('/process/auto-clean', data)
}

export function getZombieProcesses() {
  return request.get<ApiResponse<ProcessZombieData>>('/process/get/zombies')
}

export function getProcessLogs(page: number, pageSize: number) {
  return request.post<ApiResponse<ProcessLogPage>>('/process/log', { page, pageSize })
}
