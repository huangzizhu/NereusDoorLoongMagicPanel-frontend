<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  batchCreateLlmProfiles,
  createLlmProfile,
  deleteLlmProfile,
  getCredentialModels,
  getLlmProfiles,
  setDefaultLlmProfile,
  testLlmProfile,
  updateLlmProfile,
} from '../api/config'
import { useNotification } from '../composables/useNotification'
import { parse422Errors } from '../utils/errorParser'
import type {
  ApiKeyProvider,
  CredentialRemoteModel,
  LlmProfileBatchCreateRequest,
  LlmProfileCreateRequest,
  LlmProfileItem,
  LlmProfileUpdateRequest,
} from '../types/config'

const route = useRoute()
const router = useRouter()
const notification = useNotification()

const credentialId = computed(() => Number(route.params.credentialId || 0))
const credentialName = computed(() => String(route.query.name || '未命名凭证'))
const credentialProvider = computed(() => String(route.query.provider || 'Custom') as ApiKeyProvider)
const credentialBaseUrl = computed(() => String(route.query.baseUrl || ''))
const credentialMaskedKey = computed(() => String(route.query.maskedKey || ''))
const credentialActive = computed(() => route.query.active !== 'false')

const loadingModels = ref(false)
const loadingProfiles = ref(false)
const submittingManual = ref(false)
const submittingBatch = ref(false)
const modelsLoaded = ref(false)
const sourceUrl = ref('')
const remoteModels = ref<CredentialRemoteModel[]>([])
const selectedModels = ref<string[]>([])
const modelKeyword = ref('')
const profiles = ref<LlmProfileItem[]>([])
const testingProfileId = ref<number | null>(null)
const deletingProfileId = ref<number | null>(null)
const settingDefaultId = ref<number | null>(null)
const savingProfileId = ref<number | null>(null)
const testResult = ref<{ profileId: number; available: boolean; latencyMs: number; content: string | null; error: string | null } | null>(null)
const showEditModal = ref(false)
const profileEditErrors = ref<Record<string, string>>({})
const profileEditForm = ref({
  profileId: 0,
  name: '',
  contextWindow: 1048576,
  temperature: 0.1,
  isActive: true,
  description: '',
})

const manualErrors = ref<Record<string, string>>({})
const batchErrors = ref<Record<string, string>>({})

const manualForm = ref({
  name: '',
  model: '',
  maxTokens: 4096,
  contextWindow: 1048576,
  temperature: 0.1,
  retryCount: 3,
  retryDelay: 2,
  isDefault: true,
  isActive: true,
  description: '',
})

const batchForm = ref({
  namePrefix: '',
  maxTokens: 4096,
  contextWindow: 1048576,
  temperature: 0.1,
  retryCount: 3,
  retryDelay: 2,
  isDefaultFirst: true,
  isActive: true,
  description: '批量导入模型',
})

const filteredModels = computed(() => {
  const keyword = modelKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return remoteModels.value
  }

  return remoteModels.value.filter((item) => {
    return [item.id, item.name, item.ownedBy].some((field) => field.toLowerCase().includes(keyword))
  })
})

const selectedCount = computed(() => selectedModels.value.length)
const currentProfiles = computed(() => profiles.value.filter((item) => item.credentialId === credentialId.value))

const providerTone = computed(() => `provider-${credentialProvider.value.toLowerCase()}`)

watch(() => manualForm.value.model, (value) => {
  if (!manualForm.value.name.trim() || manualForm.value.name.trim() === manualForm.value.name) {
    manualForm.value.name = value.trim()
  }
})

function goBack() {
  router.push('/settings/apikey')
}

function validateNumberField(value: number, min: number): boolean {
  return Number.isFinite(value) && value >= min
}

function validateManualForm() {
  manualErrors.value = {}

  if (!manualForm.value.name.trim()) {
    manualErrors.value.name = 'Profile 名称不能为空'
  }
  if (!manualForm.value.model.trim()) {
    manualErrors.value.model = '模型名称不能为空'
  }
  if (!validateNumberField(manualForm.value.maxTokens, 1)) {
    manualErrors.value.maxTokens = '最大 Token 必须大于 0'
  }
  if (!validateNumberField(manualForm.value.contextWindow, 1)) {
    manualErrors.value.contextWindow = '上下文窗口必须大于 0'
  }
  if (manualForm.value.contextWindow > 10485760) {
    manualErrors.value.contextWindow = '上下文窗口不能超过 10M'
  }
  if (!validateNumberField(manualForm.value.temperature, 0)) {
    manualErrors.value.temperature = '温度不能小于 0'
  }
  if (!validateNumberField(manualForm.value.retryCount, 0)) {
    manualErrors.value.retryCount = '重试次数不能小于 0'
  }
  if (!validateNumberField(manualForm.value.retryDelay, 0)) {
    manualErrors.value.retryDelay = '重试间隔不能小于 0'
  }

  return Object.keys(manualErrors.value).length === 0
}

