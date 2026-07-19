import request from '../utils/request'
import type { ApiResponse } from '../types/user'
import type {
  DockerActionResult,
  DockerContainerDetail,
  DockerContainerListData,
  DockerContainerLogs,
  DockerImageListData,
  DockerInstallInfo,
  DockerCreateContainerParams,
  DockerCreateContainerResult,
  DockerMirrorConfig,
  DockerPullParams,
  DockerPullResult,
  DockerSearchResult,
  DockerSetMirrorResult,
} from '../types/docker'

export function getDockerInstallInfo() {
  return request.get<ApiResponse<DockerInstallInfo>>('/docker/install')
}

export function getRunningContainers() {
  return request.get<ApiResponse<DockerContainerListData>>('/docker/containers')
}

export function getAllContainers() {
  return request.get<ApiResponse<DockerContainerListData>>('/docker/container/list')
}

export function getDockerImages() {
  return request.get<ApiResponse<DockerImageListData>>('/docker/images')
}

export function getContainerDetail(containerId: string) {
  return request.get<ApiResponse<DockerContainerDetail>>(`/docker/container/${encodeURIComponent(containerId)}`)
}

export function getContainerLogs(containerId: string, tailLines = 200) {
  return request.get<ApiResponse<DockerContainerLogs>>(`/docker/container/${encodeURIComponent(containerId)}/logs`, {
    params: { tailLines },
  })
}

export function stopContainer(containerId: string) {
  return request.post<ApiResponse<DockerActionResult>>(`/docker/container/${encodeURIComponent(containerId)}/stop`)
}

export function startContainer(containerId: string) {
  return request.post<ApiResponse<DockerActionResult>>(`/docker/container/${encodeURIComponent(containerId)}/start`)
}

export function restartContainer(containerId: string) {
  return request.post<ApiResponse<DockerActionResult>>(`/docker/container/${encodeURIComponent(containerId)}/restart`)
}

export function deleteContainer(containerId: string) {
  return request.delete<ApiResponse<DockerActionResult>>(`/docker/container/${encodeURIComponent(containerId)}`)
}

/* ===== v2.0 新接口 ===== */

/** 搜索 Docker Hub 镜像（不设超时，前台转圈等结果） */
export function searchDockerHubImages(q: string, limit = 25) {
  return request.get<ApiResponse<DockerSearchResult>>('/docker/search', {
    params: { q, limit },
    timeout: 0, // 不设超时 — 前台转圈等搜索结果回来
  })
}

/** 拉取镜像（保持连接直到完成，拉取可能超 300s） */
export function pullDockerImage(params: DockerPullParams) {
  return request.post<ApiResponse<DockerPullResult>>('/docker/image/pull', null, {
    params: {
      imageName: params.imageName,
      tag: params.tag || undefined,
      platform: params.platform || undefined,
      registry: params.registry || undefined,
    },
    timeout: 0, // 不设超时 — 拉取完成后再弹窗通知
  })
}

/** 创建容器 */
export function createContainer(params: DockerCreateContainerParams) {
  const queryParams: Record<string, string> = {
    imageName: params.imageName,
    containerName: params.containerName,
  }
  if (params.ports && Object.keys(params.ports).length) {
    queryParams.ports = JSON.stringify(params.ports)
  }
  if (params.envVars && Object.keys(params.envVars).length) {
    queryParams.envVars = JSON.stringify(params.envVars)
  }
  if (params.volumes && Object.keys(params.volumes).length) {
    queryParams.volumes = JSON.stringify(params.volumes)
  }
  if (params.platform) queryParams.platform = params.platform
  if (params.restartPolicy) queryParams.restartPolicy = params.restartPolicy

  return request.post<ApiResponse<DockerCreateContainerResult>>('/docker/container', null, {
    params: queryParams,
  })
}

/** 获取 Docker 镜像加速站配置 */
export function getDockerMirror() {
  return request.get<ApiResponse<DockerMirrorConfig>>('/docker/mirror')
}

/** 设置 Docker 镜像加速站（写入 daemon.json 并重启 Docker，可能较慢） */
export function setDockerMirror(mirrors: string[]) {
  return request.post<ApiResponse<DockerSetMirrorResult>>('/docker/mirror', null, {
    params: { mirrors: JSON.stringify(mirrors) },
    timeout: 0,
  })
}
