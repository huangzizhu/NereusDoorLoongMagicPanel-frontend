<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { FileItem, FileTab, ClipboardState } from '../types/file'
import { FILE_TYPE_FOLDER } from '../types/file'
import * as fileApi from '../api/file'
import { useNotification } from '../composables/useNotification'
import FileTabs from '../components/file/FileTabs.vue'
import FilePathBar from '../components/file/FilePathBar.vue'
import FileToolbar from '../components/file/FileToolbar.vue'
import FileTable from '../components/file/FileTable.vue'
import FileContextMenu from '../components/file/FileContextMenu.vue'
import FileDeleteDialog from '../components/file/FileDeleteDialog.vue'
import FilePermissionDialog from '../components/file/FilePermissionDialog.vue'
import FileCreateDialog from '../components/file/FileCreateDialog.vue'
import FileUploadDialog from '../components/file/FileUploadDialog.vue'
import FileRenameMoveDialog from '../components/file/FileRenameMoveDialog.vue'
import FileOwnerDialog from '../components/file/FileOwnerDialog.vue'
import FileDetailDialog from '../components/file/FileDetailDialog.vue'
import FileCopyToDialog from '../components/file/FileCopyToDialog.vue'
import DirectoryTree from '../components/file/DirectoryTree.vue'
import FileTextEditorDialog from '../components/file/FileTextEditorDialog.vue'
import { useLoadingOverlay } from '../composables/useLoadingOverlay'

let tabIdCounter = 0
function genId() {
  return `tab-${++tabIdCounter}`
}

const notify = useNotification()
const { show: showLoadingOverlay, hide: hideLoadingOverlay } = useLoadingOverlay()

const tabs = ref<FileTab[]>([{ id: genId(), label: '/', path: '/' }])
const activeTabId = ref(tabs.value[0].id)
const fileList = ref<FileItem[]>([])
const totalFiles = ref(0)
const selectedPaths = ref<Set<string>>(new Set())
const clipboard = ref<ClipboardState | null>(null)

const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value))
const currentPath = computed(() => activeTab.value?.path ?? '/')
const folderCount = computed(() => fileList.value.filter(f => f.type === FILE_TYPE_FOLDER).length)
const fileCount = computed(() => fileList.value.filter(f => f.type !== FILE_TYPE_FOLDER).length)
const selectedItems = computed(() => fileList.value.filter(f => selectedPaths.value.has(f.path)))

const pathHistory = ref<string[]>(['/'])
const historyIndex = ref(0)
const canGoBack = computed(() => historyIndex.value > 0)
const canGoForward = computed(() => historyIndex.value < pathHistory.value.length - 1)

const contextMenu = ref({ visible: false, x: 0, y: 0, hasTarget: false, item: null as FileItem | null })
const deleteDialog = ref({ visible: false, items: [] as FileItem[] })
const permDialog = ref({ visible: false, item: null as FileItem | null })
const createDialog = ref({ visible: false, type: 'file' as 'file' | 'folder' })
const uploadDialog = ref({ visible: false })
const renameMoveDialog = ref({ visible: false, mode: 'rename' as 'rename' | 'move', item: null as FileItem | null })
const ownerDialog = ref({ visible: false, item: null as FileItem | null })
const detailDialog = ref({ visible: false, item: null as FileItem | null })
const copyToDialog = ref({ visible: false, sourcePath: '', sourceName: '' })
const textEditorDialog = ref({
  visible: false,
  requestOpenPath: '',
  requestOpenToken: 0,
  initialOpenPath: '',
  initialOpenContent: '',
  initialOpenEncoding: 'utf-8',
  initialOpenSizeBytes: 0,
})

const TEXT_WARN_SIZE_BYTES = 1 * 1024 * 1024
const TEXT_MAX_SIZE_BYTES = 10 * 1024 * 1024

function normalizePath(path: string): string {
  if (!path || path === '/') return '/'
  const withLeadingSlash = path.startsWith('/') ? path : '/' + path
  return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash
}

function isSameOrChildPath(parent: string, maybeChild: string): boolean {
  if (parent === '/') return maybeChild.startsWith('/')
  return maybeChild === parent || maybeChild.startsWith(parent + '/')
}

