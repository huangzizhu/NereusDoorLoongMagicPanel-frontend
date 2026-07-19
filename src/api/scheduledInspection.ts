import request from '../utils/request'
import type { ApiResponse } from '../types/config'
import type {
  InspectionConfig,
  InspectionConfigUpdateRequest,
  InspectionReport,
  InspectionReportListData,
  ScheduledTaskApprovalDetail,
  ScheduledTask,
  ScheduledTaskCreateRequest,
  ScheduledTaskListData,
  ScheduledTaskRun,
  ScheduledTaskRunListData,
  ScheduledTaskUpdateRequest,
} from '../types/scheduledInspection'

export function createScheduledTask(data: ScheduledTaskCreateRequest) {
  return request.post<ApiResponse<ScheduledTask>>('/scheduled-tasks', data)
}

export function getScheduledTasks(params?: { status?: 'active' | 'paused'; includeDeleted?: boolean }) {
  return request.get<ApiResponse<ScheduledTaskListData>>('/scheduled-tasks', { params })
}

export function getAllScheduledTasks(params?: { includeDeleted?: boolean }) {
  return request.get<ApiResponse<ScheduledTaskListData>>('/scheduled-tasks/all', { params })
}

export function getPendingApprovalScheduledTasks() {
  return request.get<ApiResponse<ScheduledTaskListData>>('/scheduled-tasks/pending-approval')
}

export function getScheduledTask(taskId: number) {
  return request.get<ApiResponse<ScheduledTask>>(`/scheduled-tasks/${taskId}`)
}

export function updateScheduledTask(taskId: number, data: ScheduledTaskUpdateRequest) {
  return request.put<ApiResponse<ScheduledTask>>(`/scheduled-tasks/${taskId}`, data)
}

export function deleteScheduledTask(taskId: number) {
  return request.delete<ApiResponse<null>>(`/scheduled-tasks/${taskId}`)
}

export function pauseScheduledTask(taskId: number) {
  return request.post<ApiResponse<ScheduledTask>>(`/scheduled-tasks/${taskId}/pause`)
}

export function resumeScheduledTask(taskId: number) {
  return request.post<ApiResponse<ScheduledTask>>(`/scheduled-tasks/${taskId}/resume`)
}

export function triggerScheduledTask(taskId: number) {
  return request.post<ApiResponse<ScheduledTaskRun>>(`/scheduled-tasks/${taskId}/trigger`, null, {
    timeout: 0,
  })
}

export function getScheduledTaskRuns(taskId: number, limit = 50) {
  return request.get<ApiResponse<ScheduledTaskRunListData>>(`/scheduled-tasks/${taskId}/runs`, {
    params: { limit },
  })
}

export function getScheduledTaskRun(runId: number) {
  return request.get<ApiResponse<ScheduledTaskRun>>(`/scheduled-tasks/runs/${runId}`)
}

export function getScheduledTaskApproval(taskId: number) {
  return request.get<ApiResponse<ScheduledTaskApprovalDetail>>(`/scheduled-tasks/${taskId}/approval`)
}

export function reissueScheduledTaskApproval(taskId: number) {
  return request.post<ApiResponse<ScheduledTaskApprovalDetail>>(`/scheduled-tasks/${taskId}/approval/reissue`)
}

export function getInspectionReports(params?: { page?: number; pageSize?: number }) {
  return request.get<ApiResponse<InspectionReportListData>>('/inspection/reports', { params })
}

export function getLatestInspectionReport() {
  return request.get<ApiResponse<InspectionReport | null>>('/inspection/reports/latest')
}

export function getInspectionReport(reportId: number) {
  return request.get<ApiResponse<InspectionReport>>(`/inspection/reports/${reportId}`)
}

export function triggerInspection() {
  return request.post<ApiResponse<InspectionReport>>('/inspection/trigger', null, {
    timeout: 0,
  })
}

export function getInspectionConfig() {
  return request.get<ApiResponse<InspectionConfig>>('/inspection/config')
}

export function updateInspectionConfig(data: InspectionConfigUpdateRequest) {
  return request.put<ApiResponse<InspectionConfig>>('/inspection/config', data)
}
