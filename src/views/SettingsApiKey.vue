<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { ApiKeyItem, ApiKeyProvider, ApiKeyCreateRequest, ApiKeyUpdateRequest } from '../types/config'
import { getApiKeyList, createApiKey, updateApiKey, deleteApiKey, checkApiKey } from '../api/config'
import { useNotification } from '../composables/useNotification'
import { parse422Errors } from '../utils/errorParser'

const router = useRouter()
const notification = useNotification()

const items = ref<ApiKeyItem[]>([])
const total = ref(0)
const loading = ref(false)

const sortField = ref<'createTime' | 'name' | 'provider' | 'isActive' | 'usedQuota'>('createTime')
const sortOrder = ref<'asc' | 'desc'>('desc')

const filterProvider = ref<ApiKeyProvider | ''>('')
const filterActive = ref<'' | 'true' | 'false'>('')
const filterKeyword = ref('')

const showAddModal = ref(false)
const showEditModal = ref(false)
const showDeleteConfirm = ref(false)
const showKeyResult = ref(false)
const createdMaskedKey = ref('')
const deletingItem = ref<ApiKeyItem | null>(null)
const editingItem = ref<ApiKeyItem | null>(null)
const checkingId = ref<number | null>(null)

const addForm = ref<{
  name: string
  provider: ApiKeyProvider
  baseUrl: string
  isActive: boolean
  description: string
  quotaLimit: number
  apiKey: string
}>({
  name: '',
  provider: 'OpenAI',
  baseUrl: '',
  isActive: true,
  description: '',
  quotaLimit: 0,
  apiKey: '',
})

const editForm = ref<{
  name: string
  provider: ApiKeyProvider
  baseUrl: string
  isActive: boolean
  description: string
  quotaLimit: number
  credentialId: number
}>({
  name: '',
  provider: 'OpenAI',
  baseUrl: '',
  isActive: true,
  description: '',
  quotaLimit: 0,
  credentialId: 0,
})

const addErrors = ref<Record<string, string>>({})
const editErrors = ref<Record<string, string>>({})
const submitting = ref(false)

const providerOptions: { value: ApiKeyProvider; label: string }[] = [
  { value: 'OpenAI', label: 'OpenAI' },
  { value: 'Azure', label: 'Azure' },
  { value: 'Anthropic', label: 'Anthropic' },
  { value: 'Custom', label: 'Custom' },
]

const sortedFilteredItems = computed(() => {
  let result = [...items.value]

  if (filterProvider.value) {
    result = result.filter((item) => item.provider === filterProvider.value)
  }

  if (filterActive.value !== '') {
    const isActive = filterActive.value === 'true'
    result = result.filter((item) => item.isActive === isActive)
  }

  if (filterKeyword.value.trim()) {
    const kw = filterKeyword.value.trim().toLowerCase()
    result = result.filter(
      (item) =>
        item.name.toLowerCase().includes(kw) ||
        item.maskedKey.toLowerCase().includes(kw) ||
        item.description?.toLowerCase().includes(kw) ||
        item.baseUrl?.toLowerCase().includes(kw)
    )
  }

  result.sort((a, b) => {
    const aVal = a[sortField.value]
    const bVal = b[sortField.value]
    let cmp = 0
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      cmp = aVal.localeCompare(bVal)
    } else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
      cmp = Number(aVal) - Number(bVal)
    } else {
      cmp = (aVal as number) - (bVal as number)
    }
    return sortOrder.value === 'asc' ? cmp : -cmp
  })

  return result
})

function toggleSort(field: typeof sortField.value) {
  if (sortField.value === field) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortOrder.value = 'asc'
  }
}

