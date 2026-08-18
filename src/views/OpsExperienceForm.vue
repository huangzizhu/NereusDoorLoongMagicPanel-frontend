<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import * as opsApi from '../api/opsExperience'
import { useNotification } from '../composables/useNotification'
import type {
  AttachmentFileType,
  EarlyWarningCondition,
  EarlyWarningSeverity,
  OpsAttachment,
  OpsCategory,
  OpsRiskLevel,
  OpsStatus,
} from '../types/opsExperience'

const route = useRoute()
const router = useRouter()
const notify = useNotification()

const isEdit = computed(() => Boolean(route.params.id))
const packId = computed(() => Number(route.params.id))

interface FormStage {
  name: string
  goal: string
  stepsText: string
  verify: string
  pitfallsRef: string[]
}

interface FormPitfall {
  phenomenon: string
  cause: string
  solution: string
  stageRef: string
}

interface FormEarlyWarning {
  metric: string
  condition: EarlyWarningCondition
  threshold: number
  severity: EarlyWarningSeverity
  hint: string
}

const form = reactive({
  title: '',
  category: 'deployment' as OpsCategory,
  riskLevel: 'medium' as OpsRiskLevel,
  osType: '通用',
  status: 'enabled' as OpsStatus,
  deploymentDoc: '',
  tags: [] as string[],
  tagInput: '',
  stages: [] as FormStage[],
  pitfalls: [] as FormPitfall[],
  earlyWarnings: [] as FormEarlyWarning[],
})

const saving = ref(false)
const loading = ref(false)
const attachments = ref<OpsAttachment[]>([])

const attachmentForm = reactive({
  file: null as File | null,
  fileType: 'doc' as AttachmentFileType,
  arch: '通用' as 'x86_64' | 'loongarch64' | '通用',
  osType: '通用',
  uploading: false,
})

const pitfallOptions = computed(() => form.pitfalls.map((p) => p.phenomenon).filter(Boolean))
const stageOptions = computed(() => form.stages.map((s) => s.name).filter(Boolean))

const CATEGORY_LABELS: Record<OpsCategory, string> = {
  deployment: '部署',
  fault: '故障',
  optimization: '优化',
  security: '安全',
  negative: '教训',
}

