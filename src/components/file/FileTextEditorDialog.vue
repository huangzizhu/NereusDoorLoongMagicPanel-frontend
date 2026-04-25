<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { basicSetup } from 'codemirror'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { json } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { css } from '@codemirror/lang-css'
import { markdown } from '@codemirror/lang-markdown'
import { sql } from '@codemirror/lang-sql'
import { yaml } from '@codemirror/lang-yaml'
import { useNotification } from '../../composables/useNotification'
import { useLoadingOverlay } from '../../composables/useLoadingOverlay'
import type { FileItem } from '../../types/file'
import { FILE_TYPE_FOLDER } from '../../types/file'
import * as fileApi from '../../api/file'
import FileCreateDialog from './FileCreateDialog.vue'

interface EditorTab {
  id: string
  path: string
  name: string
  content: string
  originalContent: string
  encoding: string
  sizeBytes: number
}

const props = withDefaults(defineProps<{
  visible: boolean
  requestOpenPath: string
  requestOpenToken: number
  initialOpenPath: string
  initialOpenContent: string
  initialOpenEncoding: string
  initialOpenSizeBytes: number
}>(), {
  initialOpenPath: '',
  initialOpenContent: '',
  initialOpenEncoding: 'utf-8',
  initialOpenSizeBytes: 0,
})

const emit = defineEmits<{
  cancel: []
}>()

const notify = useNotification()
const { show: showLoadingOverlay, hide: hideLoadingOverlay } = useLoadingOverlay()

const tabs = ref<EditorTab[]>([])
const activeTabId = ref('')
const editorContainerRef = ref<HTMLElement | null>(null)
const editorViewRef = ref<EditorView | null>(null)
const searchPanelObserverRef = ref<MutationObserver | null>(null)
const currentDirPath = ref('/')
const pathInput = ref('/')
const fileList = ref<FileItem[]>([])
const fileListLoading = ref(false)
const openingPathSet = ref<Set<string>>(new Set())
const saving = ref(false)

const createDialog = ref({ visible: false })

const confirmDialog = ref({
  visible: false,
  title: '',
  message: '',
})
let confirmResolver: ((value: boolean) => void) | null = null

let tabIdCounter = 0

function genTabId() {
  tabIdCounter += 1
  return `editor-tab-${tabIdCounter}`
}

function normalizePath(path: string): string {
  if (!path || path === '/') return '/'
  const withSlash = path.startsWith('/') ? path : '/' + path
  return withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash
}

function getFileName(path: string): string {
  const normalized = normalizePath(path)
  if (normalized === '/') return '/'
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] || normalized
}

function getParentPath(path: string): string {
  const normalized = normalizePath(path)
  if (normalized === '/') return '/'
  const index = normalized.lastIndexOf('/')
  return index <= 0 ? '/' : normalized.slice(0, index)
}

