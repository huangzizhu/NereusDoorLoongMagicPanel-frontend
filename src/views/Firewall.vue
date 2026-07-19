<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import * as firewallApi from '../api/firewall'
import type { FirewallSwitchStatus, FirewallPortRule, FirewallSshConfig, FirewallSshLogItem, FirewallPortRuleDeleteRequest } from '../types/firewall'
import { useLoadingOverlay } from '../composables/useLoadingOverlay'
import { useNotification } from '../composables/useNotification'
import { parse422Errors } from '../utils/errorParser'

const notify = useNotification()
const { show: showLoading, hide: hideLoading } = useLoadingOverlay()

const switchStatus = ref<FirewallSwitchStatus>({
  firewallEnabled: false,
  sshServiceEnabled: false,
})
const rules = ref<FirewallPortRule[]>([])
const sshConfig = ref<FirewallSshConfig | null>(null)
const sshLogs = ref<FirewallSshLogItem[]>([])
const sshLogsPage = ref(1)
const sshLogsPageSize = ref(10)

const isBootstrapping = ref(true)
const isSavingFirewallSwitch = ref(false)
const isSavingSshSwitch = ref(false)
const isCreatingRule = ref(false)
const isSavingSshConfig = ref(false)
const isDeletingRule = ref(false)

const deleteConfirm = ref({
  visible: false,
  rule: null as FirewallPortRule | null,
})

const ruleForm = reactive({
  port: 22,
  protocol: 1,
  ipVersion: 4,
  sourceIp: '0.0.0.0/0',
  destinationIp: '0.0.0.0/0',
  priority: 100,
  action: 1,
})

const sshForm = reactive({
  port: 22,
  permitRootLogin: 'no',
  passwordAuthentication: 'yes',
  allowUsersText: '',
  allowGroupsText: '',
  listenAddressText: '0.0.0.0',
  protocol: 2,
  loginGraceTime: 120,
  maxAuthTries: 8,
})

const firewallStatusLabel = computed(() => switchStatus.value.firewallEnabled ? '已开启' : '已关闭')
const sshServiceStatusLabel = computed(() => switchStatus.value.sshServiceEnabled ? '运行中' : '已停用')
const sshLogsTotalPages = computed(() => Math.max(1, Math.ceil(sshLogs.value.length / sshLogsPageSize.value)))
const paginatedSshLogs = computed(() => {
  const start = (sshLogsPage.value - 1) * sshLogsPageSize.value
  return sshLogs.value.slice(start, start + sshLogsPageSize.value)
})

function statusClass(enabled: boolean) {
  return enabled ? 'ok' : 'off'
}

function ruleProtocolLabel(protocol: number) {
  return protocol === 1 ? 'TCP' : 'UDP'
}

function ruleIpVersionLabel(ipVersion: number) {
  return `IPv${ipVersion}`
}

function ruleActionLabel(action: number) {
  return action === 1 ? '允许' : '拒绝'
}

function getDefaultRuleIp(ipVersion: number) {
  return ipVersion === 6 ? '::/0' : '0.0.0.0/0'
}

function splitByCommaOrLineBreak(input: string) {
  return input
    .split(/[\n,]/)
    .map(v => v.trim())
    .filter(Boolean)
}

function normalizeSshLogsPage() {
  if (sshLogsPage.value > sshLogsTotalPages.value) {
    sshLogsPage.value = sshLogsTotalPages.value
  }
}

function applySshConfigToForm(data: FirewallSshConfig) {
  sshForm.port = data.port
  sshForm.permitRootLogin = data.permitRootLogin
  sshForm.passwordAuthentication = data.passwordAuthentication
  sshForm.allowUsersText = data.allowUsers.join(', ')
  sshForm.allowGroupsText = data.allowGroups.join(', ')
  sshForm.listenAddressText = data.listenAddress.join(', ')
  sshForm.protocol = data.protocol
  sshForm.loginGraceTime = data.loginGraceTime
  sshForm.maxAuthTries = data.maxAuthTries
}

function resetRuleForm() {
  ruleForm.port = 22
  ruleForm.protocol = 1
  ruleForm.ipVersion = 4
  ruleForm.sourceIp = getDefaultRuleIp(4)
  ruleForm.destinationIp = getDefaultRuleIp(4)
  ruleForm.priority = 100
  ruleForm.action = 1
}

