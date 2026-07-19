export interface NginxInstallInfo {
  isInstalled: boolean
  version: string | null
  configPath: string | null
}

export interface NginxStatusInfo {
  isRunning: boolean
  workerProcessCount: number | null
  activeConnections: number | null
  requestsPerSecond: number | null
}

export interface NginxConfigTestResult {
  isValid: boolean
  stdout?: string
  stderr?: string
}

export interface NginxReloadResult {
  serviceName: string
  action: string
  isReloaded: boolean
}

export interface NginxRestartResult {
  serviceName: string
  action: string
  isRestarted: boolean
  currentStatus: string
}

// === V2 新增：站点管理 ===

export interface NginxSiteInfo {
  configName: string
  configPath: string
  domain: string
  listen: string
  mode: 'static' | 'reverse_proxy'
  rootPath: string | null
  proxyPass: string | null
  isEnabled: boolean
}

export interface NginxSitesResponse {
  total: number
  list: NginxSiteInfo[]
}

export interface NginxCreateSiteParams {
  domain: string
  mode: 'static' | 'reverse_proxy'
  listenPort?: number
  rootPath?: string
  proxyPass?: string
  proxyPort?: number
  proxyProtocol?: 'http' | 'https'
}

export interface NginxCreateSiteResult {
  domain: string
  mode: string
  listenPort: number
  configPath: string
  enabledPath?: string
  rootPath?: string
  proxyPass?: string | null
  isEnabled: boolean
  isReloaded: boolean
}

export interface NginxDeleteSiteResult {
  configName: string
  configPath: string
  isDeleted: boolean
  isReloaded: boolean
}

// === V2 新增：SSL 证书管理 ===

export interface NginxSslApplyParams {
  domain: string
  email: string
}

export interface NginxSslConfigParams {
  domain: string
  certPath: string
  keyPath: string
}

export interface NginxSslRenewParams {
  domain: string
}

export interface NginxSslApplyResult {
  domain: string
  webroot: string
  certPath: string
  keyPath: string
  isApplied: boolean
}

export interface NginxSslConfigResult {
  targetPath: string
  isSslConfigured: boolean
  isReloaded: boolean
}

export interface NginxSslRenewResult {
  domain: string
  isRenewed: boolean
  isReloaded: boolean
}

// === V3 新增：站点配置读取与修改 ===

export interface NginxSiteConfigParsed {
  serverName: string
  listen: string
  root: string | null
  proxyPass: string | null
  sslCertPath: string | null
  sslKeyPath: string | null
}

export interface NginxSiteConfigResult {
  domain: string
  configPath: string
  content: string
  parsed: NginxSiteConfigParsed
}

export interface NginxUpdateSiteConfigParams {
  content: string
}

export interface NginxUpdateSiteConfigResult {
  targetPath: string
  isSaved: boolean
  isReloaded: boolean
}