function getLanguageExtensions(path: string) {
  const lower = path.toLowerCase()
  if (lower.endsWith('.json')) return [json()]
  if (lower.endsWith('.xml')) return [xml()]
  if (lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.vue')) return [html()]
  if (lower.endsWith('.js') || lower.endsWith('.ts') || lower.endsWith('.jsx') || lower.endsWith('.tsx') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return [javascript({ typescript: lower.endsWith('.ts') || lower.endsWith('.tsx') })]
  }
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.less')) return [css()]
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return [markdown()]
  if (lower.endsWith('.sql')) return [sql()]
  if (lower.endsWith('.yaml') || lower.endsWith('.yml') || lower.endsWith('.toml') || lower.endsWith('.ini') || lower.endsWith('.conf') || lower.endsWith('.cfg')) {
    return [yaml()]
  }
  return []
}

const activeTab = computed(() => tabs.value.find(tab => tab.id === activeTabId.value) || null)
const isDirty = computed(() => {
  const tab = activeTab.value
  if (!tab) return false
  return tab.content !== tab.originalContent
})

const breadcrumbs = computed(() => {
  const parts = normalizePath(currentDirPath.value).split('/').filter(Boolean)
  let acc = ''
  return parts.map(part => {
    acc += '/' + part
    return { name: part, path: acc }
  })
})

function askConfirm(title: string, message: string): Promise<boolean> {
  confirmDialog.value = {
    visible: true,
    title,
    message,
  }
  return new Promise(resolve => {
    confirmResolver = resolve
  })
}

function resolveConfirm(result: boolean) {
  confirmDialog.value.visible = false
  if (confirmResolver) {
    confirmResolver(result)
    confirmResolver = null
  }
}

function destroyEditor() {
  if (searchPanelObserverRef.value) {
    searchPanelObserverRef.value.disconnect()
    searchPanelObserverRef.value = null
  }
  if (editorViewRef.value) {
    editorViewRef.value.destroy()
    editorViewRef.value = null
  }
}

function localizeSearchPanel() {
  const root = editorContainerRef.value
  if (!root) return

  const panel = root.querySelector('.cm-search') as HTMLElement | null
  if (!panel) return

  const findInput = panel.querySelector('input[name="search"], input[aria-label="Find"], input[placeholder="Find"]') as HTMLInputElement | null
  const replaceInput = panel.querySelector('input[name="replace"], input[aria-label="Replace"], input[placeholder="Replace"]') as HTMLInputElement | null

  if (findInput) {
    findInput.placeholder = '查找内容'
    findInput.setAttribute('aria-label', '查找')
    findInput.classList.add('cm-search-find-input')
  }
  if (replaceInput) {
    replaceInput.placeholder = '替换为'
    replaceInput.setAttribute('aria-label', '替换')
    replaceInput.classList.add('cm-search-replace-input')
  }

  const textInputs = panel.querySelectorAll('input[type="text"]')
  if (!findInput && textInputs[0]) {
    const input = textInputs[0] as HTMLInputElement
    input.placeholder = '查找内容'
    input.classList.add('cm-search-find-input')
  }
  if (!replaceInput && textInputs[1]) {
    const input = textInputs[1] as HTMLInputElement
    input.placeholder = '替换为'
    input.classList.add('cm-search-replace-input')
  }

  const buttonTextMap: Record<string, string> = {
    next: '下一个',
    prev: '上一个',
    previous: '上一个',
    replace: '替换',
    'replace all': '全部替换',
    all: '全部',
    close: '关闭',
  }

  panel.querySelectorAll('button').forEach(button => {
    const el = button as HTMLButtonElement
    const original = el.textContent?.trim().toLowerCase() || ''
    el.classList.remove('cm-search-find-action', 'cm-search-replace-action')
    if (buttonTextMap[original]) {
      el.textContent = buttonTextMap[original]
    }
    if (original === 'next' || original === 'prev' || original === 'previous' || original === 'close') {
      el.classList.add('cm-search-find-action')
    }
    if (original === 'replace' || original === 'replace all' || original === 'all') {
      el.classList.add('cm-search-replace-action')
    }
  })

  panel.querySelectorAll('label').forEach(label => {
    const el = label as HTMLLabelElement
    el.classList.add('cm-search-option')
    const original = el.textContent?.trim().toLowerCase() || ''
    let translated = ''
    if (original.includes('regexp')) {
      translated = '正则'
    }
    if (original.includes('case')) {
      translated = '区分大小写'
    }
    if (original.includes('word')) {
      translated = '全词匹配'
    }

    if (translated) {
      const textNode = Array.from(el.childNodes).find(node => node.nodeType === Node.TEXT_NODE)
      if (textNode) {
        textNode.textContent = ` ${translated}`
      } else {
        el.append(` ${translated}`)
      }
    }
  })
}

function setupSearchPanelObserver() {
  if (!editorContainerRef.value) return
  if (searchPanelObserverRef.value) {
    searchPanelObserverRef.value.disconnect()
  }

  const observer = new MutationObserver(() => {
    localizeSearchPanel()
  })

  observer.observe(editorContainerRef.value, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  searchPanelObserverRef.value = observer
  localizeSearchPanel()
}

function updateTabContent(tabId: string, content: string) {
  const tab = tabs.value.find(item => item.id === tabId)
  if (!tab) return
  tab.content = content
}

function scrollToTop() {
  const view = editorViewRef.value
  if (!view) return false
  view.dispatch({
    selection: EditorSelection.cursor(0),
    scrollIntoView: true,
  })
  return true
}

function scrollToBottom() {
  const view = editorViewRef.value
  if (!view) return false
  const len = view.state.doc.length
  view.dispatch({
    selection: EditorSelection.cursor(len),
    scrollIntoView: true,
  })
  return true
}

function createEditorForActiveTab() {
  const tab = activeTab.value
  if (!tab || !editorContainerRef.value) return

  destroyEditor()

  const tabId = tab.id
  const view = new EditorView({
    parent: editorContainerRef.value,
    state: EditorState.create({
      doc: tab.content,
      extensions: [
        basicSetup,
        search({ top: true }),
        history(),
        ...getLanguageExtensions(tab.path),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              void saveCurrentTab()
              return true
            },
          },
          {
            key: 'Escape',
            run: () => {
              void requestCloseEditor()
              return true
            },
          },
          {
            key: 'Mod-f',
            run: (view) => {
              openSearchPanel(view)
              queueMicrotask(() => localizeSearchPanel())
              return true
            },
          },
          {
            key: 'Mod-h',
            run: (view) => {
              openSearchPanel(view)
              queueMicrotask(() => localizeSearchPanel())
              return true
            },
          },
          {
            key: 'Mod-ArrowUp',
            run: () => scrollToTop(),
          },
          {
            key: 'Mod-ArrowDown',
            run: () => scrollToBottom(),
          },
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            updateTabContent(tabId, update.state.doc.toString())
          }
        }),
      ],
    }),
  })

  editorViewRef.value = view
  setupSearchPanelObserver()
}

