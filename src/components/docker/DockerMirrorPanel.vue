<script setup lang="ts">
import { onMounted, ref } from 'vue'
import * as dockerApi from '../../api/docker'
import { useNotification } from '../../composables/useNotification'
import type { DockerMirrorConfig } from '../../types/docker'

const notify = useNotification()

const loading = ref(true)
const saving = ref(false)
const config = ref<DockerMirrorConfig | null>(null)
const configPath = ref('')
const selectedMirrors = ref<string[]>([])
const customMirror = ref('')

const knownMirrors = [
  { url: 'https://docker.m.daocloud.cn', label: 'DaoCloud', desc: '国内推荐，LoongArch 友好' },
  { url: 'https://docker.nju.edu.cn', label: '南京大学', desc: '教育网加速' },
  { url: 'https://docker.mirrors.ustc.edu.cn', label: '中科大', desc: '教育网加速' },
  { url: 'https://mirror.ccs.tencentyun.com', label: '腾讯云', desc: '腾讯云内网' },
]

async function loadConfig() {
  loading.value = true
  try {
    const res = await dockerApi.getDockerMirror()
    if (res.data.code !== 1) {
      notify.warning('获取镜像站配置失败', res.data.msg)
      return
    }
    config.value = res.data.data
    configPath.value = res.data.data.daemonJsonPath
    selectedMirrors.value = res.data.data.registryMirrors || []
  } catch (error: any) {
    notify.error('获取镜像站配置失败', error?.message || '请稍后重试')
  } finally {
    loading.value = false
  }
}

function toggleMirror(url: string) {
  const idx = selectedMirrors.value.indexOf(url)
  if (idx !== -1) {
    selectedMirrors.value.splice(idx, 1)
  } else {
    selectedMirrors.value.push(url)
  }
}

function addCustomMirror() {
  const url = customMirror.value.trim()
  if (!url) return
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    notify.warning('请输入有效的 URL（以 http:// 或 https:// 开头）')
    return
  }
  if (selectedMirrors.value.includes(url)) {
    notify.warning('该镜像站已在列表中')
    return
  }
  selectedMirrors.value.push(url)
  customMirror.value = ''
}

function removeMirror(url: string) {
  selectedMirrors.value = selectedMirrors.value.filter((m) => m !== url)
}

