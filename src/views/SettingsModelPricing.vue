<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type {
  ModelPricingItem,
  ModelPricingCreateRequest,
  ModelPricingUpdateRequest,
  ApiKeyItem,
  LlmProfileItem,
} from '../types/config'
import {
  getModelPricingList,
  createModelPricing,
  updateModelPricing,
  deleteModelPricing,
  getApiKeyList,
  getLlmProfiles,
} from '../api/config'
import { useNotification } from '../composables/useNotification'
import { parse422Errors } from '../utils/errorParser'

const router = useRouter()
const notify = useNotification()

/* ===== 筛选与搜索 ===== */

type PriceFilterType = 'all' | 'global' | 'custom'
const filterType = ref<PriceFilterType>('all')
const searchKeyword = ref('')

/* ===== 状态 ===== */

const loading = ref(false)
const pricingItems = ref<ModelPricingItem[]>([])
const credentials = ref<ApiKeyItem[]>([])
const profiles = ref<LlmProfileItem[]>([])

/* ===== 弹窗状态 ===== */

const showFormDialog = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const editingPricingId = ref<number | null>(null)
const submitting = ref(false)

const formData = ref<{
  model: string
  inputPrice: number
  cachedInputPrice: number
  outputPrice: number
  multiplier: number
  credentialId: number | null
}>({
  model: '',
  inputPrice: 1.0,
  cachedInputPrice: 0.1,
  outputPrice: 3.0,
  multiplier: 1.0,
  credentialId: null,
})

/* ===== 删除确认 ===== */

const showDeleteConfirm = ref(false)
const deletingItem = ref<ModelPricingItem | null>(null)
const deleting = ref(false)

/* ===== 计算属性 ===== */

/** 统一过滤：类型筛选 + 关键词搜索 */
const filteredPricing = computed(() => {
  let result = pricingItems.value

  // 类型筛选
  if (filterType.value === 'global') {
    result = result.filter((p) => p.credentialId === null)
  } else if (filterType.value === 'custom') {
    result = result.filter((p) => p.credentialId !== null)
  }

  // 关键词搜索
  const kw = searchKeyword.value.trim().toLowerCase()
  if (kw) {
    result = result.filter((p) => {
      const name = getCredentialName(p.credentialId).toLowerCase()
      return p.model.toLowerCase().includes(kw) || name.includes(kw)
    })
  }

  return result
})

/** 根据当前表单中选中的 credentialId，返回对应 profiles 的去重模型名列表 */
const profileModels = computed(() => {
  const credId = formData.value.credentialId
  return profiles.value
    .filter((p) => credId === null || p.credentialId === credId)
    .map((p) => p.model)
    .filter((m, i, arr) => arr.indexOf(m) === i)
})

/* ===== 数据加载 ===== */

async function loadData() {
  loading.value = true
  try {
    const [pricingRes, credRes, profRes] = await Promise.all([
      getModelPricingList(),
      getApiKeyList(),
      getLlmProfiles(),
    ])
    if (pricingRes.data.code === 1) {
      pricingItems.value = pricingRes.data.data.items || []
    }
    if (credRes.data.code === 1) {
      credentials.value = credRes.data.data.items || []
    }
    if (profRes.data.code === 1) {
      profiles.value = profRes.data.data.items || []
    }
  } catch (e: any) {
    notify.error('加载数据失败', e?.message || '请稍后重试')
  } finally {
    loading.value = false
  }
}

/* ===== 新增 ===== */

function openCreate() {
  formMode.value = 'create'
  editingPricingId.value = null
  formData.value = {
    model: '',
    inputPrice: 1.0,
    cachedInputPrice: 0.1,
    outputPrice: 3.0,
    multiplier: 1.0,
    credentialId: null,
  }
  showFormDialog.value = true
}

function selectModelFromProfile(model: string) {
  formData.value.model = model
}

/* ===== 编辑 ===== */