function getSortIcon(field: string): string {
  if (sortField.value !== field) return 'sort-neutral'
  return sortOrder.value === 'asc' ? 'sort-asc' : 'sort-desc'
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '-'
  const d = new Date(timeStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}:${s}`
}

function validateAddForm(): boolean {
  addErrors.value = {}
  if (!addForm.value.name.trim()) {
    addErrors.value.name = '凭证别名不能为空'
  } else if (addForm.value.name.length > 64) {
    addErrors.value.name = '凭证别名不能超过64个字符'
  }
  if (!addForm.value.apiKey.trim()) {
    addErrors.value.apiKey = 'API Key不能为空'
  } else if (addForm.value.apiKey.length < 8) {
    addErrors.value.apiKey = 'API Key长度不能少于8个字符'
  }
  if (addForm.value.baseUrl && !/^https?:\/\/.+/.test(addForm.value.baseUrl.trim())) {
    addErrors.value.baseUrl = '自定义请求地址格式不正确，需以http://或https://开头'
  }
  if (addForm.value.quotaLimit < 0) {
    addErrors.value.quotaLimit = '预算额度不能为负数'
  }
  if (addForm.value.description && addForm.value.description.length > 256) {
    addErrors.value.description = '备注说明不能超过256个字符'
  }
  return Object.keys(addErrors.value).length === 0
}

function validateEditForm(): boolean {
  editErrors.value = {}
  if (!editForm.value.name.trim()) {
    editErrors.value.name = '凭证别名不能为空'
  } else if (editForm.value.name.length > 64) {
    editErrors.value.name = '凭证别名不能超过64个字符'
  }
  if (editForm.value.baseUrl && !/^https?:\/\/.+/.test(editForm.value.baseUrl.trim())) {
    editErrors.value.baseUrl = '自定义请求地址格式不正确，需以http://或https://开头'
  }
  if (editForm.value.quotaLimit < 0) {
    editErrors.value.quotaLimit = '预算额度不能为负数'
  }
  if (editForm.value.description && editForm.value.description.length > 256) {
    editErrors.value.description = '备注说明不能超过256个字符'
  }
  return Object.keys(editErrors.value).length === 0
}

async function fetchList() {
  loading.value = true
  try {
    const res = await getApiKeyList()
    if (res.data.code === 1) {
      items.value = res.data.data.items
      total.value = res.data.data.total
    } else {
      notification.error('获取凭证列表失败', res.data.msg || '请稍后重试')
    }
  } catch (e) {
    const msgs = parse422Errors(e)
    notification.error('获取凭证列表失败', msgs.join('; '))
  } finally {
    loading.value = false
  }
}

function openAddModal() {
  addForm.value = {
    name: '',
    provider: 'OpenAI',
    baseUrl: '',
    isActive: true,
    description: '',
    quotaLimit: 0,
    apiKey: '',
  }
  addErrors.value = {}
  showAddModal.value = true
}

async function handleAdd() {
  if (!validateAddForm()) return
  submitting.value = true
  try {
    const payload: ApiKeyCreateRequest = {
      name: addForm.value.name.trim(),
      provider: addForm.value.provider,
      baseUrl: addForm.value.baseUrl.trim() || undefined,
      isActive: addForm.value.isActive,
      description: addForm.value.description.trim() || undefined,
      quotaLimit: addForm.value.quotaLimit || undefined,
      apiKey: addForm.value.apiKey.trim(),
    }
    const res = await createApiKey(payload)
    if (res.data.code === 1) {
      showAddModal.value = false
      createdMaskedKey.value = res.data.data.maskedKey
      showKeyResult.value = true
      notification.info('创建成功', 'API Key凭证已成功创建')
      await fetchList()
    } else {
      notification.error('创建失败', res.data.msg || '请稍后重试')
    }
  } catch (e) {
    const msgs = parse422Errors(e)
    notification.error('创建失败', msgs.join('; '))
  } finally {
    submitting.value = false
  }
}

function openEditModal(item: ApiKeyItem) {
  editingItem.value = item
  editForm.value = {
    name: item.name,
    provider: item.provider,
    baseUrl: item.baseUrl || '',
    isActive: item.isActive,
    description: item.description || '',
    quotaLimit: item.quotaLimit || 0,
    credentialId: item.credentialId,
  }
  editErrors.value = {}
  showEditModal.value = true
}

async function handleEdit() {
  if (!validateEditForm()) return
  submitting.value = true
  try {
    const payload: ApiKeyUpdateRequest = {
      name: editForm.value.name.trim(),
      provider: editForm.value.provider,
      baseUrl: editForm.value.baseUrl.trim() || null,
      isActive: editForm.value.isActive,
      description: editForm.value.description.trim() || null,
      quotaLimit: editForm.value.quotaLimit || null,
      credentialId: editForm.value.credentialId,
    }
    const res = await updateApiKey(payload)
    if (res.data.code === 1) {
      showEditModal.value = false
      notification.info('更新成功', '凭证信息已更新')
      await fetchList()
    } else {
      notification.error('更新失败', res.data.msg || '请稍后重试')
    }
  } catch (e) {
    const msgs = parse422Errors(e)
    notification.error('更新失败', msgs.join('; '))
  } finally {
    submitting.value = false
  }
}

function openDeleteConfirm(item: ApiKeyItem) {
  deletingItem.value = item
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!deletingItem.value) return
  submitting.value = true
  try {
    const res = await deleteApiKey(deletingItem.value.credentialId)
    if (res.data.code === 1) {
      showDeleteConfirm.value = false
      notification.info('删除成功', `凭证「${deletingItem.value.name}」已删除`)
      deletingItem.value = null
      await fetchList()
    } else {
      notification.error('删除失败', res.data.msg || '请稍后重试')
    }
  } catch (e) {
    const msgs = parse422Errors(e)
    notification.error('删除失败', msgs.join('; '))
  } finally {
    submitting.value = false
  }
}

async function handleCheck(item: ApiKeyItem) {
  checkingId.value = item.credentialId
  try {
    const res = await checkApiKey(item.credentialId)
    if (res.data.code === 1) {
      notification.info('验证通过', `凭证「${item.name}」有效`)
    } else {
      notification.warning('验证失败', res.data.msg || `凭证「${item.name}」无效`)
    }
  } catch (e) {
    const msgs = parse422Errors(e)
    notification.error('验证失败', msgs.join('; '))
  } finally {
    checkingId.value = null
  }
}

function handleCopyKey() {
  if (createdMaskedKey.value) {
    navigator.clipboard.writeText(createdMaskedKey.value).then(() => {
      notification.info('复制成功', '已复制Masked Key到剪贴板')
    }).catch(() => {
      notification.error('复制失败', '请手动复制')
    })
  }
}

function closeKeyResult() {
  showKeyResult.value = false
  createdMaskedKey.value = ''
}

function resetFilters() {
  filterProvider.value = ''
  filterActive.value = ''
  filterKeyword.value = ''
}

function goBack() {
  router.push('/settings')
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="apikey-page">
    <div class="page-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack" title="返回设置">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <h1 class="page-title">API Key 凭证</h1>
          <span class="page-subtitle">管理 AI 服务商的 API Key 配置</span>
        </div>
      </div>
      <div class="header-right">
        <button class="btn btn-primary" @click="openAddModal">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          新增凭证
        </button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="filter-group">
        <label class="filter-label">服务商</label>
        <select class="filter-select" v-model="filterProvider">
          <option value="">全部</option>
          <option v-for="opt in providerOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label class="filter-label">状态</label>
        <select class="filter-select" v-model="filterActive">
          <option value="">全部</option>
          <option value="true">启用</option>
          <option value="false">禁用</option>
        </select>
      </div>
      <div class="filter-group filter-keyword">
        <label class="filter-label">搜索</label>
        <input
          type="text"
          class="filter-input"
          v-model="filterKeyword"
          placeholder="搜索名称/Key/描述..."
        />
      </div>
      <button class="btn btn-ghost filter-reset" @click="resetFilters">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        重置
      </button>
      <div class="filter-summary">
        共 <strong>{{ total }}</strong> 条，当前 <strong>{{ sortedFilteredItems.length }}</strong> 条
      </div>
    </div>

    <div class="table-card">
      <div v-if="loading" class="table-loading">
        <div class="loading-spinner"></div>
        <span>加载中...</span>
      </div>

      <div v-else-if="sortedFilteredItems.length === 0" class="table-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span>暂无凭证数据</span>
        <button class="btn btn-primary btn-sm" @click="openAddModal">新增凭证</button>
      </div>

      <div v-else class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th class="th-sortable" @click="toggleSort('name')">
                名称
                <span class="sort-icon" :class="getSortIcon('name')">
                  <svg v-if="getSortIcon('name') === 'sort-asc'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                  <svg v-else-if="getSortIcon('name') === 'sort-desc'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </span>
              </th>
              <th class="th-sortable" @click="toggleSort('provider')">
                服务商
                <span class="sort-icon" :class="getSortIcon('provider')">
                  <svg v-if="getSortIcon('provider') === 'sort-asc'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                  <svg v-else-if="getSortIcon('provider') === 'sort-desc'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </span>
              </th>
              <th>Masked Key</th>
              <th class="th-sortable" @click="toggleSort('isActive')">
                状态
                <span class="sort-icon" :class="getSortIcon('isActive')">
                  <svg v-if="getSortIcon('isActive') === 'sort-asc'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                  <svg v-else-if="getSortIcon('isActive') === 'sort-desc'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </span>
              </th>
              <th class="th-sortable" @click="toggleSort('usedQuota')">
                已用额度
                <span class="sort-icon" :class="getSortIcon('usedQuota')">
                  <svg v-if="getSortIcon('usedQuota') === 'sort-asc'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                  <svg v-else-if="getSortIcon('usedQuota') === 'sort-desc'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </span>
              </th>
              <th>预算额度</th>
              <th class="th-sortable" @click="toggleSort('createTime')">
                创建时间
                <span class="sort-icon" :class="getSortIcon('createTime')">
                  <svg v-if="getSortIcon('createTime') === 'sort-asc'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                  <svg v-else-if="getSortIcon('createTime') === 'sort-desc'" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </span>
              </th>
              <th class="th-actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in sortedFilteredItems" :key="item.credentialId">
              <td>
                <div class="cell-name">{{ item.name }}</div>
                <div class="cell-desc" v-if="item.description" :title="item.description">{{ item.description }}</div>
              </td>
              <td>
                <span class="provider-badge" :class="'provider-' + item.provider.toLowerCase()">
                  {{ item.provider }}
                </span>
              </td>
              <td>
                <code class="masked-key">{{ item.maskedKey }}</code>
              </td>
              <td>
                <span class="status-dot" :class="{ active: item.isActive, inactive: !item.isActive }">
                  {{ item.isActive ? '启用' : '禁用' }}
                </span>
              </td>
              <td>{{ item.usedQuota }}</td>
              <td>{{ item.quotaLimit || '无限制' }}</td>
              <td class="cell-time">{{ formatTime(item.createTime) }}</td>
              <td>
                <div class="action-group">
                  <button
                    class="btn btn-icon"
                    title="验证有效性"
                    :disabled="checkingId === item.credentialId"
                    @click="handleCheck(item)"
                  >
                    <svg v-if="checkingId === item.credentialId" class="spin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  </button>
                  <button class="btn btn-icon" title="编辑" @click="openEditModal(item)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="btn btn-icon btn-icon-danger" title="删除" @click="openDeleteConfirm(item)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="todo-section">
      <div class="todo-header">
        <div class="todo-title-area">
          <h3 class="todo-title">凭证有效性验证</h3>
          <span class="dev-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            开发中
          </span>
        </div>
        <p class="todo-desc">此功能对应接口 <code>GET /config/apikey/check</code>，接口尚未开发完成。当前列表中的验证按钮已实现调用框架，但后端接口可能返回异常。</p>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
          <div class="modal-container">
            <div class="modal-header">
              <h2 class="modal-title">新增 API Key 凭证</h2>
              <button class="modal-close" @click="showAddModal = false">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label"><span class="required">*</span> 凭证别名</label>
                <input type="text" class="form-input" v-model="addForm.name" placeholder="输入凭证别名" maxlength="64" />
                <span class="form-error" v-if="addErrors.name">{{ addErrors.name }}</span>
              </div>
              <div class="form-group">
                <label class="form-label"><span class="required">*</span> 服务商类型</label>
                <select class="form-select" v-model="addForm.provider">
                  <option v-for="opt in providerOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label"><span class="required">*</span> API Key</label>
                <input type="password" class="form-input" v-model="addForm.apiKey" placeholder="输入完整的API Key" />
                <span class="form-hint">Key将在保存后加密存储，不会明文展示</span>
                <span class="form-error" v-if="addErrors.apiKey">{{ addErrors.apiKey }}</span>
              </div>
              <div class="form-group">
                <label class="form-label">自定义请求地址</label>
                <input type="text" class="form-input" v-model="addForm.baseUrl" placeholder="https://api.example.com/" />
                <span class="form-error" v-if="addErrors.baseUrl">{{ addErrors.baseUrl }}</span>
              </div>
              <div class="form-row">
                <div class="form-group form-group-half">
                  <label class="form-label">预算额度限制</label>
                  <input type="number" class="form-input" v-model.number="addForm.quotaLimit" placeholder="0表示无限制" min="0" />
                  <span class="form-error" v-if="addErrors.quotaLimit">{{ addErrors.quotaLimit }}</span>
                </div>
                <div class="form-group form-group-half">
                  <label class="form-label">是否启用</label>
                  <label class="toggle-switch">
                    <input type="checkbox" v-model="addForm.isActive" />
                    <span class="toggle-slider"></span>
                    <span class="toggle-text">{{ addForm.isActive ? '启用' : '禁用' }}</span>
                  </label>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">备注说明</label>
                <textarea class="form-textarea" v-model="addForm.description" placeholder="输入备注说明（可选）" maxlength="256" rows="3"></textarea>
                <span class="form-error" v-if="addErrors.description">{{ addErrors.description }}</span>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" @click="showAddModal = false" :disabled="submitting">取消</button>
              <button class="btn btn-primary" @click="handleAdd" :disabled="submitting">
                <svg v-if="submitting" class="spin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                {{ submitting ? '提交中...' : '创建凭证' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="modal">
        <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
          <div class="modal-container">
            <div class="modal-header">
              <h2 class="modal-title">编辑凭证</h2>
              <button class="modal-close" @click="showEditModal = false">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label"><span class="required">*</span> 凭证别名</label>
                <input type="text" class="form-input" v-model="editForm.name" placeholder="输入凭证别名" maxlength="64" />
                <span class="form-error" v-if="editErrors.name">{{ editErrors.name }}</span>
              </div>
              <div class="form-group">
                <label class="form-label"><span class="required">*</span> 服务商类型</label>
                <select class="form-select" v-model="editForm.provider">
                  <option v-for="opt in providerOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">自定义请求地址</label>
                <input type="text" class="form-input" v-model="editForm.baseUrl" placeholder="https://api.example.com/" />
                <span class="form-error" v-if="editErrors.baseUrl">{{ editErrors.baseUrl }}</span>
              </div>
              <div class="form-row">
                <div class="form-group form-group-half">
                  <label class="form-label">预算额度限制</label>
                  <input type="number" class="form-input" v-model.number="editForm.quotaLimit" placeholder="0表示无限制" min="0" />
                  <span class="form-error" v-if="editErrors.quotaLimit">{{ editErrors.quotaLimit }}</span>
                </div>
                <div class="form-group form-group-half">
                  <label class="form-label">是否启用</label>
                  <label class="toggle-switch">
                    <input type="checkbox" v-model="editForm.isActive" />
                    <span class="toggle-slider"></span>
                    <span class="toggle-text">{{ editForm.isActive ? '启用' : '禁用' }}</span>
                  </label>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">备注说明</label>
                <textarea class="form-textarea" v-model="editForm.description" placeholder="输入备注说明（可选）" maxlength="256" rows="3"></textarea>
                <span class="form-error" v-if="editErrors.description">{{ editErrors.description }}</span>
              </div>
              <div class="form-notice">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                API Key 不可直接修改，如需更换请删除后重新创建
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" @click="showEditModal = false" :disabled="submitting">取消</button>
              <button class="btn btn-primary" @click="handleEdit" :disabled="submitting">
                <svg v-if="submitting" class="spin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                {{ submitting ? '提交中...' : '保存修改' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="modal">
        <div v-if="showDeleteConfirm" class="modal-overlay" @click.self="showDeleteConfirm = false">
          <div class="modal-container modal-sm">
            <div class="modal-header">
              <h2 class="modal-title">确认删除</h2>
              <button class="modal-close" @click="showDeleteConfirm = false">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="confirm-content">
                <div class="confirm-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                </div>
                <p>确定要删除凭证 <strong>「{{ deletingItem?.name }}」</strong> 吗？</p>
                <p class="confirm-sub">此操作不可撤销，删除后需重新创建凭证。</p>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-ghost" @click="showDeleteConfirm = false" :disabled="submitting">取消</button>
              <button class="btn btn-danger" @click="handleDelete" :disabled="submitting">
                <svg v-if="submitting" class="spin-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                {{ submitting ? '删除中...' : '确认删除' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="modal">
        <div v-if="showKeyResult" class="modal-overlay" @click.self="closeKeyResult">
          <div class="modal-container modal-sm">
            <div class="modal-header">
              <h2 class="modal-title">凭证创建成功</h2>
              <button class="modal-close" @click="closeKeyResult">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="key-result">
                <div class="key-result-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </div>
                <p class="key-result-text">API Key 凭证已成功创建！</p>
                <div class="key-result-field">
                  <label>Masked Key</label>
                  <div class="key-copy-row">
                    <code class="key-display">{{ createdMaskedKey }}</code>
                    <button class="btn btn-sm btn-ghost" @click="handleCopyKey" title="复制">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      复制
                    </button>
                  </div>
                </div>
                <p class="key-result-hint">完整 API Key 仅在创建时可见，请妥善保存。关闭此窗口后将无法再次查看。</p>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-primary" @click="closeKeyResult">返回列表</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.apikey-page {
  padding: 24px;
  max-width: 1440px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.back-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-primary);
  border-color: var(--color-primary-light);
}

.page-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--color-text);
  letter-spacing: -0.5px;
}

.page-subtitle {
  font-size: 13px;
  color: var(--color-text-muted);
  display: block;
  margin-top: 2px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 8px 16px;
  line-height: 1.4;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-end));
  color: #fff;
  box-shadow: 0 2px 8px var(--color-primary-shadow);
}

.btn-primary:hover:not(:disabled) {
  box-shadow: 0 4px 16px var(--color-primary-shadow);
  transform: translateY(-1px);
}

.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border-solid);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-text);
  border-color: var(--color-primary-light);
}

.btn-danger {
  background: var(--color-danger);
  color: #fff;
}

.btn-danger:hover:not(:disabled) {
  background: var(--color-danger-hover);
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 8px;
}

.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid transparent;
}

.btn-icon:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-primary);
  border-color: var(--color-border);
}

.btn-icon-danger:hover:not(:disabled) {
  background: var(--color-danger-bg);
  color: var(--color-danger);
  border-color: transparent;
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.filter-bar {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  padding: 16px 20px;
  background: var(--color-bg-surface);
  border-radius: 14px;
  border: 1px solid var(--color-border);
  transition: background 0.3s ease, border-color 0.3s ease;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-keyword {
  flex: 1;
  min-width: 200px;
}

.filter-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-select,
.filter-input {
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-inset);
  color: var(--color-text);
  font-size: 13px;
  transition: all 0.2s ease;
  outline: none;
}

.filter-select:focus,
.filter-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.filter-input {
  width: 100%;
}

.filter-reset {
  align-self: flex-end;
}

.filter-summary {
  margin-left: auto;
  font-size: 13px;
  color: var(--color-text-muted);
  align-self: flex-end;
}

.filter-summary strong {
  color: var(--color-primary);
}

.table-card {
  background: var(--color-bg-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  overflow: hidden;
  transition: background 0.3s ease, border-color 0.3s ease;
}

.table-loading,
.table-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--color-text-muted);
  font-size: 14px;
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--color-border-solid);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.table-wrapper {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th,
.data-table td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid var(--color-divider);
  transition: border-color 0.3s ease;
}

.data-table thead th {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: var(--color-bg-inset);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
  transition: background 0.3s ease, color 0.3s ease;
}

.th-sortable {
  cursor: pointer;
  user-select: none;
}

.th-sortable:hover {
  color: var(--color-primary);
}

.sort-icon {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  vertical-align: middle;
}

.th-actions {
  text-align: center;
  width: 120px;
}

.data-table tbody tr {
  transition: background 0.15s ease;
}

.data-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.cell-name {
  font-weight: 600;
  color: var(--color-text);
}

.cell-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.provider-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 8px;
  letter-spacing: 0.3px;
}

.provider-openai {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.provider-azure {
  color: var(--color-info);
  background: var(--color-info-bg);
}

.provider-anthropic {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.provider-custom {
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.masked-key {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 12px;
  color: var(--color-text-secondary);
  background: var(--color-bg-inset);
  padding: 3px 8px;
  border-radius: 6px;
  word-break: break-all;
}

.status-dot {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
}

.status-dot::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.active {
  color: var(--color-success);
}

.status-dot.active::before {
  background: var(--color-success);
  box-shadow: 0 0 6px var(--color-success);
}

.status-dot.inactive {
  color: var(--color-text-muted);
}

.status-dot.inactive::before {
  background: var(--color-text-muted);
}

.cell-time {
  font-size: 13px;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.action-group {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.spin-icon {
  animation: spin 0.8s linear infinite;
}

.todo-section {
  margin-top: 24px;
  padding: 20px;
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning);
  border-radius: 14px;
  border-style: dashed;
  transition: background 0.3s ease, border-color 0.3s ease;
}

.todo-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.todo-title-area {
  display: flex;
  align-items: center;
  gap: 10px;
}

.todo-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-warning);
}

.dev-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: var(--color-warning);
  padding: 2px 8px;
  border-radius: 6px;
  letter-spacing: 0.3px;
}

.todo-desc {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.todo-desc code {
  background: rgba(0,0,0,0.06);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', monospace;
}

:global([data-theme="dark"]) .todo-desc code {
  background: rgba(255,255,255,0.08);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  padding: 20px;
}

.modal-container {
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  background: var(--color-bg-surface);
  border-radius: 20px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: background 0.3s ease;
}

.modal-sm {
  max-width: 440px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
}

.modal-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.modal-close:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-divider);
  transition: border-color 0.3s ease;
}

.form-group {
  margin-bottom: 16px;
}

.form-group-half {
  flex: 1;
}

.form-row {
  display: flex;
  gap: 16px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.required {
  color: var(--color-danger);
  margin-right: 2px;
}

.form-input,
.form-select,
.form-textarea {
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-inset);
  color: var(--color-text);
  font-size: 14px;
  transition: all 0.2s ease;
  outline: none;
  font-family: inherit;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.form-textarea {
  resize: vertical;
  min-height: 72px;
}

.form-hint {
  display: block;
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 4px;
}

.form-error {
  display: block;
  font-size: 12px;
  color: var(--color-danger);
  margin-top: 4px;
  font-weight: 500;
}

.form-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-warning);
  background: var(--color-warning-bg);
  padding: 10px 14px;
  border-radius: 10px;
  margin-top: 4px;
}

.toggle-switch {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  position: relative;
}

.toggle-switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: relative;
  width: 44px;
  height: 24px;
  background-color: var(--color-bg-inset);
  border: 1px solid var(--color-border-solid);
  border-radius: 24px;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: var(--color-text-muted);
  border-radius: 50%;
  transition: all 0.2s ease;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
  background-color: #fff;
}

.toggle-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.confirm-content {
  text-align: center;
  padding: 12px 0;
}

.confirm-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--color-warning-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-warning);
  margin: 0 auto 16px;
}

.confirm-content p {
  font-size: 15px;
  color: var(--color-text);
  line-height: 1.6;
}

.confirm-sub {
  font-size: 13px;
  color: var(--color-text-muted);
  margin-top: 4px;
}

.key-result {
  text-align: center;
  padding: 12px 0;
}

.key-result-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--color-success-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-success);
  margin: 0 auto 16px;
}

.key-result-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 16px;
}

.key-result-field {
  text-align: left;
  margin-bottom: 12px;
}

.key-result-field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.key-copy-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.key-display {
  flex: 1;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 13px;
  color: var(--color-text);
  background: var(--color-bg-inset);
  padding: 10px 14px;
  border-radius: 10px;
  word-break: break-all;
  text-align: left;
}

.key-result-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.5;
  margin-top: 8px;
}

.modal-enter-active {
  transition: opacity 0.25s ease;
}

.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-container {
  animation: modal-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-leave-active .modal-container {
  animation: modal-out 0.2s cubic-bezier(0.4, 0, 1, 1);
}

@keyframes modal-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes modal-out {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.98) translateY(5px);
  }
}

@media (max-width: 1200px) {
  .data-table th:nth-child(6),
  .data-table td:nth-child(6) {
    display: none;
  }
}

@media (max-width: 1024px) {
  .data-table th:nth-child(5),
  .data-table td:nth-child(5),
  .data-table th:nth-child(6),
  .data-table td:nth-child(6) {
    display: none;
  }
}

@media (max-width: 768px) {
  .apikey-page {
    padding: 16px;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .filter-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-keyword {
    min-width: 0;
  }

  .filter-summary {
    margin-left: 0;
    text-align: center;
  }

  .data-table th:nth-child(3),
  .data-table td:nth-child(3),
  .data-table th:nth-child(5),
  .data-table td:nth-child(5),
  .data-table th:nth-child(6),
  .data-table td:nth-child(6) {
    display: none;
  }

  .modal-container {
    max-width: 100%;
    border-radius: 16px;
  }

  .form-row {
    flex-direction: column;
    gap: 0;
  }
}
</style>