async function fetchFileList() {
  try {
    const res = await fileApi.getFileList(currentPath.value, 0, 0)
    if (res.data.code === 1) {
      fileList.value = res.data.data.items
      totalFiles.value = res.data.data.total
      selectedPaths.value = new Set()
    } else {
      notify.warning('获取文件列表失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('网络错误', e.message || '无法获取文件列表')
  }
}

function addTab(path = '/') {
  const tab: FileTab = {
    id: genId(),
    label: path === '/' ? '/' : path.split('/').filter(Boolean).pop() || path,
    path,
  }
  tabs.value.push(tab)
  activeTabId.value = tab.id
}

function removeTab(id: string) {
  if (tabs.value.length <= 1) return
  const idx = tabs.value.findIndex(t => t.id === id)
  tabs.value.splice(idx, 1)
  if (activeTabId.value === id) {
    const newIdx = Math.min(idx, tabs.value.length - 1)
    activeTabId.value = tabs.value[newIdx].id
  }
}

function switchTab(id: string) {
  if (activeTabId.value !== id) {
    activeTabId.value = id
  }
}

function pushHistory(path: string) {
  if (pathHistory.value[historyIndex.value] === path) return
  pathHistory.value = pathHistory.value.slice(0, historyIndex.value + 1)
  pathHistory.value.push(path)
  historyIndex.value = pathHistory.value.length - 1
}

function navigateTo(path: string) {
  if (activeTab.value) {
    const normalized = normalizePath(path)
    if (normalized === activeTab.value.path) return
    pushHistory(normalized)
    activeTab.value.path = normalized
    activeTab.value.label = normalized === '/' ? '/' : normalized.split('/').filter(Boolean).pop() || normalized
  }
}

function goBack() {
  if (!canGoBack.value) return
  historyIndex.value--
  const path = pathHistory.value[historyIndex.value]
  if (activeTab.value) {
    activeTab.value.path = path
    activeTab.value.label = path === '/' ? '/' : path.split('/').filter(Boolean).pop() || path
  }
}

function goForward() {
  if (!canGoForward.value) return
  historyIndex.value++
  const path = pathHistory.value[historyIndex.value]
  if (activeTab.value) {
    activeTab.value.path = path
    activeTab.value.label = path === '/' ? '/' : path.split('/').filter(Boolean).pop() || path
  }
}

watch(currentPath, () => {
  fetchFileList()
})

onMounted(() => {
  fetchFileList()
})

function toggleSelect(path: string, multi: boolean) {
  const newSet = new Set(selectedPaths.value)
  if (multi) {
    if (newSet.has(path)) {
      newSet.delete(path)
    } else {
      newSet.add(path)
    }
  } else {
    if (newSet.has(path) && newSet.size === 1) {
      newSet.clear()
    } else {
      newSet.clear()
      newSet.add(path)
    }
  }
  selectedPaths.value = newSet
}

function selectAll() {
  if (fileList.value.every(f => selectedPaths.value.has(f.path))) {
    selectedPaths.value = new Set()
  } else {
    selectedPaths.value = new Set(fileList.value.map(f => f.path))
  }
}

function openItem(item: FileItem) {
  if (item.type === FILE_TYPE_FOLDER) {
    navigateTo(item.path)
    return
  }

  openTextEditor(item)
}

async function openTextEditor(item: FileItem) {
  if (item.size > TEXT_MAX_SIZE_BYTES) {
    notify.warning('文件过大', '超过 10MB 的文件请下载后打开，不支持在线编辑')
    return
  }

  if (item.size > TEXT_WARN_SIZE_BYTES) {
    notify.warning('大文件提示', `文件大小约 ${(item.size / 1024 / 1024).toFixed(2)} MB，加载可能较慢`) 
  }

  const normalizedPath = normalizePath(item.path)

  try {
    showLoadingOverlay()
    const res = await fileApi.readTextFile(normalizedPath)
    if (res.data.code === 1 && res.data.data.success) {
      const data = res.data.data
      textEditorDialog.value.initialOpenPath = data.targetPath
      textEditorDialog.value.initialOpenContent = data.content
      textEditorDialog.value.initialOpenEncoding = data.encoding
      textEditorDialog.value.initialOpenSizeBytes = data.sizeBytes
      textEditorDialog.value.requestOpenPath = data.targetPath
      textEditorDialog.value.visible = true
      textEditorDialog.value.requestOpenToken += 1
    } else {
      notify.warning('打开失败', res.data.data?.errorMessage || res.data.msg)
    }
  } catch (e: any) {
    notify.error('打开失败', e.message || '读取文本失败')
  } finally {
    hideLoadingOverlay()
  }
}

function closeTextEditor() {
  textEditorDialog.value.visible = false
}

async function moveItemsToFolder(items: FileItem[], targetPath: string) {
  const normalizedTargetPath = normalizePath(targetPath)
  const movableItems = items.filter(item => {
    const sourcePath = normalizePath(item.path)
    if (sourcePath === normalizedTargetPath) {
      notify.warning('移动失败', `不能将 ${item.name} 移动到自身`)
      return false
    }
    if (item.type === FILE_TYPE_FOLDER && isSameOrChildPath(sourcePath, normalizedTargetPath)) {
      notify.warning('移动失败', `不能将文件夹 ${item.name} 移动到其子目录`)
      return false
    }
    return true
  })

  if (movableItems.length === 0) return

  for (const item of movableItems) {
    const sourcePath = normalizePath(item.path)
    const destPath = normalizedTargetPath === '/' ? '/' + item.name : normalizedTargetPath + '/' + item.name
    if (sourcePath === destPath) continue
    try {
      const res = await fileApi.moveFile(sourcePath, destPath)
      if (res.data.code === 1 && res.data.data.success) {
        notify.info('移动成功', `${item.name} → ${destPath}`)
      } else {
        notify.warning('移动失败',res.data.msg)
      }
    } catch (e: any) {
      notify.error('移动失败', e.message)
    }
  }

  fetchFileList()
}

async function handleDropOn(target: FileItem, source: FileItem) {
  if (target.type !== FILE_TYPE_FOLDER) return
  const sourcePath = normalizePath(source.path)
  const selected = selectedItems.value
  const draggedWithinSelected = selected.some(item => normalizePath(item.path) === sourcePath)
  const items = draggedWithinSelected ? selected : [source]
  await moveItemsToFolder(items, target.path)
}

async function handleDropToTreeFolder(targetPath: string, sourcePath: string) {
  const normalizedSourcePath = normalizePath(sourcePath)
  const sourceItem = fileList.value.find(item => normalizePath(item.path) === normalizedSourcePath)
  if (!sourceItem) return

  const selected = selectedItems.value
  const draggedWithinSelected = selected.some(item => normalizePath(item.path) === normalizedSourcePath)
  const items = draggedWithinSelected ? selected : [sourceItem]
  await moveItemsToFolder(items, targetPath)
}

function handleContextMenu(e: MouseEvent, item?: FileItem) {
  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    hasTarget: !!item,
    item: item || null,
  }
  if (item && !selectedPaths.value.has(item.path)) {
    selectedPaths.value = new Set([item.path])
  }
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function handleContextUpload() {
  closeContextMenu()
  uploadDialog.value.visible = true
}

function handleContextCreateFile() {
  closeContextMenu()
  createDialog.value = { visible: true, type: 'file' }
}

function handleContextCreateFolder() {
  closeContextMenu()
  createDialog.value = { visible: true, type: 'folder' }
}

async function downloadItem(item: FileItem) {
  try {
    const res = await fileApi.downloadFile(item.path)
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = item.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e: any) {
    notify.error('下载失败', e.message || '网络错误')
  }
}

function handleContextDownload() {
  closeContextMenu()
  const item = contextMenu.value.item
  if (!item) return
  downloadItem(item)
}

function handleContextRefresh() {
  closeContextMenu()
  fetchFileList()
}

function handleContextPermissions() {
  closeContextMenu()
  const item = contextMenu.value.item
  if (item) {
    permDialog.value = { visible: true, item }
  }
}

function handleContextRename() {
  closeContextMenu()
  const item = contextMenu.value.item
  if (item) {
    renameMoveDialog.value = { visible: true, mode: 'rename', item }
  }
}

function handleContextMove() {
  closeContextMenu()
  const item = contextMenu.value.item
  if (item) {
    renameMoveDialog.value = { visible: true, mode: 'move', item }
  }
}

function handleContextCopy() {
  closeContextMenu()
  const item = contextMenu.value.item
  if (item && item.type !== FILE_TYPE_FOLDER) {
    clipboard.value = { mode: 'copy', paths: [item.path] }
    notify.info('已复制', item.name)
  }
}

function handleContextCut() {
  closeContextMenu()
  const item = contextMenu.value.item
  if (item) {
    clipboard.value = { mode: 'cut', paths: [item.path] }
    notify.info('已剪切', item.name)
  }
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fallback below.
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    return copied
  } catch {
    return false
  }
}

async function handleContextCopyPath() {
  closeContextMenu()
  const item = contextMenu.value.item
  if (!item) return

  const copied = await copyTextToClipboard(item.path)
  if (copied) {
    notify.info('路径已复制', item.path)
  } else {
    notify.warning('复制失败', '浏览器不支持或权限受限，请手动复制')
  }
}

async function handleContextPaste() {
  closeContextMenu()
  if (!clipboard.value || clipboard.value.paths.length === 0) return

  const targetDir = currentPath.value
  const mode = clipboard.value.mode

  for (const sourcePath of clipboard.value.paths) {
    const fileName = sourcePath.split('/').pop() || sourcePath
    const destPath = targetDir === '/' ? '/' + fileName : targetDir + '/' + fileName

    try {
      if (mode === 'copy') {
        const res = await fileApi.copyFile(sourcePath, destPath)
        if (res.data.code === 1 && res.data.data.success) {
          notify.info('粘贴成功', `${fileName} → ${destPath}`)
        } else {
          notify.warning('粘贴失败', res.data.msg)
        }
      } else {
        const res = await fileApi.moveFile(sourcePath, destPath)
        if (res.data.code === 1 && res.data.data.success) {
          notify.info('粘贴成功', `${fileName} → ${destPath}`)
        } else {
          notify.warning('粘贴失败', res.data.msg)
        }
      }
    } catch (e: any) {
      notify.error('粘贴失败', e.message)
    }
  }

  if (mode === 'cut') {
    clipboard.value = null
  }

  fetchFileList()
}

async function handleContextCompress() {
  closeContextMenu()
  const item = contextMenu.value.item
  if (!item) return

  try {
    notify.info('正在压缩', item.name)
    const res = await fileApi.compressFile(item.path)
    if (res.data.code === 1 && res.data.data.success) {
      notify.info('压缩成功', `${res.data.data.archivePath} (${formatSize(res.data.data.archiveSizeBytes)})`)
      fetchFileList()
    } else {
      notify.warning('压缩失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('压缩失败', e.message)
  }
}

async function handleContextDecompress() {
  closeContextMenu()
  const item = contextMenu.value.item
  if (!item) return

  // 自动生成目的地址：压缩文件所在目录 + 压缩文件名（去掉扩展名）
  let destDir: string
  const lastSlashIndex = item.path.lastIndexOf('/')
  if (lastSlashIndex !== -1) {
    destDir = item.path.substring(0, lastSlashIndex)
  } else {
    destDir = '/'
  }

  // 获取不带扩展名的文件名
  let baseName = item.name
  if (baseName.endsWith('.tar.gz')) {
    baseName = baseName.substring(0, baseName.length - 7)
  } else if (baseName.endsWith('.tar')) {
    baseName = baseName.substring(0, baseName.length - 4)
  } else if (baseName.endsWith('.zip')) {
    baseName = baseName.substring(0, baseName.length - 4)
  }
  const destPath = destDir

  try {
    notify.info('正在解压', item.name)
    const res = await fileApi.decompressFile(item.path, destPath)
    if (res.data.code === 1 && res.data.data.success) {
      notify.info('解压成功', `解压到 ${res.data.data.targetPath}`)
      fetchFileList()
    } else {
      notify.warning('解压失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('解压失败', e.message)
  }
}

function handleContextChangeOwner() {
  closeContextMenu()
  const item = contextMenu.value.item
  if (item) {
    ownerDialog.value = { visible: true, item }
  }
}

function handleContextDetail() {
  closeContextMenu()
  const item = contextMenu.value.item
  if (item) {
    detailDialog.value = { visible: true, item }
  }
}

function handleContextDelete() {
  closeContextMenu()
  const item = contextMenu.value.item
  if (item) {
    deleteDialog.value = { visible: true, items: [item] }
  }
}

function handleBatchDelete() {
  const items = selectedItems.value
  if (items.length === 0) return
  deleteDialog.value = { visible: true, items }
}

function handleBatchDownload() {
  const items = selectedItems.value
  for (const item of items) {
    downloadItem(item)
  }
}

function handleBatchRename() {
  const items = selectedItems.value
  if (items.length === 1) {
    renameMoveDialog.value = { visible: true, mode: 'rename', item: items[0] }
  }
}

function handleBatchCopyTo() {
  const items = selectedItems.value
  if (items.length === 0) return
  if (items.length === 1) {
    copyToDialog.value = { visible: true, sourcePath: items[0].path, sourceName: items[0].name }
  } else {
    notify.warning('批量复制', '暂不支持多文件同时复制到，请逐个操作')
  }
}

async function handleBatchCompress() {
  const items = selectedItems.value
  if (items.length === 0) return
  if (items.length === 1) {
    try {
      notify.info('正在压缩', items[0].name)
      const res = await fileApi.compressFile(items[0].path)
      if (res.data.code === 1 && res.data.data.success) {
        notify.info('压缩成功', `${res.data.data.archivePath} (${formatSize(res.data.data.archiveSizeBytes)})`)
        fetchFileList()
      } else {
        notify.warning('压缩失败', res.data.msg)
      }
    } catch (e: any) {
      notify.error('压缩失败', e.message)
    }
  } else {
    notify.warning('批量压缩', '暂不支持多文件同时压缩，请逐个操作')
  }
}

async function confirmDelete() {
  const items = deleteDialog.value.items
  deleteDialog.value.visible = false
  if (items.length === 0) return

  try {
    if (items.length === 1) {
      const res = await fileApi.deleteFile(items[0].path)
      if (res.data.code === 1) {
        notify.info('删除成功', items[0].name)
      } else {
        notify.warning('删除失败', res.data.msg)
      }
    } else {
      const res = await fileApi.batchDeleteFiles(items.map(i => i.path))
      if (res.data.code === 1) {
        const failed = res.data.data.items.filter(i => !i.success)
        if (failed.length === 0) {
          notify.info('批量删除成功', `共删除 ${items.length} 个项目`)
        } else {
          notify.warning('部分删除失败', `${failed.length} 个项目删除失败`)
        }
      } else {
        notify.warning('批量删除失败', res.data.msg)
      }
    }
  } catch (e: any) {
    notify.error('删除失败', e.message)
  } finally {
    fetchFileList()
  }
}

async function confirmCreate(name: string) {
  createDialog.value.visible = false
  const basePath = currentPath.value === '/' ? '' : currentPath.value
  const fullPath = basePath + '/' + name

  try {
    const res = createDialog.value.type === 'folder'
      ? await fileApi.createDirectory(fullPath)
      : await fileApi.createFile(fullPath)
    if (res.data.code === 1) {
      notify.info('创建成功', name)
    } else {
      notify.warning('创建失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('创建失败', e.message)
  } finally {
    fetchFileList()
  }
}

function confirmUpload(files: File[]) {
  uploadDialog.value.visible = false
  const path = currentPath.value
  let successCount = 0
  let failCount = 0

  for (const file of files) {
    fileApi.uploadFile(path, file)
      .then(res => {
        if (res.data.code === 1) {
          successCount++
          notify.info('上传成功', file.name)
        } else {
          failCount++
          notify.warning('上传失败', `${file.name}: ${res.data.msg}`)
        }
      })
      .catch(() => {
        failCount++
        notify.error('上传失败', file.name)
      })
      .finally(() => {
        if (successCount + failCount === files.length) {
          fetchFileList()
        }
      })
  }
}

async function confirmPermission(path: string, permissions: string) {
  permDialog.value.visible = false
  try {
    const res = await fileApi.changePermissions(path, permissions)
    if (res.data.code === 1 && res.data.data.success) {
      notify.info('权限修改成功', `${path} → ${permissions}`)
    } else {
      notify.warning('权限修改失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('权限修改失败', e.message)
  } finally {
    fetchFileList()
  }
}

async function confirmRenameMove(sourcePath: string, destinationPath: string) {
  renameMoveDialog.value.visible = false
  try {
    const res = await fileApi.moveFile(sourcePath, destinationPath)
    if (res.data.code === 1 && res.data.data.success) {
      const action = renameMoveDialog.value.mode === 'rename' ? '重命名' : '移动'
      notify.info(`${action}成功`, `${sourcePath} → ${destinationPath}`)
    } else {
      notify.warning('操作失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('操作失败', e.message)
  } finally {
    fetchFileList()
  }
}

async function confirmOwner(path: string, owner: string, group: string, recursive: boolean) {
  ownerDialog.value.visible = false
  try {
    const res = await fileApi.changeOwner(path, owner, group, recursive)
    if (res.data.code === 1 && res.data.data.success) {
      notify.info('所有者修改成功', `${owner}:${group}`)
    } else {
      notify.warning('所有者修改失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('所有者修改失败', e.message)
  } finally {
    fetchFileList()
  }
}

async function confirmCopyTo(destinationPath: string) {
  copyToDialog.value.visible = false
  const sourcePath = copyToDialog.value.sourcePath
  const fileName = sourcePath.split('/').pop() || sourcePath
  const destPath = destinationPath === '/' ? '/' + fileName : destinationPath + '/' + fileName

  try {
    const res = await fileApi.copyFile(sourcePath, destPath)
    if (res.data.code === 1 && res.data.data.success) {
      notify.info('复制成功', `${fileName} → ${destPath}`)
    } else {
      notify.warning('复制失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('复制失败', e.message)
  } finally {
    fetchFileList()
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i]
}

function handleGlobalContextMenu(e: MouseEvent) {
  e.preventDefault()
  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    hasTarget: false,
    item: null,
  }
}

function handleClickOutside() {
  closeContextMenu()
}

function handleTableContextMenu(e: MouseEvent, item?: FileItem) {
  e.stopPropagation()
  handleContextMenu(e, item)
}

function handleTableDragStart(item: FileItem) {
  const selected = selectedItems.value
  const draggedWithinSelected = selected.some(i => normalizePath(i.path) === normalizePath(item.path))
  if (!draggedWithinSelected && !selectedPaths.value.has(item.path)) {
    selectedPaths.value = new Set([item.path])
  }
}
</script>

<template>
  <div class="file-explorer" @click="handleClickOutside" @contextmenu.prevent="handleGlobalContextMenu">
    <FileTabs
      :tabs="tabs"
      :activeTabId="activeTabId"
      @switch="switchTab"
      @add="addTab()"
      @remove="removeTab"
    />
    <FilePathBar
      :currentPath="currentPath"
      @navigate="navigateTo"
    />
    <FileToolbar
      :selectedCount="selectedPaths.size"
      :canGoBack="canGoBack"
      :canGoForward="canGoForward"
      :clipboard="clipboard"
      @goBack="goBack"
      @goForward="goForward"
      @upload="uploadDialog.visible = true"
      @createFile="createDialog = { visible: true, type: 'file' }"
      @createFolder="createDialog = { visible: true, type: 'folder' }"
      @batchDelete="handleBatchDelete"
      @batchDownload="handleBatchDownload"
      @batchRename="handleBatchRename"
      @batchCopyTo="handleBatchCopyTo"
      @batchCompress="handleBatchCompress"
    />
    <div class="file-main">
      <aside class="file-sidebar">
        <DirectoryTree
          :currentPath="currentPath"
          @navigate="navigateTo"
          @dropToFolder="handleDropToTreeFolder"
        />
      </aside>
      <div class="file-content">
        <FileTable
          :fileList="fileList"
          :selectedPaths="selectedPaths"
          @toggleSelect="toggleSelect"
          @selectAll="selectAll"
          @open="openItem"
          @dragStart="handleTableDragStart"
          @dropOn="handleDropOn"
          @contextmenu="handleTableContextMenu"
        />
      </div>
    </div>
    <div class="file-statusbar">
      <div class="status-left">
        <span class="status-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          {{ folderCount }} 个文件夹
        </span>
        <span class="status-sep">·</span>
        <span class="status-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          {{ fileCount }} 个文件
        </span>
        <template v-if="selectedPaths.size > 0">
          <span class="status-sep">·</span>
          <span class="status-item selected-count">已选 {{ selectedPaths.size }} 项</span>
        </template>
        <template v-if="clipboard && clipboard.paths.length > 0">
          <span class="status-sep">·</span>
          <span class="status-item clipboard-status">
            {{ clipboard.mode === 'copy' ? '复制' : '剪切' }}了 {{ clipboard.paths.length }} 项
          </span>
        </template>
      </div>
      <div class="status-right">
        <span class="status-item">共 {{ totalFiles }} 项</span>
      </div>
    </div>

    <FileContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :hasTarget="contextMenu.hasTarget"
      :item="contextMenu.item"
      :clipboard="clipboard"
      @refresh="handleContextRefresh"
      @upload="handleContextUpload"
      @createFile="handleContextCreateFile"
      @createFolder="handleContextCreateFolder"
      @download="handleContextDownload"
      @permissions="handleContextPermissions"
      @rename="handleContextRename"
      @move="handleContextMove"
      @copy="handleContextCopy"
      @cut="handleContextCut"
      @copyPath="handleContextCopyPath"
      @paste="handleContextPaste"
      @compress="handleContextCompress"
      @decompress="handleContextDecompress"
      @changeOwner="handleContextChangeOwner"
      @detail="handleContextDetail"
      @delete="handleContextDelete"
      @close="closeContextMenu"
    />

    <FileDeleteDialog
      :visible="deleteDialog.visible"
      :items="deleteDialog.items"
      @confirm="confirmDelete"
      @cancel="deleteDialog.visible = false"
    />

    <FilePermissionDialog
      :visible="permDialog.visible"
      :item="permDialog.item"
      @confirm="confirmPermission"
      @cancel="permDialog.visible = false"
    />

    <FileCreateDialog
      :visible="createDialog.visible"
      :type="createDialog.type"
      :currentPath="currentPath"
      @confirm="confirmCreate"
      @cancel="createDialog.visible = false"
    />

    <FileUploadDialog
      :visible="uploadDialog.visible"
      :currentPath="currentPath"
      @confirm="confirmUpload"
      @cancel="uploadDialog.visible = false"
    />

    <FileRenameMoveDialog
      :visible="renameMoveDialog.visible"
      :mode="renameMoveDialog.mode"
      :item="renameMoveDialog.item"
      @confirm="confirmRenameMove"
      @cancel="renameMoveDialog.visible = false"
    />

    <FileOwnerDialog
      :visible="ownerDialog.visible"
      :item="ownerDialog.item"
      @confirm="confirmOwner"
      @cancel="ownerDialog.visible = false"
    />

    <FileDetailDialog
      :visible="detailDialog.visible"
      :item="detailDialog.item"
      @cancel="detailDialog.visible = false"
    />

    <FileCopyToDialog
      :visible="copyToDialog.visible"
      :sourcePath="copyToDialog.sourcePath"
      :sourceName="copyToDialog.sourceName"
      @confirm="confirmCopyTo"
      @cancel="copyToDialog.visible = false"
    />

    <FileTextEditorDialog
      :visible="textEditorDialog.visible"
      :requestOpenPath="textEditorDialog.requestOpenPath"
      :requestOpenToken="textEditorDialog.requestOpenToken"
      :initialOpenPath="textEditorDialog.initialOpenPath"
      :initialOpenContent="textEditorDialog.initialOpenContent"
      :initialOpenEncoding="textEditorDialog.initialOpenEncoding"
      :initialOpenSizeBytes="textEditorDialog.initialOpenSizeBytes"
      @cancel="closeTextEditor"
    />
  </div>
</template>

<style scoped>
.file-explorer {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--topbar-height));
  overflow: hidden;
  background: var(--color-bg);
}

.file-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.file-sidebar {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  backdrop-filter: var(--backdrop-blur);
  -webkit-backdrop-filter: var(--backdrop-blur);
  overflow-y: auto;
}

.file-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.file-statusbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-elevated);
  backdrop-filter: var(--backdrop-blur);
  -webkit-backdrop-filter: var(--backdrop-blur);
  font-size: 12px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.status-sep {
  color: var(--color-text-faint);
}

.selected-count {
  color: var(--color-primary);
  font-weight: 600;
}

.clipboard-status {
  color: var(--color-info);
  font-weight: 500;
}

@media (max-width: 768px) {
  .file-sidebar {
    display: none;
  }
}
</style>