function openEdit(item: ModelPricingItem) {
  formMode.value = 'edit'
  editingPricingId.value = item.pricingId
  formData.value = {
    model: item.model,
    inputPrice: item.inputPrice,
    cachedInputPrice: item.cachedInputPrice,
    outputPrice: item.outputPrice,
    multiplier: item.multiplier,
    credentialId: item.credentialId,
  }
  showFormDialog.value = true
}

/* ===== 提交 ===== */

function closeFormDialog() {
  showFormDialog.value = false
}

async function submitForm() {
  if (!formData.value.model.trim()) {
    notify.warning('参数不完整', '请填写模型名称')
    return
  }

  submitting.value = true
  try {
    if (formMode.value === 'create') {
      const payload: ModelPricingCreateRequest = {
        model: formData.value.model.trim(),
        inputPrice: formData.value.inputPrice,
        cachedInputPrice: formData.value.cachedInputPrice,
        outputPrice: formData.value.outputPrice,
        multiplier: formData.value.multiplier,
        credentialId: formData.value.credentialId ?? null,
      }
      const res = await createModelPricing(payload)
      if (res.data.code === 200 || res.data.code === 1) {
        notify.info('定价已创建', `${formData.value.model} 定价已保存`)
        closeFormDialog()
        await loadData()
        return
      }
      notify.warning('创建失败', res.data.msg)
    } else {
      if (!editingPricingId.value) return
      const payload: ModelPricingUpdateRequest = {
        model: formData.value.model.trim(),
        inputPrice: formData.value.inputPrice,
        cachedInputPrice: formData.value.cachedInputPrice,
        outputPrice: formData.value.outputPrice,
        multiplier: formData.value.multiplier,
      }
      const res = await updateModelPricing(editingPricingId.value, payload)
      if (res.data.code === 200 || res.data.code === 1) {
        notify.info('定价已更新', `${formData.value.model} 定价已保存`)
        closeFormDialog()
        await loadData()
        return
      }
      notify.warning('更新失败', res.data.msg)
    }
  } catch (e: any) {
    notify.error('操作失败', parse422Errors(e).join('\n'))
  } finally {
    submitting.value = false
  }
}

/* ===== 删除 ===== */

function openDeleteConfirm(item: ModelPricingItem) {
  deletingItem.value = item
  showDeleteConfirm.value = true
}

function closeDeleteConfirm() {
  showDeleteConfirm.value = false
  deletingItem.value = null
}

async function confirmDelete() {
  if (!deletingItem.value) return
  deleting.value = true
  try {
    const res = await deleteModelPricing(deletingItem.value.pricingId)
    if (res.data.code === 200 || res.data.code === 1) {
      notify.info('定价已删除', `${deletingItem.value.model} 已删除`)
      closeDeleteConfirm()
      await loadData()
      return
    }
    notify.warning('删除失败', res.data.msg)
  } catch (e: any) {
    notify.error('删除失败', e?.message || '请稍后重试')
  } finally {
    deleting.value = false
  }
}

/* ===== 切换启用/禁用 ===== */

async function toggleActive(item: ModelPricingItem) {
  try {
    const res = await updateModelPricing(item.pricingId, {
      isActive: item.isActive ? 0 : 1,
    })
    if (res.data.code === 200 || res.data.code === 1) {
      notify.info(item.isActive ? '已禁用' : '已启用', `${item.model} 定价状态已更新`)
      await loadData()
      return
    }
    notify.warning('操作失败', res.data.msg)
  } catch (e: any) {
    notify.error('操作失败', e?.message || '请稍后重试')
  }
}

/* ===== 辅助 ===== */

function formatPrice(price: number) {
  return price.toFixed(4)
}

function getCredentialName(credentialId: number | null) {
  if (credentialId === null) return '全局'
  const cred = credentials.value.find((c) => c.credentialId === credentialId)
  return cred ? cred.name : `ID: ${credentialId}`
}

