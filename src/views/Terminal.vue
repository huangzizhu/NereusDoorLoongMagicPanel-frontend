<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Terminal as Xterm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import * as terminalApi from '../api/terminal'
import { useNotification } from '../composables/useNotification'
import { useTheme, type ThemeMode } from '../composables/useTheme'
import type {
  TerminalAdminLoginMessage,
  TerminalAvailableData,
  TerminalClientMessage,
  TerminalServerMessage,
  TerminalSessionLogItem,
} from '../types/terminal'

type ViewTab = 'terminal' | 'logs'
type ConnectMode = 'normal' | 'admin-direct'
type ConnectionStatus = 'idle' | 'checking' | 'connecting' | 'connected' | 'closed' | 'error'

const notify = useNotification()
const { currentTheme } = useTheme()

const activeTab = ref<ViewTab>('terminal')
const terminalEl = ref<HTMLElement | null>(null)
const status = ref<ConnectionStatus>('idle')
const connectMode = ref<ConnectMode>('normal')
const currentMode = ref('normal')
const sessionId = ref('')
const title = ref('未连接')
const linuxUser = ref('-')
const closeReason = ref('')
const availableMessage = ref('正在检测普通终端可用性')
const availableData = ref<TerminalAvailableData | null>(null)

const adminForm = ref({
  username: '',
  password: '',
})
const adminSubmitting = ref(false)
const pendingAdminDirectLogin = ref(false)

const logs = ref<TerminalSessionLogItem[]>([])
const logsLoading = ref(false)
const logsLoaded = ref(false)
const logsPage = ref(1)
const logsPageSize = ref(10)
const logsTotal = ref(0)

const TERMINAL_DIMENSION_MIN = 1
const TERMINAL_DIMENSION_MAX = 500

let term: Xterm | null = null
let fitAddon: FitAddon | null = null
let ws: WebSocket | null = null
let resizeObserver: ResizeObserver | null = null
let resizeTimer: ReturnType<typeof setTimeout> | null = null
let lastSentDimensions: { cols: number, rows: number } | null = null
let lastObservedHostSize = { width: 0, height: 0 }
let lastClientMessage = ''

const statusText = computed(() => {
  const map: Record<ConnectionStatus, string> = {
    idle: '未连接',
    checking: '检测中',
    connecting: '连接中',
    connected: '已连接',
    closed: '已断开',
    error: '连接异常',
  }
  return map[status.value]
})

const statusClass = computed(() => {
  if (status.value === 'connected') return 'success'
  if (status.value === 'connecting' || status.value === 'checking') return 'warning'
  if (status.value === 'error') return 'danger'
  return 'neutral'
})

const canSendInput = computed(() => {
  return status.value === 'connected' && (!pendingAdminDirectLogin.value || currentMode.value === 'admin')
})

const logsTotalPages = computed(() => Math.max(1, Math.ceil(logsTotal.value / logsPageSize.value)))

function getTerminalTheme(theme: ThemeMode) {
  if (theme === 'light') {
    return {
      background: '#f8fafc',
      foreground: '#1e293b',
      cursor: '#2563eb',
      cursorAccent: '#ffffff',
      selectionBackground: '#bfdbfe',
      black: '#0f172a',
      red: '#dc2626',
      green: '#059669',
      yellow: '#d97706',
      blue: '#2563eb',
      magenta: '#7c3aed',
      cyan: '#0891b2',
      white: '#e2e8f0',
      brightBlack: '#64748b',
      brightRed: '#ef4444',
      brightGreen: '#10b981',
      brightYellow: '#f59e0b',
      brightBlue: '#3b82f6',
      brightMagenta: '#8b5cf6',
      brightCyan: '#06b6d4',
      brightWhite: '#ffffff',
    }
  }

  return {
    background: '#0c1222',
    foreground: '#e2e8f0',
    cursor: '#93c5fd',
    cursorAccent: '#0c1222',
    selectionBackground: '#334155',
    black: '#020617',
    red: '#f87171',
    green: '#34d399',
    yellow: '#fbbf24',
    blue: '#60a5fa',
    magenta: '#a78bfa',
    cyan: '#22d3ee',
    white: '#cbd5e1',
    brightBlack: '#64748b',
    brightRed: '#ef4444',
    brightGreen: '#6ee7b7',
    brightYellow: '#fcd34d',
    brightBlue: '#93c5fd',
    brightMagenta: '#c4b5fd',
    brightCyan: '#67e8f9',
    brightWhite: '#f8fafc',
  }
}

