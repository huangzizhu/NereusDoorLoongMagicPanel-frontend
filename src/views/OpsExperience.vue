<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as opsApi from '../api/opsExperience'
import { useNotification } from '../composables/useNotification'
import type { OpsCategory, OpsExperiencePack, OpsStatus } from '../types/opsExperience'

const router = useRouter()
const notify = useNotification()

const packs = ref<OpsExperiencePack[]>([])
const total = ref(0)
const loading = ref(false)
const refreshing = ref(false)
const page = ref(1)
const pageSize = 20

const q = ref('')
const categoryFilter = ref<'' | OpsCategory>('')
const statusFilter = ref<'' | OpsStatus>('')

const statusUpdatingId = ref<number | null>(null)
const exportingId = ref<number | null>(null)

const importDialog = reactive({
  visible: false,
  file: null as File | null,
  importing: false,
})

const summaryDialog = reactive({
  visible: false,
  text: '',
  loading: false,
})

const deleteDialog = reactive({
  visible: false,
  pack: null as OpsExperiencePack | null,
  deleting: false,
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const enabledCount = computed(() => packs.value.filter((p) => p.status === 'enabled').length)
const disabledCount = computed(() => packs.value.filter((p) => p.status === 'disabled').length)
const aiCount = computed(() => packs.value.filter((p) => p.source === 'ai').length)

// 请求序号守卫：防抖搜索与翻页/刷新并发时，只采纳最后一次发出的请求
let loadSeq = 0

const CATEGORY_LABELS: Record<OpsCategory, string> = {
  deployment: '部署',
  fault: '故障',
  optimization: '优化',
  security: '安全',
  negative: '教训',
}

function categoryLabel(category: OpsCategory): string {
  return CATEGORY_LABELS[category] || category
}

function categoryClass(category: OpsCategory): string {
  const map: Record<OpsCategory, string> = {
    deployment: 'deploy',
    fault: 'danger',
    optimization: 'success',
    security: 'warning',
    negative: 'muted',
  }
  return map[category] || 'muted'
}

function sourceLabel(source: 'ai' | 'human'): string {
  return source === 'ai' ? 'AI 沉淀' : '人工录入'
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function normalizeError(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback
  return fallback
}

const QUALITY_FORMULA = '质量分 = 100 + 有用×5 - 无用×10 + 命中×1（低于 50 检索排序降权）'

async function loadPacks(showFullLoading = false) {
  const seq = ++loadSeq
  try {
    if (showFullLoading) {
      loading.value = true
    } else {
      refreshing.value = true
    }
    const res = await opsApi.getOpsPacks({
      page: page.value,
      pageSize,
      q: q.value.trim() || undefined,
      category: categoryFilter.value || undefined,
      status: statusFilter.value || undefined,
    })
    if (seq !== loadSeq) return
    if (res.data.code !== 1) {
      notify.warning('经验库加载失败', res.data.msg)
      return
    }
    packs.value = res.data.data.items || []
    total.value = res.data.data.total || 0
  } catch (error) {
    if (seq !== loadSeq) return
    notify.error('经验库加载失败', normalizeError(error, '请稍后重试'))
  } finally {
    if (seq === loadSeq) {
      loading.value = false
      refreshing.value = false
    }
  }
}

/* ---------- 搜索（300ms 防抖）与筛选 ---------- */
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(q, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    loadPacks()
  }, 300)
})

function changeFilter() {
  page.value = 1
  loadPacks()
}

function loadPage(target: number) {
  page.value = Math.min(Math.max(1, target), totalPages.value)
  loadPacks()
}

/* ---------- 状态开关 ---------- */
async function toggleStatus(pack: OpsExperiencePack) {
  statusUpdatingId.value = pack.id
  try {
    const next: OpsStatus = pack.status === 'enabled' ? 'disabled' : 'enabled'
    const res = await opsApi.updateOpsPack(pack.id, { status: next })
    if (res.data.code !== 1) {
      notify.warning('状态切换失败', res.data.msg)
      return
    }
    const index = packs.value.findIndex((item) => item.id === pack.id)
    if (index >= 0) packs.value[index] = res.data.data
    notify.info(next === 'enabled' ? '经验包已启用' : '经验包已停用')
  } catch (error) {
    notify.error('状态切换失败', normalizeError(error, '请稍后重试'))
  } finally {
    statusUpdatingId.value = null
  }
}

