<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as nginxApi from '../api/nginx'
import DockerStatusCard from '../components/docker/DockerStatusCard.vue'
import DockerEmptyState from '../components/docker/DockerEmptyState.vue'
import { useNotification } from '../composables/useNotification'
import FileTextEditorDialog from '../components/file/FileTextEditorDialog.vue'
import type {
  NginxConfigTestResult,
  NginxCreateSiteParams,
  NginxCreateSiteResult,
  NginxDeleteSiteResult,
  NginxInstallInfo,
  NginxSiteInfo,
  NginxSitesResponse,
  NginxSslApplyParams,
  NginxSslApplyResult,
  NginxSslConfigParams,
  NginxSslConfigResult,
  NginxSslRenewParams,
  NginxSslRenewResult,
  NginxStatusInfo,
} from '../types/nginx'

type NginxTab = 'overview' | 'config' | 'sites' | 'ssl'
type ConfirmAction = 'reload' | 'restart'

const notify = useNotification()

const NGINX_ICON = '<svg fill="#009639" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>NGINX</title><path d="M12 0L1.605 6v12L12 24l10.395-6V6L12 0zm6 16.59c0 .705-.646 1.29-1.529 1.29-.631 0-1.351-.255-1.801-.81l-6-7.141v6.66c0 .721-.57 1.29-1.274 1.29H7.32c-.721 0-1.29-.6-1.29-1.29V7.41c0-.705.63-1.29 1.5-1.29.646 0 1.38.255 1.83.81l5.97 7.141V7.41c0-.721.6-1.29 1.29-1.29h.075c.72 0 1.29.6 1.29 1.29v9.18H18z"/></svg>'

const loading = ref(true)
const refreshing = ref(false)
const activeTab = ref<NginxTab>('overview')
const installInfo = ref<NginxInstallInfo | null>(null)
const statusInfo = ref<NginxStatusInfo | null>(null)
const lastUpdatedText = ref('尚未刷新')

const configTesting = ref(false)
const configTestResult = ref<NginxConfigTestResult | null>(null)
const actionLoading = ref<ConfirmAction | ''>('')

const confirmDialog = ref({
  visible: false,
  action: 'reload' as ConfirmAction,
  title: '',
  message: '',
  confirmText: '',
})

// === V2 站点管理状态 ===
const sitesLoading = ref(false)
const sites = ref<NginxSiteInfo[]>([])
const sitesTotal = ref(0)

const createDialog = ref({
  visible: false,
  submitting: false,
  form: {
    domain: '',
    listenPort: 80,
    rootPath: '',
    proxyEnabled: false,
    proxyPass: '',
    proxyPort: 3000,
    proxyProtocol: 'http' as 'http' | 'https',
  },
})

const deleteDialog = ref({
  visible: false,
  submitting: false,
  configName: '',
  domain: '',
})

// === V2 SSL 证书状态 ===
const sslApplyDialog = ref({
  visible: false,
  submitting: false,
  form: { domain: '', email: '' },
})
const sslConfigDialog = ref({
  visible: false,
  submitting: false,
  form: { domain: '', certPath: '', keyPath: '' },
})
const sslRenewDialog = ref({
  visible: false,
  submitting: false,
  form: { domain: '' },
})

let pollTimer: ReturnType<typeof setInterval> | null = null

const nginxInstalled = computed(() => installInfo.value?.isInstalled === true)
const nginxRunning = computed(() => statusInfo.value?.isRunning === true)
const workerCountText = computed(() => statusInfo.value?.workerProcessCount ?? 'N/A')
const connectionText = computed(() => statusInfo.value?.activeConnections ?? 'N/A')
const rpsText = computed(() => statusInfo.value?.requestsPerSecond ?? 'N/A')
const versionText = computed(() => installInfo.value?.version || '未安装')
const configPathText = computed(() => installInfo.value?.configPath || '-')

function markUpdated() {
  const now = new Date()
  lastUpdatedText.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
}