function writeSystemLine(message: string) {
  term?.writeln(`\r\n\x1b[90m${message}\x1b[0m`)
}

function isPrimaryModifier(event: KeyboardEvent) {
  return navigator.platform.toUpperCase().includes('MAC') ? event.metaKey : event.ctrlKey
}

function isCopyShortcut(event: KeyboardEvent) {
  return isPrimaryModifier(event) && event.shiftKey && event.key.toLowerCase() === 'c'
}

function isPasteShortcut(event: KeyboardEvent) {
  return isPrimaryModifier(event) && event.shiftKey && event.key.toLowerCase() === 'v'
}

function clampTerminalDimension(value: number, fallback: number) {
  return Math.max(
    TERMINAL_DIMENSION_MIN,
    Math.min(
      TERMINAL_DIMENSION_MAX,
      Number.isFinite(value) ? Math.floor(value) : fallback,
    ),
  )
}

function normalizeTerminalDimensions(cols: number, rows: number) {
  return {
    cols: clampTerminalDimension(cols, 120),
    rows: clampTerminalDimension(rows, 30),
  }
}

function decodeAnsiCString(value: string) {
  let result = ''

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char !== '\\') {
      result += char
      continue
    }

    const nextChar = value[index + 1]
    if (!nextChar) {
      result += '\\'
      continue
    }

    if (/[0-7]/.test(nextChar)) {
      let octal = nextChar
      let cursor = index + 2
      while (cursor < value.length && octal.length < 3 && /[0-7]/.test(value[cursor])) {
        octal += value[cursor]
        cursor += 1
      }
      result += String.fromCharCode(parseInt(octal, 8))
      index = cursor - 1
      continue
    }

    if (nextChar === 'x') {
      const hex = value.slice(index + 2, index + 4)
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        result += String.fromCharCode(parseInt(hex, 16))
        index += 3
        continue
      }
    }

    const escapedCharMap: Record<string, string> = {
      '\\': '\\',
      '\'': '\'',
      '"': '"',
      a: '\u0007',
      b: '\b',
      e: '\u001b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
    }

    result += escapedCharMap[nextChar] ?? nextChar
    index += 1
  }

  return result
}

function decodeShellEscapedOutput(data: string) {
  if (!data.includes("$'")) return data

  return data.replace(/(?:'[^']*'|\$'(?:\\.|[^'])*')+/g, (segment) => {
    if (!segment.includes("$'")) return segment

    let decoded = ''
    const tokenPattern = /'([^']*)'|\$'((?:\\.|[^'])*)'/g
    let tokenMatch: RegExpExecArray | null

    while ((tokenMatch = tokenPattern.exec(segment))) {
      if (tokenMatch[1] !== undefined) {
        decoded += tokenMatch[1]
        continue
      }
      decoded += decodeAnsiCString(tokenMatch[2] || '')
    }

    try {
      return new TextDecoder('utf-8').decode(
        Uint8Array.from(decoded, (char) => char.charCodeAt(0)),
      )
    } catch {
      return decoded
    }
  })
}

function createTerminal() {
  if (!terminalEl.value) return

  term = new Xterm({
    cursorBlink: true,
    convertEol: true,
    fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 14,
    fontWeight: 500,
    fontWeightBold: 800,
    lineHeight: 1.25,
    cursorStyle: 'bar',
    cursorInactiveStyle: 'outline',
    minimumContrastRatio: 4.5,
    scrollback: 5000,
    theme: getTerminalTheme(currentTheme.value),
  })
  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(terminalEl.value)
  term.attachCustomKeyEventHandler((event) => {
    if (isCopyShortcut(event)) {
      event.preventDefault()
      void copySelection(false)
      return false
    }

    if (isPasteShortcut(event)) {
      event.preventDefault()
      void pasteClipboard(false)
      return false
    }

    return true
  })
  term.onData((data) => {
    if (!canSendInput.value) return
    sendMessage({ type: 'input', data })
  })
  term.writeln('\x1b[90m等待连接终端...\x1b[0m')

  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return

    const width = Math.round(entry.contentRect.width)
    const height = Math.round(entry.contentRect.height)
    if (width === lastObservedHostSize.width && height === lastObservedHostSize.height) return

    lastObservedHostSize = { width, height }
    scheduleFitAndResize()
  })
  if (terminalEl.value) {
    resizeObserver.observe(terminalEl.value)
  }
  scheduleFitAndResize()
}

