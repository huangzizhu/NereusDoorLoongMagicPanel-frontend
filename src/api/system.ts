import request from '../utils/request'
import type { AlertListResponse, AlertResponse } from '../types/system'

export function getAlerts(page: number, pageSize: number, excludeProcessed: boolean = true) {
  return request.post<AlertListResponse>('/system/alerts/all', {
    page,
    pageSize,
    excludeProcessed,
  }, {
    headers: {
      'Content-Type': 'application/json',
    },
    // 告警查询不应被全局 5 秒超时直接中断。
    timeout: 15000,
  })
}

export function markAlertRead(id: number) {
  return request.put<AlertResponse>(`/system/alerts/${id}/read`)
}

export function markAlertProcessed(id: number) {
  return request.put<AlertResponse>(`/system/alerts/${id}/process`)
}