function goBack() {
  router.push('/settings')
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="pricing-page">
    <header class="page-header">
      <button class="back-btn" @click="goBack">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div>
        <p class="eyebrow">Billing</p>
        <h1 class="page-title">模型定价</h1>
        <p class="page-subtitle">管理全局模型价格与各凭证自定义价。最终价格 = 单价 × 倍率。</p>
      </div>
      <button class="refresh-btn" :disabled="loading" @click="loadData">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        刷新
      </button>
    </header>

    <!-- ===== 统一筛选工具栏 ===== -->
    <div class="filter-bar">
      <div class="filter-type-group">
        <button class="filter-btn" :class="{ active: filterType === 'all' }" @click="filterType = 'all'">全部</button>
        <button class="filter-btn" :class="{ active: filterType === 'global' }" @click="filterType = 'global'">全局</button>
        <button class="filter-btn" :class="{ active: filterType === 'custom' }" @click="filterType = 'custom'">自定义</button>
      </div>

      <label class="search-field">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input v-model="searchKeyword" type="text" placeholder="搜索模型名或凭证名…" />
      </label>

      <button class="primary-btn" @click="openCreate">+ 新增定价</button>
    </div>

    <!-- ===== 统一定价表格 ===== -->
    <section class="section-card">
      <div class="section-head">
        <h2>
          定价记录
          <span class="count-badge">{{ filteredPricing.length }} / {{ pricingItems.length }}</span>
        </h2>
        <p>价格为 ¥/百万 tokens。最终价格 = 单价 × 倍率。全局价适用于所有凭证，自定义价仅对该凭证生效。</p>
      </div>

      <div v-if="loading" class="loading-text">加载中…</div>

      <div v-else-if="filteredPricing.length === 0" class="empty-text">暂无匹配的定价记录。</div>

      <div v-else class="table-wrap">
        <table class="pricing-table">
          <thead>
            <tr>
              <th>模型</th>
              <th>输入价格</th>
              <th>缓存输入价</th>
              <th>输出价格</th>
              <th>倍率</th>
              <th>凭证</th>
              <th>状态</th>
              <th class="actions-col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredPricing" :key="item.pricingId">
              <td><code>{{ item.model }}</code></td>
              <td>¥{{ formatPrice(item.inputPrice) }}</td>
              <td>¥{{ formatPrice(item.cachedInputPrice) }}</td>
              <td>¥{{ formatPrice(item.outputPrice) }}</td>
              <td>{{ item.multiplier }}</td>
              <td>
                <span class="cred-badge" :class="item.credentialId === null ? 'global' : 'custom'">
                  {{ getCredentialName(item.credentialId) }}
                </span>
              </td>
              <td>
                <span class="status-pill" :class="item.isActive ? 'active' : 'inactive'" @click="toggleActive(item)">
                  {{ item.isActive ? '启用' : '禁用' }}
                </span>
              </td>
              <td class="actions-col">
                <button class="mini-btn" @click="openEdit(item)">编辑</button>
                <button class="mini-btn danger" @click="openDeleteConfirm(item)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ===== 新增/编辑弹窗 ===== -->
    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="showFormDialog" class="dialog-overlay" @click.self="closeFormDialog">
          <div class="dialog-card">
            <div class="dialog-head">
              <h3>{{ formMode === 'create' ? '新增定价' : '编辑定价' }}</h3>
            </div>

            <div class="dialog-body">
              <div class="form-grid">
                <!-- 新增时可选择凭证；编辑时只读显示 -->
                <label v-if="formMode === 'create'" class="field">
                  <span>所属凭证</span>
                  <select v-model.number="formData.credentialId">
                    <option :value="null">全局定价（适用于所有凭证）</option>
                    <option v-for="cred in credentials" :key="cred.credentialId" :value="cred.credentialId">
                      {{ cred.name }} ({{ cred.provider }})
                    </option>
                  </select>
                </label>
                <div v-else class="field-info">
                  <span class="field">凭证</span>
                  <span class="info-value">{{ getCredentialName(formData.credentialId) }}</span>
                </div>

                <label class="field">
                  <span>模型名称</span>
                  <input v-model="formData.model" type="text" placeholder="如 gpt-4o, deepseek-chat" />
                </label>

                <div class="form-row-3">
                  <label class="field">
                    <span>输入价格 (¥/M)</span>
                    <input v-model.number="formData.inputPrice" type="number" min="0" step="0.0001" />
                  </label>

                  <label class="field">
                    <span>缓存输入价 (¥/M)</span>
                    <input v-model.number="formData.cachedInputPrice" type="number" min="0" step="0.0001" />
                  </label>

                  <label class="field">
                    <span>输出价格 (¥/M)</span>
                    <input v-model.number="formData.outputPrice" type="number" min="0" step="0.0001" />
                  </label>
                </div>

                <label class="field">
                  <span>倍率</span>
                  <input v-model.number="formData.multiplier" type="number" min="0" step="0.1" />
                  <span class="field-hint">最终价格 = 单价 × 倍率</span>
                </label>
              </div>

              <!-- 快速选取模型 — 仅显示当前凭证对应的 profiles -->
              <div v-if="profileModels.length > 0" class="quick-model-select">
                <span class="quick-label">{{ formData.credentialId ? '该凭证下的可用模型：' : '所有凭证下的可用模型：' }}</span>
                <div class="quick-chips">
                  <button
                    v-for="m in profileModels"
                    :key="m"
                    class="mini-chip"
                    :class="{ selected: formData.model === m }"
                    @click="selectModelFromProfile(m)"
                  >
                    {{ m }}
                  </button>
                </div>
              </div>
            </div>

            <div class="dialog-actions">
              <button class="secondary-btn" :disabled="submitting" @click="closeFormDialog">取消</button>
              <button class="primary-btn" :disabled="submitting" @click="submitForm">
                {{ submitting ? '保存中…' : '保存' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ===== 删除确认弹窗 ===== -->
    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="showDeleteConfirm" class="dialog-overlay" @click.self="closeDeleteConfirm">
          <div class="dialog-card">
            <div class="dialog-head">
              <h3>删除定价</h3>
              <p>确定要删除 <strong>{{ deletingItem?.model }}</strong> 的定价记录吗？删除后该模型价格将按优先级回退。</p>
            </div>
            <div class="dialog-actions">
              <button class="secondary-btn" :disabled="deleting" @click="closeDeleteConfirm">取消</button>
              <button class="danger-btn" :disabled="deleting" @click="confirmDelete">
                {{ deleting ? '删除中…' : '确认删除' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.pricing-page {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 20px;
  padding: 22px;
  border: 1px solid var(--color-border);
  border-radius: 24px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
}

.back-btn {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border: 1px solid var(--color-border-solid);
  border-radius: 14px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
}

.back-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-ghost);
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

.refresh-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border-solid);
  border-radius: 10px;
  padding: 0 14px;
  height: 38px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.18s ease;
  flex-shrink: 0;
}

.refresh-btn:hover {
  border-color: var(--color-primary-light);
  color: var(--color-primary);
}

.refresh-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* Filter bar */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.filter-type-group {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}

.filter-btn {
  border: none;
  border-radius: 10px;
  padding: 8px 14px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease;
}

.filter-btn.active {
  background: var(--color-bg-inset);
  color: var(--color-text);
}

.search-field {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 200px;
  max-width: 360px;
  padding: 0 12px;
  height: 40px;
  border-radius: 14px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg);
  color: var(--color-text-muted);
  transition: border-color 0.18s ease;
}

.search-field:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.search-field input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 14px;
  outline: none;
}

