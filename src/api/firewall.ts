import request from '../utils/request'
import type { ApiResponse } from '../types/user'
import type {
  FirewallSwitchStatus,
  FirewallPortRuleCreateRequest,
  FirewallPortRuleListData,
  FirewallSshConfig,
  FirewallSshConfigUpdateRequest,
  FirewallSshLogListData,
} from '../types/firewall'

export function getFirewallSwitchStatus() {
  return request.get<ApiResponse<FirewallSwitchStatus>>('/firewall/switch')
}

export function updateFirewallSwitchStatus(data: Partial<FirewallSwitchStatus>) {
  return request.put<ApiResponse<FirewallSwitchStatus>>('/firewall/switch', data)
}

export function getFirewallPortRules() {
  return request.get<ApiResponse<FirewallPortRuleListData>>('/firewall/port-rules')
}

export function createFirewallPortRule(data: FirewallPortRuleCreateRequest) {
  return request.post<ApiResponse<FirewallPortRuleListData>>('/firewall/port-rules', data)
}

export function getSshConfig() {
  return request.get<ApiResponse<FirewallSshConfig>>('/firewall/ssh/config')
}

export function updateSshConfig(data: FirewallSshConfigUpdateRequest) {
  return request.put<ApiResponse<FirewallSshConfig>>('/firewall/ssh/config', data)
}

export function getSshLogs() {
  return request.get<ApiResponse<FirewallSshLogListData>>('/firewall/ssh/logs')
}