const FILE_TYPE_LABELS: Record<AttachmentFileType, string> = {
  script: '脚本',
  binary: '二进制',
  doc: '文档',
  archive: '压缩包',
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

/* ---------- 加载（编辑模式） ---------- */
async function loadPack() {
  loading.value = true
  try {
    const res = await opsApi.getOpsPack(packId.value)
    if (res.data.code !== 1) {
      notify.warning('经验包加载失败', res.data.msg)
      router.replace('/ops-experience')
      return
    }
    const pack = res.data.data
    form.title = pack.title
    form.category = pack.category
    form.riskLevel = pack.riskLevel
    form.osType = pack.osType || '通用'
    form.status = pack.status
    form.deploymentDoc = pack.deploymentDoc
    form.tags = [...(pack.tags || [])]
    form.stages = (pack.stages || []).map((stage) => ({
      name: stage.name,
      goal: stage.goal,
      stepsText: (stage.steps || []).join('\n'),
      verify: stage.verify,
      pitfallsRef: [...(stage.pitfallsRef || [])],
    }))
    form.pitfalls = (pack.pitfalls || []).map((pitfall) => ({
      phenomenon: pitfall.phenomenon,
      cause: pitfall.cause,
      solution: pitfall.solution,
      stageRef: pitfall.stageRef || '',
    }))
    form.earlyWarnings = (pack.earlyWarnings || []).map((warning) => ({
      metric: warning.metric,
      condition: warning.condition,
      threshold: warning.threshold,
      severity: warning.severity,
      hint: warning.hint,
    }))
    attachments.value = pack.attachments || []
  } catch (error) {
    notify.error('经验包加载失败', normalizeError(error, '请稍后重试'))
    router.replace('/ops-experience')
  } finally {
    loading.value = false
  }
}

/* ---------- 标签 ---------- */
function addTag() {
  const tag = form.tagInput.trim()
  if (!tag) return
  if (form.tags.includes(tag)) {
    form.tagInput = ''
    return
  }
  form.tags.push(tag)
  form.tagInput = ''
}

function removeTag(tag: string) {
  form.tags = form.tags.filter((item) => item !== tag)
}

/* ---------- 动态编辑器 ---------- */
function addStage() {
  form.stages.push({ name: '', goal: '', stepsText: '', verify: '', pitfallsRef: [] })
}

function removeStage(index: number) {
  form.stages.splice(index, 1)
}

function addPitfall() {
  form.pitfalls.push({ phenomenon: '', cause: '', solution: '', stageRef: '' })
}

function removePitfall(index: number) {
  form.pitfalls.splice(index, 1)
}

function addEarlyWarning() {
  form.earlyWarnings.push({ metric: '', condition: '<', threshold: 0, severity: 'warning', hint: '' })
}

function removeEarlyWarning(index: number) {
  form.earlyWarnings.splice(index, 1)
}

/* ---------- 保存 ---------- */
function splitSteps(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function validate(): string | null {
  if (!form.title.trim()) return '请输入标题'
  if (!form.deploymentDoc.trim()) return '请输入 Markdown 正文'
  return null
}

function buildPayload() {
  return {
    title: form.title.trim(),
    category: form.category,
    riskLevel: form.riskLevel,
    osType: form.osType.trim() || '通用',
    status: form.status,
    deploymentDoc: form.deploymentDoc,
    tags: form.tags,
    stages: form.stages.map((stage) => ({
      name: stage.name.trim(),
      goal: stage.goal.trim(),
      steps: splitSteps(stage.stepsText),
      verify: stage.verify.trim(),
      pitfallsRef: stage.pitfallsRef,
    })),
    pitfalls: form.pitfalls.map((pitfall) => ({
      phenomenon: pitfall.phenomenon.trim(),
      cause: pitfall.cause.trim(),
      solution: pitfall.solution.trim(),
      stageRef: pitfall.stageRef.trim() || null,
    })),
    earlyWarnings: form.earlyWarnings.map((warning) => ({
      metric: warning.metric.trim(),
      condition: warning.condition,
      threshold: Number(warning.threshold),
      severity: warning.severity,
      hint: warning.hint.trim(),
    })),
  }
}

async function save() {
  const validationError = validate()
  if (validationError) {
    notify.warning('表单校验失败', validationError)
    return
  }

  saving.value = true
  try {
    const payload = buildPayload()
    if (isEdit.value) {
      const res = await opsApi.updateOpsPack(packId.value, payload)
      if (res.data.code !== 1) {
        notify.warning('保存失败', res.data.msg)
        return
      }
      notify.info('经验包已保存', `已生成新版本 v${res.data.data.version}`)
      router.replace({ path: `/ops-experience/${packId.value}/edit` }).catch(() => {})
      window.scrollTo({ top: 0 })
    } else {
      const res = await opsApi.createOpsPack(payload)
      if (res.data.code !== 1) {
        notify.warning('创建失败', res.data.msg)
        return
      }
      notify.info('经验包已创建', `v${res.data.data.version} · 来源为人工录入，可继续上传附件`)
      router.replace({ path: `/ops-experience/${res.data.data.id}/edit` }).catch(() => {})
    }
  } catch (error) {
    notify.error(isEdit.value ? '保存失败' : '创建失败', normalizeError(error, '请稍后重试'))
  } finally {
    saving.value = false
  }
}

/* ---------- 附件上传 ---------- */
function onAttachmentFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  attachmentForm.file = input.files?.[0] || null
  input.value = ''
}

async function uploadAttachment() {
  if (!attachmentForm.file) {
    notify.warning('上传失败', '请先选择附件文件')
    return
  }
  if (attachmentForm.file.size > 50 * 1024 * 1024) {
    notify.warning('上传失败', '单个附件不能超过 50MB')
    return
  }
  attachmentForm.uploading = true
  try {
    const res = await opsApi.uploadOpsAttachment(packId.value, attachmentForm.file, {
      fileType: attachmentForm.fileType,
      arch: attachmentForm.arch,
      osType: attachmentForm.osType,
    })
    if (res.data.code !== 1) {
      notify.warning('上传失败', res.data.msg)
      return
    }
    attachments.value.push(res.data.data)
    attachmentForm.file = null
    notify.info('附件已上传', res.data.data.filename)
  } catch (error) {
    notify.error('上传失败', normalizeError(error, '请稍后重试'))
  } finally {
    attachmentForm.uploading = false
  }
}

onMounted(() => {
  if (isEdit.value) {
    loadPack()
  }
})

// 创建成功后跳转 /ops-experience/:id/edit 时组件实例被复用（同一组件），
// onMounted 不会重跑，这里监听 id 变化重新加载服务端数据（附件清单、规范化字段）。
watch(
  () => route.params.id,
  (newId) => {
    if (newId) {
      loadPack()
    }
  },
)
</script>

<template>
  <div class="ops-form-page">
    <div v-if="loading" class="loading-panel">正在加载经验包...</div>
    <template v-else>
      <header class="page-header">
        <div>
          <button class="back-btn" @click="router.push(isEdit ? `/ops-experience/${packId}` : '/ops-experience')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {{ isEdit ? '返回详情' : '返回经验库' }}
          </button>
          <p class="eyebrow">{{ isEdit ? 'Edit Pack' : 'New Pack' }}</p>
          <h1 class="page-title">{{ isEdit ? '编辑经验包' : '新建经验包' }}</h1>
          <p class="page-subtitle">
            {{ isEdit ? '保存后 version 自动 +1，更新只提交变更字段。' : '人工录入运维经验，保存后 source 固定为人工录入，version 从 1 开始。' }}
          </p>
        </div>

        <div class="header-actions">
          <button class="secondary-btn" :disabled="saving" @click="router.push(isEdit ? `/ops-experience/${packId}` : '/ops-experience')">取消</button>
          <button class="primary-btn" :disabled="saving" @click="save">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </header>

      <div class="form-layout">
        <div class="form-main">
          <section class="panel-card">
            <div class="panel-head">
              <div>
                <h2>基本信息</h2>
                <p>标题与正文为必填项，其余字段有默认值。</p>
              </div>
            </div>
            <div class="field-grid">
              <label class="field wide">
                <span>标题 <em>*</em></span>
                <input v-model="form.title" maxlength="120" type="text" placeholder="一句话描述，如：Nginx SSL 证书过期导致 502" />
              </label>

              <label class="field">
                <span>分类</span>
                <select v-model="form.category">
                  <option v-for="(label, value) in CATEGORY_LABELS" :key="value" :value="value">{{ label }}</option>
                </select>
              </label>

              <label class="field">
                <span>风险等级</span>
                <select v-model="form.riskLevel">
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </label>

              <label class="field">
                <span>适用系统</span>
                <input v-model="form.osType" type="text" placeholder="麒麟 / LoongArch / 通用" />
              </label>

              <div class="field">
                <span>状态</span>
                <label v-if="isEdit" class="status-switch">
                  <input v-model="form.status" type="checkbox" true-value="enabled" false-value="disabled" />
                  <span class="toggle-control"></span>
                  <span class="toggle-copy">{{ form.status === 'enabled' ? '启用（可被 Agent 检索）' : '停用（不参与检索排序）' }}</span>
                </label>
                <p v-else class="status-fixed">创建后默认启用</p>
              </div>

              <label class="field wide">
                <span>标签</span>
                <div class="tag-editor">
                  <div v-if="form.tags.length" class="tag-list">
                    <span v-for="tag in form.tags" :key="tag" class="tag-chip">
                      {{ tag }}
                      <button type="button" class="tag-remove" @click="removeTag(tag)">×</button>
                    </span>
                  </div>
                  <input
                    v-model="form.tagInput"
                    type="text"
                    placeholder="输入后按回车添加标签"
                    @keydown.enter.prevent="addTag"
                    @blur="addTag"
                  />
                </div>
              </label>
            </div>
          </section>

          <section class="panel-card">
            <div class="panel-head">
              <div>
                <h2>操作文档</h2>
                <p>Markdown 正文，首行将作为列表摘要（截断约 60 字）。</p>
              </div>
            </div>
            <label class="field doc-field">
              <textarea v-model="form.deploymentDoc" rows="16" placeholder="# 标题&#10;&#10;## 背景&#10;...&#10;&#10;## 操作步骤&#10;1. ...&#10;2. ..."></textarea>
            </label>
          </section>

          <!-- 阶段 -->
          <section class="panel-card">
            <div class="panel-head">
              <div>
                <h2>阶段</h2>
                <p>按顺序执行的处置步骤；步骤每行一步。</p>
              </div>
              <button class="mini-btn primary" @click="addStage">添加阶段</button>
            </div>
            <div v-if="!form.stages.length" class="empty-panel inner">暂无阶段。</div>
            <div v-else class="editor-list">
              <article v-for="(stage, index) in form.stages" :key="index" class="editor-card">
                <div class="editor-head">
                  <strong>阶段 {{ index + 1 }}</strong>
                  <button class="mini-btn danger" @click="removeStage(index)">删除</button>
                </div>
                <div class="field-grid">
                  <label class="field">
                    <span>名称</span>
                    <input v-model="stage.name" type="text" placeholder="如：诊断" />
                  </label>
                  <label class="field">
                    <span>目标</span>
                    <input v-model="stage.goal" type="text" placeholder="如：定位根因" />
                  </label>
                  <label class="field">
                    <span>步骤（每行一步）</span>
                    <textarea v-model="stage.stepsText" rows="4" placeholder="curl -I https://example.com&#10;openssl x509 -enddate -noout -in cert.pem"></textarea>
                  </label>
                  <label class="field">
                    <span>验证方式</span>
                    <input v-model="stage.verify" type="text" placeholder="如：确认证书过期" />
                  </label>
                  <div class="field">
                    <span>关联坑</span>
                    <div v-if="pitfallOptions.length" class="ref-picker">
                      <label v-for="pitfall in pitfallOptions" :key="pitfall" class="ref-option">
                        <input v-model="stage.pitfallsRef" type="checkbox" :value="pitfall" />
                        <span>{{ pitfall }}</span>
                      </label>
                    </div>
                    <p v-else class="field-hint">先在「坑」中录入现象，才能在此关联。</p>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <!-- 坑 -->
          <section class="panel-card">
            <div class="panel-head">
              <div>
                <h2>坑</h2>
                <p>常见问题：现象、原因与解决方案。</p>
              </div>
              <button class="mini-btn primary" @click="addPitfall">添加坑</button>
            </div>
            <div v-if="!form.pitfalls.length" class="empty-panel inner">暂无坑。</div>
            <div v-else class="editor-list">
              <article v-for="(pitfall, index) in form.pitfalls" :key="index" class="editor-card">
                <div class="editor-head">
                  <strong>坑 {{ index + 1 }}</strong>
                  <button class="mini-btn danger" @click="removePitfall(index)">删除</button>
                </div>
                <div class="field-grid">
                  <label class="field">
                    <span>现象</span>
                    <input v-model="pitfall.phenomenon" type="text" placeholder="如：502" />
                  </label>
                  <label class="field">
                    <span>原因</span>
                    <input v-model="pitfall.cause" type="text" placeholder="如：证书过期" />
                  </label>
                  <label class="field">
                    <span>解决方案</span>
                    <input v-model="pitfall.solution" type="text" placeholder="如：续期" />
                  </label>
                  <label class="field">
                    <span>关联阶段</span>
                    <select v-model="pitfall.stageRef">
                      <option value="">不关联（跨阶段）</option>
                      <option v-for="stage in stageOptions" :key="stage" :value="stage">{{ stage }}</option>
                    </select>
                  </label>
                </div>
              </article>
            </div>
          </section>

          <!-- 预警特征 -->
          <section class="panel-card">
            <div class="panel-head">
              <div>
                <h2>预警特征</h2>
                <p>指标满足条件时提醒 Agent 提前介入。</p>
              </div>
              <button class="mini-btn primary" @click="addEarlyWarning">添加预警</button>
            </div>
            <div v-if="!form.earlyWarnings.length" class="empty-panel inner">暂无预警特征。</div>
            <div v-else class="editor-list">
              <article v-for="(warning, index) in form.earlyWarnings" :key="index" class="editor-card">
                <div class="editor-head">
                  <strong>预警 {{ index + 1 }}</strong>
                  <button class="mini-btn danger" @click="removeEarlyWarning(index)">删除</button>
                </div>
                <div class="field-grid warning-grid">
                  <label class="field">
                    <span>指标</span>
                    <input v-model="warning.metric" type="text" placeholder="如：cpu_usage / disk_usage / cert_expiry_days" />
                  </label>
                  <label class="field">
                    <span>比较符</span>
                    <select v-model="warning.condition">
                      <option value="<">&lt;</option>
                      <option value="<=">&lt;=</option>
                      <option value=">">&gt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="==">==</option>
                    </select>
                  </label>
                  <label class="field">
                    <span>阈值</span>
                    <input v-model.number="warning.threshold" type="number" step="any" />
                  </label>
                  <label class="field">
                    <span>严重级别</span>
                    <select v-model="warning.severity">
                      <option value="info">info（提示）</option>
                      <option value="warning">warning（警告）</option>
                      <option value="critical">critical（严重）</option>
                    </select>
                  </label>
                  <label class="field wide">
                    <span>提示</span>
                    <input v-model="warning.hint" type="text" placeholder="给 Agent 的上下文提示，如：提前续期" />
                  </label>
                </div>
              </article>
            </div>
          </section>
        </div>

        <aside class="form-side">
          <section class="panel-card side-card">
            <div class="side-title">
              <h3>{{ isEdit ? '附件（' + attachments.length + '）' : '附件' }}</h3>
            </div>
            <p v-if="!isEdit" class="side-note">保存后可上传附件（脚本 / 文档 / 压缩包等）。</p>
            <p v-else class="side-note">一期为只读参考，不支持删除附件；同名不同内容会上传失败，请换名。</p>

            <template v-if="isEdit">
              <div class="upload-box">
                <label class="upload-file">
                  <input type="file" @change="onAttachmentFileChange" />
                  <span v-if="attachmentForm.file" class="file-name">{{ attachmentForm.file.name }}（{{ formatSize(attachmentForm.file.size) }}）</span>
                  <span v-else class="file-placeholder">选择附件文件</span>
                </label>
                <div class="upload-meta-grid">
                  <label class="field">
                    <span>类型</span>
                    <select v-model="attachmentForm.fileType">
                      <option value="script">脚本</option>
                      <option value="binary">二进制</option>
                      <option value="doc">文档</option>
                      <option value="archive">压缩包</option>
                    </select>
                  </label>
                  <label class="field">
                    <span>架构</span>
                    <select v-model="attachmentForm.arch">
                      <option value="通用">通用</option>
                      <option value="x86_64">x86_64</option>
                      <option value="loongarch64">loongarch64</option>
                    </select>
                  </label>
                  <label class="field">
                    <span>适用系统</span>
                    <input v-model="attachmentForm.osType" type="text" placeholder="通用" />
                  </label>
                </div>
                <button class="primary-btn upload-btn" :disabled="attachmentForm.uploading || !attachmentForm.file" @click="uploadAttachment">
                  {{ attachmentForm.uploading ? '上传中...' : '上传附件' }}
                </button>
              </div>

              <ul v-if="attachments.length" class="attachment-list">
                <li v-for="attachment in attachments" :key="attachment.id" class="attachment-item">
                  <span class="file-type-icon" :class="attachment.fileType">{{ FILE_TYPE_LABELS[attachment.fileType] }}</span>
                  <div class="attachment-meta">
                    <strong>{{ attachment.filename }}</strong>
                    <small>{{ formatSize(attachment.size) }} · {{ attachment.arch || '通用' }} · {{ attachment.osType || '通用' }}</small>
                  </div>
                </li>
              </ul>
              <p v-else class="field-hint">暂无附件。</p>
            </template>
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ops-form-page {
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

.eyebrow {
  margin-top: 10px;
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
  flex-shrink: 0;
}

.form-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}

.form-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.form-side {
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

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
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

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.field-grid .wide {
  grid-column: 1 / -1;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.field > span {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.field > span em {
  color: var(--color-danger);
  font-style: normal;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  border-radius: 14px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0 14px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.field input,
.field select {
  min-height: 44px;
}

.field textarea {
  padding: 12px 14px;
  resize: vertical;
  line-height: 1.7;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.doc-field textarea {
  min-height: 320px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 13px;
}

.field-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.6;
  padding-top: 4px;
}

/* ---------- 状态开关 ---------- */
.status-switch {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--color-border-solid);
  border-radius: 14px;
  background: var(--color-bg);
  cursor: pointer;
}

.status-switch input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.toggle-control {
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border-solid);
  position: relative;
  flex-shrink: 0;
  transition: background 0.18s ease, border-color 0.18s ease;
}

.toggle-control::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-text-muted);
  transition: transform 0.18s ease, background 0.18s ease;
}

.status-switch input:checked + .toggle-control {
  background: var(--color-primary-ghost);
  border-color: var(--color-primary);
}

.status-switch input:checked + .toggle-control::after {
  transform: translateX(16px);
  background: var(--color-primary);
}

.toggle-copy {
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.status-fixed {
  margin: 0;
  padding: 12px;
  border-radius: 14px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

/* ---------- 标签 ---------- */
.tag-editor {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 10px;
  border-radius: 14px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.tag-editor:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.tag-editor input {
  flex: 1;
  min-width: 120px;
  min-height: 28px;
  border: none;
  background: transparent;
  padding: 0 4px;
  outline: none;
  color: var(--color-text);
  font-size: 14px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 8px;
  background: var(--color-bg-inset);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.tag-remove {
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}

.tag-remove:hover {
  color: var(--color-danger);
}

/* ---------- 编辑器列表 ---------- */
.editor-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.editor-card {
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-inset);
}

.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.editor-head strong {
  color: var(--color-text);
  font-size: 14px;
  font-weight: 800;
}

.warning-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.warning-grid .wide {
  grid-column: 1 / -1;
}

/* ---------- 关联坑选择 ---------- */
.ref-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-surface);
  min-height: 44px;
}

.ref-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  cursor: pointer;
  transition: all 0.18s ease;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.ref-option:has(input:checked) {
  border-color: var(--color-primary);
  background: var(--color-primary-ghost);
  color: var(--color-primary);
}

.ref-option input {
  accent-color: var(--color-primary);
}

/* ---------- 附件 ---------- */
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

.upload-box {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.upload-file {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 64px;
  padding: 12px;
  border: 1px dashed var(--color-border-solid);
  border-radius: 14px;
  background: var(--color-bg-inset);
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease;
  text-align: center;
}

.upload-file:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
}

.upload-file input {
  display: none;
}

.file-name {
  color: var(--color-text);
  font-size: 12.5px;
  font-weight: 700;
  word-break: break-all;
  line-height: 1.5;
}

.file-placeholder {
  color: var(--color-text-muted);
  font-size: 13px;
}

.upload-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.upload-meta-grid .field {
  gap: 6px;
}

.upload-meta-grid .field input,
.upload-meta-grid .field select {
  min-height: 40px;
  font-size: 13px;
}

.upload-btn {
  width: 100%;
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
}

.primary-btn,
.secondary-btn {
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

.primary-btn:disabled,
.secondary-btn:disabled,
.mini-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
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

.mini-btn.primary {
  color: var(--color-primary);
  background: var(--color-primary-ghost);
  border-color: rgba(59, 130, 246, 0.16);
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

@media (max-width: 1280px) {
  .form-layout {
    grid-template-columns: 1fr;
  }

  .form-side {
    position: static;
  }
}

@media (max-width: 768px) {
  .ops-form-page {
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

  .field-grid,
  .warning-grid {
    grid-template-columns: 1fr;
  }
}
</style>