function ensureTabFromPayload(path: string, content: string, encoding: string, sizeBytes: number) {
  const normalized = normalizePath(path)
  const existed = tabs.value.find(tab => tab.path === normalized)
  if (existed) {
    existed.content = content
    existed.originalContent = content
    existed.encoding = encoding || existed.encoding
    existed.sizeBytes = sizeBytes
    activeTabId.value = existed.id
    return
  }

  const tab: EditorTab = {
    id: genTabId(),
    path: normalized,
    name: getFileName(normalized),
    content,
    originalContent: content,
    encoding: encoding || 'utf-8',
    sizeBytes,
  }
  tabs.value.push(tab)
  activeTabId.value = tab.id
}

async function loadDirectory(path: string) {
  const normalized = normalizePath(path)
  currentDirPath.value = normalized
  pathInput.value = normalized
  fileListLoading.value = true
  try {
    const res = await fileApi.getFileList(normalized, 0, 0)
    if (res.data.code === 1) {
      fileList.value = [...res.data.data.items].sort((a, b) => {
        if (a.type === FILE_TYPE_FOLDER && b.type !== FILE_TYPE_FOLDER) return -1
        if (a.type !== FILE_TYPE_FOLDER && b.type === FILE_TYPE_FOLDER) return 1
        return a.name.localeCompare(b.name)
      })
    } else {
      notify.warning('目录加载失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('目录加载失败', e.message || '网络错误')
  } finally {
    fileListLoading.value = false
  }
}

async function openFilePath(path: string, preferDirectory?: string) {
  const normalized = normalizePath(path)
  const existed = tabs.value.find(tab => tab.path === normalized)
  if (existed) {
    activeTabId.value = existed.id
    await loadDirectory(preferDirectory || getParentPath(normalized))
    return
  }

  if (openingPathSet.value.has(normalized)) return
  openingPathSet.value.add(normalized)

  try {
    showLoadingOverlay()
    const res = await fileApi.readTextFile(normalized)
    if (res.data.code === 1 && res.data.data.success) {
      const data = res.data.data
      ensureTabFromPayload(data.targetPath, data.content, data.encoding, data.sizeBytes)
      await nextTick()
      createEditorForActiveTab()
      await loadDirectory(preferDirectory || getParentPath(data.targetPath))
    } else {
      notify.warning('打开失败', res.data.data?.errorMessage || res.data.msg)
    }
  } catch (e: any) {
    notify.error('打开失败', e.message || '读取文本失败')
  } finally {
    hideLoadingOverlay()
    openingPathSet.value.delete(normalized)
  }
}

function openCreateFileDialog() {
  createDialog.value.visible = true
}

async function confirmCreateFile(name: string) {
  createDialog.value.visible = false
  const base = normalizePath(currentDirPath.value)
  const fullPath = base === '/' ? `/${name}` : `${base}/${name}`

  try {
    const res = await fileApi.createFile(fullPath)
    if (res.data.code === 1 && res.data.data.success) {
      notify.info('新建成功', name)
      await loadDirectory(base)
      ensureTabFromPayload(fullPath, '', 'utf-8', 0)
      await nextTick()
      createEditorForActiveTab()
    } else {
      notify.warning('新建失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('新建失败', e.message || '网络错误')
  }
}

function switchTab(tabId: string) {
  activeTabId.value = tabId
}

async function removeTab(tabId: string) {
  const index = tabs.value.findIndex(tab => tab.id === tabId)
  if (index < 0) return

  const tab = tabs.value[index]
  if (tab.content !== tab.originalContent) {
    const shouldClose = await askConfirm('关闭标签页', `文件 ${tab.name} 有未保存修改，确认关闭吗？`)
    if (!shouldClose) return
  }

  tabs.value.splice(index, 1)

  if (activeTabId.value === tabId) {
    if (tabs.value.length === 0) {
      activeTabId.value = ''
      destroyEditor()
    } else {
      const nextIndex = Math.min(index, tabs.value.length - 1)
      activeTabId.value = tabs.value[nextIndex].id
    }
  }
}

async function saveCurrentTab() {
  const tab = activeTab.value
  if (!tab || saving.value) return
  if (tab.content === tab.originalContent) return

  saving.value = true
  try {
    const res = await fileApi.writeTextFile(tab.path, tab.content)
    if (res.data.code === 1 && res.data.data.success) {
      tab.originalContent = tab.content
      tab.sizeBytes = res.data.data.sizeBytes
      notify.info('保存成功', tab.path)
      await loadDirectory(getParentPath(tab.path))
    } else {
      notify.warning('保存失败', res.data.data?.errorMessage || res.data.msg)
    }
  } catch (e: any) {
    notify.error('保存失败', e.message || '网络错误')
  } finally {
    saving.value = false
  }
}

async function requestCloseEditor() {
  const dirtyTabs = tabs.value.filter(tab => tab.content !== tab.originalContent)
  if (dirtyTabs.length > 0) {
    const shouldClose = await askConfirm('关闭编辑器', `当前有 ${dirtyTabs.length} 个标签未保存，确认退出编辑器吗？`)
    if (!shouldClose) return
  }
  emit('cancel')
}

function navigateUp() {
  const parent = getParentPath(currentDirPath.value)
  void loadDirectory(parent)
}

function navigateByInput() {
  const target = normalizePath(pathInput.value)
  void loadDirectory(target)
}

function openListItem(item: FileItem) {
  if (item.type === FILE_TYPE_FOLDER) {
    void loadDirectory(item.path)
    return
  }
  void openFilePath(item.path, currentDirPath.value)
}

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      destroyEditor()
      return
    }

    await nextTick()

    if (tabs.value.length > 0 && activeTab.value) {
      createEditorForActiveTab()
    }

    if (fileList.value.length === 0) {
      await loadDirectory(currentDirPath.value)
    }
  }
)

watch(
  () => props.requestOpenToken,
  async () => {
    if (!props.visible || !props.requestOpenPath) return

    if (props.initialOpenPath && normalizePath(props.initialOpenPath) === normalizePath(props.requestOpenPath)) {
      ensureTabFromPayload(
        props.initialOpenPath,
        props.initialOpenContent,
        props.initialOpenEncoding,
        props.initialOpenSizeBytes
      )
      await nextTick()
      createEditorForActiveTab()
      await loadDirectory(getParentPath(props.initialOpenPath))
      return
    }

    await openFilePath(props.requestOpenPath)
  }
)

watch(activeTabId, async () => {
  if (!props.visible) return
  await nextTick()
  if (!activeTab.value) {
    destroyEditor()
    return
  }
  createEditorForActiveTab()
})

onBeforeUnmount(() => {
  destroyEditor()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="visible" class="dialog-overlay" @click.self="requestCloseEditor">
        <div class="dialog-card">
          <div class="dialog-header">
            <div class="editor-tabs">
              <button
                v-for="tab in tabs"
                :key="tab.id"
                class="editor-tab"
                :class="{ active: tab.id === activeTabId }"
                @click="switchTab(tab.id)"
              >
                <span class="tab-name">{{ tab.name }}</span>
                <span class="tab-dirty" v-if="tab.content !== tab.originalContent">*</span>
                <span class="tab-close" @click.stop="removeTab(tab.id)">x</span>
              </button>
            </div>
            <div class="header-actions">
              <button class="btn btn-primary" :disabled="!activeTab || saving || !isDirty" @click="saveCurrentTab">
                {{ saving ? '保存中...' : '保存 (Ctrl+S)' }}
              </button>
              <button class="btn btn-cancel" @click="requestCloseEditor">关闭 (Esc)</button>
            </div>
          </div>

          <div class="dialog-main">
            <aside class="left-panel">
              <div class="panel-tools">
                <button class="tool-btn" title="上一级" @click="navigateUp">上一级</button>
                <button class="tool-btn" title="刷新" @click="loadDirectory(currentDirPath)">刷新</button>
                <button class="tool-btn" title="新建文件" @click="openCreateFileDialog">新建</button>
              </div>
              <div class="path-input-row">
                <input v-model="pathInput" class="path-input" @keydown.enter="navigateByInput" placeholder="输入路径后回车" />
              </div>
              <div class="breadcrumbs">
                <button class="crumb" :class="{ current: currentDirPath === '/' }" @click="loadDirectory('/')">/</button>
                <template v-for="(node, idx) in breadcrumbs" :key="node.path">
                  <svg class="crumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <button class="crumb" :class="{ current: idx === breadcrumbs.length - 1 }" @click="loadDirectory(node.path)">{{ node.name }}</button>
                </template>
              </div>
              <div class="file-list">
                <div v-if="fileListLoading" class="file-list-state">加载中...</div>
                <button
                  v-for="item in fileList"
                  :key="item.path"
                  class="file-item"
                  :class="{ folder: item.type === FILE_TYPE_FOLDER }"
                  @click="openListItem(item)"
                >
                  <span class="file-icon" :class="{ folder: item.type === FILE_TYPE_FOLDER }">
                    <svg v-if="item.type === FILE_TYPE_FOLDER" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                    <svg v-else-if="/\.(ts|tsx|js|jsx|vue|json|css|scss|less|html|xml|yaml|yml|sql|md|sh|go|py|java|c|cpp|rs)$/i.test(item.name)" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <polyline points="10 13 8 15 10 17"/>
                      <polyline points="14 13 16 15 14 17"/>
                    </svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </span>
                  <span class="file-item-name">{{ item.name }}</span>
                </button>
              </div>
            </aside>

            <main class="editor-wrap">
              <div class="editor-meta" v-if="activeTab">
                <div class="meta-main">
                  <span class="meta-pill path">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span>{{ activeTab.path }}</span>
                  </span>
                  <span class="meta-pill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 7V4h16v3"/>
                      <path d="M9 20h6"/>
                      <path d="M12 4v16"/>
                    </svg>
                    {{ activeTab.encoding.toUpperCase() }}
                  </span>
                  <span class="meta-pill">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                      <polyline points="7.5 4.21 12 6.81 16.5 4.21"/>
                      <polyline points="7.5 19.79 7.5 14.6 3 12"/>
                      <polyline points="21 12 16.5 14.6 16.5 19.79"/>
                    </svg>
                    {{ activeTab.sizeBytes }} B
                  </span>
                </div>
                <div class="meta-hint">Ctrl+F 搜索 · Ctrl+H 替换 · Ctrl+Up/Down 顶部/底部</div>
              </div>
              <div ref="editorContainerRef" class="editor-host"></div>
            </main>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="dialog">
      <div v-if="confirmDialog.visible" class="confirm-overlay" @click.self="resolveConfirm(false)">
        <div class="confirm-card">
          <h3 class="confirm-title">{{ confirmDialog.title }}</h3>
          <p class="confirm-message">{{ confirmDialog.message }}</p>
          <div class="confirm-actions">
            <button class="btn btn-cancel" @click="resolveConfirm(false)">取消</button>
            <button class="btn btn-primary" @click="resolveConfirm(true)">确认</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <FileCreateDialog
    :visible="createDialog.visible"
    type="file"
    :currentPath="currentDirPath"
    @confirm="confirmCreateFile"
    @cancel="createDialog.visible = false"
  />
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 8500;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 10% 20%, color-mix(in srgb, var(--color-primary) 20%, transparent) 0, transparent 40%),
    radial-gradient(circle at 90% 0%, color-mix(in srgb, var(--color-gradient-end) 16%, transparent) 0, transparent 35%),
    rgba(0, 0, 0, 0.48);
  backdrop-filter: blur(8px);
}

.dialog-card {
  width: min(98vw, 1450px);
  height: min(93vh, 920px);
  border-radius: 18px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  box-shadow: 0 22px 55px rgba(0, 0, 0, 0.32), var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid var(--color-border);
  background:
    linear-gradient(120deg, color-mix(in srgb, var(--color-bg-elevated) 85%, var(--color-primary) 15%), var(--color-bg-elevated));
  padding: 10px;
}

.editor-tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  overflow-y: visible;
  flex: 1;
  align-items: flex-end;
  padding-top: 2px;
}