async function loadNginxData(showFullLoading = false) {
  try {
    if (showFullLoading) {
      loading.value = true
    } else {
      refreshing.value = true
    }

    const [installRes, statusRes] = await Promise.all([
      nginxApi.getNginxInstallInfo(),
      nginxApi.getNginxStatus(),
    ])

    if (installRes.data.code !== 1) {
      throw new Error(installRes.data.msg || '获取 Nginx 安装信息失败')
    }

    if (statusRes.data.code !== 1) {
      throw new Error(statusRes.data.msg || '获取 Nginx 运行状态失败')
    }

    installInfo.value = installRes.data.data
    statusInfo.value = statusRes.data.data
    markUpdated()
  } catch (error: any) {
    notify.error('Nginx 状态加载失败', error?.message || '请稍后重试')
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

async function runConfigTest() {
  if (configTesting.value) return
  configTesting.value = true
  try {
    const res = await nginxApi.testNginxConfig()
    if (res.data.code !== 1) {
      notify.warning('配置测试失败', res.data.msg)
      return
    }

    configTestResult.value = res.data.data
    if (res.data.data.isValid) {
      notify.info('Nginx 配置有效', '可以继续执行重载')
    } else {
      notify.warning('Nginx 配置无效', '请先修正配置错误')
    }
  } catch (error: any) {
    notify.error('配置测试失败', error?.message || '请稍后再试')
  } finally {
    configTesting.value = false
  }
}

function openActionConfirm(action: ConfirmAction) {
  confirmDialog.value = {
    visible: true,
    action,
    title: action === 'reload' ? '重载 Nginx' : '重启 Nginx',
    message: action === 'reload'
      ? '建议先执行配置测试，确认语法通过后再重载 Nginx。'
      : '重启会中断并重新拉起 Nginx 服务，请确认当前操作窗口适合执行重启。',
    confirmText: action === 'reload' ? '确认重载' : '确认重启',
  }
}

function closeActionConfirm() {
  confirmDialog.value.visible = false
}

async function confirmAction() {
  const action = confirmDialog.value.action
  actionLoading.value = action
  try {
    if (action === 'reload') {
      const res = await nginxApi.reloadNginx()
      if (res.data.code !== 1) {
        notify.warning('重载失败', res.data.msg)
        return
      }
      notify.info('Nginx 已重载', `${res.data.data.serviceName} / ${res.data.data.action}`)
    } else {
      const res = await nginxApi.restartNginx()
      if (res.data.code !== 1) {
        notify.warning('重启失败', res.data.msg)
        return
      }
      notify.info('Nginx 已重启', `当前状态：${res.data.data.currentStatus}`)
    }

    closeActionConfirm()
    await loadNginxData()
  } catch (error: any) {
    notify.error(confirmDialog.value.title + '失败', error?.message || '请稍后再试')
  } finally {
    actionLoading.value = ''
  }
}

// === V2 站点管理函数 ===

async function loadSites() {
  if (sitesLoading.value) return
  sitesLoading.value = true
  try {
    const res = await nginxApi.getNginxSites()
    if (res.data.code !== 1) throw new Error(res.data.msg || '获取站点列表失败')
    sites.value = res.data.data.list
    sitesTotal.value = res.data.data.total
  } catch (error: any) {
    notify.error('站点列表加载失败', error?.message || '请稍后重试')
  } finally {
    sitesLoading.value = false
  }
}

function openCreateDialog() {
  createDialog.value.form = {
    domain: '',
    listenPort: 80,
    rootPath: '',
    proxyEnabled: false,
    proxyPass: '',
    proxyPort: 3000,
    proxyProtocol: 'http',
  }
  createDialog.value.visible = true
}

function closeCreateDialog() {
  createDialog.value.visible = false
}

async function submitCreateSite() {
  const form = createDialog.value.form
  if (!form.domain.trim()) {
    notify.warning('请填写域名', '域名不能为空')
    return
  }
  if (!form.rootPath.trim()) {
    notify.warning('请填写根目录', '站点根目录为必填')
    return
  }
  if (form.proxyEnabled && !form.proxyPass.trim()) {
    notify.warning('请填写反代地址', '启用反向代理后必须填写目标地址')
    return
  }

  createDialog.value.submitting = true
  try {
    const params: NginxCreateSiteParams = {
      domain: form.domain.trim(),
      mode: 'static',
      listenPort: form.listenPort,
      rootPath: form.rootPath.trim(),
    }
    if (form.proxyEnabled) {
      params.proxyPass = form.proxyPass.trim()
      params.proxyPort = form.proxyPort
      params.proxyProtocol = form.proxyProtocol
    }

    const res = await nginxApi.createNginxSite(params)
    if (res.data.code !== 1) {
      notify.warning('创建站点失败', res.data.msg)
      return
    }
    notify.info('站点已创建', `${form.domain} 配置已生成并重载`)
    closeCreateDialog()
    await loadSites()
  } catch (error: any) {
    notify.error('创建站点失败', error?.message || '请稍后再试')
  } finally {
    createDialog.value.submitting = false
  }
}

function openDeleteDialog(site: NginxSiteInfo) {
  deleteDialog.value.configName = site.configName
  deleteDialog.value.domain = site.domain
  deleteDialog.value.visible = true
}

function closeDeleteDialog() {
  deleteDialog.value.visible = false
}

async function confirmDeleteSite() {
  deleteDialog.value.submitting = true
  try {
    const res = await nginxApi.deleteNginxSite(deleteDialog.value.configName)
    if (res.data.code !== 1) {
      notify.warning('删除站点失败', res.data.msg)
      return
    }
    notify.info('站点已删除', `${deleteDialog.value.domain} 配置已移除并重载`)
    closeDeleteDialog()
    await loadSites()
  } catch (error: any) {
    notify.error('删除站点失败', error?.message || '请稍后再试')
  } finally {
    deleteDialog.value.submitting = false
  }
}

// === V2 SSL 函数 ===

function openSslApplyDialog() {
  sslApplyDialog.value.form = { domain: '', email: '' }
  sslApplyDialog.value.visible = true
}

function closeSslApplyDialog() {
  sslApplyDialog.value.visible = false
}

async function submitSslApply() {
  const form = sslApplyDialog.value.form
  if (!form.domain.trim() || !form.email.trim()) {
    notify.warning('请填写完整信息', '域名和邮箱均为必填')
    return
  }
  sslApplyDialog.value.submitting = true
  try {
    const res = await nginxApi.applyNginxSsl({ domain: form.domain.trim(), email: form.email.trim() })
    if (res.data.code !== 1) {
      notify.warning('申请 SSL 失败', res.data.msg)
      return
    }
    notify.info('SSL 证书已申请', `证书路径：${res.data.data.certPath}`)
    closeSslApplyDialog()
  } catch (error: any) {
    notify.error('SSL 申请失败', error?.message || '请稍后再试')
  } finally {
    sslApplyDialog.value.submitting = false
  }
}

function openSslConfigDialog(domain?: string) {
  sslConfigDialog.value.form = {
    domain: domain || '',
    certPath: `/etc/letsencrypt/live/${domain || ''}/fullchain.pem`,
    keyPath: `/etc/letsencrypt/live/${domain || ''}/privkey.pem`,
  }
  sslConfigDialog.value.visible = true
}

function closeSslConfigDialog() {
  sslConfigDialog.value.visible = false
}

async function submitSslConfig() {
  const form = sslConfigDialog.value.form
  if (!form.domain.trim() || !form.certPath.trim() || !form.keyPath.trim()) {
    notify.warning('请填写完整信息', '域名、证书路径和私钥路径均为必填')
    return
  }
  sslConfigDialog.value.submitting = true
  try {
    const res = await nginxApi.configNginxSsl({
      domain: form.domain.trim(),
      certPath: form.certPath.trim(),
      keyPath: form.keyPath.trim(),
    })
    if (res.data.code !== 1) {
      notify.warning('SSL 配置失败', res.data.msg)
      return
    }
    notify.info('SSL 已配置', `站点 ${form.domain} 已启用 HTTPS`)
    closeSslConfigDialog()
  } catch (error: any) {
    notify.error('SSL 配置失败', error?.message || '请稍后再试')
  } finally {
    sslConfigDialog.value.submitting = false
  }
}

function openSslRenewDialog(domain?: string) {
  sslRenewDialog.value.form = { domain: domain || '' }
  sslRenewDialog.value.visible = true
}

function closeSslRenewDialog() {
  sslRenewDialog.value.visible = false
}

async function submitSslRenew() {
  const form = sslRenewDialog.value.form
  if (!form.domain.trim()) {
    notify.warning('请填写域名', '域名不能为空')
    return
  }
  sslRenewDialog.value.submitting = true
  try {
    const res = await nginxApi.renewNginxSsl({ domain: form.domain.trim() })
    if (res.data.code !== 1) {
      notify.warning('SSL 续期失败', res.data.msg)
      return
    }
    notify.info('SSL 已续期', `${form.domain} 证书已更新并重载`)
    closeSslRenewDialog()
  } catch (error: any) {
    notify.error('SSL 续期失败', error?.message || '请稍后再试')
  } finally {
    sslRenewDialog.value.submitting = false
  }
}

// === V3 新增：站点配置查看与编辑 ===
const viewConfigDialog = ref({
  visible: false,
  domain: '',
  configPath: '',
  content: '',
  loading: false,
})

const editorDialog = ref({
  visible: false,
  domain: '',
  content: '',
  token: 0,
})

async function viewSiteConfig(site: NginxSiteInfo) {
  viewConfigDialog.value.domain = site.domain
  viewConfigDialog.value.configPath = site.configPath
  viewConfigDialog.value.visible = true
  viewConfigDialog.value.loading = true
  try {
    const res = await nginxApi.getNginxSiteConfig(site.domain)
    if (res.data.code === 1) {
      viewConfigDialog.value.content = res.data.data.content
    } else {
      notify.warning('获取配置失败', res.data.msg)
      viewConfigDialog.value.content = '// 获取配置失败'
    }
  } catch (error: any) {
    notify.error('获取配置失败', error?.message || '请稍后重试')
    viewConfigDialog.value.content = '// 获取配置失败'
  } finally {
    viewConfigDialog.value.loading = false
  }
}

function closeViewConfig() {
  viewConfigDialog.value.visible = false
  viewConfigDialog.value.content = ''
}

async function editSiteConfig(site: NginxSiteInfo) {
  // 先清除旧内容防止缓存
  editorDialog.value.content = ''
  editorDialog.value.domain = site.domain
  // 先获取最新内容再打开编辑器
  try {
    viewConfigDialog.value.domain = site.domain
    viewConfigDialog.value.configPath = site.configPath
    viewConfigDialog.value.loading = true
    const res = await nginxApi.getNginxSiteConfig(site.domain)
    viewConfigDialog.value.loading = false
    if (res.data.code === 1) {
      editorDialog.value.content = res.data.data.content
      editorDialog.value.token++
      editorDialog.value.visible = true
    } else {
      notify.warning('获取配置失败', res.data.msg)
    }
  } catch (error: any) {
    viewConfigDialog.value.loading = false
    notify.error('获取配置失败', error?.message || '请稍后重试')
  }
}



function onEditorSaved() {
  notify.info('修改成功', '站点配置已保存，Nginx 已重载')
  closeEditor()
}

function closeEditor() {
  editorDialog.value.visible = false
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(() => {
    loadNginxData()
  }, 12000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// 切换 Tab 时按需加载数据
watch(activeTab, (tab) => {
  if (tab === 'sites') {
    loadSites()
  }
})

onMounted(async () => {
  await loadNginxData(true)
  startPolling()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="nginx-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Web Server Operations</p>
        <h1 class="page-title">Nginx 管理</h1>
        <p class="page-subtitle">围绕安装检测、运行态观测、配置测试与服务控制构建的 Nginx 工作台。</p>
      </div>

      <div class="header-actions">
        <div class="status-badge" :class="{ online: nginxRunning, offline: !nginxRunning }">
          <span class="dot"></span>
          {{ nginxRunning ? 'Nginx 运行中' : 'Nginx 未运行' }}
        </div>
        <button class="secondary-btn" :disabled="refreshing" @click="loadNginxData()">
          {{ refreshing ? '刷新中...' : '刷新状态' }}
        </button>
      </div>
    </header>

    <section class="status-grid">
      <DockerStatusCard label="安装状态" :value="nginxInstalled ? 'Installed' : 'Missing'" :tone="nginxInstalled ? 'success' : 'danger'" helper="来自 /nginx/install" />
      <DockerStatusCard label="版本" :value="versionText" helper="安装信息返回的 version" />
      <DockerStatusCard label="运行状态" :value="nginxRunning ? 'Running' : 'Stopped'" :tone="nginxRunning ? 'success' : 'warning'" helper="来自 /nginx/status" />
      <DockerStatusCard label="Worker 数量" :value="workerCountText" tone="info" helper="workerProcessCount" />
      <DockerStatusCard label="活动连接" :value="connectionText" helper="未启用 stub_status 时可能为 N/A" />
      <DockerStatusCard label="最近刷新" :value="lastUpdatedText" helper="页面每 12 秒自动刷新" />
    </section>

    <div v-if="loading" class="skeleton-grid">
      <div v-for="i in 4" :key="i" class="skeleton-card"></div>
    </div>

    <template v-else-if="!nginxInstalled">
      <DockerEmptyState :checking="refreshing" @retry="loadNginxData()" />
    </template>

    <template v-else>
      <div class="detail-tabs">
        <button class="tab-btn" :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">服务概览</button>
        <button class="tab-btn" :class="{ active: activeTab === 'config' }" @click="activeTab = 'config'">配置测试</button>
        <button class="tab-btn" :class="{ active: activeTab === 'sites' }" @click="activeTab = 'sites'">站点管理</button>
        <button class="tab-btn" :class="{ active: activeTab === 'ssl' }" @click="activeTab = 'ssl'">SSL 证书</button>
      </div>

      <section v-if="activeTab === 'overview'" class="overview-panel">
        <article class="panel-card hero-card">
          <div class="hero-main">
            <div class="hero-icon" v-html="NGINX_ICON"></div>
            <div class="hero-copy">
              <h2>Nginx 服务概览</h2>
              <p>当前接口支持安装信息、运行状态、配置测试、重载和重启。页面将这些动作串成一个完整的运维工作流。</p>
            </div>
          </div>
          <div class="hero-meta">
            <div class="hero-stat">
              <span>配置文件</span>
              <strong>{{ configPathText }}</strong>
            </div>
            <div class="hero-stat">
              <span>每秒请求</span>
              <strong>{{ rpsText }}</strong>
            </div>
            <div class="hero-stat">
              <span>活动连接</span>
              <strong>{{ connectionText }}</strong>
            </div>
          </div>
        </article>

        <section class="detail-grid">
          <article class="panel-card">
            <div class="panel-title">服务控制</div>
            <div class="note-list">
              <div class="note-item">推荐顺序：先执行配置测试，确认语法通过后再执行重载。</div>
              <div class="note-item">如果需要彻底重新拉起服务，再使用重启操作。</div>
            </div>
            <div class="action-row">
              <button class="primary-btn" :disabled="actionLoading === 'reload'" @click="openActionConfirm('reload')">
                {{ actionLoading === 'reload' ? '重载中...' : '重载 Nginx' }}
              </button>
              <button class="danger-btn" :disabled="actionLoading === 'restart'" @click="openActionConfirm('restart')">
                {{ actionLoading === 'restart' ? '重启中...' : '重启 Nginx' }}
              </button>
            </div>
          </article>

          <article class="panel-card">
            <div class="panel-title">运行信号</div>
            <div class="signal-list">
              <div class="signal-row">
                <span>服务状态</span>
                <strong>{{ nginxRunning ? '运行中' : '未运行' }}</strong>
              </div>
              <div class="signal-row">
                <span>Worker 进程数</span>
                <strong>{{ workerCountText }}</strong>
              </div>
              <div class="signal-row">
                <span>活动连接数</span>
                <strong>{{ connectionText }}</strong>
              </div>
              <div class="signal-row">
                <span>每秒请求</span>
                <strong>{{ rpsText }}</strong>
              </div>
            </div>
          </article>
        </section>
      </section>

      <section v-else-if="activeTab === 'config'" class="config-panel">
        <article class="panel-card config-card">
          <div class="panel-head">
            <div>
              <h2>Nginx 配置测试</h2>
              <p>调用 `/nginx/test-config`，直接查看标准输出和错误输出，判断当前配置是否可重载。</p>
            </div>
            <button class="primary-btn" :disabled="configTesting" @click="runConfigTest">
              {{ configTesting ? '测试中...' : '测试配置' }}
            </button>
          </div>

          <div v-if="configTestResult" class="result-banner" :class="{ success: configTestResult.isValid, failure: !configTestResult.isValid }">
            <div class="result-title">{{ configTestResult.isValid ? '配置有效' : '配置无效' }}</div>
            <div class="result-subtitle">{{ configTestResult.isValid ? '可以继续执行重载。' : '请先修正配置后再执行重载。' }}</div>
          </div>

          <div class="hint-block">
            Nginx 的配置检测输出习惯比较特殊，语法通过时也可能把提示写进错误输出流，所以要结合“配置是否有效”这个结果一起判断，而不是只看 `stderr` 是否为空。
          </div>

          <div class="output-grid">
            <section class="output-block">
              <div class="output-title">stdout</div>
              <pre class="output-content">{{ configTestResult?.stdout || '暂无标准输出。' }}</pre>
            </section>
            <section class="output-block">
              <div class="output-title">stderr</div>
              <pre class="output-content">{{ configTestResult?.stderr || '暂无错误输出。' }}</pre>
            </section>
          </div>
        </article>
      </section>

      <!-- === 站点管理面板 === -->
      <section v-else-if="activeTab === 'sites'" class="sites-panel">
        <article class="panel-card">
          <div class="panel-head">
            <div>
              <h2>站点列表</h2>
              <p>管理 Nginx 虚拟主机配置，支持静态站点和反向代理两种模式。</p>
            </div>
            <button class="primary-btn" @click="openCreateDialog()">+ 创建站点</button>
          </div>

          <div v-if="sitesLoading" class="sites-loading">
            <div v-for="i in 3" :key="i" class="skeleton-row"></div>
          </div>

          <div v-else-if="sites.length === 0" class="empty-sites">
            <div class="empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <h3>暂无站点配置</h3>
            <p>点击「创建站点」按钮添加你的第一个虚拟主机。</p>
          </div>

          <div v-else class="sites-table-wrap">
            <table class="sites-table">
              <thead>
                <tr>
                  <th>域名</th>
                  <th>端口</th>
                  <th>模式</th>
                  <th>目标路径</th>
                  <th>状态</th>
                  <th class="th-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="site in sites" :key="site.configName">
                  <td class="td-domain">{{ site.domain }}</td>
                  <td><code class="port-badge">{{ site.listen }}</code></td>
                  <td>
                    <span class="mode-badge" :class="site.mode">
                      {{ site.mode === 'static' ? '静态' : '反代' }}
                    </span>
                  </td>
                  <td class="td-path">{{ site.mode === 'static' ? site.rootPath : site.proxyPass }}</td>
                  <td>
                    <span class="status-tag" :class="{ enabled: site.isEnabled }">
                      {{ site.isEnabled ? '启用' : '禁用' }}
                    </span>
                  </td>
                  <td class="td-actions">
                    <div class="action-btn-group">
                      <button class="icon-btn" title="查看配置" @click="viewSiteConfig(site)">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </button>
                      <button class="icon-btn edit-icon" title="编辑配置" @click="editSiteConfig(site)">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button class="icon-btn danger-icon" title="删除站点" @click="openDeleteDialog(site)">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <!-- === SSL 证书面板 === -->
      <section v-else-if="activeTab === 'ssl'" class="ssl-panel">
        <article class="panel-card ssl-warn-card">
          <div class="ssl-warn-head">
            <span class="untested-badge">⚠️ 未经测试</span>
            <div>
              <h2>SSL 证书管理</h2>
              <p>申请、配置和续期 Let's Encrypt SSL 证书。</p>
            </div>
          </div>
          <div class="hint-block">
            ⚠️ 此面板的三个接口因开发主机不在公网，尚未经过实际测试。使用时请注意风险。
          </div>
        </article>

        <div class="ssl-grid">
          <!-- 申请证书 -->
          <article class="panel-card ssl-card">
            <div class="ssl-card-head">
              <span class="untested-badge small">⚠️ 未测试</span>
              <h3>申请 SSL 证书</h3>
            </div>
            <p class="ssl-card-desc">通过 certbot 为域名申请 Let's Encrypt 证书。</p>
            <div class="ssl-form-btns">
              <button class="primary-btn" @click="openSslApplyDialog()">申请证书</button>
            </div>
          </article>

          <!-- 配置证书 -->
          <article class="panel-card ssl-card">
            <div class="ssl-card-head">
              <span class="untested-badge small">⚠️ 未测试</span>
              <h3>配置 SSL 证书</h3>
            </div>
            <p class="ssl-card-desc">将已申请的证书绑定到指定站点的 Nginx 配置中。</p>
            <div class="ssl-form-btns">
              <button class="primary-btn" @click="openSslConfigDialog()">配置证书</button>
            </div>
          </article>

          <!-- 续期证书 -->
          <article class="panel-card ssl-card">
            <div class="ssl-card-head">
              <span class="untested-badge small">⚠️ 未测试</span>
              <h3>续期 SSL 证书</h3>
            </div>
            <p class="ssl-card-desc">手动触发证书续期，适用于未开启自动续期的环境。</p>
            <div class="ssl-form-btns">
              <button class="primary-btn" @click="openSslRenewDialog()">续期证书</button>
            </div>
          </article>
        </div>
      </section>
    </template>

    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="confirmDialog.visible" class="dialog-overlay" @click.self="closeActionConfirm">
          <div class="dialog-card">
            <div class="dialog-head">
              <h3>{{ confirmDialog.title }}</h3>
              <p>{{ confirmDialog.message }}</p>
            </div>

            <div class="dialog-actions">
              <button class="secondary-btn" @click="closeActionConfirm">取消</button>
              <button :class="confirmDialog.action === 'restart' ? 'danger-btn' : 'primary-btn'" @click="confirmAction">
                {{ confirmDialog.confirmText }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 创建站点弹窗 -->
    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="createDialog.visible" class="dialog-overlay" @click.self="closeCreateDialog">
          <div class="dialog-card dialog-wide">
            <div class="dialog-head">
              <h3>创建站点</h3>
              <p>创建一个新的 Nginx 虚拟主机配置。</p>
            </div>

            <div class="dialog-body">
              <div class="form-group">
                <label class="form-label">域名</label>
                <input v-model="createDialog.form.domain" type="text" class="form-input" placeholder="example.com" />
              </div>

              <div class="form-group">
                <label class="form-label">监听端口</label>
                <input v-model.number="createDialog.form.listenPort" type="number" class="form-input" placeholder="80" />
              </div>

              <div class="form-group">
                <label class="form-label">站点根目录</label>
                <input v-model="createDialog.form.rootPath" type="text" class="form-input" placeholder="/var/www/example.com" />
              </div>

              <div class="form-group">
                <label class="toggle-row">
                  <input type="checkbox" v-model="createDialog.form.proxyEnabled" class="toggle-checkbox" />
                  <span class="toggle-label">启用反向代理</span>
                </label>
              </div>

              <template v-if="createDialog.form.proxyEnabled">
                <div class="proxy-section">
                  <div class="form-group">
                    <label class="form-label">反代目标地址</label>
                    <input v-model="createDialog.form.proxyPass" type="text" class="form-input" placeholder="127.0.0.1" />
                  </div>
                  <div class="form-row">
                    <div class="form-group">
                      <label class="form-label">目标端口</label>
                      <input v-model.number="createDialog.form.proxyPort" type="number" class="form-input" placeholder="3000" />
                    </div>
                    <div class="form-group">
                      <label class="form-label">协议</label>
                      <select v-model="createDialog.form.proxyProtocol" class="form-select">
                        <option value="http">HTTP</option>
                        <option value="https">HTTPS</option>
                      </select>
                    </div>
                  </div>
                </div>
              </template>
            </div>

            <div class="dialog-actions">
              <button class="secondary-btn" :disabled="createDialog.submitting" @click="closeCreateDialog">取消</button>
              <button class="primary-btn" :disabled="createDialog.submitting" @click="submitCreateSite">
                {{ createDialog.submitting ? '创建中...' : '确认创建' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 删除站点确认弹窗 -->
    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="deleteDialog.visible" class="dialog-overlay" @click.self="closeDeleteDialog">
          <div class="dialog-card">
            <div class="dialog-head">
              <h3>删除站点</h3>
              <p>确定要删除「<strong>{{ deleteDialog.domain }}</strong>」的 Nginx 配置吗？此操作不可撤销。</p>
            </div>
            <div class="dialog-actions">
              <button class="secondary-btn" :disabled="deleteDialog.submitting" @click="closeDeleteDialog">取消</button>
              <button class="danger-btn" :disabled="deleteDialog.submitting" @click="confirmDeleteSite">
                {{ deleteDialog.submitting ? '删除中...' : '确认删除' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- SSL 申请弹窗 -->
    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="sslApplyDialog.visible" class="dialog-overlay" @click.self="closeSslApplyDialog">
          <div class="dialog-card">
            <div class="dialog-head">
              <h3>申请 SSL 证书</h3>
              <p>通过 certbot 为域名申请 Let's Encrypt 免费证书。</p>
            </div>
            <div class="dialog-body">
              <div class="form-group">
                <label class="form-label">域名</label>
                <input v-model="sslApplyDialog.form.domain" type="text" class="form-input" placeholder="example.com" />
              </div>
              <div class="form-group">
                <label class="form-label">邮箱</label>
                <input v-model="sslApplyDialog.form.email" type="email" class="form-input" placeholder="admin@example.com" />
              </div>
            </div>
            <div class="dialog-actions">
              <button class="secondary-btn" :disabled="sslApplyDialog.submitting" @click="closeSslApplyDialog">取消</button>
              <button class="primary-btn" :disabled="sslApplyDialog.submitting" @click="submitSslApply">
                {{ sslApplyDialog.submitting ? '申请中...' : '确认申请' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- SSL 配置弹窗 -->
    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="sslConfigDialog.visible" class="dialog-overlay" @click.self="closeSslConfigDialog">
          <div class="dialog-card dialog-wide">
            <div class="dialog-head">
              <h3>配置 SSL 证书</h3>
              <p>将证书绑定到指定域名的 Nginx 配置中。</p>
            </div>
            <div class="dialog-body">
              <div class="form-group">
                <label class="form-label">域名</label>
                <input v-model="sslConfigDialog.form.domain" type="text" class="form-input" placeholder="example.com" />
              </div>
              <div class="form-group">
                <label class="form-label">证书路径</label>
                <input v-model="sslConfigDialog.form.certPath" type="text" class="form-input" placeholder="/etc/letsencrypt/live/.../fullchain.pem" />
              </div>
              <div class="form-group">
                <label class="form-label">私钥路径</label>
                <input v-model="sslConfigDialog.form.keyPath" type="text" class="form-input" placeholder="/etc/letsencrypt/live/.../privkey.pem" />
              </div>
            </div>
            <div class="dialog-actions">
              <button class="secondary-btn" :disabled="sslConfigDialog.submitting" @click="closeSslConfigDialog">取消</button>
              <button class="primary-btn" :disabled="sslConfigDialog.submitting" @click="submitSslConfig">
                {{ sslConfigDialog.submitting ? '配置中...' : '确认配置' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- SSL 续期弹窗 -->
    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="sslRenewDialog.visible" class="dialog-overlay" @click.self="closeSslRenewDialog">
          <div class="dialog-card">
            <div class="dialog-head">
              <h3>续期 SSL 证书</h3>
              <p>手动触发证书续期，适用于未开启自动续期的环境。</p>
            </div>
            <div class="dialog-body">
              <div class="form-group">
                <label class="form-label">域名</label>
                <input v-model="sslRenewDialog.form.domain" type="text" class="form-input" placeholder="example.com" />
              </div>
            </div>
            <div class="dialog-actions">
              <button class="secondary-btn" :disabled="sslRenewDialog.submitting" @click="closeSslRenewDialog">取消</button>
              <button class="primary-btn" :disabled="sslRenewDialog.submitting" @click="submitSslRenew">
                {{ sslRenewDialog.submitting ? '续期中...' : '确认续期' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 查看站点配置弹窗（只读） -->
    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="viewConfigDialog.visible" class="dialog-overlay" @click.self="closeViewConfig">
          <div class="dialog-card view-config-card">
            <div class="dialog-head">
              <h3>站点配置：{{ viewConfigDialog.domain }}</h3>
              <p>{{ viewConfigDialog.configPath }}</p>
            </div>
            <div class="view-config-body">
              <pre v-if="!viewConfigDialog.loading" class="view-config-content">{{ viewConfigDialog.content }}</pre>
              <div v-else class="view-config-loading">加载中...</div>
            </div>
            <div class="dialog-actions">
              <button class="primary-btn" @click="closeViewConfig">关闭</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 编辑站点配置编辑器（复用 FileTextEditorDialog） -->
    <FileTextEditorDialog
      :visible="editorDialog.visible"
      mode="nginx"
      :nginxDomain="editorDialog.domain"
      :requestOpenPath="editorDialog.domain"
      :requestOpenToken="editorDialog.token"
      :initialOpenPath="editorDialog.domain"
      :initialOpenContent="editorDialog.content"
      @cancel="closeEditor"
      @saved="onEditorSaved"
    />
  </div>
</template>

<style scoped>
.nginx-page {
  padding: 24px;
  max-width: 1680px;
  margin: 0 auto;
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
  font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif;
}

.page-subtitle {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  max-width: 700px;
}

.header-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.status-badge.online {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.status-badge.offline {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.status-grid,
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
}

.skeleton-card {
  min-height: 116px;
  border-radius: 18px;
  background: linear-gradient(90deg, var(--color-bg-surface), var(--color-bg-hover), var(--color-bg-surface));
  background-size: 240px 100%;
  animation: loading-shimmer 1.4s linear infinite;
}

.detail-tabs {
  display: inline-flex;
  width: fit-content;
  gap: 4px;
  padding: 4px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}

.tab-btn {
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.tab-btn.active {
  background: var(--color-bg-inset);
  color: var(--color-text);
}

.overview-panel,
.config-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-card {
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
  padding: 18px;
}

.hero-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.hero-main {
  display: flex;
  align-items: center;
  gap: 18px;
}

.hero-icon {
  width: 68px;
  height: 68px;
  border-radius: 18px;
  background: var(--color-bg-inset);
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-icon :deep(svg) {
  width: 44px;
  height: 44px;
}

.hero-copy h2,
.panel-head h2 {
  font-size: 24px;
  font-weight: 800;
  color: var(--color-text);
}

.hero-copy p,
.panel-head p {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.hero-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  min-width: 420px;
}

.hero-stat {
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-bg-inset);
  padding: 14px;
}

.hero-stat span,
.panel-title,
.output-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.hero-stat strong {
  display: block;
  margin-top: 8px;
  font-size: 16px;
  color: var(--color-text);
  word-break: break-word;
}

.detail-grid,
.output-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.signal-list,
.note-list {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.signal-row,
.note-item {
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
}

.signal-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.signal-row span,
.note-item {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.7;
}

.signal-row strong {
  font-size: 13px;
  color: var(--color-text);
  text-align: right;
}

.action-row {
  margin-top: 16px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.result-banner {
  margin-top: 16px;
  border-radius: 16px;
  padding: 14px 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-inset);
}

.result-banner.success {
  border-color: rgba(16, 185, 129, 0.18);
}

.result-banner.failure {
  border-color: rgba(239, 68, 68, 0.18);
}

.result-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--color-text);
}

.result-subtitle {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.hint-block {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-inset);
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.output-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.output-content {
  min-height: 280px;
  border-radius: 16px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 14px;
  font-size: 12px;
  line-height: 1.65;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.primary-btn,
.secondary-btn,
.danger-btn {
  min-height: 42px;
  border-radius: 12px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
}

.primary-btn {
  border: 1px solid var(--color-border-solid);
  color: var(--color-text);
  background: var(--color-bg-surface);
}

.primary-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.secondary-btn {
  border: 1px solid var(--color-border-solid);
  color: var(--color-text-secondary);
  background: var(--color-bg-surface);
}

.secondary-btn:hover {
  color: var(--color-text);
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.danger-btn {
  border: 1px solid rgba(239, 68, 68, 0.18);
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.primary-btn:disabled,
.secondary-btn:disabled,
.danger-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 260;
}

.dialog-card {
  width: min(460px, 100%);
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.dialog-head {
  padding: 20px 22px 16px;
}

.dialog-head h3 {
  font-size: 22px;
  font-weight: 800;
  color: var(--color-text);
}

.dialog-head p {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.dialog-actions {
  padding: 18px 22px 22px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.22s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .dialog-card,
.dialog-leave-to .dialog-card {
  transform: translateY(16px) scale(0.98);
}

.dialog-card {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

/* === V2 新面板样式 === */

/* 站点管理 */
.sites-panel,
.ssl-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sites-table-wrap {
  margin-top: 16px;
  overflow-x: auto;
}

.sites-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.sites-table th {
  text-align: left;
  padding: 10px 12px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  border-bottom: 1px solid var(--color-border);
}

.sites-table td {
  padding: 12px;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.sites-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.td-domain {
  font-weight: 600;
  color: var(--color-text);
}

.td-path {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 12px;
  color: var(--color-text-secondary);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.th-actions,
.td-actions {
  width: 130px;
  text-align: center;
}

.action-btn-group {
  display: flex;
  gap: 6px;
  justify-content: center;
  align-items: center;
}

.edit-icon:hover {
  border-color: rgba(59, 130, 246, 0.3);
  background: rgba(59, 130, 246, 0.08);
  color: #3b82f6;
}

/* === 查看配置弹窗 === */
.view-config-card {
  width: min(760px, 95vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.view-config-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0 22px 16px;
}

.view-config-content {
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px;
  font-family: 'IBM Plex Mono', 'Cascadia Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 300px;
  max-height: 55vh;
  overflow: auto;
}

.view-config-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.port-badge {
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--color-text);
}

.mode-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.mode-badge.static {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}

.mode-badge.reverse_proxy {
  background: rgba(99, 102, 241, 0.12);
  color: #6366f1;
}

.status-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: var(--color-bg-inset);
  color: var(--color-text-muted);
}

.status-tag.enabled {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-surface);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
  color: var(--color-text-muted);
}

.icon-btn:hover {
  border-color: var(--color-text-secondary);
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.icon-btn:active {
  transform: scale(0.95);
}

.edit-icon:hover {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}

.danger-icon:hover {
  border-color: rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.12);
  color: var(--color-danger);
}

.skeleton-row {
  height: 48px;
  margin: 8px 0;
  border-radius: 12px;
  background: linear-gradient(90deg, var(--color-bg-surface), var(--color-bg-hover), var(--color-bg-surface));
  background-size: 240px 100%;
  animation: loading-shimmer 1.4s linear infinite;
}

.empty-sites {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 24px;
  text-align: center;
}

.empty-icon {
  color: var(--color-text-muted);
  opacity: 0.5;
}

.empty-sites h3 {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
}

.empty-sites p {
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* SSL 面板 */
.ssl-warn-card .ssl-warn-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 6px;
}

.ssl-warn-head h2 {
  font-size: 24px;
  font-weight: 800;
  color: var(--color-text);
}

.ssl-warn-head p {
  margin-top: 6px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.untested-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
  white-space: nowrap;
  flex-shrink: 0;
}

.untested-badge.small {
  font-size: 10px;
  padding: 2px 8px;
}

.ssl-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.ssl-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ssl-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ssl-card-head h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
}

.ssl-card-desc {
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.ssl-form-btns {
  margin-top: auto;
  padding-top: 8px;
}

/* 弹窗表单 */
.dialog-wide {
  width: min(540px, 100%);
}

.dialog-body {
  padding: 0 22px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.form-input,
.form-select {
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-inset);
  color: var(--color-text);
  padding: 0 14px;
  font-size: 13px;
  transition: border-color 0.18s ease;
}

.form-select {
  appearance: auto;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--color-primary);
}

/* 反向代理开关 */
.toggle-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 8px 0;
  user-select: none;
}

.toggle-checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.toggle-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
}

.proxy-section {
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 16px;
  background: var(--color-bg-inset);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@keyframes loading-shimmer {
  0% {
    background-position: -240px 0;
  }
  100% {
    background-position: 240px 0;
  }
}

@media (max-width: 1280px) {
  .status-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .hero-card,
  .hero-main {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-meta,
  .detail-grid,
  .output-grid {
    min-width: 0;
    grid-template-columns: 1fr;
  }

  .ssl-grid {
    grid-template-columns: 1fr;
  }

  .form-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .nginx-page {
    padding: 16px;
  }

  .page-header,
  .panel-head {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    align-items: stretch;
  }

  .status-grid {
    grid-template-columns: 1fr;
  }

  .detail-tabs {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
  }
}
</style>
