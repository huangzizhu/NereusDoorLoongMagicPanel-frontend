export interface FirewallSwitchStatus {
  firewallEnabled: boolean
  sshServiceEnabled: boolean
}

export interface FirewallPortRule {
  id: number
  port: number
  protocol: number
  sourceIp: string
  destinationIp: string
  priority: number
  action: number
  createdTime: string
  updatedTime: string
}

export interface FirewallPortRuleListData {
  total: number
  list: FirewallPortRule[]
}

export interface FirewallPortRuleCreateRequest {
  port: number
  protocol: number
  sourceIp: string
  destinationIp: string
  priority?: number
  action: number
}

export interface FirewallSshConfig {
  id: number
  port: number
  permitRootLogin: string
  passwordAuthentication: string
  allowUsers: string[]
  allowGroups: string[]
  listenAddress: string[]
  protocol: number
  loginGraceTime: number
  maxAuthTries: number
  createdTime: string
  updatedTime: string
}

export interface FirewallSshConfigUpdateRequest {
  port?: number
  permitRootLogin?: string
  passwordAuthentication?: string
  allowUsers?: string[]
  allowGroups?: string[]
  listenAddress?: string[]
  protocol?: number
  loginGraceTime?: number
  maxAuthTries?: number
}

export interface FirewallSshLogItem {
  timestamp: string
  user: string
  sourceIp: string
  port: number
  status: string
  reason: string
}

export interface FirewallSshLogListData {
  total: number
  list: FirewallSshLogItem[]
}