function onRuleIpVersionChange() {
  const defaultIp = getDefaultRuleIp(ruleForm.ipVersion)
  ruleForm.sourceIp = defaultIp
  ruleForm.destinationIp = defaultIp
}

async function loadSwitchStatus() {
  const res = await firewallApi.getFirewallSwitchStatus()
  if (res.data.code === 1) {
    switchStatus.value = res.data.data
    return
  }
  notify.warning('获取开关状态失败', res.data.msg)
}

async function loadPortRules() {
  const res = await firewallApi.getFirewallPortRules()
  if (res.data.code === 1) {
    rules.value = res.data.data.list
    return
  }
  notify.warning('获取端口规则失败', res.data.msg)
}

async function loadSshConfig() {
  const res = await firewallApi.getSshConfig()
  if (res.data.code === 1) {
    sshConfig.value = res.data.data
    applySshConfigToForm(res.data.data)
    return
  }
  notify.warning('获取 SSH 配置失败', res.data.msg)
}

async function loadSshLogs() {
  const res = await firewallApi.getSshLogs()
  if (res.data.code === 1) {
    sshLogs.value = res.data.data.list
    normalizeSshLogsPage()
    return
  }
  notify.warning('获取 SSH 日志失败', res.data.msg)
}

function prevSshLogsPage() {
  if (sshLogsPage.value <= 1) return
  sshLogsPage.value -= 1
}

function nextSshLogsPage() {
  if (sshLogsPage.value >= sshLogsTotalPages.value) return
  sshLogsPage.value += 1
}

function updateSshLogsPageSize(pageSize: number) {
  sshLogsPageSize.value = pageSize
  sshLogsPage.value = 1
}

async function bootstrap() {
  try {
    isBootstrapping.value = true
    showLoading()
    await Promise.all([
      loadSwitchStatus(),
      loadPortRules(),
      loadSshConfig(),
      loadSshLogs(),
    ])
  } catch (error) {
    notify.error('加载失败', parse422Errors(error).join('\n'))
  } finally {
    isBootstrapping.value = false
    hideLoading()
  }
}

async function onToggleFirewall() {
  if (isSavingFirewallSwitch.value) return

  const nextValue = !switchStatus.value.firewallEnabled
  isSavingFirewallSwitch.value = true
  try {
    showLoading()
    const res = await firewallApi.updateFirewallSwitchStatus({ firewallEnabled: nextValue })
    if (res.data.code === 1) {
      switchStatus.value = res.data.data
      notify.info('防火墙状态已更新', `当前状态：${res.data.data.firewallEnabled ? '已开启' : '已关闭'}`)
      return
    }
    notify.warning('更新防火墙状态失败', res.data.msg)
  } catch (error) {
    notify.error('更新防火墙状态失败', parse422Errors(error).join('\n'))
  } finally {
    isSavingFirewallSwitch.value = false
    hideLoading()
  }
}

async function onToggleSshService() {
  if (isSavingSshSwitch.value) return

  const nextValue = !switchStatus.value.sshServiceEnabled
  isSavingSshSwitch.value = true
  try {
    showLoading()
    const res = await firewallApi.updateFirewallSwitchStatus({ sshServiceEnabled: nextValue })
    if (res.data.code === 1) {
      switchStatus.value = res.data.data
      notify.info('SSH 服务状态已更新', `当前状态：${res.data.data.sshServiceEnabled ? '运行中' : '已停用'}`)
      return
    }
    notify.warning('更新 SSH 服务状态失败', res.data.msg)
  } catch (error) {
    notify.error('更新 SSH 服务状态失败', parse422Errors(error).join('\n'))
  } finally {
    isSavingSshSwitch.value = false
    hideLoading()
  }
}

async function onCreateRule() {
  if (isCreatingRule.value) return

  if (!ruleForm.port || ruleForm.port < 1 || ruleForm.port > 65535) {
    notify.warning('参数错误', '端口号必须在 1-65535 之间')
    return
  }

  if (!ruleForm.sourceIp.trim() || !ruleForm.destinationIp.trim()) {
    notify.warning('参数错误', '来源 IP 与目标 IP 不能为空')
    return
  }

  isCreatingRule.value = true
  try {
    showLoading()
    const res = await firewallApi.createFirewallPortRule({
      port: Number(ruleForm.port),
      protocol: Number(ruleForm.protocol),
      ipVersion: Number(ruleForm.ipVersion),
      sourceIp: ruleForm.sourceIp.trim(),
      destinationIp: ruleForm.destinationIp.trim(),
      priority: Number(ruleForm.priority),
      action: Number(ruleForm.action),
    })

    if (res.data.code === 1) {
      rules.value = res.data.data.list
      notify.info('端口规则创建成功', '新规则已加入列表')
      resetRuleForm()
      return
    }

    notify.warning('创建端口规则失败', res.data.msg)
  } catch (error) {
    notify.error('创建端口规则失败', parse422Errors(error).join('\n'))
  } finally {
    isCreatingRule.value = false
    hideLoading()
  }
}

