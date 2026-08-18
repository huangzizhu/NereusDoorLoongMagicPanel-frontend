import request from '../utils/request'
import type { ApiResponse } from '../types/config'
import type {
  FeedbackAction,
  OpsAttachment,
  OpsExperiencePack,
  OpsPackCreateRequest,
  OpsPackListData,
  OpsPackListQuery,
  OpsPackUpdateRequest,
} from '../types/opsExperience'

/** 4.1 创建经验包 */
export function createOpsPack(data: OpsPackCreateRequest) {
  return request.post<ApiResponse<OpsExperiencePack>>('/ops-experience/packs', data)
}

/** 4.2 列表（分页 + 搜索 + 筛选） */
export function getOpsPacks(params?: OpsPackListQuery) {
  return request.get<ApiResponse<OpsPackListData>>('/ops-experience/packs', { params })
}

/** 4.3 详情 */
export function getOpsPack(packId: number) {
  return request.get<ApiResponse<OpsExperiencePack>>(`/ops-experience/packs/${packId}`)
}

/** 4.4 更新（人工修改，任意子集） */
export function updateOpsPack(packId: number, data: OpsPackUpdateRequest) {
  return request.put<ApiResponse<OpsExperiencePack>>(`/ops-experience/packs/${packId}`, data)
}

/** 4.5 删除（连带删除附件文件与记录，不可恢复） */
export function deleteOpsPack(packId: number) {
  return request.delete<ApiResponse<null>>(`/ops-experience/packs/${packId}`)
}

/** 4.6 反馈（useful / useless；hit 由 Agent 自动累计，前端无需调用） */
export function feedbackOpsPack(packId: number, action: FeedbackAction) {
  return request.post<ApiResponse<OpsExperiencePack>>(`/ops-experience/packs/${packId}/feedback`, { action })
}

/** 4.7 导入（zip 包，multipart/form-data） */
export function importOpsPacks(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request.post<ApiResponse<OpsExperiencePack>>('/ops-experience/import', formData, {
    timeout: 0,
  })
}

/** 4.8 导出（单包 zip，浏览器直接下载） */
export function exportOpsPack(packId: number) {
  return request.get<Blob>(`/ops-experience/packs/${packId}/export`, {
    responseType: 'blob',
    timeout: 0,
  })
}

/**
 * 4.9 知识摘要（组织记忆预览）
 * 注意：返回纯文本（非 JSON），空库返回空字符串 ""
 */
export function getOpsKnowledgeSummary(limit = 20) {
  return request.get<string>('/ops-experience/knowledge-summary', { params: { limit } })
}

/** 4.10 附件上传（人工附加，multipart/form-data） */
export function uploadOpsAttachment(
  packId: number,
  file: File,
  meta: { fileType?: string; arch?: string; osType?: string } = {},
) {
  const formData = new FormData()
  formData.append('file', file)
  if (meta.fileType) formData.append('fileType', meta.fileType)
  if (meta.arch) formData.append('arch', meta.arch)
  if (meta.osType) formData.append('osType', meta.osType)
  return request.post<ApiResponse<OpsAttachment>>(`/ops-experience/packs/${packId}/attachments`, formData, {
    timeout: 0,
  })
}

/** 触发浏览器下载 Blob（导出用） */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