/* ---------- 导出 ---------- */
async function exportPack(pack: OpsExperiencePack) {
  exportingId.value = pack.id
  try {
    const res = await opsApi.exportOpsPack(pack.id)
    opsApi.downloadBlob(res.data, `ops-experience-pack-${pack.id}.zip`)
    notify.info('导出成功', 'zip 包已开始下载')
  } catch (error) {
    notify.error('导出失败', normalizeError(error, '请稍后重试'))
  } finally {
    exportingId.value = null
  }
}

/* ---------- 删除 ---------- */
function openDeleteDialog(pack: OpsExperiencePack) {
  deleteDialog.pack = pack
  deleteDialog.visible = true
}

function closeDeleteDialog() {
  if (deleteDialog.deleting) return
  deleteDialog.visible = false
}

async function confirmDelete() {
  if (!deleteDialog.pack) return
  deleteDialog.deleting = true
  try {
    const res = await opsApi.deleteOpsPack(deleteDialog.pack.id)
    if (res.data.code !== 1) {
      notify.warning('删除失败', res.data.msg)
      return
    }
    notify.info('经验包已删除', '附件文件已一并删除')
    deleteDialog.visible = false
    if (packs.value.length === 1 && page.value > 1) {
      page.value -= 1
    }
    await loadPacks()
  } catch (error) {
    notify.error('删除失败', normalizeError(error, '请稍后重试'))
  } finally {
    deleteDialog.deleting = false
  }
}

/* ---------- 导入 ---------- */
function openImportDialog() {
  importDialog.file = null
  importDialog.visible = true
}

function closeImportDialog() {
  if (importDialog.importing) return
  importDialog.visible = false
  importDialog.file = null
}

function onImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  importDialog.file = input.files?.[0] || null
  input.value = ''
}

async function confirmImport() {
  if (!importDialog.file) {
    notify.warning('导入失败', '请先选择 .zip 文件')
    return
  }
  if (!importDialog.file.name.toLowerCase().endsWith('.zip')) {
    notify.warning('导入失败', '仅支持 .zip 格式的经验包文件')
    return
  }
  importDialog.importing = true
  try {
    const res = await opsApi.importOpsPacks(importDialog.file)
    if (res.data.code !== 1) {
      notify.warning('导入失败', res.data.msg)
      return
    }
    notify.info('导入成功', `已创建经验包「${res.data.data.title}」`)
    importDialog.visible = false
    router.push({ path: `/ops-experience/${res.data.data.id}` })
  } catch (error) {
    notify.error('导入失败', normalizeError(error, '请稍后重试'))
  } finally {
    importDialog.importing = false
  }
}

/* ---------- 知识摘要（Agent 组织记忆预览） ---------- */
async function openSummaryDialog() {
  summaryDialog.visible = true
  summaryDialog.text = ''
  summaryDialog.loading = true
  try {
    const res = await opsApi.getOpsKnowledgeSummary(20)
    summaryDialog.text = typeof res.data === 'string' ? res.data : ''
  } catch (error) {
    notify.error('知识摘要加载失败', normalizeError(error, '请稍后重试'))
  } finally {
    summaryDialog.loading = false
  }
}

function closeSummaryDialog() {
  summaryDialog.visible = false
}

onMounted(() => {
  loadPacks(true)
})
</script>

