export interface CpuInfo {
  modelName: string
  coreCount: number
  usagePercent: number
  load1Min: number
  load5Min: number
  load15Min: number
}

export interface MemoryInfo {
  totalBytes: number
  usedBytes: number
  availableBytes: number
  usagePercent: number
  swapTotalBytes: number
  swapUsedBytes: number
  swapUsagePercent: number
}

export interface GpuInfo {
  index: number
  name: string
  temperatureC: number
  usagePercent: number
  memoryTotalBytes: number
  memoryUsedBytes: number
  memoryUsagePercent: number
  fanSpeedPercent: number
  powerUsageWatts: number
}

export interface DiskInfo {
  mountPoint: string
  fileSystem: string
  totalBytes: number
  usedBytes: number
  usagePercent: number
  readBytesPerSec: number
  writeBytesPerSec: number
}

export interface NetworkInfo {
  interfaceName: string
  ipAddress: string
  macAddress: string
  recvBytesPerSec: number
  sentBytesPerSec: number
  totalRecvBytes: number
  totalSentBytes: number
  isUp: boolean
}

export interface SystemHealth {
  hostname: string
  cpuUsage: number
  memoryUsage: number
  diskUsage: number
  healthScore: number
  status: number
  cpuInfo: CpuInfo
  memoryInfo: MemoryInfo
  gpuInfos: GpuInfo[]
  diskInfos: DiskInfo[]
  networkInfos: NetworkInfo[]
}

export interface AlertItem {
  id: number
  level: number
  message: string
  status: number
  createTime: string
}

export interface AlertListResponse {
  code: number
  msg: string
  data: {
    total: number
    items: AlertItem[]
  }
}

export interface AlertResponse {
  code: number
  msg: string
  data: AlertItem
}