async function onSaveSshConfig() {
  if (isSavingSshConfig.value) return

  isSavingSshConfig.value = true
  try {
    showLoading()
    const payload = {
      port: Number(sshForm.port),
      permitRootLogin: sshForm.permitRootLogin,
      passwordAuthentication: sshForm.passwordAuthentication,
      allowUsers: splitByCommaOrLineBreak(sshForm.allowUsersText),
      allowGroups: splitByCommaOrLineBreak(sshForm.allowGroupsText),
      listenAddress: splitByCommaOrLineBreak(sshForm.listenAddressText),
      protocol: Number(sshForm.protocol),
      loginGraceTime: Number(sshForm.loginGraceTime),
      maxAuthTries: Number(sshForm.maxAuthTries),
    }

    const res = await firewallApi.updateSshConfig(payload)
    if (res.data.code === 1) {
      sshConfig.value = res.data.data
      applySshConfigToForm(res.data.data)
      notify.info('SSH 配置已保存', '修改已生效')
      return
    }

    notify.warning('保存 SSH 配置失败', res.data.msg)
  } catch (error) {
    notify.error('保存 SSH 配置失败', parse422Errors(error).join('\n'))
  } finally {
    isSavingSshConfig.value = false
    hideLoading()
  }
}

function openDeleteConfirm(rule: FirewallPortRule) {
  deleteConfirm.value = { visible: true, rule }
}

function closeDeleteConfirm() {
  deleteConfirm.value = { visible: false, rule: null }
}

async function onDeleteRule() {
  const rule = deleteConfirm.value.rule
  if (!rule || isDeletingRule.value) return

  isDeletingRule.value = true
  try {
    showLoading()
    const payload: FirewallPortRuleDeleteRequest = {
      port: rule.port,
      protocol: rule.protocol,
      sourceIp: rule.sourceIp,
      destinationIp: rule.destinationIp,
      ipVersion: rule.ipVersion,
    }

    const res = await firewallApi.deleteFirewallPortRule(payload)
    if (res.data.code === 1) {
      rules.value = res.data.data.list
      notify.info('端口规则已删除', `已移除 ${rule.port}/${ruleProtocolLabel(rule.protocol)} 规则`)
      closeDeleteConfirm()
      return
    }

    notify.warning('删除端口规则失败', res.data.msg)
  } catch (error) {
    notify.error('删除端口规则失败', parse422Errors(error).join('\n'))
  } finally {
    isDeletingRule.value = false
    hideLoading()
  }
}

async function refreshRules() {
  try {
    showLoading()
    await loadPortRules()
    notify.info('规则列表已刷新')
  } catch (error) {
    notify.error('刷新规则失败', parse422Errors(error).join('\n'))
  } finally {
    hideLoading()
  }
}

async function refreshSshLogs() {
  try {
    showLoading()
    await loadSshLogs()
    notify.info('SSH 日志已刷新')
  } catch (error) {
    notify.error('刷新 SSH 日志失败', parse422Errors(error).join('\n'))
  } finally {
    hideLoading()
  }
}

onMounted(() => {
  bootstrap()
})
</script>

