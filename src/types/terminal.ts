export type TerminalMode = 'normal' | 'admin'

export interface TerminalAvailableData {
  normalTerminalAvailable: boolean
  normalContainerName: string
}

export interface TerminalLogQuery {
  page: number
  pageSize: number
}

export interface TerminalSessionLogItem {
  sessionId: string
  userId: number
  panelUsername: string
  clientIp: string
  mode: TerminalMode | string
  normalContainerName: string | null
  adminLinuxUsername: string | null
  adminAuthAttempted: boolean
  adminAuthSucceeded: boolean
  adminAuthFailedCount: number
  startTime: string
  endTime: string | null
  closeReason: string | null
  exitCode: number | null
  logId: number
}

export interface TerminalSessionLogData {
  total: number
  items: TerminalSessionLogItem[]
}

export interface TerminalStateMessage {
  type: 'state'
  sessionId: string
  mode: TerminalMode | string
  linuxUser: string
  title: string
}

export interface TerminalOutputMessage {
  type: 'output'
  data: string
}

export interface TerminalAdminLoginResultMessage {
  type: 'admin_login_result'
  success: boolean
  mode: TerminalMode | string
  msg: string
}

export interface TerminalErrorMessage {
  type: 'error'
  code?: string
  msg: string
}

export type TerminalServerMessage =
  | TerminalStateMessage
  | TerminalOutputMessage
  | TerminalAdminLoginResultMessage
  | TerminalErrorMessage

export interface TerminalInputMessage {
  type: 'input'
  data: string
}

export interface TerminalResizeMessage {
  type: 'resize'
  cols: number
  rows: number
}

export interface TerminalAdminLoginMessage {
  type: 'admin_login'
  username: string
  password: string
}

export type TerminalClientMessage =
  | TerminalInputMessage
  | TerminalResizeMessage
  | TerminalAdminLoginMessage
