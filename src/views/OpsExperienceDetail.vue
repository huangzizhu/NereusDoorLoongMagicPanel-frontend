<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as opsApi from '../api/opsExperience'
import { useNotification } from '../composables/useNotification'
import { renderMarkdown } from '../utils/markdown'
import type {
  AttachmentFileType,
  EarlyWarningSeverity,
  OpsCategory,
  OpsExperiencePack,
  OpsRiskLevel,
} from '../types/opsExperience'

const route = useRoute()
const router = useRouter()
const notify = useNotification()

const packId = computed(() => Number(route.params.id))

const pack = ref<OpsExperiencePack | null>(null)
const loading = ref(false)
const feedbackGiven = ref<'useful' | 'useless' | null>(null)
const feedbackSubmitting = ref(false)
const exporting = ref(false)

const deleteDialog = reactive({
  visible: false,
  deleting: false,
})

const CATEGORY_LABELS: Record<OpsCategory, string> = {
  deployment: '部署',
  fault: '故障',
  optimization: '优化',
  security: '安全',
  negative: '教训',
}

const RISK_LABELS: Record<OpsRiskLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
}

const FILE_TYPE_LABELS: Record<AttachmentFileType, string> = {
  script: '脚本',
  binary: '二进制',
  doc: '文档',
  archive: '压缩包',
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

function riskLabel(risk: OpsRiskLevel): string {
  return RISK_LABELS[risk] || risk
}

function severityLabel(severity: EarlyWarningSeverity): string {
  const map: Record<EarlyWarningSeverity, string> = {
    info: '提示',
    warning: '警告',
    critical: '严重',
  }
  return map[severity] || severity
}

function sourceLabel(source: 'ai' | 'human'): string {
  return source === 'ai' ? 'AI 沉淀' : '人工录入'
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function normalizeError(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback
  return fallback
}

const renderedDoc = computed(() => renderMarkdown(pack.value?.deploymentDoc || ''))

async function loadPack() {
  loading.value = true
  try {
    const res = await opsApi.getOpsPack(packId.value)
    if (res.data.code !== 1) {
      notify.warning('经验包加载失败', res.data.msg)
      router.replace('/ops-experience')
      return
    }
    pack.value = res.data.data
  } catch (error) {
    notify.error('经验包加载失败', normalizeError(error, '请稍后重试'))
    router.replace('/ops-experience')
  } finally {
    loading.value = false
  }
}

/* ---------- 反馈（有用 / 无用，本地防重复） ---------- */
async function sendFeedback(action: 'useful' | 'useless') {
  if (!pack.value || feedbackGiven.value || feedbackSubmitting.value) return
  feedbackSubmitting.value = true
  try {
    const res = await opsApi.feedbackOpsPack(pack.value.id, action)
    if (res.data.code !== 1) {
      notify.warning('反馈提交失败', res.data.msg)
      return
    }
    pack.value = res.data.data
    feedbackGiven.value = action
    notify.info(action === 'useful' ? '已标记为有用' : '已标记为无用', '感谢反馈，质量分会自动更新')
  } catch (error) {
    notify.error('反馈提交失败', normalizeError(error, '请稍后重试'))
  } finally {
    feedbackSubmitting.value = false
  }
}

/* ---------- 导出 ---------- */
async function exportPack() {
  if (!pack.value) return
  exporting.value = true
  try {
    const res = await opsApi.exportOpsPack(pack.value.id)
    opsApi.downloadBlob(res.data, `ops-experience-pack-${pack.value.id}.zip`)
    notify.info('导出成功', 'zip 包已开始下载')
  } catch (error) {
    notify.error('导出失败', normalizeError(error, '请稍后重试'))
  } finally {
    exporting.value = false
  }
}

/* ---------- 删除 ---------- */
function openDeleteDialog() {
  deleteDialog.visible = true
}

function closeDeleteDialog() {
  if (deleteDialog.deleting) return
  deleteDialog.visible = false
}

async function confirmDelete() {
  if (!pack.value) return
  deleteDialog.deleting = true
  try {
    const res = await opsApi.deleteOpsPack(pack.value.id)
    if (res.data.code !== 1) {
      notify.warning('删除失败', res.data.msg)
      return
    }
    notify.info('经验包已删除', '附件文件已一并删除')
    deleteDialog.visible = false
    router.replace('/ops-experience')
  } catch (error) {
    notify.error('删除失败', normalizeError(error, '请稍后重试'))
  } finally {
    deleteDialog.deleting = false
  }
}

/* ---------- 坑关联阶段跳转 ---------- */
function scrollToStage(stageName: string | null) {
  if (!stageName) return
  const index = pack.value?.stages?.findIndex((stage) => stage.name === stageName)
  if (index === undefined || index < 0) return
  document.getElementById(`stage-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

onMounted(loadPack)
</script>

<template>
  <div class="ops-detail-page">
    <div v-if="loading" class="loading-panel">正在加载经验包详情...</div>
    <template v-else-if="pack">
      <header class="page-header">
        <div class="header-main">
          <button class="back-btn" @click="router.push('/ops-experience')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            返回经验库
          </button>
          <h1 class="page-title">{{ pack.title }}</h1>
          <div class="badge-row">
            <span class="category-tag" :class="categoryClass(pack.category)">{{ categoryLabel(pack.category) }}</span>
            <span class="risk-badge" :class="pack.riskLevel">{{ riskLabel(pack.riskLevel) }}风险</span>
            <span class="status-badge" :class="pack.status">{{ pack.status === 'enabled' ? '启用' : '停用' }}</span>
            <span class="source-badge" :class="pack.source">{{ sourceLabel(pack.source) }}</span>
            <span class="version-chip">v{{ pack.version }}</span>
          </div>
        </div>

        <div class="header-actions">
          <button class="secondary-btn" :disabled="exporting" @click="exportPack">{{ exporting ? '导出中...' : '导出' }}</button>
          <button class="secondary-btn" @click="router.push(`/ops-experience/${pack.id}/edit`)">编辑</button>
          <button class="danger-btn" @click="openDeleteDialog">删除</button>
        </div>
      </header>

      <div class="detail-layout">
        <main class="detail-main">
          <section class="panel-card">
            <div class="panel-head">
              <div>
                <h2>操作文档</h2>
                <p>Markdown 正文，首行将作为列表摘要（截断约 60 字）。</p>
              </div>
            </div>
            <div class="markdown-body" v-html="renderedDoc"></div>
          </section>

          <section v-if="pack.stages?.length" class="panel-card">
            <div class="panel-head">
              <div>
                <h2>阶段</h2>
                <p>按顺序执行的处置步骤。</p>
              </div>
            </div>
            <div class="stage-list">
              <article v-for="(stage, index) in pack.stages" :id="`stage-${index}`" :key="`${stage.name}-${index}`" class="stage-card">
                <div class="stage-head">
                  <span class="stage-index">{{ index + 1 }}</span>
                  <div>
                    <h3>{{ stage.name }}</h3>
                    <p v-if="stage.goal">{{ stage.goal }}</p>
                  </div>
                </div>
                <div v-if="stage.steps?.length" class="stage-block">
                  <span class="block-label">执行步骤</span>
                  <ol class="steps-list">
                    <li v-for="(step, stepIndex) in stage.steps" :key="stepIndex"><code>{{ step }}</code></li>
                  </ol>
                </div>
                <div v-if="stage.verify" class="stage-block">
                  <span class="block-label">验证方式</span>
                  <p class="block-text">{{ stage.verify }}</p>
                </div>
                <div v-if="stage.pitfallsRef?.length" class="stage-block">
                  <span class="block-label">关联坑</span>
                  <div class="ref-chips">
                    <span v-for="ref in stage.pitfallsRef" :key="ref" class="ref-chip"># {{ ref }}</span>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section v-if="pack.pitfalls?.length" class="panel-card">
            <div class="panel-head">
              <div>
                <h2>坑</h2>
                <p>常见问题与解决方案。</p>
              </div>
            </div>
            <div class="pitfall-list">
              <article v-for="(pitfall, index) in pack.pitfalls" :key="`${pitfall.phenomenon}-${index}`" class="pitfall-card">
                <div class="pitfall-head">
                  <span class="pitfall-icon">!</span>
                  <h3>{{ pitfall.phenomenon }}</h3>
                </div>
                <div class="pitfall-grid">
                  <div class="pitfall-item">
                    <span>原因</span>
                    <p>{{ pitfall.cause || '--' }}</p>
                  </div>
                  <div class="pitfall-item">
                    <span>解决方案</span>
                    <p>{{ pitfall.solution || '--' }}</p>
                  </div>
                  <div v-if="pitfall.stageRef" class="pitfall-item ref">
                    <span>关联阶段</span>
                    <button class="link-btn" @click="scrollToStage(pitfall.stageRef)">{{ pitfall.stageRef }}</button>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section v-if="pack.earlyWarnings?.length" class="panel-card">
            <div class="panel-head">
              <div>
                <h2>预警特征</h2>
                <p>指标异常时提前触发提醒，帮助 Agent 在故障前介入。</p>
              </div>
            </div>
            <div class="warning-table-wrap">
              <table class="warning-table">
                <thead>
                  <tr>
                    <th>指标</th>
                    <th>条件</th>
                    <th>阈值</th>
                    <th>严重级别</th>
                    <th>提示</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(warning, index) in pack.earlyWarnings" :key="`${warning.metric}-${index}`">
                    <td class="mono">{{ warning.metric }}</td>
                    <td class="mono">{{ warning.condition }}</td>
                    <td class="mono">{{ warning.threshold }}</td>
                    <td>
                      <span class="severity-badge" :class="warning.severity">{{ severityLabel(warning.severity) }}</span>
                    </td>
                    <td>{{ warning.hint || '--' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <aside class="detail-side">
          <section class="panel-card side-card">
            <div class="side-title">
              <h3>质量与反馈</h3>
            </div>
            <div class="quality-row">
              <span class="quality-badge" :class="{ low: pack.qualityScore < 50 }" :title="'质量分 = 100 + 有用×5 - 无用×10 + 命中×1（低于 50 检索排序降权）'">
                {{ pack.qualityScore }}
              </span>
              <div class="quality-stats">
                <span>命中 {{ pack.hitCount }}</span>
                <span>有用 {{ pack.usefulCount }}</span>
                <span>无用 {{ pack.uselessCount }}</span>
              </div>
            </div>
            <div class="feedback-row">
              <button
                class="feedback-btn"
                :class="{ active: feedbackGiven === 'useful', disabled: Boolean(feedbackGiven) }"
                :disabled="feedbackSubmitting || Boolean(feedbackGiven)"
                @click="sendFeedback('useful')"
              >
                👍 有用（{{ pack.usefulCount }}）
              </button>
              <button
                class="feedback-btn useless"
                :class="{ active: feedbackGiven === 'useless', disabled: Boolean(feedbackGiven) }"
                :disabled="feedbackSubmitting || Boolean(feedbackGiven)"
                @click="sendFeedback('useless')"
              >
                👎 无用（{{ pack.uselessCount }}）
              </button>
            </div>
            <p class="feedback-hint">反馈会实时更新质量分；本地记录防止连点，刷新后重置。</p>
          </section>

          <section class="panel-card side-card">
            <div class="side-title">
              <h3>基本信息</h3>
            </div>
            <dl class="meta-list">
              <div><dt>适用系统</dt><dd>{{ pack.osType || '通用' }}</dd></div>
              <div><dt>标签</dt><dd>
                <span v-if="pack.tags?.length" class="meta-tags">
                  <span v-for="tag in pack.tags" :key="tag" class="tag-chip">{{ tag }}</span>
                </span>
                <span v-else>--</span>
              </dd></div>
              <div><dt>来源会话</dt><dd>{{ pack.sourceSessionId || '--' }}</dd></div>
              <div><dt>创建时间</dt><dd>{{ formatDate(pack.createdAt) }}</dd></div>
              <div><dt>更新时间</dt><dd>{{ formatDate(pack.updatedAt) }}</dd></div>
            </dl>
          </section>

          <section class="panel-card side-card">
            <div class="side-title">
              <h3>附件（{{ pack.attachments?.length || 0 }}）</h3>
            </div>
            <p class="side-note">一期为只读参考，不提供下载/执行入口；如需完整文件请使用「导出」下载整个包。</p>
            <div v-if="!pack.attachments?.length" class="empty-panel inner">暂无附件。</div>
            <ul v-else class="attachment-list">
              <li v-for="attachment in pack.attachments" :key="attachment.id" class="attachment-item">
                <span class="file-type-icon" :class="attachment.fileType">{{ FILE_TYPE_LABELS[attachment.fileType] }}</span>
                <div class="attachment-meta">
                  <strong>{{ attachment.filename }}</strong>
                  <small>{{ formatSize(attachment.size) }} · {{ attachment.arch || '通用' }} · {{ attachment.osType || '通用' }}</small>
                </div>
              </li>
            </ul>
          </section>
        </aside>
      </div>

      <Teleport to="body">
        <Transition name="dialog">
          <div v-if="deleteDialog.visible" class="dialog-overlay" @click.self="closeDeleteDialog">
            <div class="dialog-card">
              <div class="dialog-head">
                <h3>删除经验包</h3>
                <p>确认删除「{{ pack.title }}」？<strong class="danger-text">将同时删除附件文件与附件记录，不可恢复。</strong></p>
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
    </template>
  </div>
</template>

<style scoped>
.ops-detail-page {
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

.header-main {
  min-width: 0;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: transparent;
  padding: 0;
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: color 0.18s ease;
}

.back-btn:hover {
  color: var(--color-primary);
}

.page-title {
  margin-top: 10px;
  font-size: 26px;
  font-weight: 800;
  color: var(--color-text);
  line-height: 1.4;
  word-break: break-word;
}

.badge-row {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.category-tag,
.risk-badge,
.status-badge,
.source-badge,
.version-chip {
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

.risk-badge.low {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.risk-badge.medium {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.risk-badge.high {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.status-badge.enabled {
  color: var(--color-success);
  background: var(--color-success-bg);
}

.status-badge.disabled {
  color: var(--color-text-muted);
  background: var(--color-bg-inset);
}

.source-badge.ai {
  color: var(--color-info);
  background: var(--color-info-bg);
}

.source-badge.human {
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.version-chip {
  color: var(--color-text-secondary);
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex-shrink: 0;
}

.detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 16px;
  align-items: start;
}

.detail-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.detail-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: calc(var(--topbar-height) + 16px);
}

.panel-card {
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-sm);
  padding: 18px;
}

.panel-head h2 {
  font-size: 20px;
  font-weight: 800;
  color: var(--color-text);
}

.panel-head p {
  margin-top: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* ---------- Markdown 正文 ---------- */
.markdown-body {
  margin-top: 16px;
  line-height: 1.75;
  font-size: 14px;
  color: var(--color-text);
  word-break: break-word;
}

.markdown-body :deep(p) {
  margin: 0.6em 0;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 1em 0 0.5em;
  font-weight: 700;
  line-height: 1.4;
  color: var(--color-text);
}

.markdown-body :deep(h1) { font-size: 1.5em; }
.markdown-body :deep(h2) { font-size: 1.3em; }
.markdown-body :deep(h3) { font-size: 1.15em; }
.markdown-body :deep(h4) { font-size: 1.05em; }

.markdown-body :deep(strong) {
  font-weight: 700;
  color: var(--color-text);
}

.markdown-body :deep(a) {
  color: var(--color-primary);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s ease;
}

.markdown-body :deep(a:hover) {
  border-bottom-color: var(--color-primary);
}

.markdown-body :deep(code):not(pre code) {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  background: var(--color-bg-inset);
  color: var(--color-text);
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  word-break: break-word;
}

.markdown-body :deep(pre) {
  margin: 12px 0;
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.6;
}

.markdown-body :deep(pre code) {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  background: none;
  padding: 0;
  border: none;
  color: var(--color-text);
  tab-size: 2;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.6em;
}

.markdown-body :deep(li) {
  margin: 0.25em 0;
}

.markdown-body :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 14px;
  border-left: 3px solid var(--color-primary);
  background: var(--color-bg-hover);
  border-radius: 0 8px 8px 0;
  color: var(--color-text-secondary);
}

.markdown-body :deep(blockquote p) {
  margin: 0;
}

.markdown-body :deep(hr) {
  margin: 20px 0;
  border: none;
  border-top: 1px solid var(--color-border);
}

.markdown-body :deep(table) {
  margin: 12px 0;
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 9px 12px;
  border: 1px solid var(--color-border-solid);
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--color-bg-inset);
  color: var(--color-text);
  font-weight: 700;
}

.markdown-body :deep(td) {
  color: var(--color-text-secondary);
}

/* ---------- 阶段 ---------- */
.stage-list,
.pitfall-list {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stage-card,
.pitfall-card {
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  scroll-margin-top: calc(var(--topbar-height) + 24px);
}

.stage-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.stage-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 10px;
  flex-shrink: 0;
  background: var(--color-primary-ghost);
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 800;
}

.stage-head h3 {
  color: var(--color-text);
  font-size: 16px;
  font-weight: 800;
}

.stage-head p {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.stage-block {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
}

.block-label {
  display: block;
  font-size: 11px;
  font-weight: 800;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}

.steps-list {
  margin: 0;
  padding-left: 1.4em;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.steps-list li {
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.steps-list code {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 12.5px;
  background: var(--color-bg-surface);
  color: var(--color-text);
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  word-break: break-all;
}

.block-text {
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
  margin: 0;
}

.ref-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ref-chip {
  padding: 3px 8px;
  border-radius: 8px;
  background: var(--color-info-bg);
  color: var(--color-info);
  font-size: 11px;
  font-weight: 700;
}

/* ---------- 坑 ---------- */
.pitfall-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pitfall-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: 14px;
  font-weight: 900;
}

.pitfall-head h3 {
  color: var(--color-text);
  font-size: 15px;
  font-weight: 800;
}

.pitfall-grid {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.pitfall-item {
  padding: 12px;
  border-radius: 12px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
}

.pitfall-item span {
  display: block;
  font-size: 11px;
  font-weight: 800;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.pitfall-item p {
  margin: 6px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
  word-break: break-word;
}

.pitfall-item.ref .link-btn {
  margin-top: 6px;
}

/* ---------- 预警特征 ---------- */
.warning-table-wrap {
  margin-top: 16px;
  overflow: auto;
}

.warning-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 560px;
}

.warning-table th,
.warning-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-divider);
  text-align: left;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.warning-table th {
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: var(--color-bg-inset);
}

.warning-table tr:last-child td {
  border-bottom: none;
}

.mono {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  color: var(--color-text);
}

.severity-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.severity-badge.info {
  color: var(--color-info);
  background: var(--color-info-bg);
}

.severity-badge.warning {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.severity-badge.critical {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

/* ---------- 侧栏 ---------- */
.side-card {
  padding: 16px;
}

.side-title h3 {
  font-size: 15px;
  font-weight: 800;
  color: var(--color-text);
}

.side-note {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-muted);
}

.quality-row {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.quality-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 56px;
  min-height: 40px;
  padding: 6px 12px;
  border-radius: 14px;
  font-size: 18px;
  font-weight: 800;
  color: var(--color-primary);
  background: var(--color-primary-ghost);
  cursor: help;
}

.quality-badge.low {
  color: var(--color-text-muted);
  background: var(--color-bg-inset);
}

.quality-stats {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.feedback-row {
  margin-top: 14px;
  display: flex;
  gap: 10px;
}

.feedback-btn {
  flex: 1;
  min-height: 40px;
  border-radius: 12px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.feedback-btn:hover:not(:disabled) {
  border-color: var(--color-success);
  color: var(--color-success);
  background: var(--color-success-bg);
}

.feedback-btn.useless:hover:not(:disabled) {
  border-color: var(--color-danger);
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.feedback-btn.active {
  border-color: var(--color-success);
  color: var(--color-success);
  background: var(--color-success-bg);
}

.feedback-btn.useless.active {
  border-color: var(--color-danger);
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.feedback-btn:disabled {
  cursor: not-allowed;
}

.feedback-btn.disabled:not(.active) {
  opacity: 0.5;
}

.feedback-hint {
  margin-top: 10px;
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.6;
}

.meta-list {
  margin: 14px 0 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.meta-list > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-divider);
}

.meta-list > div:last-child {
  border-bottom: none;
}

.meta-list dt {
  font-size: 11px;
  font-weight: 800;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.meta-list dd {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
  word-break: break-all;
  line-height: 1.6;
}

.meta-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
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

.attachment-list {
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  min-width: 0;
}

.file-type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  height: 26px;
  padding: 0 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 800;
  flex-shrink: 0;
}

.file-type-icon.script {
  color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.file-type-icon.binary {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}

.file-type-icon.doc {
  color: var(--color-info);
  background: var(--color-info-bg);
}

.file-type-icon.archive {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.attachment-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.attachment-meta strong {
  color: var(--color-text);
  font-size: 13px;
  word-break: break-all;
  line-height: 1.5;
}

.attachment-meta small {
  color: var(--color-text-muted);
  font-size: 12px;
  white-space: nowrap;
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

.primary-btn:disabled,
.secondary-btn:disabled,
.danger-btn:disabled,
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
  font-size: 13px;
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

.empty-panel.inner {
  padding: 18px;
  border-radius: 14px;
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
  border-top: 1px solid var(--color-divider);
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
  .detail-layout {
    grid-template-columns: 1fr;
  }

  .detail-side {
    position: static;
  }
}

@media (max-width: 768px) {
  .ops-detail-page {
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

  .pitfall-grid {
    grid-template-columns: 1fr;
  }
}
</style>