function getCurrentDimensions() {
  if (!fitAddon || !term) return { cols: 120, rows: 30 }
  const proposed = fitAddon.proposeDimensions()
  return normalizeTerminalDimensions(
    proposed?.cols || term.cols || 120,
    proposed?.rows || term.rows || 30,
  )
}

function sendResizeIfNeeded(force = false) {
  if (!term) return false

  const dimensions = normalizeTerminalDimensions(term.cols, term.rows)
  if (!force && lastSentDimensions
    && lastSentDimensions.cols === dimensions.cols
    && lastSentDimensions.rows === dimensions.rows) {
    return false
  }

  lastSentDimensions = dimensions
  return sendMessage({ type: 'resize', cols: dimensions.cols, rows: dimensions.rows })
}

function scheduleFitAndResize(forceResize = false) {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    if (!fitAddon || !term) return
    fitAddon.fit()
    if (status.value === 'connected') {
      sendResizeIfNeeded(forceResize)
    }
  }, 80)
}

function resetConnectionState() {
  currentMode.value = 'normal'
  sessionId.value = ''
  linuxUser.value = '-'
  title.value = '未连接'
  closeReason.value = ''
  pendingAdminDirectLogin.value = false
  adminSubmitting.value = false
  lastSentDimensions = null
}

function closeSocket(markClosed = true) {
  if (ws) {
    ws.onopen = null
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null
    ws.close()
    ws = null
  }
  if (markClosed && status.value === 'connected') {
    status.value = 'closed'
  }
}

function sendMessage(message: TerminalClientMessage) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false
  const payload = JSON.stringify(message)
  lastClientMessage = payload
  ws.send(payload)
  return true
}

function connect(mode: ConnectMode) {
  closeSocket(false)
  resetConnectionState()
  connectMode.value = mode
  status.value = 'connecting'
  term?.clear()
  writeSystemLine(mode === 'normal' ? '正在连接普通终端...' : '正在连接管理员直连终端...')

  const dimensions = getCurrentDimensions()
  const path = mode === 'normal' ? '/terminal/ws' : '/terminal/admin/ws'
  ws = new WebSocket(terminalApi.createTerminalWsUrl(path, dimensions.cols, dimensions.rows))

  ws.onopen = () => {
    status.value = 'connected'
    scheduleFitAndResize(true)
    if (mode === 'admin-direct') {
      pendingAdminDirectLogin.value = true
      submitAdminLogin(true)
    }
  }

  ws.onmessage = (event) => {
    handleWsMessage(event.data)
  }

  ws.onerror = () => {
    status.value = 'error'
    closeReason.value = 'websocket_error'
    notify.error('终端连接异常', 'WebSocket 连接发生错误')
  }

  ws.onclose = (event) => {
    if (ws) ws = null
    if (status.value !== 'error') {
      status.value = 'closed'
    }
    closeReason.value = event.reason || closeReason.value || `code ${event.code}`
    adminSubmitting.value = false
    if (event.code !== 1000) {
      writeSystemLine(`连接已关闭：${closeReason.value}`)
    }
  }
}

function shouldFilterShellStartupOutput(data: string) {
  return data.includes('cannot set terminal process group')
    && data.includes('no job control in this shell')
}