.editor-tab {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 170px;
  height: 34px;
  padding: 0 11px;
  border: 1px solid var(--color-border-solid);
  border-radius: 10px 10px 0 0;
  background: color-mix(in srgb, var(--color-bg-inset) 92%, transparent);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.18s ease;
}

.editor-tab:hover {
  filter: brightness(1.02);
  border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border-solid));
}

.editor-tab.active {
  color: var(--color-text);
  border-color: var(--color-primary);
  background: linear-gradient(160deg, color-mix(in srgb, var(--color-primary-ghost) 84%, transparent), var(--color-bg-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 30%, transparent);
}

.tab-name {
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-dirty {
  color: var(--color-warning);
}

.tab-close {
  opacity: 0.7;
  font-weight: 700;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 7px 14px;
  border-radius: 10px;
  border: 1px solid var(--color-border-solid);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px color-mix(in srgb, var(--color-primary) 32%, transparent);
}

.btn-cancel {
  background: var(--color-bg-inset);
  color: var(--color-text-secondary);
}

.btn-cancel:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.dialog-main {
  flex: 1;
  min-height: 0;
  display: flex;
}

.left-panel {
  width: 320px;
  border-right: 1px solid var(--color-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-elevated) 85%, var(--color-primary) 15%), var(--color-bg-inset));
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.panel-tools {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 8px;
}

.tool-btn {
  padding: 6px;
  border-radius: 8px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-surface);
  cursor: pointer;
  color: var(--color-text-secondary);
}