<template>
  <div class="firewall-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Network Security</p>
        <h1 class="page-title">防火墙</h1>
        <p class="page-subtitle">系统防火墙规则与 SSH 服务集中管理</p>
      </div>
      <button class="secondary-btn" :disabled="isBootstrapping" @click="bootstrap">刷新全部</button>
    </header>

    <section class="section-wrap">
      <div class="section-head">
        <h2>系统防火墙管理</h2>
      </div>

      <div class="status-panel">
        <div class="status-meta">
          <span class="status-label">当前状态</span>
          <span class="status-value" :class="statusClass(switchStatus.firewallEnabled)">{{ firewallStatusLabel }}</span>
        </div>
        <button class="primary-btn" :disabled="isSavingFirewallSwitch" @click="onToggleFirewall">
          {{ switchStatus.firewallEnabled ? '关闭防火墙' : '开启防火墙' }}
        </button>
      </div>

      <div class="grid-two">
        <div class="card rule-card">
          <div class="card-head">
            <h3>端口规则列表</h3>
            <button class="secondary-btn" @click="refreshRules">刷新规则</button>
          </div>

          <div class="rule-table-wrap">
            <table class="rule-table">
              <thead>
              <tr>
                <th>端口</th>
                <th>协议</th>
                <th>IP 版本</th>
                <th>来源 IP</th>
                <th>目标 IP</th>
                <th>优先级</th>
                <th>动作</th>
                <th class="actions-col">操作</th>
              </tr>
              </thead>
              <tbody>
              <tr v-if="rules.length === 0">
                <td class="empty-cell" colspan="8">暂无规则</td>
              </tr>
              <tr v-for="rule in rules" :key="rule.id">
                <td>{{ rule.port }}</td>
                <td>
                    <span class="pill" :class="rule.protocol === 1 ? 'pill-info' : 'pill-warning'">
                      {{ ruleProtocolLabel(rule.protocol) }}
                    </span>
                </td>
                <td>
                    <span class="pill pill-neutral">
                      {{ ruleIpVersionLabel(rule.ipVersion) }}
                    </span>
                </td>
                <td class="mono">{{ rule.sourceIp }}</td>
                <td class="mono">{{ rule.destinationIp }}</td>
                <td>{{ rule.priority }}</td>
                <td>
                    <span class="pill" :class="rule.action === 1 ? 'pill-success' : 'pill-danger'">
                      {{ ruleActionLabel(rule.action) }}
                    </span>
                </td>
                <td class="actions-col">
                  <button class="mini-btn danger" :disabled="isDeletingRule" @click.stop="openDeleteConfirm(rule)">删除</button>
                </td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card form-card">
          <div class="card-head">
            <h3>新建端口规则</h3>
          </div>

          <div class="form-grid">
            <label class="field">
              <span>端口</span>
              <input v-model.number="ruleForm.port" type="number" min="1" max="65535">
            </label>

            <label class="field">
              <span>协议</span>
              <select v-model.number="ruleForm.protocol">
                <option :value="1">TCP</option>
                <option :value="0">UDP</option>
              </select>
            </label>

            <label class="field">
              <span>IP 版本</span>
              <select v-model.number="ruleForm.ipVersion" @change="onRuleIpVersionChange">
                <option :value="4">IPv4</option>
                <option :value="6">IPv6</option>
              </select>
            </label>

            <label class="field">
              <span>来源 IP</span>
              <input
                v-model="ruleForm.sourceIp"
                type="text"
                :placeholder="ruleForm.ipVersion === 6 ? '例如 ::/0' : '例如 0.0.0.0/0'"
              >
            </label>

            <label class="field">
              <span>目标 IP</span>
              <input
                v-model="ruleForm.destinationIp"
                type="text"
                :placeholder="ruleForm.ipVersion === 6 ? '例如 ::/0' : '例如 0.0.0.0/0'"
              >
            </label>

            <label class="field">
              <span>优先级</span>
              <input v-model.number="ruleForm.priority" type="number" min="1" max="9999">
            </label>

            <label class="field">
              <span>动作</span>
              <select v-model.number="ruleForm.action">
                <option :value="1">允许</option>
                <option :value="0">拒绝</option>
              </select>
            </label>
          </div>

          <div class="actions">
            <button class="primary-btn" :disabled="isCreatingRule" @click="onCreateRule">创建规则</button>
            <button class="secondary-btn" :disabled="isCreatingRule" @click="resetRuleForm">重置</button>
          </div>
        </div>
      </div>
    </section>

    <section class="section-wrap">
      <div class="section-head">
        <h2>SSH 管理</h2>
      </div>

      <div class="status-panel">
        <div class="status-meta">
          <span class="status-label">服务状态</span>
          <span class="status-value" :class="statusClass(switchStatus.sshServiceEnabled)">{{ sshServiceStatusLabel }}</span>
        </div>
        <button class="primary-btn" :disabled="isSavingSshSwitch" @click="onToggleSshService">
          {{ switchStatus.sshServiceEnabled ? '关闭 SSH 服务' : '开启 SSH 服务' }}
        </button>
      </div>

      <div class="grid-two">
        <div class="card form-card">
          <div class="card-head">
            <h3>SSH 配置</h3>
          </div>

          <div class="form-grid ssh-form-grid">
            <label class="field">
              <span>端口</span>
              <input v-model.number="sshForm.port" type="number" min="1" max="65535">
            </label>

            <label class="field">
              <span>Root 登录</span>
              <select v-model="sshForm.permitRootLogin">
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </label>

            <label class="field">
              <span>密码认证</span>
              <select v-model="sshForm.passwordAuthentication">
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </label>

            <label class="field">
              <span>协议版本</span>
              <input v-model.number="sshForm.protocol" type="number" min="1" max="2">
            </label>

            <label class="field">
              <span>登录宽限时间(秒)</span>
              <input v-model.number="sshForm.loginGraceTime" type="number" min="1" max="3600">
            </label>

            <label class="field">
              <span>最大认证尝试次数</span>
              <input v-model.number="sshForm.maxAuthTries" type="number" min="1" max="20">
            </label>

            <label class="field full-row">
              <span>允许用户(逗号或换行分隔)</span>
              <textarea v-model="sshForm.allowUsersText" rows="2" placeholder="例如 root, deploy"></textarea>
            </label>

            <label class="field full-row">
              <span>允许用户组(逗号或换行分隔)</span>
              <textarea v-model="sshForm.allowGroupsText" rows="2" placeholder="例如 admins, ops"></textarea>
            </label>

            <label class="field full-row">
              <span>监听地址(逗号或换行分隔)</span>
              <textarea v-model="sshForm.listenAddressText" rows="2" placeholder="例如 0.0.0.0"></textarea>
            </label>
          </div>

          <div class="actions">
            <button class="primary-btn" :disabled="isSavingSshConfig" @click="onSaveSshConfig">保存 SSH 配置</button>
            <button
              class="secondary-btn"
              :disabled="isSavingSshConfig || !sshConfig"
              @click="sshConfig && applySshConfigToForm(sshConfig)"
            >
              还原
            </button>
          </div>
        </div>

        <div class="card rule-card">
          <div class="card-head">
            <h3>SSH 登录日志</h3>
            <div class="toolbar-actions">
              <label class="page-size-control">
                <span>每页</span>
                <select :value="sshLogsPageSize" @change="updateSshLogsPageSize(Number(($event.target as HTMLSelectElement).value))">
                  <option :value="10">10</option>
                  <option :value="20">20</option>
                  <option :value="50">50</option>
                </select>
              </label>
              <button class="secondary-btn" :disabled="sshLogsPage <= 1" @click="prevSshLogsPage">上一页</button>
              <span class="page-text">第 {{ sshLogsPage }} / {{ sshLogsTotalPages }} 页</span>
              <button class="secondary-btn" :disabled="sshLogsPage >= sshLogsTotalPages" @click="nextSshLogsPage">下一页</button>
              <button class="secondary-btn" @click="refreshSshLogs">刷新日志</button>
            </div>
          </div>

          <div class="rule-table-wrap">
            <table class="rule-table">
              <thead>
              <tr>
                <th>时间</th>
                <th>用户</th>
                <th>来源 IP</th>
                <th>端口</th>
                <th>状态</th>
                <th>原因</th>
              </tr>
              </thead>
              <tbody>
              <tr v-if="sshLogs.length === 0">
                <td class="empty-cell" colspan="6">暂无 SSH 日志</td>
              </tr>
              <tr v-for="(log, index) in paginatedSshLogs" :key="`${log.timestamp}-${log.user}-${index}`">
                <td class="mono">{{ log.timestamp }}</td>
                <td>{{ log.user || '-' }}</td>
                <td class="mono">{{ log.sourceIp || '-' }}</td>
                <td>{{ log.port || '-' }}</td>
                <td>
                    <span class="pill" :class="log.status === 'SUCCESS' ? 'pill-success' : 'pill-danger'">
                      {{ log.status || '-' }}
                    </span>
                </td>
                <td>{{ log.reason || '-' }}</td>
              </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  </div>

  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="deleteConfirm.visible" class="dialog-overlay" @click.self="closeDeleteConfirm">
        <div class="dialog-card">
          <div class="dialog-head">
            <h3>删除端口规则</h3>
            <p>
              确定要删除端口 <strong>{{ deleteConfirm.rule?.port }}</strong> / {{ ruleProtocolLabel(deleteConfirm.rule?.protocol ?? 1) }}
              的规则吗？此操作不可恢复。
            </p>
          </div>

          <div class="dialog-actions">
            <button class="secondary-btn" :disabled="isDeletingRule" @click="closeDeleteConfirm">取消</button>
            <button class="danger-btn" :disabled="isDeletingRule" @click="onDeleteRule">
              {{ isDeletingRule ? '删除中...' : '确认删除' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.firewall-page {
  padding: 24px;
  max-width: 1500px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
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

.section-wrap {
  margin-top: 22px;
  padding: 18px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background:
      radial-gradient(circle at top right, var(--color-primary-ghost), transparent 45%),
      var(--color-bg-elevated);
  box-shadow: var(--shadow-sm);
}

.section-head {
  margin-bottom: 14px;
}

.section-head h2 {
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text);
}

.status-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 12px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-surface);
  padding: 12px 14px;
  margin-bottom: 14px;
}