function handleWsMessage(raw: string) {
  let message: TerminalServerMessage
  try {
    message = JSON.parse(raw)
  } catch {
    term?.write(raw)
    return
  }

  if (message.type === 'output') {
    if (shouldFilterShellStartupOutput(message.data)) return
    term?.write(decodeShellEscapedOutput(message.data))
    return
  }

  if (message.type === 'state') {
    sessionId.value = message.sessionId
    currentMode.value = message.mode
    linuxUser.value = message.linuxUser || '-'
    title.value = message.title || '终端'
    pendingAdminDirectLogin.value = false
    return
  }

  if (message.type === 'admin_login_result') {
    adminSubmitting.value = false
    pendingAdminDirectLogin.value = !message.success && connectMode.value === 'admin-direct'
    if (message.success) {
      currentMode.value = message.mode
      notify.info('管理员认证成功', message.msg || '管理员终端已创建')
    } else {
      notify.warning('管理员认证失败', message.msg || '请检查用户名和密码')
      writeSystemLine(message.msg || '管理员认证失败')
    }
    return
  }

  if (message.type === 'error') {
    if (message.code === 'invalid_message') {
      console.warn('Terminal invalid_message', { lastClientMessage })
    }
    notify.error('终端错误', message.msg || message.code || '未知错误')
    writeSystemLine(message.msg || message.code || '终端错误')
  }
}

async function checkNormalAvailability(autoConnect = false) {
  status.value = status.value === 'connected' ? status.value : 'checking'
  try {
    const res = await terminalApi.getTerminalAvailable()
    availableData.value = res.data.data
    if (res.data.data?.normalTerminalAvailable) {
      availableMessage.value = `普通终端可用：${res.data.data.normalContainerName || '默认容器'}`
      if (autoConnect) connect('normal')
      else if (status.value === 'checking') status.value = 'idle'
      return
    }
    availableMessage.value = res.data.msg || '普通终端不可用'
    if (status.value === 'checking') status.value = 'idle'
  } catch (e: any) {
    availableData.value = null
    availableMessage.value = e?.response?.data?.msg || e?.message || '普通终端检测失败'
    if (status.value === 'checking') status.value = 'error'
  }
}

function connectNormal() {
  if (!availableData.value?.normalTerminalAvailable) {
    notify.warning('普通终端不可用', availableMessage.value)
    return
  }
  connect('normal')
}

function connectAdminDirect() {
  if (!adminForm.value.username.trim() || !adminForm.value.password) {
    notify.warning('请输入管理员账号', 'Linux 用户名和密码不能为空')
    return
  }
  connect('admin-direct')
}

function submitAdminLogin(isFirstPacket = false) {
  if (!adminForm.value.username.trim() || !adminForm.value.password) {
    if (!isFirstPacket) notify.warning('请输入管理员账号', 'Linux 用户名和密码不能为空')
    return
  }

  const message: TerminalAdminLoginMessage = {
    type: 'admin_login',
    username: adminForm.value.username.trim(),
    password: adminForm.value.password,
  }
  adminSubmitting.value = true
  const sent = sendMessage(message)
  adminForm.value.password = ''
  if (!sent) {
    adminSubmitting.value = false
    notify.warning('发送失败', '终端尚未连接')
  }
}

function disconnect() {
  closeSocket()
  status.value = 'closed'
  writeSystemLine('已断开终端连接')
}

function reconnect() {
  if (connectMode.value === 'admin-direct') {
    connectAdminDirect()
    return
  }
  connectNormal()
}

function clearTerminal() {
  term?.clear()
}

async function copySelection(showFeedback = true) {
  const selection = term?.getSelection()
  if (!selection) {
    if (showFeedback) {
      notify.warning('没有可复制内容', '请先在终端中选择文本')
    }
    return
  }
  try {
    await navigator.clipboard.writeText(selection)
    term?.clearSelection()
    if (showFeedback) {
      notify.info('复制成功', '已复制选中文本')
    }
  } catch {
    notify.error('复制失败', '当前浏览器不允许访问剪贴板')
  }
}

async function pasteClipboard(showFeedback = true) {
  if (!canSendInput.value) {
    if (showFeedback) {
      notify.warning('终端不可写', '当前连接状态不允许粘贴内容')
    }
    return
  }

  try {
    const text = await navigator.clipboard.readText()
    if (!text) {
      if (showFeedback) {
        notify.warning('剪贴板为空', '没有可粘贴的文本内容')
      }
      return
    }

    const sent = sendMessage({ type: 'input', data: text })
    if (!sent) {
      notify.warning('发送失败', '终端尚未连接')
      return
    }

    term?.focus()
    if (showFeedback) {
      notify.info('已粘贴到终端', `共 ${text.length} 个字符`)
    }
  } catch {
    notify.error('粘贴失败', '当前浏览器不允许读取剪贴板')
  }
}