function validateBatchForm() {
  batchErrors.value = {}

  if (selectedModels.value.length === 0) {
    batchErrors.value.models = '至少选择一个模型'
  }
  if (!validateNumberField(batchForm.value.maxTokens, 1)) {
    batchErrors.value.maxTokens = '最大 Token 必须大于 0'
  }
  if (!validateNumberField(batchForm.value.contextWindow, 1)) {
    batchErrors.value.contextWindow = '上下文窗口必须大于 0'
  }
  if (batchForm.value.contextWindow > 10485760) {
    batchErrors.value.contextWindow = '上下文窗口不能超过 10M'
  }
  if (!validateNumberField(batchForm.value.temperature, 0)) {
    batchErrors.value.temperature = '温度不能小于 0'
  }
  if (!validateNumberField(batchForm.value.retryCount, 0)) {
    batchErrors.value.retryCount = '重试次数不能小于 0'
  }
  if (!validateNumberField(batchForm.value.retryDelay, 0)) {
    batchErrors.value.retryDelay = '重试间隔不能小于 0'
  }

  return Object.keys(batchErrors.value).length === 0
}

async function fetchRemoteModels() {
  if (!credentialId.value) {
    notification.error('参数缺失', '未找到 credentialId')
    return
  }

  loadingModels.value = true
  batchErrors.value = {}
  try {
    const res = await getCredentialModels(credentialId.value)
    if (res.data.code === 1) {
      sourceUrl.value = res.data.data.sourceUrl
      remoteModels.value = res.data.data.models || []
      selectedModels.value = []
      modelsLoaded.value = true
      notification.info('模型已同步', `已拉取 ${remoteModels.value.length} 个模型`) 
    } else {
      notification.error('拉取失败', res.data.msg || '请稍后重试')
    }
  } catch (error) {
    const msgs = parse422Errors(error)
    notification.error('拉取失败', msgs.join('; '))
  } finally {
    loadingModels.value = false
  }
}

function toggleModelSelection(modelId: string) {
  if (selectedModels.value.includes(modelId)) {
    selectedModels.value = selectedModels.value.filter((item) => item !== modelId)
  } else {
    selectedModels.value = [...selectedModels.value, modelId]
  }
}

function selectAllVisible() {
  const visibleIds = filteredModels.value.map((item) => item.id)
  selectedModels.value = Array.from(new Set([...selectedModels.value, ...visibleIds]))
}

function clearSelection() {
  selectedModels.value = []
}

async function fetchProfiles() {
  loadingProfiles.value = true
  try {
    const res = await getLlmProfiles()
    if (res.data.code === 1) {
      profiles.value = res.data.data.items || []
    } else {
      notification.error('获取 Profile 失败', res.data.msg || '请稍后重试')
    }
  } catch (error) {
    const msgs = parse422Errors(error)
    notification.error('获取 Profile 失败', msgs.join('; '))
  } finally {
    loadingProfiles.value = false
  }
}

function openEditProfile(item: LlmProfileItem) {
  profileEditForm.value = {
    profileId: item.profileId,
    name: item.name,
    contextWindow: item.contextWindow,
    temperature: item.temperature,
    isActive: item.isActive,
    description: item.description || '',
  }
  profileEditErrors.value = {}
  showEditModal.value = true
}

function validateProfileEditForm() {
  profileEditErrors.value = {}
  if (!profileEditForm.value.name.trim()) {
    profileEditErrors.value.name = 'Profile 名称不能为空'
  }
  if (!validateNumberField(profileEditForm.value.temperature, 0)) {
    profileEditErrors.value.temperature = '温度不能小于 0'
  }
  if (!validateNumberField(profileEditForm.value.contextWindow, 1)) {
    profileEditErrors.value.contextWindow = '上下文窗口必须大于 0'
  }
  if (profileEditForm.value.contextWindow > 10485760) {
    profileEditErrors.value.contextWindow = '上下文窗口不能超过 10M'
  }
  return Object.keys(profileEditErrors.value).length === 0
}

async function handleProfileEdit() {
  if (!validateProfileEditForm()) return

  savingProfileId.value = profileEditForm.value.profileId
  try {
    const payload: LlmProfileUpdateRequest = {
      name: profileEditForm.value.name.trim(),
      contextWindow: profileEditForm.value.contextWindow,
      temperature: profileEditForm.value.temperature,
      isActive: profileEditForm.value.isActive,
      description: profileEditForm.value.description.trim() || undefined,
    }
    const res = await updateLlmProfile(profileEditForm.value.profileId, payload)
    if (res.data.code === 1) {
      notification.info('Profile 已更新', `已保存「${res.data.data.name}」`)
      showEditModal.value = false
      await fetchProfiles()
    } else {
      notification.error('更新失败', res.data.msg || '请稍后重试')
    }
  } catch (error) {
    const msgs = parse422Errors(error)
    notification.error('更新失败', msgs.join('; '))
  } finally {
    savingProfileId.value = null
  }
}