.tool-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.path-input-row {
  padding: 0 8px 8px;
}

.path-input {
  width: 100%;
  border: 1px solid var(--color-border-solid);
  border-radius: 8px;
  padding: 7px 10px;
  background: var(--color-bg-inset);
  color: var(--color-text);
}

.breadcrumbs {
  padding: 0 8px 8px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  font-size: 12px;
}

.crumb {
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 6px;
  padding: 3px 7px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.16s ease;
}

.crumb:hover {
  border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
  background: var(--color-primary-ghost);
  color: var(--color-primary);
}

.crumb.current {
  color: var(--color-text);
  border-color: color-mix(in srgb, var(--color-border-solid) 72%, var(--color-primary));
  background: color-mix(in srgb, var(--color-primary-ghost) 55%, transparent);
}

.crumb-sep {
  color: var(--color-text-faint);
}

.file-list {
  flex: 1;
  overflow: auto;
  border-top: 1px solid var(--color-border);
}

.file-list-state {
  padding: 12px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.file-item {
  width: 100%;
  display: flex;
  gap: 10px;
  align-items: center;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  min-height: 42px;
  padding: 10px 10px;
  cursor: pointer;
  color: var(--color-text-secondary);
  text-align: left;
  transition: all 0.16s ease;
}

.file-item:hover {
  background: color-mix(in srgb, var(--color-bg-hover) 75%, var(--color-primary-ghost));
}

.file-item.folder {
  color: var(--color-text);
}

.file-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}

