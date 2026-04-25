export interface FileItem {
  name: string
  path: string
  type: number
  size: number
  createdTime: string
  modifiedTime: string
  owner: string
  permissions: string
}

export const FILE_TYPE_FILE = 0
export const FILE_TYPE_FOLDER = 1
export const FILE_TYPE_LINK = 2
export const FILE_TYPE_UNKNOWN = 3

export interface FileListData {
  total: number
  items: FileItem[]
  page: number
}

export interface FileOperationResult {
  success: boolean
  absolutePath: string
  errorMessage: string | null
}

export interface BatchDeleteData {
  total: number
  items: FileOperationResult[]
}

export interface PermissionResult {
  success: boolean
  newPermissions: string
  errorMessage: string | null
}

export interface CompressResult {
  success: boolean
  sourcePath: string
  archivePath: string
  archiveSizeBytes: number
  errorMessage: string | null
}

export interface DecompressResult {
  success: boolean
  archivePath: string
  targetPath: string
  errorMessage: string | null
}

export interface ChangeOwnerResult {
  success: boolean
  newOwner: string
  newGroup: string
  errorMessage: string | null
}

export interface FileInfoData {
  name: string
  path: string
  type: number
  size: number
  createdTime: string
  modifiedTime: string
  owner: string
  group: string
  permissions: string
}

export interface ReadTextFileData {
  success: boolean
  targetPath: string
  content: string
  encoding: string
  sizeBytes: number
  errorMessage: string | null
}

export interface WriteTextFileData {
  success: boolean
  targetPath: string
  sizeBytes: number
  errorMessage: string | null
}

export interface FileTreeNode {
  fileName: string
  fileType: string
  absolutePath: string
  children: FileTreeNode[]
}

export interface FileTreeData {
  success: boolean
  rootPath: string
  maxDepth: number
  tree: FileTreeNode
  errorMessage: string | null
}

export interface ClipboardState {
  mode: 'copy' | 'cut'
  paths: string[]
}

export interface FileTab {
  id: string
  label: string
  path: string
}