async function handleTestProfile(item: LlmProfileItem) {
  testingProfileId.value = item.profileId
  try {
    const res = await testLlmProfile(item.profileId)
    if (res.data.code === 1) {
      testResult.value = {
        profileId: item.profileId,
        available: res.data.data.available,
        latencyMs: res.data.data.latencyMs,
        content: res.data.data.content,
        error: res.data.data.error,
      }
      if (res.data.data.available) {
        notification.info('联通性正常', `${item.model} 响应 ${Math.round(res.data.data.latencyMs)} ms`)
      } else {
        notification.warning('测试未通过', res.data.data.error || '模型不可用')
      }
    } else {
      notification.error('测试失败', res.data.msg || '请稍后重试')
    }
  } catch (error) {
    const msgs = parse422Errors(error)
    notification.error('测试失败', msgs.join('; '))
  } finally {
    testingProfileId.value = null
  }
}

async function handleSetDefault(item: LlmProfileItem) {
  settingDefaultId.value = item.profileId
  try {
    const res = await setDefaultLlmProfile(item.profileId)
    if (res.data.code === 1) {
      notification.info('默认模型已更新', `当前默认模型为「${res.data.data.name}」`)
      await fetchProfiles()
    } else {
      notification.error('设置失败', res.data.msg || '请稍后重试')
    }
  } catch (error) {
    const msgs = parse422Errors(error)
    notification.error('设置失败', msgs.join('; '))
  } finally {
    settingDefaultId.value = null
  }
}

async function handleDeleteProfile(item: LlmProfileItem) {
  const confirmed = window.confirm(`确定删除模型 Profile「${item.name}」吗？`)
  if (!confirmed) return

  deletingProfileId.value = item.profileId
  try {
    const res = await deleteLlmProfile(item.profileId)
    if (res.data.code === 1) {
      notification.info('Profile 已删除', `已删除「${item.name}」`)
      await fetchProfiles()
    } else {
      notification.error('删除失败', res.data.msg || '请稍后重试')
    }
  } catch (error) {
    const msgs = parse422Errors(error)
    notification.error('删除失败', msgs.join('; '))
  } finally {
    deletingProfileId.value = null
  }
}

async function handleManualCreate() {
  if (!validateManualForm()) return

  submittingManual.value = true
  try {
    const payload: LlmProfileCreateRequest = {
      name: manualForm.value.name.trim(),
      credentialId: credentialId.value,
      model: manualForm.value.model.trim(),
      maxTokens: manualForm.value.maxTokens,
      contextWindow: manualForm.value.contextWindow,
      temperature: manualForm.value.temperature,
      retryCount: manualForm.value.retryCount,
      retryDelay: manualForm.value.retryDelay,
      isDefault: manualForm.value.isDefault,
      isActive: manualForm.value.isActive,
      description: manualForm.value.description.trim() || undefined,
    }
    const res = await createLlmProfile(payload)
    if (res.data.code === 1) {
      notification.info('模型已创建', `已创建 Profile「${res.data.data.name}」`)
      manualForm.value.model = ''
      manualForm.value.name = ''
      manualForm.value.description = ''
      await fetchProfiles()
    } else {
      notification.error('创建失败', res.data.msg || '请稍后重试')
    }
  } catch (error) {
    const msgs = parse422Errors(error)
    notification.error('创建失败', msgs.join('; '))
  } finally {
    submittingManual.value = false
  }
}

async function handleBatchCreate() {
  if (!validateBatchForm()) return

  submittingBatch.value = true
  try {
    const payload: LlmProfileBatchCreateRequest = {
      credentialId: credentialId.value,
      models: selectedModels.value,
      namePrefix: batchForm.value.namePrefix.trim() || undefined,
      maxTokens: batchForm.value.maxTokens,
      contextWindow: batchForm.value.contextWindow,
      temperature: batchForm.value.temperature,
      retryCount: batchForm.value.retryCount,
      retryDelay: batchForm.value.retryDelay,
      isDefaultFirst: batchForm.value.isDefaultFirst,
      isActive: batchForm.value.isActive,
      description: batchForm.value.description.trim() || undefined,
    }
    const res = await batchCreateLlmProfiles(payload)
    if (res.data.code === 1) {
      notification.info('批量创建成功', `已创建 ${res.data.data.total} 个模型 Profile`)
      clearSelection()
      await fetchProfiles()
    } else {
      notification.error('批量创建失败', res.data.msg || '请稍后重试')
    }
  } catch (error) {
    const msgs = parse422Errors(error)
    notification.error('批量创建失败', msgs.join('; '))
  } finally {
    submittingBatch.value = false
  }
}