.file-icon.folder {
  color: var(--color-primary);
}

.file-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-text);
}

.editor-wrap {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.editor-meta {
  min-height: 42px;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
  background: linear-gradient(180deg, var(--color-bg-elevated), color-mix(in srgb, var(--color-bg-elevated) 78%, var(--color-bg-inset)));
}

.meta-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--color-border-solid) 85%, var(--color-primary));
  background: color-mix(in srgb, var(--color-bg-inset) 86%, transparent);
  color: var(--color-text-secondary);
}

.meta-pill.path {
  max-width: min(44vw, 560px);
}

.meta-pill.path span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-hint {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px dashed color-mix(in srgb, var(--color-primary) 34%, transparent);
  background: color-mix(in srgb, var(--color-primary-ghost) 75%, transparent);
  color: var(--color-text-secondary);
}

.editor-host {
  flex: 1;
  min-height: 0;
}

.editor-host :deep(.cm-editor) {
  height: 100%;
  font-size: 13.5px;
  color: var(--color-text);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg) 95%, var(--color-bg-elevated)), var(--color-bg));
}

.editor-host :deep(.cm-scroller) {
  font-family: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;
}

.editor-host :deep(.cm-gutters) {
  background: var(--color-bg-inset);
  border-right: 1px solid var(--color-border);
  color: var(--color-text-muted);
}