async function doSave() {
  saving.value = true
  try {
    const res = await dockerApi.setDockerMirror(selectedMirrors.value)
    if (res.data.code !== 1) {
      notify.warning('保存失败', res.data.msg)
      return
    }
    notify.info('配置已保存', `Docker 已重启，当前 ${selectedMirrors.value.length} 个镜像站`)
    await loadConfig()
  } catch (error: any) {
    notify.error('保存失败', error?.message || '请稍后重试')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="mirror-panel">
    <div class="panel-head">
      <div>
        <h2>镜像加速站配置</h2>
        <p>配置 Docker 的 registry mirrors，拉取镜像时自动走加速站。</p>
      </div>
      <div class="config-path-badge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        {{ configPath || '/etc/docker/daemon.json' }}
      </div>
    </div>

    <div v-if="loading" class="loading-state">加载镜像站配置中...</div>

    <template v-else>
      <!-- 当前配置摘要 -->
      <div class="current-config">
        <div class="config-summary">
          <div class="summary-value">{{ selectedMirrors.length }}</div>
          <div class="summary-label">已配置镜像站</div>
        </div>
        <div v-if="selectedMirrors.length === 0" class="no-mirror-tip">
          当前未配置任何镜像加速站，从 Docker Hub 拉取可能较慢。
        </div>
        <div v-else class="current-mirrors">
          <div v-for="url in selectedMirrors" :key="url" class="current-mirror-item">
            <code>{{ url }}</code>
            <button class="chip-remove" @click="removeMirror(url)">✕</button>
          </div>
        </div>
      </div>

      <!-- 预设镜像站 -->
      <section class="mirror-section">
        <div class="section-label">常用镜像站</div>
        <div class="preset-grid">
          <button
            v-for="mirror in knownMirrors"
            :key="mirror.url"
            class="preset-card"
            :class="{ selected: selectedMirrors.includes(mirror.url) }"
            @click="toggleMirror(mirror.url)"
          >
            <div class="preset-check">
              <svg v-if="selectedMirrors.includes(mirror.url)" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <div v-else class="check-empty"></div>
            </div>
            <div>
              <strong>{{ mirror.label }}</strong>
              <span>{{ mirror.url }}</span>
              <span class="preset-desc">{{ mirror.desc }}</span>
            </div>
          </button>
        </div>
      </section>

      <!-- 自定义输入 -->
      <section class="mirror-section">
        <div class="section-label">自定义镜像站</div>
        <div class="custom-row">
          <input
            v-model="customMirror"
            type="text"
            placeholder="https://your-mirror.com"
            @keydown.enter="addCustomMirror"
          />
          <button class="add-btn" :disabled="!customMirror.trim()" @click="addCustomMirror">添加</button>
        </div>
      </section>

      <!-- 保存 -->
      <div class="save-bar">
        <div class="save-info">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>保存后将自动重启 Docker 守护进程，已有容器不受影响。</span>
        </div>
        <button class="primary-btn" :disabled="saving" @click="doSave">
          <span v-if="saving" class="spinner"></span>
          {{ saving ? '保存并重启中...' : '保存配置并重启 Docker' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mirror-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
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

.config-path-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 12px;
  background: var(--color-bg-inset);
  color: var(--color-text-muted);
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.loading-state {
  padding: 24px 0;
  color: var(--color-text-secondary);
  text-align: center;
}

/* === 当前配置 === */
.current-config {
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}

.config-summary {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.summary-value {
  font-size: 28px;
  font-weight: 800;
  color: var(--color-primary);
  line-height: 1;
}

.summary-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  font-weight: 600;
}

.no-mirror-tip {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--color-warning-bg);
  color: var(--color-warning);
  font-size: 13px;
}

.current-mirrors {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.current-mirror-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 12px;
  border-radius: 10px;
  background: var(--color-primary-ghost);
  border: 1px solid rgba(59, 130, 246, 0.15);
}

.current-mirror-item code {
  font-size: 12px;
  color: var(--color-primary);
}

.chip-remove {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-primary);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.18s ease;
}

.chip-remove:hover {
  background: var(--color-primary);
  color: #fff;
}

/* === 预设列表 === */
.mirror-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.preset-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  cursor: pointer;
  text-align: left;
  transition: all 0.18s ease;
}

.preset-card:hover {
  border-color: var(--color-primary);
}

.preset-card.selected {
  border-color: var(--color-primary);
  background: var(--color-primary-ghost);
  box-shadow: 0 0 0 2px var(--color-primary-ghost);
}

.preset-check {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  margin-top: 2px;
}

.check-empty {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 2px solid var(--color-border-solid);
}

.preset-card.selected .check-empty {
  display: none;
}

.preset-card strong {
  display: block;
  font-size: 14px;
  color: var(--color-text);
  font-weight: 700;
}

.preset-card span {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.preset-desc {
  margin-top: 2px;
  font-family: inherit !important;
  color: var(--color-text-secondary) !important;
  font-size: 12px !important;
}

/* === 自定义输入 === */
.custom-row {
  display: flex;
  gap: 8px;
}

.custom-row input {
  flex: 1;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.18s ease;
}

.custom-row input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.add-btn {
  min-height: 44px;
  padding: 0 20px;
  border: 1px solid var(--color-primary);
  border-radius: 14px;
  background: var(--color-primary-ghost);
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
}

.add-btn:hover {
  background: var(--color-primary);
  color: #fff;
}

.add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* === 保存栏 === */
.save-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-radius: 18px;
  border: 1px solid var(--color-border);
  background: var(--color-warning-bg);
}

.save-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.save-info svg {
  flex-shrink: 0;
  color: var(--color-warning);
}

.primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 18px;
  border-radius: 12px;
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary-btn:not(:disabled):hover {
  opacity: 0.9;
  transform: translateY(-1px);
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

@media (max-width: 768px) {
  .preset-grid {
    grid-template-columns: 1fr;
  }

  .save-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .panel-head {
    flex-direction: column;
  }
}
</style>