onMounted(() => {
  if (!credentialId.value) {
    notification.error('参数缺失', '无法进入模型设置页面')
    router.replace('/settings/apikey')
    return
  }

  fetchProfiles()
})
</script>

<template>
  <div class="model-setup-page">
    <header class="hero-panel">
      <div class="hero-main">
        <button class="back-btn" @click="goBack" title="返回凭证列表">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="hero-copy">
          <p class="eyebrow">Credential Ready</p>
          <h1 class="page-title">添加模型配置</h1>
          <p class="page-subtitle">凭证已经创建完成。现在把它接入一个或多个模型 Profile，支持手动添加，也支持从远端接口拉取后批量导入。</p>
        </div>
      </div>

      <div class="credential-strip">
        <div class="credential-card credential-primary">
          <span class="card-label">当前凭证</span>
          <div class="credential-name-row">
            <strong class="credential-name">{{ credentialName }}</strong>
            <span class="provider-badge" :class="providerTone">{{ credentialProvider }}</span>
          </div>
          <div class="credential-meta">
            <span>Credential ID #{{ credentialId }}</span>
            <span>{{ credentialActive ? '启用中' : '已禁用' }}</span>
          </div>
        </div>

        <div class="credential-card">
          <span class="card-label">Base URL</span>
          <code class="credential-code">{{ credentialBaseUrl || '未设置，自服务商默认地址' }}</code>
        </div>

        <div class="credential-card" v-if="credentialMaskedKey">
          <span class="card-label">Masked Key</span>
          <code class="credential-code">{{ credentialMaskedKey }}</code>
        </div>
      </div>
    </header>

    <section class="workspace-grid">
      <article class="surface-card manual-card">
        <div class="section-head">
          <div>
            <p class="section-kicker">Manual</p>
            <h2 class="section-title">手动创建单个模型</h2>
          </div>
          <span class="section-tip">适合明确知道模型 ID 的场景</span>
        </div>

        <div class="form-grid">
          <div class="form-group form-span-2">
            <label class="form-label">Profile 名称</label>
            <input v-model="manualForm.name" class="form-input" type="text" placeholder="例如：DeepSeek 默认" maxlength="100">
            <span v-if="manualErrors.name" class="form-error">{{ manualErrors.name }}</span>
          </div>

          <div class="form-group form-span-2">
            <label class="form-label">模型 ID</label>
            <input v-model="manualForm.model" class="form-input" type="text" placeholder="例如：deepseek-chat / gpt-5.4-mini">
            <span v-if="manualErrors.model" class="form-error">{{ manualErrors.model }}</span>
          </div>

          <div class="form-group">
            <label class="form-label">Max Tokens</label>
            <input v-model.number="manualForm.maxTokens" class="form-input" type="number" min="1">
            <span v-if="manualErrors.maxTokens" class="form-error">{{ manualErrors.maxTokens }}</span>
          </div>

          <div class="form-group">
            <label class="form-label">上下文窗口</label>
            <input v-model.number="manualForm.contextWindow" class="form-input" type="number" min="1" max="10485760">
            <span v-if="manualErrors.contextWindow" class="form-error">{{ manualErrors.contextWindow }}</span>
            <span class="form-hint">控制对话历史压缩阈值，推荐 1048576 (1M)</span>
          </div>

          <div class="form-group">
            <label class="form-label">Temperature</label>
            <input v-model.number="manualForm.temperature" class="form-input" type="number" min="0" step="0.1">
            <span v-if="manualErrors.temperature" class="form-error">{{ manualErrors.temperature }}</span>
          </div>

          <div class="form-group">
            <label class="form-label">Retry Count</label>
            <input v-model.number="manualForm.retryCount" class="form-input" type="number" min="0">
            <span v-if="manualErrors.retryCount" class="form-error">{{ manualErrors.retryCount }}</span>
          </div>

          <div class="form-group">
            <label class="form-label">Retry Delay</label>
            <input v-model.number="manualForm.retryDelay" class="form-input" type="number" min="0" step="0.1">
            <span v-if="manualErrors.retryDelay" class="form-error">{{ manualErrors.retryDelay }}</span>
          </div>

          <div class="form-group form-span-2">
            <label class="form-label">描述</label>
            <textarea v-model="manualForm.description" class="form-textarea" rows="3" placeholder="例如：比赛演示默认模型"></textarea>
          </div>
        </div>

        <div class="switch-row">
          <label class="toggle-pill">
            <input v-model="manualForm.isDefault" type="checkbox">
            <span>设为默认模型</span>
          </label>
          <label class="toggle-pill">
            <input v-model="manualForm.isActive" type="checkbox">
            <span>立即启用</span>
          </label>
        </div>

        <div class="footer-actions">
          <button class="btn btn-ghost" @click="goBack">稍后再配</button>
          <button class="btn btn-primary" :disabled="submittingManual" @click="handleManualCreate">
            <svg v-if="submittingManual" class="spin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            {{ submittingManual ? '创建中...' : '创建模型 Profile' }}
          </button>
        </div>

        <div class="connectivity-panel">
          <div class="section-head compact-head">
            <div>
              <p class="section-kicker">Connectivity</p>
              <h3 class="mini-title">模型联通性测试</h3>
            </div>
            <span class="section-tip">先创建 Profile，再使用测试接口验证模型</span>
          </div>

          <div v-if="testResult" class="test-result-card" :class="{ success: testResult.available, danger: !testResult.available }">
            <div class="test-result-header">
              <strong>{{ testResult.available ? '测试通过' : '测试失败' }}</strong>
              <span v-if="testResult.available">{{ Math.round(testResult.latencyMs) }} ms</span>
            </div>
            <p v-if="testResult.content" class="test-result-copy">{{ testResult.content }}</p>
            <p v-if="testResult.error" class="test-result-copy">{{ testResult.error }}</p>
          </div>
        </div>
      </article>

      <article class="surface-card import-card">
        <div class="section-head section-head-split">
          <div>
            <p class="section-kicker">Remote Sync</p>
            <h2 class="section-title">拉取模型并批量导入</h2>
          </div>
          <button class="btn btn-primary" :disabled="loadingModels" @click="fetchRemoteModels">
            <svg v-if="loadingModels" class="spin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {{ loadingModels ? '拉取中...' : '拉取模型' }}
          </button>
        </div>

        <div class="sync-meta">
          <div class="meta-chip">
            <span class="meta-label">源地址</span>
            <code>{{ sourceUrl || '点击右上角按钮从远端同步模型' }}</code>
          </div>
          <div class="meta-chip accent">
            <span class="meta-label">已选择</span>
            <strong>{{ selectedCount }}</strong>
          </div>
        </div>

        <div class="batch-settings">
          <div class="form-grid compact-grid">
            <div class="form-group form-span-2">
              <label class="form-label">名称前缀</label>
              <input v-model="batchForm.namePrefix" class="form-input" type="text" placeholder="例如：office-ai">
            </div>

            <div class="form-group">
              <label class="form-label">Max Tokens</label>
              <input v-model.number="batchForm.maxTokens" class="form-input" type="number" min="1">
              <span v-if="batchErrors.maxTokens" class="form-error">{{ batchErrors.maxTokens }}</span>
            </div>

            <div class="form-group">
              <label class="form-label">上下文窗口</label>
              <input v-model.number="batchForm.contextWindow" class="form-input" type="number" min="1" max="10485760">
              <span v-if="batchErrors.contextWindow" class="form-error">{{ batchErrors.contextWindow }}</span>
              <span class="form-hint">所有模型共用此值，推荐 1048576 (1M)</span>
            </div>

            <div class="form-group">
              <label class="form-label">Temperature</label>
              <input v-model.number="batchForm.temperature" class="form-input" type="number" min="0" step="0.1">
              <span v-if="batchErrors.temperature" class="form-error">{{ batchErrors.temperature }}</span>
            </div>

            <div class="form-group">
              <label class="form-label">Retry Count</label>
              <input v-model.number="batchForm.retryCount" class="form-input" type="number" min="0">
              <span v-if="batchErrors.retryCount" class="form-error">{{ batchErrors.retryCount }}</span>
            </div>

            <div class="form-group">
              <label class="form-label">Retry Delay</label>
              <input v-model.number="batchForm.retryDelay" class="form-input" type="number" min="0" step="0.1">
              <span v-if="batchErrors.retryDelay" class="form-error">{{ batchErrors.retryDelay }}</span>
            </div>

            <div class="form-group form-span-2">
              <label class="form-label">描述</label>
              <textarea v-model="batchForm.description" class="form-textarea" rows="2" placeholder="例如：批量导入模型"></textarea>
            </div>
          </div>

          <div class="switch-row">
            <label class="toggle-pill">
              <input v-model="batchForm.isDefaultFirst" type="checkbox">
              <span>首个创建项设为默认</span>
            </label>
            <label class="toggle-pill">
              <input v-model="batchForm.isActive" type="checkbox">
              <span>创建后启用</span>
            </label>
          </div>
        </div>

        <div class="model-list-panel">
          <div class="model-toolbar">
            <input v-model="modelKeyword" class="form-input search-input" type="text" placeholder="搜索模型 ID / 名称 / 归属方">
            <div class="toolbar-actions">
              <button class="btn btn-ghost btn-sm" :disabled="filteredModels.length === 0" @click="selectAllVisible">全选可见</button>
              <button class="btn btn-ghost btn-sm" :disabled="selectedCount === 0" @click="clearSelection">清空</button>
            </div>
          </div>

          <div v-if="!modelsLoaded" class="model-empty-state">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <p>先从当前凭证的接口拉取模型列表，再选择要导入的模型。</p>
          </div>

          <div v-else-if="filteredModels.length === 0" class="model-empty-state compact">
            <p>当前筛选条件下没有可显示的模型。</p>
          </div>

          <div v-else class="model-list">
            <label v-for="item in filteredModels" :key="item.id" class="model-row" :class="{ selected: selectedModels.includes(item.id) }">
              <input :checked="selectedModels.includes(item.id)" type="checkbox" @change="toggleModelSelection(item.id)">
              <div class="model-copy">
                <strong>{{ item.name || item.id }}</strong>
                <span>{{ item.id }}</span>
              </div>
              <span class="model-owner">{{ item.ownedBy || 'unknown' }}</span>
            </label>
          </div>
        </div>

        <span v-if="batchErrors.models" class="form-error block-error">{{ batchErrors.models }}</span>

        <div class="footer-actions">
          <button class="btn btn-ghost" @click="goBack">返回凭证列表</button>
          <button class="btn btn-primary" :disabled="submittingBatch || selectedCount === 0" @click="handleBatchCreate">
            <svg v-if="submittingBatch" class="spin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            {{ submittingBatch ? '批量创建中...' : `批量创建 ${selectedCount || ''} 个 Profile` }}
          </button>
        </div>
      </article>
    </section>

    <section class="surface-card profiles-card">
      <div class="section-head section-head-split">
        <div>
          <p class="section-kicker">Profiles</p>
          <h2 class="section-title">当前凭证下的模型配置</h2>
        </div>
        <span class="section-tip">创建后可测试、设默认、编辑和删除</span>
      </div>

      <div v-if="loadingProfiles" class="model-empty-state compact">
        <p>正在加载模型 Profile...</p>
      </div>

      <div v-else-if="currentProfiles.length === 0" class="model-empty-state compact">
        <p>当前凭证下还没有模型 Profile。先在上方手动创建或批量导入。</p>
      </div>

      <div v-else class="profiles-list">
        <article v-for="item in currentProfiles" :key="item.profileId" class="profile-row">
          <div class="profile-main">
            <div class="profile-title-row">
              <strong>{{ item.name }}</strong>
              <span class="status-badge" :class="{ active: item.isActive, inactive: !item.isActive }">{{ item.isActive ? '启用' : '禁用' }}</span>
              <span v-if="item.isDefault" class="default-badge">默认</span>
            </div>
            <div class="profile-meta">
              <span>Model: {{ item.model }}</span>
              <span>Max: {{ item.maxTokens }}</span>
              <span>Window: {{ item.contextWindow >= 1000000 ? (item.contextWindow / 1000000).toFixed(0) + 'M' : item.contextWindow.toLocaleString() }}</span>
              <span>Temp: {{ item.temperature }}</span>
              <span>Retry: {{ item.retryCount }} / {{ item.retryDelay }}s</span>
            </div>
            <p v-if="item.description" class="profile-desc">{{ item.description }}</p>
          </div>

          <div class="profile-actions">
            <button class="btn btn-ghost btn-sm" :disabled="testingProfileId === item.profileId" @click="handleTestProfile(item)">
              {{ testingProfileId === item.profileId ? '测试中...' : '测试联通性' }}
            </button>
            <button class="btn btn-ghost btn-sm" :disabled="item.isDefault || settingDefaultId === item.profileId || !item.isActive" @click="handleSetDefault(item)">
              {{ item.isDefault ? '已默认' : (settingDefaultId === item.profileId ? '设置中...' : '设为默认') }}
            </button>
            <button class="btn btn-ghost btn-sm" @click="openEditProfile(item)">修改</button>
            <button class="btn btn-danger btn-sm" :disabled="deletingProfileId === item.profileId" @click="handleDeleteProfile(item)">
              {{ deletingProfileId === item.profileId ? '删除中...' : '删除' }}
            </button>
          </div>
        </article>
      </div>
    </section>

    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
          <div class="modal-container">
            <div class="modal-header">
              <h2 class="modal-title">修改模型 Profile</h2>
              <button class="modal-close" @click="showEditModal = false">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-grid">
                <div class="form-group form-span-2">
                  <label class="form-label">Profile 名称</label>
                  <input v-model="profileEditForm.name" class="form-input" type="text" maxlength="100">
                  <span v-if="profileEditErrors.name" class="form-error">{{ profileEditErrors.name }}</span>
                </div>
                <div class="form-group">
                  <label class="form-label">Temperature</label>
                  <input v-model.number="profileEditForm.temperature" class="form-input" type="number" min="0" step="0.1">
                  <span v-if="profileEditErrors.temperature" class="form-error">{{ profileEditErrors.temperature }}</span>
                </div>
                <div class="form-group">
                  <label class="form-label">上下文窗口</label>
                  <input v-model.number="profileEditForm.contextWindow" class="form-input" type="number" min="1" max="10485760">
                  <span v-if="profileEditErrors.contextWindow" class="form-error">{{ profileEditErrors.contextWindow }}</span>
                </div>
                <div class="form-group">
                  <label class="form-label">状态</label>
                  <label class="toggle-pill toggle-pill-block">
                    <input v-model="profileEditForm.isActive" type="checkbox">
                    <span>{{ profileEditForm.isActive ? '启用' : '禁用' }}</span>
                  </label>
                </div>
                <div class="form-group form-span-2">
                  <label class="form-label">描述</label>
                  <textarea v-model="profileEditForm.description" class="form-textarea" rows="3"></textarea>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" @click="showEditModal = false">取消</button>
              <button class="btn btn-primary" :disabled="savingProfileId === profileEditForm.profileId" @click="handleProfileEdit">
                {{ savingProfileId === profileEditForm.profileId ? '保存中...' : '保存修改' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.model-setup-page {
  padding: 24px;
  max-width: 1480px;
  margin: 0 auto;
}

.hero-panel {
  padding: 28px;
  border: 1px solid var(--color-border);
  border-radius: 28px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 18%, transparent), transparent 32%),
    linear-gradient(145deg, var(--color-bg-surface), color-mix(in srgb, var(--color-bg-surface) 82%, var(--color-primary) 18%));
  box-shadow: var(--shadow-sm);
}