.editor-host :deep(.cm-panels.cm-panels-top) {
  border-bottom: 1px solid var(--color-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-bg-elevated) 90%, var(--color-primary) 10%), var(--color-bg-elevated));
}

.editor-host :deep(.cm-search) {
  display: grid;
  grid-template-columns: minmax(260px, 360px) repeat(10, max-content);
  align-items: center;
  column-gap: 8px;
  row-gap: 8px;
  padding: 10px;
}

.editor-host :deep(.cm-search .cm-search-find-input),
.editor-host :deep(.cm-search .cm-search-replace-input) {
  width: min(360px, 100%);
}

.editor-host :deep(.cm-search .cm-search-find-input) {
  grid-column: 1;
  grid-row: 1;
}

.editor-host :deep(.cm-search .cm-search-replace-input) {
  grid-column: 1;
  grid-row: 2;
}

.editor-host :deep(.cm-search .cm-search-find-action) {
  grid-row: 1;
}

.editor-host :deep(.cm-search .cm-search-replace-action) {
  grid-row: 2;
}

.editor-host :deep(.cm-search .cm-search-option) {
  grid-row: 2;
  height: 34px;
  padding: 0 10px 0 8px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--color-border-solid) 85%, var(--color-primary));
  background: color-mix(in srgb, var(--color-bg-surface) 86%, var(--color-bg-elevated)) !important;
  width: auto !important;
}

.editor-host :deep(.cm-search input:not([type='checkbox'])) {
  min-width: 260px;
  border: 1px solid var(--color-border-solid);
  border-radius: 10px;
  height: 34px;
  box-sizing: border-box;
  padding: 0 12px;
  background: color-mix(in srgb, var(--color-bg-surface) 75%, var(--color-bg-inset) 25%) !important;
  color: var(--color-text);
  line-height: 34px;
  transition: all 0.2s ease;
}

.editor-host :deep(.cm-search input:not([type='checkbox']):focus) {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.editor-host :deep(.cm-search button) {
  border: 1px solid color-mix(in srgb, var(--color-border-solid) 80%, var(--color-primary));
  border-radius: 10px;
  height: 34px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--color-bg-surface) 90%, var(--color-primary-ghost));
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: all 0.2s ease;
}

.editor-host :deep(.cm-search button:hover) {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-ghost);
  transform: translateY(-1px);
}

.editor-host :deep(.cm-search .cm-search-option) {
  color: var(--color-text-secondary);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.editor-host :deep(.cm-search .cm-search-option input[type='checkbox']) {
  appearance: none;
  width: 14px;
  height: 14px;
  margin: 0;
  flex-shrink: 0;
  border-radius: 4px;
  border: 1px solid var(--color-search-checkbox-border);
  background: var(--color-search-checkbox-bg);
  transition: all 0.16s ease;
}

.editor-host :deep(.cm-search .cm-search-option input[type='checkbox']:hover) {
  border-color: var(--color-primary);
}

.editor-host :deep(.cm-search .cm-search-option input[type='checkbox']:checked) {
  border-color: var(--color-primary);
  background: var(--color-primary);
  box-shadow: inset 0 0 0 2px var(--color-search-checkbox-check);
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 8600;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.confirm-card {
  width: min(92vw, 420px);
  border-radius: 14px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-lg);
  padding: 18px;
}

.confirm-title {
  font-size: 18px;
  color: var(--color-text);
}

.confirm-message {
  margin-top: 8px;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
