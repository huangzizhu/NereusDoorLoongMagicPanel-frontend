import request from '../utils/request'
import type { ApiResponse } from '../types/user'
import type { FileListData, FileOperationResult, BatchDeleteData, PermissionResult, CompressResult, DecompressResult, ChangeOwnerResult, FileInfoData, FileTreeData, ReadTextFileData, WriteTextFileData } from '../types/file'

export function getFileList(path: string, page = 1, pageSize = 100) {
  return request.post<ApiResponse<FileListData>>('/file/list', { path, page, pageSize })
}

export function uploadFile(destinationPath: string, file: File) {
  const formData = new FormData()
  formData.append('destinationPath', destinationPath)
  formData.append('file', file)
  return request.post<ApiResponse<null>>('/file/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
}

export function getDownloadUrl(filePath: string) {
  return `/api/file/download/${encodeURIComponent(filePath)}`
}

export function downloadFile(filePath: string) {
  return request.get('/file/download/' + encodeURIComponent(filePath), {
    responseType: 'blob',
    timeout: 60000,
  })
}

export function deleteFile(path: string) {
  return request.delete<ApiResponse<null>>('/file', { data: { path } })
}

export function createFile(path: string) {
  return request.post<ApiResponse<FileOperationResult>>('/file', { path })
}

export function moveFile(sourcePath: string, destinationPath: string) {
  return request.put<ApiResponse<FileOperationResult>>('/file', { sourcePath, destinationPath })
}

export function batchDeleteFiles(paths: string[]) {
  return request.delete<ApiResponse<BatchDeleteData>>('/file/batch', { data: { paths } })
}

export function changePermissions(path: string, permissions: string) {
  return request.put<ApiResponse<PermissionResult>>('/file/permissions', { path, permissions })
}

export function createDirectory(path: string) {
  return request.post<ApiResponse<FileOperationResult>>('/file/dir', { path })
}

export function copyFile(sourcePath: string, destinationPath: string) {
  return request.post<ApiResponse<FileOperationResult>>('/file/copy', { sourcePath, destinationPath })
}

export function compressFile(path: string) {
  return request.post<ApiResponse<CompressResult>>('/file/zip', { path })
}

export function decompressFile(zipFilePath: string, dstPath?: string) {
  const data: Record<string, string> = { zipFilePath }
  if (dstPath) data.dstPath = dstPath
  return request.post<ApiResponse<DecompressResult>>('/file/unzip', data)
}

export function changeOwner(targetPath: string, owner: string, group: string, recursive = false) {
  return request.put<ApiResponse<ChangeOwnerResult>>('/file/owner', { targetPath, owner, group, recursive })
}

export function getFileInfo(path: string) {
  return request.get<ApiResponse<FileInfoData>>('/file/info/' + encodeURIComponent(path))
}

export function getFileTree(rootPath: string, depth = 2) {
  return request.post<ApiResponse<FileTreeData>>('/file/tree', { rootPath, depth }, {
    timeout: 10000,
  })
}

export function readTextFile(path: string) {
  return request.get<ApiResponse<ReadTextFileData>>('/file/read/' + encodeURIComponent(path), {
    timeout: 30000,
  })
}

export function writeTextFile(path: string, content: string) {
  return request.post<ApiResponse<WriteTextFileData>>('/file/write', { path, content }, {
    timeout: 30000,
  })
}