.hero-main {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.back-btn {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: 1px solid var(--color-border-solid);
  background: color-mix(in srgb, var(--color-bg-surface) 84%, transparent);
  color: var(--color-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.back-btn:hover {
  color: var(--color-primary);
  border-color: var(--color-primary-light);
  transform: translateX(-1px);
}

.hero-copy {
  flex: 1;
}

.eyebrow,
.section-kicker,
.card-label,
.meta-label {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-primary);
}

.page-title {
  margin-top: 6px;
  font-size: 34px;
  font-weight: 800;
  color: var(--color-text);
}

.page-subtitle {
  margin-top: 10px;
  max-width: 820px;
  font-size: 14px;
  line-height: 1.75;
  color: var(--color-text-secondary);
}

.credential-strip {
  margin-top: 24px;
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.8fr;
  gap: 14px;
}

.credential-card {
  min-width: 0;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-bg-surface) 88%, transparent);
}

.credential-primary {
  background: linear-gradient(145deg, color-mix(in srgb, var(--color-primary) 14%, var(--color-bg-surface)), var(--color-bg-surface));
}

.credential-name-row {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.credential-name {
  font-size: 20px;
  color: var(--color-text);
}

.credential-meta {
  margin-top: 12px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  color: var(--color-text-muted);
  font-size: 13px;
}

.credential-code {
  display: block;
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  word-break: break-all;
}

.workspace-grid {
  margin-top: 22px;
  display: grid;
  grid-template-columns: minmax(340px, 0.9fr) minmax(420px, 1.1fr);
  gap: 20px;
  align-items: start;
}

.surface-card {
  padding: 22px;
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.section-head-split {
  align-items: center;
}

.section-title {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
}

.section-tip {
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 8px 10px;
  border-radius: 999px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
}

.form-grid {
  margin-top: 22px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.compact-grid {
  margin-top: 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-span-2 {
  grid-column: span 2;
}

.form-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.form-input,
.form-textarea {
  width: 100%;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-inset);
  color: var(--color-text);
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
}

.form-input:focus,
.form-textarea:focus,
.search-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.form-textarea {
  resize: vertical;
}

.form-error {
  font-size: 12px;
  color: var(--color-danger);
}

.form-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.4;
}

.connectivity-panel {
  margin-top: 22px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
}

.compact-head {
  align-items: center;
}

.mini-title {
  margin-top: 6px;
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text);
}

.test-result-card {
  margin-top: 14px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-inset);
}