.status-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-label {
  font-size: 12px;
  color: var(--color-text-muted);
}

.status-value {
  font-size: 13px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
}

.status-value.ok {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.status-value.off {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.grid-two {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 14px;
}

.card {
  border-radius: 12px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-surface);
  padding: 14px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.card-head h3 {
  font-size: 15px;
  color: var(--color-text);
}

.rule-table-wrap {
  overflow-x: auto;
}

.rule-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 680px;
}

.rule-table th,
.rule-table td {
  text-align: left;
  padding: 10px;
  border-bottom: 1px solid var(--color-divider);
  font-size: 13px;
  color: var(--color-text-secondary);
}

.rule-table th {
  color: var(--color-text-muted);
  font-weight: 600;
  background: var(--color-bg-inset);
}

.rule-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.empty-cell {
  text-align: center;
  color: var(--color-text-muted);
  padding: 22px 10px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.page-size-control {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.page-size-control select {
  min-width: 72px;
  border: 1px solid var(--color-border-solid);
  border-radius: 10px;
  background: var(--color-bg-surface);
  color: var(--color-text);
  padding: 7px 10px;
  font-size: 13px;
  outline: none;
}

.page-size-control select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.page-text {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.pill-info {
  color: var(--color-info);
  background: var(--color-info-bg);
}

.pill-warning {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.pill-success {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.pill-neutral {
  color: var(--color-text-secondary);
  background: var(--color-bg-inset);
}

.pill-danger {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.ssh-form-grid {
  grid-template-columns: 1fr 1fr;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field span {
  font-size: 12px;
  color: var(--color-text-muted);
}

.field input,
.field select,
.field textarea {
  width: 100%;
  border: 1px solid var(--color-border-solid);
  border-radius: 10px;
  background: var(--color-bg-surface);
  color: var(--color-text);
  padding: 9px 11px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.field textarea {
  resize: vertical;
  min-height: 66px;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.field.full-row {
  grid-column: 1 / -1;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.primary-btn,
.secondary-btn {
  border: none;
  border-radius: 10px;
  height: 36px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.primary-btn {
  color: #fff;
  background: linear-gradient(120deg, var(--color-gradient-start), var(--color-gradient-end));
  box-shadow: 0 6px 18px -8px var(--color-primary-shadow);
}

.primary-btn:hover {
  transform: translateY(-1px);
}

.secondary-btn {
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-surface);
}

.secondary-btn:hover {
  border-color: var(--color-primary-light);
  color: var(--color-primary);
}

.primary-btn:disabled,
.secondary-btn:disabled,
.danger-btn:disabled,
.mini-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.actions-col {
  width: 80px;
}

.mini-btn {
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.mini-btn.danger {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.mini-btn.danger:hover {
  transform: translateY(-1px);
}

.danger-btn {
  border: 1px solid rgba(239, 68, 68, 0.18);
  border-radius: 10px;
  height: 36px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #fff;
  background: linear-gradient(120deg, #dc2626, #ef4444);
  box-shadow: 0 6px 18px -8px rgba(239, 68, 68, 0.45);
}

.danger-btn:hover {
  transform: translateY(-1px);
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
  width: min(420px, 100%);
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

.dialog-head p strong {
  color: var(--color-text);
  font-weight: 700;
}

.dialog-actions {
  padding: 18px 22px 22px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

@media (max-width: 1280px) {
  .grid-two {
    grid-template-columns: 1fr;
  }

  .rule-table {
    min-width: 620px;
  }
}

@media (max-width: 768px) {
  .firewall-page {
    padding: 16px;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .status-panel {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .actions {
    flex-direction: column;
  }

  .ssh-form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
