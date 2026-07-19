<script setup lang="ts">
import { reactive, ref } from 'vue'
import * as dockerApi from '../../api/docker'
import { useNotification } from '../../composables/useNotification'

const props = defineProps<{
  visible: boolean
  defaultImageName: string
}>()

const emit = defineEmits<{
  close: []
  created: [containerId: string, containerName: string]
}>()

const notify = useNotification()

const form = reactive({
  imageName: '',
  containerName: '',
  platform: '',
  restartPolicy: '',
})

const portEntries = reactive<{ hostPort: string; containerPort: string }[]>([])
const envEntries = reactive<{ key: string; value: string }[]>([])
const volumeEntries = reactive<{ hostPath: string; containerPath: string }[]>([])

const creating = ref(false)
const resultData = ref<{ containerId: string; containerName: string } | null>(null)

const restartOptions = [
  { label: '无', value: '' },
  { label: 'Always', value: 'always' },
  { label: 'Unless Stopped', value: 'unless-stopped' },
  { label: 'On Failure', value: 'on-failure' },
]

function resetForm() {
  form.imageName = props.defaultImageName
  form.containerName = ''
  form.platform = ''
  form.restartPolicy = ''
  portEntries.length = 0
  envEntries.length = 0
  volumeEntries.length = 0
  resultData.value = null
  creating.value = false
}

function addPort() {
  portEntries.push({ hostPort: '', containerPort: '' })
}

function removePort(index: number) {
  portEntries.splice(index, 1)
}

function addEnv() {
  envEntries.push({ key: '', value: '' })
}

function removeEnv(index: number) {
  envEntries.splice(index, 1)
}

function addVolume() {
  volumeEntries.push({ hostPath: '', containerPath: '' })
}

function removeVolume(index: number) {
  volumeEntries.splice(index, 1)
}

async function doCreate() {
  if (!form.imageName.trim()) {
    notify.warning('请输入镜像名称')
    return
  }
  if (!form.containerName.trim()) {
    notify.warning('请输入容器名称')
    return
  }

  creating.value = true

  // 构建 ports/volumes/envVars
  const ports: Record<string, string> = {}
  for (const p of portEntries) {
    if (p.hostPort && p.containerPort) {
      ports[p.hostPort] = p.containerPort
    }
  }

  const volumes: Record<string, string> = {}
  for (const v of volumeEntries) {
    if (v.hostPath && v.containerPath) {
      volumes[v.hostPath] = v.containerPath
    }
  }

  const envVars: Record<string, string> = {}
  for (const e of envEntries) {
    if (e.key) {
      envVars[e.key] = e.value
    }
  }

  try {
    const res = await dockerApi.createContainer({
      imageName: form.imageName.trim(),
      containerName: form.containerName.trim(),
      ports: Object.keys(ports).length ? ports : undefined,
      volumes: Object.keys(volumes).length ? volumes : undefined,
      envVars: Object.keys(envVars).length ? envVars : undefined,
      platform: form.platform || undefined,
      restartPolicy: form.restartPolicy || undefined,
    })

    if (res.data.code !== 1) {
      notify.warning('创建容器失败', res.data.msg)
      return
    }

    resultData.value = {
      containerId: res.data.data.containerId,
      containerName: res.data.data.containerName,
    }

    notify.info('容器创建成功', `${res.data.data.containerName} (${res.data.data.containerId.slice(0, 12)})`)
    emit('created', res.data.data.containerId, res.data.data.containerName)
  } catch (error: any) {
    notify.error('创建容器失败', error?.message || '请检查参数后重试')
  } finally {
    creating.value = false
  }
}