.test-result-card.success {
  border-color: rgba(16, 185, 129, 0.28);
  background: rgba(16, 185, 129, 0.08);
}

.test-result-card.danger {
  border-color: rgba(239, 68, 68, 0.24);
  background: rgba(239, 68, 68, 0.08);
}

.test-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  color: var(--color-text);
}

.test-result-copy {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.switch-row {
  margin-top: 18px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.toggle-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-inset);
  font-size: 13px;
  color: var(--color-text-secondary);
}

.toggle-pill input {
  margin: 0;
}

.footer-actions {
  margin-top: 22px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.sync-meta {
  margin-top: 18px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 140px;
  gap: 12px;
}

.meta-chip {
  padding: 14px 16px;
  border-radius: 16px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
  min-width: 0;
}

.meta-chip code {
  display: block;
  margin-top: 8px;
  color: var(--color-text-secondary);
  word-break: break-all;
}

.meta-chip.accent {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.meta-chip strong {
  margin-top: 8px;
  font-size: 26px;
  color: var(--color-text);
}

.batch-settings {
  margin-top: 18px;
}

.model-list-panel {
  margin-top: 20px;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  overflow: hidden;
  background: linear-gradient(180deg, color-mix(in srgb, var(--color-bg-surface) 92%, transparent), var(--color-bg-inset));
}

.model-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
}

.search-input {
  flex: 1;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.model-empty-state {
  padding: 42px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  color: var(--color-text-muted);
}

.model-empty-state.compact {
  padding: 24px 18px;
}

.model-list {
  max-height: 480px;
  overflow: auto;
}

.model-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 14px 16px;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 75%, transparent);
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}

