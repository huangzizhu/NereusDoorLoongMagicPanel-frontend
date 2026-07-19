export interface DockerInstallInfo {
  isInstalled: boolean
  version: string | null
}

export interface DockerContainerSummary {
  containerId: string
  imageName: string
  status: string
  ports: string
  cpuPercent: number
  memoryUsageMB: number
  memoryLimitMB: number
}

export interface DockerContainerListData {
  total: number
  list: DockerContainerSummary[]
}

export interface DockerImageInfo {
  repository: string
  tag: string
  imageId: string
  createdSince: string
  createdAt: string
  size: string
}

export interface DockerImageListData {
  total: number
  list: DockerImageInfo[]
}

export interface DockerContainerHealthLog {
  Start: string
  End: string
  ExitCode: number
  Output: string
}

export interface DockerContainerStateHealth {
  Status: string
  FailingStreak: number
  Log: DockerContainerHealthLog[]
}

export interface DockerContainerState {
  Status: string
  Running: boolean
  Paused: boolean
  Restarting: boolean
  OOMKilled: boolean
  Dead: boolean
  Pid: number
  ExitCode: number
  Error: string
  StartedAt: string
  FinishedAt: string
  Health?: DockerContainerStateHealth
}

export interface DockerContainerMount {
  Type: string
  Source: string
  Destination: string
  Mode: string
  RW: boolean
  Propagation: string
}

export interface DockerContainerPortBinding {
  HostIp: string
  HostPort: string
}

export interface DockerContainerNetworkEndpoint {
  Gateway?: string
  IPAddress?: string
  MacAddress?: string
  Aliases?: string[] | null
  NetworkID?: string
  EndpointID?: string
  [key: string]: unknown
}

export interface DockerContainerNetworkSettings {
  Ports?: Record<string, DockerContainerPortBinding[] | null>
  Networks?: Record<string, DockerContainerNetworkEndpoint>
}

export interface DockerContainerConfig {
  Image: string
  Cmd?: string[] | null
  Env?: string[] | null
  Labels?: Record<string, string> | null
  Entrypoint?: string[] | null
  WorkingDir?: string
}

export interface DockerContainerRestartPolicy {
  Name: string
  MaximumRetryCount: number
}

export interface DockerContainerHostConfig {
  Binds?: string[] | null
  NetworkMode?: string
  PortBindings?: Record<string, DockerContainerPortBinding[] | null>
  RestartPolicy?: DockerContainerRestartPolicy
}

export interface DockerContainerDetail {
  Id: string
  Name: string
  Created: string
  Path?: string
  Args?: string[]
  State: DockerContainerState
  Config: DockerContainerConfig
  HostConfig?: DockerContainerHostConfig
  Mounts?: DockerContainerMount[]
  NetworkSettings?: DockerContainerNetworkSettings
}

export interface DockerContainerLogs {
  containerId: string
  logs: string
  errors: string
}

export interface DockerActionResult {
  containerId: string
  isStarted?: boolean
  isStopped?: boolean
  isRestarted?: boolean
  isDeleted?: boolean
  /** v2.0 丰富字段 */
  success?: boolean
  action?: string
  containerName?: string
  previousStatus?: string
  currentStatus?: string
  previousRunning?: boolean
  currentRunning?: boolean
  returnCode?: number
  stdout?: string
  stderr?: string
}

/* ===== v2.0 新接口类型 ===== */

/** Docker Hub 搜索单个结果 */
export interface DockerSearchItem {
  name: string
  description: string
  starCount: string | number
  isOfficial: boolean
  isAutomated: boolean
}

export interface DockerSearchResult {
  total: number
  list: DockerSearchItem[]
}

/** 拉取镜像参数 */
export interface DockerPullParams {
  imageName: string
  tag?: string
  platform?: string
  registry?: string
}

export interface DockerPullResult {
  image: string
  platform?: string | null
  registry?: string | null
  isPulled: boolean
}

/** 创建容器参数 */
export interface DockerCreateContainerParams {
  imageName: string
  containerName: string
  ports?: Record<string, string>
  envVars?: Record<string, string>
  volumes?: Record<string, string>
  platform?: string
  restartPolicy?: string
}

export interface DockerCreateContainerResult {
  containerId: string
  containerName: string
  imageName: string
  platform?: string | null
  ports: Record<string, string>
  envVars: Record<string, string>
  volumes: Record<string, string>
  restartPolicy?: string | null
  isCreated: boolean
}

/** 镜像加速站配置 */
export interface DockerMirrorConfig {
  registryMirrors: string[] | null
  daemonJsonPath: string
  rawConfig?: { 'registry-mirrors'?: string[] }
}

export interface DockerSetMirrorResult {
  daemonJsonPath: string
  isSet: boolean
  isRestarted: boolean
}
