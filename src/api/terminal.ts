import request from '../utils/request'
import type { ApiResponse } from '../types/user'
import type {
  TerminalAvailableData,
  TerminalLogQuery,
  TerminalSessionLogData,
} from '../types/terminal'

export function getTerminalAvailable() {
  return request.get<ApiResponse<TerminalAvailableData | null>>('/terminal/available')
}

export function getTerminalSessionLogs(query: TerminalLogQuery) {
  return request.post<ApiResponse<TerminalSessionLogData>>('/terminal/session/log', query)
}

export function createTerminalWsUrl(path: '/terminal/ws' | '/terminal/admin/ws', cols: number, rows: number) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams({
    cols: String(Math.max(1, Math.min(500, Math.floor(cols)))),
    rows: String(Math.max(1, Math.min(500, Math.floor(rows)))),
  })
  return `${protocol}//${window.location.host}/api${path}?${params.toString()}`
}