async function loadLogs() {
  logsLoading.value = true
  try {
    const res = await terminalApi.getTerminalSessionLogs({
      page: logsPage.value,
      pageSize: logsPageSize.value,
    })
    if (res.data.data) {
      logs.value = res.data.data.items || []
      logsTotal.value = res.data.data.total || 0
      logsLoaded.value = true
    } else {
      notify.warning('获取会话日志失败', res.data.msg || '接口未返回日志数据')
    }
  } catch (e: any) {
    notify.error('获取会话日志失败', e?.response?.data?.msg || e?.message || '网络异常')
  } finally {
    logsLoading.value = false
  }
}

function prevLogsPage() {
  if (logsPage.value <= 1) return
  logsPage.value -= 1
  loadLogs()
}

function nextLogsPage() {
  if (logsPage.value >= logsTotalPages.value) return
  logsPage.value += 1
  loadLogs()
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ')
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`
}

watch(currentTheme, (theme) => {
  if (term) {
    term.options.theme = getTerminalTheme(theme)
    nextTick(() => scheduleFitAndResize())
  }
})

watch(activeTab, (tab) => {
  if (tab === 'terminal') {
    nextTick(() => scheduleFitAndResize())
    return
  }
  if (!logsLoaded.value) loadLogs()
})

onMounted(async () => {
  await nextTick()
  createTerminal()
  await checkNormalAvailability(true)
})

onBeforeUnmount(() => {
  closeSocket(false)
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeObserver?.disconnect()
  term?.dispose()
})
</script>

<template>
  <div class="terminal-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Tools</p>
        <h1 class="page-title">终端</h1>
        <p class="page-subtitle">通过 WebSocket 连接服务器终端</p>
      </div>
      <div class="header-actions">
        <span class="status-pill" :class="statusClass">{{ statusText }}</span>
        <button class="secondary-btn" @click="checkNormalAvailability(false)">检测普通终端</button>
      </div>
    </header>

    <div class="tabs-wrap">
      <button class="tab-btn" :class="{ active: activeTab === 'terminal' }" @click="activeTab = 'terminal'">终端</button>
      <button class="tab-btn" :class="{ active: activeTab === 'logs' }" @click="activeTab = 'logs'">会话日志</button>
    </div>

    <section v-show="activeTab === 'terminal'" class="terminal-layout">
      <aside class="side-panel">
        <div class="info-block">
          <div class="block-title">连接信息</div>
          <div class="meta-list">
            <div><span>标题</span><strong>{{ title }}</strong></div>
            <div><span>模式</span><strong>{{ currentMode }}</strong></div>
            <div><span>Linux 用户</span><strong>{{ linuxUser }}</strong></div>
            <div><span>会话</span><strong class="mono">{{ sessionId || '-' }}</strong></div>
          </div>
        </div>

        <div class="info-block">
          <div class="block-title">普通终端</div>
          <p class="hint-text">{{ availableMessage }}</p>
          <button class="primary-btn full-btn" :disabled="!availableData?.normalTerminalAvailable || status === 'connecting'" @click="connectNormal">
            连接普通终端
          </button>
        </div>

        <div class="info-block">
          <div class="block-title">管理员终端</div>
          <label class="form-label">
            Linux 用户名
            <input v-model="adminForm.username" class="form-input" autocomplete="username" placeholder="例如 root 或 he">
          </label>
          <label class="form-label">
            Linux 密码
            <input v-model="adminForm.password" class="form-input" type="password" autocomplete="current-password" placeholder="仅用于本次认证" @keyup.enter="connectMode === 'admin-direct' && status === 'connected' ? submitAdminLogin(false) : connectAdminDirect()">
          </label>
          <div class="button-stack">
            <button class="primary-btn full-btn" :disabled="adminSubmitting || status === 'connecting'" @click="connectAdminDirect">
              管理员直连
            </button>
            <button class="secondary-btn full-btn" :disabled="adminSubmitting || status !== 'connected'" @click="submitAdminLogin(false)">
              当前会话切管理员
            </button>
          </div>
        </div>

        <div class="info-block">
          <div class="block-title">操作</div>
          <div class="button-grid">
            <button class="secondary-btn" :disabled="status === 'connecting'" @click="reconnect">重连</button>
            <button class="secondary-btn" :disabled="status !== 'connected'" @click="disconnect">断开</button>
            <button class="secondary-btn" @click="clearTerminal">清屏</button>
            <button class="secondary-btn" @click="() => copySelection()">复制</button>
            <button class="secondary-btn" :disabled="!canSendInput" @click="() => pasteClipboard()">粘贴</button>
          </div>
          <p v-if="closeReason" class="hint-text">最近关闭：{{ closeReason }}</p>
        </div>
      </aside>

      <main class="terminal-shell">
        <div class="terminal-toolbar">
          <div class="terminal-title">
            <span class="terminal-dot"></span>
            <span>{{ title }}</span>
          </div>
          <div class="terminal-toolbar-meta">
            <span class="terminal-shortcut-tip">Ctrl/Cmd+Shift+C/V，右键粘贴</span>
            <span class="terminal-meta">{{ connectMode === 'admin-direct' ? '管理员直连' : '普通终端' }}</span>
          </div>
        </div>
        <div ref="terminalEl" class="xterm-host" @contextmenu.prevent="pasteClipboard(false)"></div>
      </main>
    </section>

    <section v-show="activeTab === 'logs'" class="logs-section">
      <div class="logs-toolbar">
        <div>
          <h2>会话日志</h2>
          <p>共 {{ logsTotal }} 条记录</p>
        </div>
        <button class="secondary-btn" :disabled="logsLoading" @click="loadLogs">刷新日志</button>
      </div>

      <div class="table-wrap">
        <table class="log-table">
          <thead>
            <tr>
              <th>Log ID</th>
              <th>模式</th>
              <th>面板用户</th>
              <th>客户端 IP</th>
              <th>Linux 用户</th>
              <th>开始时间</th>
              <th>结束时间</th>
              <th>关闭原因</th>
              <th>退出码</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="logsLoading">
              <td colspan="9" class="empty-cell">正在加载日志...</td>
            </tr>
            <tr v-else-if="logs.length === 0">
              <td colspan="9" class="empty-cell">暂无会话日志</td>
            </tr>
            <tr v-for="item in logs" :key="item.logId">
              <td>{{ item.logId }}</td>
              <td><span class="mode-tag">{{ item.mode }}</span></td>
              <td>{{ item.panelUsername }}</td>
              <td>{{ item.clientIp }}</td>
              <td>{{ item.adminLinuxUsername || '-' }}</td>
              <td>{{ formatDateTime(item.startTime) }}</td>
              <td>{{ formatDateTime(item.endTime) }}</td>
              <td>{{ item.closeReason || '-' }}</td>
              <td>{{ item.exitCode ?? '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <button class="secondary-btn" :disabled="logsLoading || logsPage <= 1" @click="prevLogsPage">上一页</button>
        <span>第 {{ logsPage }} / {{ logsTotalPages }} 页</span>
        <button class="secondary-btn" :disabled="logsLoading || logsPage >= logsTotalPages" @click="nextLogsPage">下一页</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.terminal-page {
  min-height: 100%;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 22px;
  border: 1px solid var(--color-border);
  border-radius: 24px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
  margin-bottom: 18px;
}

.eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-primary);
}

.page-title {
  margin-top: 6px;
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.05em;
  color: var(--color-text);
}

.page-subtitle {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  max-width: 700px;
}



.header-actions,
.tabs-wrap,
.logs-toolbar,
.pagination {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tabs-wrap {
  padding: 4px;
  width: fit-content;
  border: 1px solid var(--color-border-solid);
  border-radius: 12px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
}

.tab-btn {
  border: none;
  border-radius: 8px;
  padding: 9px 18px;
  color: var(--color-text-secondary);
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}

.tab-btn.active {
  color: var(--color-primary);
  background: var(--color-bg-active);
}

.terminal-layout {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  gap: 18px;
  min-height: 0;
  height: calc(100vh - var(--topbar-height) - 150px);
}

.side-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.info-block,
.logs-section {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
}

.info-block {
  padding: 16px;
}

.block-title {
  margin-bottom: 12px;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 800;
}

.meta-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.meta-list div {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 10px;
  align-items: baseline;
}

.meta-list span,
.hint-text {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.meta-list strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-text);
  font-size: 13px;
}

.mono {
  font-family: Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.hint-text {
  margin: 0 0 12px;
  line-height: 1.6;
}

.form-label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.form-input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--color-border-solid);
  border-radius: 8px;
  outline: none;
  background: var(--color-bg-inset);
  color: var(--color-text);
  font-size: 14px;
}

.form-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.button-stack,
.button-grid {
  display: grid;
  gap: 10px;
}

.button-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.terminal-shell {
  min-width: 0;
  height: 100%;
  min-height: 520px;
  overflow: hidden;
  border: 1px solid var(--color-border-solid);
  border-radius: 8px;
  background: var(--color-bg-inset);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
}

.terminal-toolbar {
  height: 44px;
  padding: 0 14px;
  border-bottom: 1px solid var(--color-border-solid);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--color-bg-surface);
}

.terminal-toolbar-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.terminal-title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 700;
}

.terminal-title span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 0 4px var(--color-success-bg);
  flex: 0 0 auto;
}

.terminal-meta {
  color: var(--color-text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.terminal-shortcut-tip {
  color: var(--color-text-muted);
  font-size: 11px;
  white-space: nowrap;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-bg-inset) 82%, transparent);
}

.xterm-host {
  flex: 1;
  min-height: 0;
  padding: 10px;
  overflow: hidden;
  cursor: text;
}

.xterm-host :deep(.xterm) {
  height: 100%;
}

.xterm-host :deep(.xterm-viewport) {
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

.logs-section {
  padding: 18px;
}

.logs-toolbar {
  justify-content: space-between;
  margin-bottom: 14px;
}

.logs-toolbar h2 {
  margin: 0;
  color: var(--color-text);
  font-size: 18px;
}

.logs-toolbar p {
  margin: 5px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.table-wrap {
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.log-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  background: var(--color-bg-surface);
}

.log-table th,
.log-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-divider);
  color: var(--color-text-secondary);
  font-size: 13px;
  text-align: left;
  white-space: nowrap;
}

.log-table th {
  color: var(--color-text);
  font-weight: 800;
  background: var(--color-bg-inset);
}

.log-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.empty-cell {
  text-align: center !important;
  color: var(--color-text-muted) !important;
}

.mode-tag,
.status-pill {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.mode-tag {
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.status-pill.success {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.status-pill.warning {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.status-pill.danger {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.status-pill.neutral {
  color: var(--color-text-secondary);
  background: var(--color-bg-inset);
}

.primary-btn,
.secondary-btn {
  min-height: 36px;
  border: none;
  border-radius: 8px;
  padding: 0 14px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  transition: all 0.2s ease;
}

.primary-btn {
  color: #ffffff;
  background: var(--color-primary);
  box-shadow: 0 8px 18px -12px var(--color-primary-shadow);
}

.primary-btn:hover {
  background: var(--color-primary-dark);
}

.secondary-btn {
  color: var(--color-text-secondary);
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border-solid);
}

.secondary-btn:hover {
  color: var(--color-primary);
  border-color: var(--color-primary-light);
}

.primary-btn:disabled,
.secondary-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  box-shadow: none;
}

.full-btn {
  width: 100%;
}

.pagination {
  justify-content: flex-end;
  margin-top: 14px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

@media (max-width: 1100px) {
  .terminal-layout {
    grid-template-columns: 1fr;
    height: auto;
  }

  .side-panel {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .terminal-page {
    padding: 16px;
  }

  .page-header,
  .logs-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    justify-content: space-between;
  }

  .terminal-toolbar {
    height: auto;
    padding: 10px 14px;
    align-items: flex-start;
    flex-direction: column;
  }

  .terminal-toolbar-meta {
    width: 100%;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }

  .side-panel {
    grid-template-columns: 1fr;
  }

  .terminal-shell {
    min-height: 440px;
  }
}
</style>