.model-row:hover {
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-hover));
}

.model-row.selected {
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg-hover));
}

.model-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.model-copy strong,
.model-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-copy strong {
  color: var(--color-text);
  font-size: 14px;
}

.model-copy span,
.model-owner {
  color: var(--color-text-muted);
  font-size: 12px;
}

.model-owner {
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
}

.block-error {
  margin-top: 12px;
  display: block;
}

.profiles-card {
  margin-top: 20px;
}

.profiles-list {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.profile-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--color-border);
  background: linear-gradient(180deg, color-mix(in srgb, var(--color-bg-surface) 90%, transparent), var(--color-bg-inset));
}

.profile-main {
  flex: 1;
  min-width: 0;
}

.profile-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.profile-title-row strong {
  font-size: 16px;
  color: var(--color-text);
}

.profile-meta {
  margin-top: 8px;
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  color: var(--color-text-muted);
  font-size: 13px;
}

.profile-desc {
  margin-top: 10px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.profile-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.status-badge,
.default-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.status-badge.active {
  background: rgba(16, 185, 129, 0.14);
  color: #059669;
}

.status-badge.inactive {
  background: rgba(148, 163, 184, 0.18);
  color: #64748b;
}

.default-badge {
  background: rgba(245, 158, 11, 0.16);
  color: #d97706;
}

.toggle-pill-block {
  min-height: 48px;
  border-radius: 12px;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.48);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 1200;
}