<template>
  <div class="ops-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">Ops Experience</p>
        <h1 class="page-title">运维经验库</h1>
        <p class="page-subtitle">沉淀部署、故障、优化与安全运维知识，供 Agent 诊断时检索参考，形成「沉淀 → 检索 → 应用 → 反馈」闭环。</p>
      </div>

      <div class="header-actions">
        <div class="connection-badge">
          <span class="dot"></span>
          {{ total }} 条经验
        </div>
        <button class="secondary-btn" :disabled="refreshing || loading" @click="loadPacks()">
          {{ refreshing || loading ? '刷新中...' : '刷新数据' }}
        </button>
      </div>
    </header>

    <section class="status-grid">
      <article class="status-card">
        <span class="status-label">经验包总数</span>
        <strong class="status-value">{{ total }}</strong>
        <span class="status-helper">当前筛选结果</span>
      </article>
      <article class="status-card success">
        <span class="status-label">启用</span>
        <strong class="status-value">{{ enabledCount }}</strong>
        <span class="status-helper">当前页统计</span>
      </article>
      <article class="status-card muted">
        <span class="status-label">停用</span>
        <strong class="status-value">{{ disabledCount }}</strong>
        <span class="status-helper">当前页统计</span>
      </article>
      <article class="status-card ai">
        <span class="status-label">AI 沉淀</span>
        <strong class="status-value">{{ aiCount }}</strong>
        <span class="status-helper">当前页统计</span>
      </article>
    </section>

    <section class="content-panel">
      <div class="toolbar-card">
        <div class="toolbar-intro">
          <h2>经验包列表</h2>
          <p>按质量分降序排列，低于 50 分的经验包会被降权（仍可见）。</p>
        </div>

        <div class="toolbar-controls">
          <label class="field">
            <span>搜索</span>
            <input v-model="q" type="text" placeholder="搜索标题 / 标签 / 正文" />
          </label>

          <label class="field">
            <span>分类</span>
            <select v-model="categoryFilter" @change="changeFilter">
              <option value="">全部</option>
              <option value="deployment">部署</option>
              <option value="fault">故障</option>
              <option value="optimization">优化</option>
              <option value="security">安全</option>
              <option value="negative">教训</option>
            </select>
          </label>

          <label class="field">
            <span>状态</span>
            <select v-model="statusFilter" @change="changeFilter">
              <option value="">全部</option>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>

          <div class="toolbar-buttons">
            <button class="secondary-btn" @click="openSummaryDialog">查看 Agent 记忆</button>
            <button class="secondary-btn" @click="openImportDialog">导入</button>
            <button class="primary-btn" @click="router.push('/ops-experience/new')">新建经验包</button>
          </div>
        </div>
      </div>

      <div v-if="loading" class="loading-panel">正在加载经验库...</div>
      <div v-else-if="!packs.length" class="empty-panel">暂无经验包。点击「新建经验包」沉淀第一条运维知识，或通过「导入」迁移已有经验。</div>
      <div v-else class="table-card">
        <table class="pack-table">
          <thead>
            <tr>
              <th>标题</th>
              <th>分类</th>
              <th>适用系统</th>
              <th>标签</th>
              <th>质量分</th>
              <th>来源</th>
              <th>版本</th>
              <th>统计</th>
              <th>状态</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pack in packs" :key="pack.id">
              <td class="title-cell">
                <button class="title-link" @click="router.push(`/ops-experience/${pack.id}`)">{{ pack.title }}</button>
              </td>
              <td>
                <span class="category-tag" :class="categoryClass(pack.category)">{{ categoryLabel(pack.category) }}</span>
              </td>
              <td>{{ pack.osType || '通用' }}</td>
              <td>
                <div v-if="pack.tags?.length" class="tag-row">
                  <span v-for="tag in pack.tags.slice(0, 3)" :key="tag" class="tag-chip">{{ tag }}</span>
                  <span v-if="pack.tags.length > 3" class="tag-chip more">+{{ pack.tags.length - 3 }}</span>
                </div>
                <span v-else class="muted-copy">--</span>
              </td>
              <td>
                <span class="quality-badge" :class="{ low: pack.qualityScore < 50 }" :title="QUALITY_FORMULA">{{ pack.qualityScore }}</span>
              </td>
              <td>
                <span class="source-badge" :class="pack.source">{{ sourceLabel(pack.source) }}</span>
              </td>
              <td class="mono">v{{ pack.version }}</td>
              <td>
                <span class="stat-copy" :title="QUALITY_FORMULA">
                  命中 {{ pack.hitCount }} · 有用 {{ pack.usefulCount }} · 无用 {{ pack.uselessCount }}
                </span>
              </td>
              <td>
                <button
                  class="switch-btn"
                  :class="{ on: pack.status === 'enabled' }"
                  :disabled="statusUpdatingId === pack.id"
                  :title="pack.status === 'enabled' ? '点击停用' : '点击启用'"
                  @click="toggleStatus(pack)"
                >
                  <span class="switch-knob"></span>
                </button>
              </td>
              <td>{{ formatDate(pack.updatedAt) }}</td>
              <td>
                <div class="action-row">
                  <button class="link-btn" @click="router.push(`/ops-experience/${pack.id}`)">详情</button>
                  <button class="mini-btn" @click="router.push(`/ops-experience/${pack.id}/edit`)">编辑</button>
                  <button class="mini-btn" :disabled="exportingId === pack.id" @click="exportPack(pack)">
                    {{ exportingId === pack.id ? '导出中' : '导出' }}
                  </button>
                  <button class="mini-btn danger" @click="openDeleteDialog(pack)">删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pager">
        <span>共 {{ total }} 条</span>
        <div class="pager-buttons">
          <button class="mini-btn" :disabled="page <= 1 || loading || refreshing" @click="loadPage(page - 1)">上一页</button>
          <span>{{ page }} / {{ totalPages }}</span>
          <button class="mini-btn" :disabled="page >= totalPages || loading || refreshing" @click="loadPage(page + 1)">下一页</button>
        </div>
      </div>
    </section>

    <!-- 导入 -->
    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="importDialog.visible" class="dialog-overlay" @click.self="closeImportDialog">
          <div class="dialog-card">
            <div class="dialog-head">
              <h3>导入经验包</h3>
              <p>上传由本系统导出或按规范制作的 zip 包（manifest.json + deployment.md + attachments/）。后端会校验 schemaVersion、附件 sha256 完整性与文件大小。</p>
            </div>
            <div class="dialog-body">
              <label class="file-drop">
                <input type="file" accept=".zip,application/zip" @change="onImportFileChange" />
                <span v-if="importDialog.file" class="file-name">{{ importDialog.file.name }}</span>
                <span v-else class="file-placeholder">点击选择 .zip 文件</span>
              </label>
              <p class="file-hint">单个附件大小上限 50MB；文件名不允许包含路径分隔符。</p>
            </div>
            <div class="dialog-actions">
              <button class="secondary-btn" :disabled="importDialog.importing" @click="closeImportDialog">取消</button>
              <button class="primary-btn" :disabled="importDialog.importing || !importDialog.file" @click="confirmImport">
                {{ importDialog.importing ? '导入中...' : '导入' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 知识摘要 -->
    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="summaryDialog.visible" class="dialog-overlay" @click.self="closeSummaryDialog">
          <div class="dialog-card summary-card">
            <div class="dialog-head">
              <h3>Agent 组织记忆</h3>
              <p>这是当前注入 Agent system 消息的经验摘要，管理员可借此了解 Agent 检索时能看到什么。</p>
            </div>
            <div class="dialog-body">
              <div v-if="summaryDialog.loading" class="loading-panel inner">正在加载知识摘要...</div>
              <div v-else-if="!summaryDialog.text" class="empty-panel inner">经验库为空，Agent 暂无组织记忆。</div>
              <pre v-else class="summary-text">{{ summaryDialog.text }}</pre>
            </div>
            <div class="dialog-actions">
              <button class="secondary-btn" @click="closeSummaryDialog">关闭</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 删除确认 -->
    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="deleteDialog.visible" class="dialog-overlay" @click.self="closeDeleteDialog">
          <div class="dialog-card">
            <div class="dialog-head">
              <h3>删除经验包</h3>
              <p>确认删除「{{ deleteDialog.pack?.title }}」？<strong class="danger-text">将同时删除附件文件与附件记录，不可恢复。</strong></p>
            </div>
            <div class="dialog-actions">
              <button class="secondary-btn" :disabled="deleteDialog.deleting" @click="closeDeleteDialog">取消</button>
              <button class="danger-btn" :disabled="deleteDialog.deleting" @click="confirmDelete">
                {{ deleteDialog.deleting ? '删除中...' : '删除' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.ops-page {
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
  color: var(--color-text);
}

.page-subtitle {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  max-width: 680px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.connection-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.status-card {
  min-height: 116px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
}

.status-card.success .status-value,
.status-card.success .status-label {
  color: var(--color-success);
}

.status-card.muted .status-value,
.status-card.muted .status-label {
  color: var(--color-text-muted);
}

.status-card.ai .status-value,
.status-card.ai .status-label {
  color: var(--color-info);
}

.status-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.status-value {
  font-size: 28px;
  line-height: 1.1;
  font-weight: 800;
  color: var(--color-text);
}

.status-helper {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.content-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar-card,
.table-card {
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
}

.toolbar-card {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.toolbar-intro h2 {
  font-size: 20px;
  font-weight: 800;
  color: var(--color-text);
}

.toolbar-intro p {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.toolbar-controls {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 160px 140px auto;
  align-items: end;
  gap: 12px;
}

.toolbar-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field span {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.field input,
.field select {
  width: 100%;
  min-height: 44px;
  border-radius: 14px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0 14px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.field input:focus,
.field select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.table-card {
  overflow: auto;
}

.pack-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 1180px;
}

.pack-table th,
.pack-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-divider);
  text-align: left;
  vertical-align: middle;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.pack-table th {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: var(--color-bg-inset);
}

.pack-table tr:last-child td {
  border-bottom: none;
}

.title-cell {
  max-width: 360px;
}

.title-link {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--color-text);
  font-size: 14px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  line-height: 1.5;
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  transition: color 0.18s ease;
}

.title-link:hover {
  color: var(--color-primary);
}

.category-tag {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.category-tag.deploy {
  color: var(--color-info);
  background: var(--color-info-bg);
}

.category-tag.danger {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.category-tag.success {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.category-tag.warning {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.category-tag.muted {
  color: var(--color-text-muted);
  background: var(--color-bg-inset);
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 220px;
}

.tag-chip {
  padding: 3px 8px;
  border-radius: 8px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.tag-chip.more {
  color: var(--color-text-muted);
}

.quality-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  min-height: 26px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  color: var(--color-primary);
  background: var(--color-primary-ghost);
  cursor: help;
}

.quality-badge.low {
  color: var(--color-text-muted);
  background: var(--color-bg-inset);
}

.source-badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.source-badge.ai {
  color: var(--color-info);
  background: var(--color-info-bg);
}

.source-badge.human {
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.mono {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  color: var(--color-text);
}

.stat-copy {
  font-size: 12px;
  color: var(--color-text-secondary);
  cursor: help;
  white-space: nowrap;
}

.switch-btn {
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border-solid);
  position: relative;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: background 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
}

.switch-btn .switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-text-muted);
  transition: transform 0.18s ease, background 0.18s ease;
}

.switch-btn.on {
  background: var(--color-primary-ghost);
  border-color: var(--color-primary);
}

.switch-btn.on .switch-knob {
  transform: translateX(16px);
  background: var(--color-primary);
}

.switch-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.pager-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
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
  transition: all 0.18s ease;
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

.mini-btn {
  border: 1px solid var(--color-border-solid);
  border-radius: 10px;
  padding: 8px 12px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, opacity 0.18s ease;
}

.mini-btn.danger {
  color: var(--color-danger);
  background: var(--color-danger-bg);
  border-color: rgba(239, 68, 68, 0.18);
}

.mini-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.primary-btn:disabled,
.secondary-btn:disabled,
.danger-btn:disabled,
.mini-btn:disabled,
.link-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.link-btn {
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-weight: 800;
  cursor: pointer;
  padding: 0;
}

.loading-panel,
.empty-panel {
  padding: 28px;
  border: 1px solid var(--color-border);
  border-radius: 18px;
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  text-align: center;
}

.loading-panel.inner,
.empty-panel.inner {
  padding: 18px;
  border-radius: 14px;
}

.muted-copy {
  font-size: 12px;
  color: var(--color-text-muted);
}

.danger-text {
  color: var(--color-danger);
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
  max-height: min(860px, calc(100vh - 48px));
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.dialog-card.summary-card {
  width: min(720px, 100%);
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

.dialog-body {
  padding: 0 22px 18px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dialog-actions {
  padding: 18px 22px 22px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid var(--color-divider);
}

.file-drop {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 88px;
  padding: 16px;
  border: 1px dashed var(--color-border-solid);
  border-radius: 16px;
  background: var(--color-bg-inset);
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease;
  text-align: center;
}

.file-drop:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.file-drop input {
  display: none;
}

.file-name {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 700;
  word-break: break-all;
}

.file-placeholder {
  color: var(--color-text-muted);
  font-size: 13px;
}

.file-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.summary-text {
  margin: 0;
  padding: 14px;
  max-height: 460px;
  overflow: auto;
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-inset);
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.8;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12.5px;
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

@media (max-width: 1280px) {
  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .toolbar-controls {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .ops-page {
    padding: 16px;
  }

  .page-header {
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    align-items: stretch;
    justify-content: stretch;
  }

  .status-grid,
  .toolbar-controls {
    grid-template-columns: 1fr;
  }

  .toolbar-buttons {
    justify-content: stretch;
  }

  .toolbar-buttons .primary-btn,
  .toolbar-buttons .secondary-btn {
    flex: 1;
  }
}
</style>
