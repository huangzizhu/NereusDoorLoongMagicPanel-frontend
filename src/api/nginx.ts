import request from '../utils/request'
import type { ApiResponse } from '../types/user'
import type {
  NginxConfigTestResult,
  NginxCreateSiteParams,
  NginxCreateSiteResult,
  NginxDeleteSiteResult,
  NginxInstallInfo,
  NginxReloadResult,
  NginxRestartResult,
  NginxSiteConfigResult,
  NginxSitesResponse,
  NginxSslApplyParams,
  NginxSslApplyResult,
  NginxSslConfigParams,
  NginxSslConfigResult,
  NginxSslRenewParams,
  NginxSslRenewResult,
  NginxStatusInfo,
  NginxUpdateSiteConfigParams,
  NginxUpdateSiteConfigResult,
} from '../types/nginx'

export function getNginxInstallInfo() {
  return request.get<ApiResponse<NginxInstallInfo>>('/nginx/install')
}

export function getNginxStatus() {
  return request.get<ApiResponse<NginxStatusInfo>>('/nginx/status')
}

export function testNginxConfig() {
  return request.post<ApiResponse<NginxConfigTestResult>>('/nginx/test-config')
}

export function reloadNginx() {
  return request.post<ApiResponse<NginxReloadResult>>('/nginx/reload')
}

export function restartNginx() {
  return request.post<ApiResponse<NginxRestartResult>>('/nginx/restart')
}

// === V2 新增：站点管理 ===

export function getNginxSites() {
  return request.get<ApiResponse<NginxSitesResponse>>('/nginx/sites')
}

export function createNginxSite(params: NginxCreateSiteParams) {
  return request.post<ApiResponse<NginxCreateSiteResult>>('/nginx/site', params)
}

export function deleteNginxSite(configName: string) {
  return request.delete<ApiResponse<NginxDeleteSiteResult>>(`/nginx/site/${configName}`)
}

// === V2 新增：SSL 证书管理 ===

export function applyNginxSsl(params: NginxSslApplyParams) {
  return request.post<ApiResponse<NginxSslApplyResult>>('/nginx/ssl/apply', params)
}

export function configNginxSsl(params: NginxSslConfigParams) {
  return request.post<ApiResponse<NginxSslConfigResult>>('/nginx/ssl/config', params)
}

export function renewNginxSsl(params: NginxSslRenewParams) {
  return request.post<ApiResponse<NginxSslRenewResult>>('/nginx/ssl/renew', params)
}

// === V3 新增：站点配置读取与修改 ===

export function getNginxSiteConfig(domain: string) {
  return request.get<ApiResponse<NginxSiteConfigResult>>(`/nginx/site/${domain}`)
}

export function updateNginxSiteConfig(domain: string, params: NginxUpdateSiteConfigParams) {
  return request.put<ApiResponse<NginxUpdateSiteConfigResult>>(`/nginx/site/${domain}`, params)
}