.modal-container {
  width: min(680px, 100%);
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 24px;
  box-shadow: var(--shadow-lg, 0 24px 80px rgba(15, 23, 42, 0.24));
  overflow: hidden;
}

.modal-header,
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px;
}

.modal-header {
  border-bottom: 1px solid var(--color-border);
}

.modal-footer {
  border-top: 1px solid var(--color-border);
}

.modal-body {
  padding: 22px;
}

.modal-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text);
}

.modal-close {
  width: 36px;
  height: 36px;
  border: 1px solid var(--color-border-solid);
  border-radius: 10px;
  background: transparent;
  color: var(--color-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: translateY(10px);
  opacity: 0;
}

.provider-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.provider-openai {
  background: rgba(16, 185, 129, 0.14);
  color: #059669;
}

.provider-azure {
  background: rgba(59, 130, 246, 0.14);
  color: #2563eb;
}

.provider-anthropic {
  background: rgba(245, 158, 11, 0.16);
  color: #d97706;
}

.provider-custom {
  background: rgba(236, 72, 153, 0.14);
  color: #db2777;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 8px 16px;
  border-radius: 12px;
  border: 1px solid transparent;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-primary {
  color: #fff;
  background: linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-end));
  box-shadow: 0 8px 20px var(--color-primary-shadow);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn-ghost {
  color: var(--color-text-secondary);
  background: transparent;
  border-color: var(--color-border-solid);
}

.btn-ghost:hover:not(:disabled) {
  color: var(--color-text);
  border-color: var(--color-primary-light);
  background: var(--color-bg-hover);
}

.btn-sm {
  min-height: 34px;
  padding: 6px 12px;
  font-size: 12px;
}

.spin-icon {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 1100px) {
  .credential-strip,
  .workspace-grid,
  .sync-meta {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .model-setup-page {
    padding: 16px;
  }

  .hero-panel,
  .surface-card {
    padding: 18px;
    border-radius: 20px;
  }

  .page-title {
    font-size: 28px;
  }

  .hero-main,
  .section-head,
  .section-head-split,
  .model-toolbar,
  .footer-actions,
  .profile-row,
  .modal-footer,
  .modal-header {
    flex-direction: column;
    align-items: stretch;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-span-2 {
    grid-column: span 1;
  }

  .model-row {
    grid-template-columns: 18px minmax(0, 1fr);
  }

  .model-owner {
    justify-self: start;
  }

  .profile-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