.search-field input::placeholder {
  color: var(--color-text-muted);
}

/* Section */
.section-card {
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
  padding: 20px;
}

.section-head {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.section-head h2 {
  width: 100%;
  font-size: 20px;
  font-weight: 800;
  color: var(--color-text);
}

.section-head p {
  flex: 1;
  font-size: 13px;
  color: var(--color-text-secondary);
  min-width: 200px;
}

.section-head .primary-btn {
  margin-left: auto;
  flex-shrink: 0;
}

.count-badge {
  margin-left: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
  background: var(--color-bg-inset);
  padding: 2px 10px;
  border-radius: 999px;
  vertical-align: middle;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field span {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Table */
.table-wrap {
  overflow-x: auto;
}

.pricing-table {
  width: 100%;
  min-width: 780px;
  border-collapse: collapse;
  font-size: 13px;
}

.pricing-table th,
.pricing-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-divider);
  text-align: left;
  white-space: nowrap;
}

.pricing-table th {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  background: var(--color-bg-inset);
}

.pricing-table td code {
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
  font-size: 13px;
  background: var(--color-bg-inset);
  padding: 2px 8px;
  border-radius: 6px;
  color: var(--color-text);
}

.pricing-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.actions-col {
  width: 130px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: opacity 0.18s ease;
}

.status-pill.active {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.status-pill.inactive {
  color: var(--color-text-secondary);
  background: var(--color-bg-inset);
}

.status-pill:hover {
  opacity: 0.75;
}

/* Credential badge */
.cred-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.cred-badge.global {
  color: var(--color-info);
  background: var(--color-info-bg);
}

.cred-badge.custom {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

/* Form */
.form-row-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
}

.field-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-info .field {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.field-info .info-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.mini-btn {
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
  color: var(--color-text-secondary);
  background: var(--color-bg-inset);
  margin-right: 6px;
}

.mini-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.mini-btn.danger {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.mini-btn.danger:hover {
  opacity: 0.8;
}

/* Quick model select in dialog */
.quick-model-select {
  margin-top: 14px;
  padding: 12px;
  border-radius: 12px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-divider);
}

.quick-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  display: block;
  margin-bottom: 8px;
}

.quick-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mini-chip {
  border: 1px solid var(--color-border-solid);
  border-radius: 999px;
  padding: 4px 10px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: 'IBM Plex Mono', 'Fira Code', monospace;
}

.mini-chip:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.mini-chip.selected {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

/* Dialog */
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
  width: min(480px, 100%);
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.dialog-head {
  padding: 20px 22px 12px;
}

.dialog-head h3 {
  font-size: 22px;
  font-weight: 800;
  color: var(--color-text);
}

.dialog-head p {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.dialog-body {
  padding: 8px 22px 12px;
}

.dialog-actions {
  padding: 12px 22px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field input,
.field select {
  width: 100%;
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0 12px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.field input:focus,
.field select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.field input[type="number"] {
  font-variant-numeric: tabular-nums;
}

.field-hint {
  font-size: 11px;
  color: var(--color-text-muted);
}

/* Buttons */
.primary-btn,
.secondary-btn,
.danger-btn {
  min-height: 38px;
  border-radius: 10px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
  border: 1px solid var(--color-border-solid);
}

.primary-btn {
  background: var(--color-bg-surface);
  color: var(--color-text);
}

.primary-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.secondary-btn {
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
}

.secondary-btn:hover {
  color: var(--color-text);
  border-color: var(--color-primary);
}

.danger-btn {
  background: var(--color-danger-bg);
  color: var(--color-danger);
  border-color: rgba(239, 68, 68, 0.18);
}

.danger-btn:hover {
  background: var(--color-danger);
  color: #fff;
}

.primary-btn:disabled,
.secondary-btn:disabled,
.danger-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

/* Utilities */
.loading-text,
.empty-text {
  padding: 40px 0;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 14px;
}

.empty-text.hint {
  padding: 20px 0;
  font-size: 13px;
  color: var(--color-text-muted);
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
</style>
