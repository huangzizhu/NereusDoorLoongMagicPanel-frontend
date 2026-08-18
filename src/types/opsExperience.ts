/* =========================================================
   运维经验包（Ops Experience Pack）类型定义
   对应后端 gateway/controller/OpsExperienceController.py
   ========================================================= */

export type OpsCategory = 'deployment' | 'fault' | 'optimization' | 'security' | 'negative'
export type OpsRiskLevel = 'low' | 'medium' | 'high'
export type OpsStatus = 'enabled' | 'disabled'
export type OpsSource = 'ai' | 'human'
export type AttachmentFileType = 'script' | 'binary' | 'doc' | 'archive'
export type AttachmentArch = 'x86_64' | 'loongarch64' | '通用'
export type EarlyWarningSeverity = 'info' | 'warning' | 'critical'
export type EarlyWarningCondition = '<' | '<=' | '>' | '>=' | '=='
export type FeedbackAction = 'useful' | 'useless' | 'hit'

/** 阶段（结构化附件） */
export interface OpsStage {
  name: string
  goal: string
  steps: string[]
  verify: string
  pitfallsRef: string[]
}

/** 坑（结构化附件） */
export interface OpsPitfall {
  phenomenon: string
  cause: string
  solution: string
  stageRef: string | null
}

/** 预警特征（结构化附件） */
export interface OpsEarlyWarning {
  metric: string
  condition: EarlyWarningCondition
  threshold: number
  severity: EarlyWarningSeverity
  hint: string
}

/** 附件（详情接口返回） */
export interface OpsAttachment {
  id: number
  packId: number
  filename: string
  fileType: AttachmentFileType
  storagePath: string
  sha256: string
  size: number
  arch: AttachmentArch
  osType: string
  createdAt: string
}

/** 经验包 */
export interface OpsExperiencePack {
  id: number
  title: string
  category: OpsCategory
  osType: string
  tags: string[]
  deploymentDoc: string
  stages: OpsStage[]
  pitfalls: OpsPitfall[]
  earlyWarnings: OpsEarlyWarning[]
  riskLevel: OpsRiskLevel
  status: OpsStatus
  source: OpsSource
  version: number
  sourceSessionId: string | null
  hitCount: number
  usefulCount: number
  uselessCount: number
  qualityScore: number
  createdAt: string
  updatedAt: string
  /** 仅详情接口返回 */
  attachments?: OpsAttachment[]
}

export interface OpsPackListData {
  total: number
  items: OpsExperiencePack[]
}

/** 创建经验包（4.1；id/统计字段/source/version/时间戳由后端生成） */
export interface OpsPackCreateRequest {
  title: string
  deploymentDoc: string
  category?: OpsCategory
  osType?: string
  tags?: string[]
  stages?: OpsStage[]
  pitfalls?: OpsPitfall[]
  earlyWarnings?: OpsEarlyWarning[]
  riskLevel?: OpsRiskLevel
  status?: OpsStatus
}

/** 更新经验包（4.4；任意子集，exclude_unset 语义） */
export interface OpsPackUpdateRequest {
  title?: string
  deploymentDoc?: string
  category?: OpsCategory
  osType?: string
  tags?: string[]
  stages?: OpsStage[]
  pitfalls?: OpsPitfall[]
  earlyWarnings?: OpsEarlyWarning[]
  riskLevel?: OpsRiskLevel
  status?: OpsStatus
}

export interface OpsPackListQuery {
  page?: number
  pageSize?: number
  q?: string
  category?: OpsCategory
  status?: OpsStatus
}