function handleClose() {
  if (!creating.value) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
        <div class="dialog-card wide">
          <div class="dialog-head">
            <div>
              <h3>创建容器</h3>
              <p>配置容器参数，从指定镜像创建并启动一个新容器。</p>
            </div>
            <button class="close-btn" @click="handleClose">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div class="dialog-body">
            <!-- 基础参数 -->
            <div class="form-grid">
              <div class="field full">
                <label>镜像 <span class="required">*</span></label>
                <input v-model="form.imageName" type="text" placeholder="nginx:latest" />
              </div>

              <div class="field full">
                <label>容器名称 <span class="required">*</span></label>
                <input v-model="form.containerName" type="text" placeholder="my-nginx" />
              </div>

              <div class="field">
                <label>目标架构</label>
                <input v-model="form.platform" type="text" placeholder="留空自动选择" />
              </div>

              <div class="field">
                <label>重启策略</label>
                <select v-model="form.restartPolicy">
                  <option v-for="opt in restartOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
            </div>

            <!-- 端口映射 -->
            <section class="entry-section">
              <div class="section-head">
                <label>端口映射</label>
                <button class="add-row-btn" @click="addPort">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  添加端口
                </button>
              </div>
              <div v-if="portEntries.length === 0" class="section-empty">未配置端口映射</div>
              <div v-for="(entry, index) in portEntries" :key="index" class="entry-row">
                <input v-model="entry.hostPort" type="text" placeholder="宿主机端口" />
                <span class="arrow">→</span>
                <input v-model="entry.containerPort" type="text" placeholder="容器端口" />
                <button class="remove-btn" @click="removePort(index)">✕</button>
              </div>
            </section>

            <!-- 环境变量 -->
            <section class="entry-section">
              <div class="section-head">
                <label>环境变量</label>
                <button class="add-row-btn" @click="addEnv">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  添加变量
                </button>
              </div>
              <div v-if="envEntries.length === 0" class="section-empty">未配置环境变量</div>
              <div v-for="(entry, index) in envEntries" :key="index" class="entry-row">
                <input v-model="entry.key" type="text" placeholder="KEY" class="key-input" />
                <span class="arrow">=</span>
                <input v-model="entry.value" type="text" placeholder="VALUE" />
                <button class="remove-btn" @click="removeEnv(index)">✕</button>
              </div>
            </section>

            <!-- 挂载卷 -->
            <section class="entry-section">
              <div class="section-head">
                <label>挂载卷</label>
                <button class="add-row-btn" @click="addVolume">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  添加挂载
                </button>
              </div>
              <div v-if="volumeEntries.length === 0" class="section-empty">未配置挂载卷</div>
              <div v-for="(entry, index) in volumeEntries" :key="index" class="entry-row">
                <input v-model="entry.hostPath" type="text" placeholder="/host/path" />
                <span class="arrow">→</span>
                <input v-model="entry.containerPath" type="text" placeholder="/container/path" />
                <button class="remove-btn" @click="removeVolume(index)">✕</button>
              </div>
            </section>

            <!-- 结果 -->
            <div v-if="resultData" class="result-banner success">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <div>
                <strong>容器已创建</strong>
                <p>{{ resultData.containerName }} ({{ resultData.containerId.slice(0, 12) }})</p>
              </div>
            </div>
          </div>

          <div class="dialog-actions">
            <button class="secondary-btn" @click="handleClose" :disabled="creating">
              {{ resultData ? '关闭' : '取消' }}
            </button>
            <button v-if="!resultData" class="primary-btn" :disabled="creating || !form.imageName.trim() || !form.containerName.trim()" @click="doCreate">
              <span v-if="creating" class="spinner"></span>
              {{ creating ? '创建中...' : '创建容器' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.42);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 280;
}

.dialog-card {
  width: min(620px, 100%);
  max-height: min(90vh, 900px);
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.dialog-card.wide {
  width: min(720px, 100%);
}

.dialog-head {
  padding: 20px 22px 16px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--color-border);
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

.close-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: var(--color-bg-inset);
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
}

.close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.dialog-body {
  padding: 22px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field.full {
  grid-column: 1 / -1;
}

.field label {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.required {
  color: var(--color-danger);
}

.field input,
.field select {
  width: 100%;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.field select {
  cursor: pointer;
  appearance: auto;
}

.field input:focus,
.field select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

/* === Entry sections (ports / env / volumes) === */
.entry-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-head label {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.add-row-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  background: var(--color-primary-ghost);
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.add-row-btn:hover {
  background: var(--color-primary);
  color: #fff;
}

.section-empty {
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--color-bg-inset);
  color: var(--color-text-muted);
  font-size: 13px;
  text-align: center;
}

.entry-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.entry-row input {
  flex: 1;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.18s ease;
}

.entry-row input:focus {
  border-color: var(--color-primary);
}

.entry-row .key-input {
  max-width: 140px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.arrow {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: 14px;
  font-weight: 600;
}

.remove-btn {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
}

.remove-btn:hover {
  background: var(--color-danger);
  color: #fff;
}

.result-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  border-radius: 16px;
}

.result-banner.success {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.result-banner strong {
  display: block;
  font-size: 16px;
}

.result-banner p {
  margin-top: 4px;
  font-size: 13px;
  opacity: 0.85;
}

.dialog-actions {
  padding: 16px 22px 22px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid var(--color-border);
}

.primary-btn,
.secondary-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 18px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.primary-btn {
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary-btn:not(:disabled):hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.secondary-btn {
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
}

.secondary-btn:hover {
  color: var(--color-text);
  border-color: var(--color-primary);
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
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

@media (max-width: 600px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .entry-row {
    flex-wrap: wrap;
  }

  .entry-row .key-input {
    max-width: none;
  }
}
</style>