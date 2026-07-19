<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import * as dockerApi from '../../api/docker'
import { useNotification } from '../../composables/useNotification'

const props = defineProps<{
  visible: boolean
  imageName: string
}>()

const emit = defineEmits<{
  close: []
  pulled: [imageName: string]
  createContainer: [imageName: string]
}>()

const notify = useNotification()

const form = reactive({
  imageName: '',
  tag: 'latest',
  platform: '',
  registry: '',
})

const pulling = ref(false)
const pullResult = ref<{ image: string; isPulled: boolean } | null>(null)
const pullError = ref('')

// 预设计 registry 选择
const selectedPreset = ref<string | null>(null)

const registryPresets = [
  { label: '走 daemon.json 配置', value: '', desc: '按当前 daemon.json 的 mirror 配置走' },
  { label: 'DaoCloud 加速站', value: 'docker.m.daocloud.cn', desc: '国内推荐，LoongArch 友好' },
  { label: 'Docker Hub 直连', value: 'registry-1.docker.io', desc: '绕过 mirror 配置，直接连官方' },
]

function selectPreset(value: string) {
  selectedPreset.value = value || null
  form.registry = value
}

function resetForm() {
  form.imageName = props.imageName
  form.tag = 'latest'
  form.platform = ''
  form.registry = ''
  selectedPreset.value = null
  pullResult.value = null
  pullError.value = ''
  pulling.value = false
}

async function doPull() {
  if (!form.imageName.trim()) {
    notify.warning('请输入镜像名称')
    return
  }

  pulling.value = true
  pullResult.value = null
  pullError.value = ''

  try {
    const res = await dockerApi.pullDockerImage({
      imageName: form.imageName.trim(),
      tag: form.tag || undefined,
      platform: form.platform || undefined,
      registry: form.registry || undefined,
    })

    if (res.data.code !== 1) {
      pullError.value = res.data.msg || '拉取失败'
      return
    }

    pullResult.value = {
      image: res.data.data.image,
      isPulled: res.data.data.isPulled,
    }
    notify.info('镜像拉取成功', `${res.data.data.image} 已拉取到本机`)
  } catch (error: any) {
    pullError.value = error?.message || '拉取请求异常，请稍后重试'
  } finally {
    pulling.value = false
  }
}

function handleCreateContainer() {
  emit('createContainer', form.imageName.trim())
  emit('close')
}

function handleClose() {
  emit('close')
}

/* 每次打开弹窗都要重置为崭新状态 */
watch(() => props.visible, (val) => {
  if (val) resetForm()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
        <div class="dialog-card">
          <div class="dialog-head">
            <div>
              <h3>拉取镜像</h3>
              <p>配置拉取参数，从 Docker Hub 或加速站拉取镜像到本机。</p>
            </div>
            <button class="close-btn" @click="handleClose">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <!-- 拉取表单 -->
          <div v-if="!pullResult" class="dialog-body">
            <div class="form-grid">
              <div class="field full">
                <label>镜像名称 <span class="required">*</span></label>
                <input v-model="form.imageName" type="text" readonly placeholder="从搜索结果自动填充" />
                <p class="field-hint">从镜像市场选择后自动填充，不可修改。</p>
              </div>

              <div class="field">
                <label>标签</label>
                <input v-model="form.tag" type="text" placeholder="latest" />
              </div>

              <div class="field">
                <label>目标架构</label>
                <input v-model="form.platform" type="text" placeholder="留空自动选择" />
                <p class="field-hint">如 <code>linux/amd64</code>、<code>linux/loongarch64</code></p>
              </div>

              <div class="field full">
                <label>Registry 来源</label>
                <div class="preset-row">
                  <button
                    v-for="preset in registryPresets"
                    :key="preset.value"
                    class="preset-btn"
                    :class="{ active: form.registry === preset.value }"
                    @click="selectPreset(preset.value)"
                  >
                    <strong>{{ preset.label }}</strong>
                    <span>{{ preset.desc }}</span>
                  </button>
                </div>
                <input v-model="form.registry" type="text" placeholder="或输入自定义 registry 地址（不含 https://）" />
              </div>
            </div>

            <div v-if="pullError" class="error-banner">{{ pullError }}</div>
          </div>

          <!-- 拉取结果 -->
          <div v-else class="dialog-body">
            <div class="result-banner success">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <div>
                <strong>拉取成功</strong>
                <p>{{ pullResult.image }} 已就绪</p>
              </div>
            </div>
          </div>

          <div class="dialog-actions">
            <button class="secondary-btn" @click="handleClose">
              {{ pullResult ? '关闭' : '取消' }}
            </button>

            <template v-if="!pullResult">
              <button class="primary-btn" :disabled="pulling || !form.imageName.trim()" @click="doPull">
                <span v-if="pulling" class="spinner"></span>
                {{ pulling ? '拉取中...' : '开始拉取' }}
              </button>
            </template>

            <template v-else>
              <button class="primary-btn" @click="handleCreateContainer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="12" y1="8" x2="12" y2="16"></line>
                  <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
                创建容器
              </button>
            </template>
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
  z-index: 270;
}

.dialog-card {
  width: min(620px, 100%);
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
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
  gap: 16px;
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

.field input {
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

.field input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.field input[readonly] {
  background: var(--color-bg-inset);
  color: var(--color-text);
  cursor: default;
  opacity: 0.85;
}

.field input[readonly]:focus {
  border-color: var(--color-border-solid);
  box-shadow: none;
}

.field-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  line-height: 1.5;
}

.field-hint code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--color-bg-inset);
  font-size: 11px;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-btn {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  cursor: pointer;
  text-align: left;
  transition: all 0.18s ease;
}

.preset-btn:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-ghost);
}

.preset-btn.active {
  border-color: var(--color-primary);
  background: var(--color-primary-ghost);
  box-shadow: 0 0 0 2px var(--color-primary-ghost);
}

.preset-btn strong {
  font-size: 12px;
  color: var(--color-text);
  font-weight: 700;
}

.preset-btn span {
  font-size: 10px;
  color: var(--color-text-muted);
  line-height: 1.4;
}

.error-banner {
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--color-danger-bg);
  color: var(--color-danger);
  font-size: 13px;
  font-weight: 600;
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

  .preset-row {
    flex-direction: column;
  }
}
</style>