<script setup lang="ts">
import { ref } from 'vue'
import * as dockerApi from '../../api/docker'
import { useNotification } from '../../composables/useNotification'
import type { DockerSearchItem } from '../../types/docker'

const emit = defineEmits<{
  pull: [imageName: string]
}>()

const notify = useNotification()

const query = ref('')
const results = ref<DockerSearchItem[]>([])
const total = ref(0)
const searching = ref(false)
const searched = ref(false)

async function doSearch() {
  const q = query.value.trim()
  if (!q) return

  searching.value = true
  searched.value = true
  results.value = []
  total.value = 0

  try {
    const res = await dockerApi.searchDockerHubImages(q, 25)
    if (res.data.code !== 1) {
      notify.warning('搜索失败', res.data.msg)
      return
    }
    results.value = res.data.data.list || []
    total.value = res.data.data.total || 0
  } catch (error: any) {
    notify.error('搜索 Docker Hub 失败', error?.message || '请稍后重试')
  } finally {
    searching.value = false
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') doSearch()
}

function triggerPull(item: DockerSearchItem) {
  let imageName = item.name
  // 官方镜像直接传 name（如 nginx），第三方传完整名（如 linuxserver/nginx）
  emit('pull', imageName)
}
</script>

<template>
  <div class="search-panel">
    <!-- 搜索栏 -->
    <div class="search-bar">
      <div class="search-field">
        <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          v-model="query"
          type="text"
          placeholder="搜索 Docker Hub 镜像，例如 nginx、redis、mysql..."
          @keydown="handleKeydown"
        />
        <button class="primary-btn" :disabled="searching || !query.trim()" @click="doSearch">
          {{ searching ? '搜索中...' : '搜索' }}
        </button>
      </div>
      <p v-if="searched" class="search-summary">
        找到 <strong>{{ total }}</strong> 个结果
        <template v-if="query.trim()"> —— "{{ query.trim() }}"</template>
      </p>
    </div>

    <!-- 搜索中骨架 -->
    <div v-if="searching" class="skeleton-list">
      <div v-for="i in 5" :key="i" class="skeleton-item"></div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="searched && results.length === 0" class="empty-state">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </div>
      <div class="empty-title">没有找到匹配的镜像</div>
      <div class="empty-text">试试其他关键词，或检查 Docker 是否正在运行。</div>
    </div>

    <!-- 结果列表 -->
    <div v-else-if="results.length" class="search-results">
      <div
        v-for="item in results"
        :key="item.name"
        class="result-card"
      >
        <div class="result-body">
          <div class="result-head">
            <div class="result-name-wrap">
              <strong class="result-name">{{ item.name }}</strong>
              <span v-if="item.isOfficial" class="official-badge">官方</span>
            </div>
            <div class="result-meta">
              <span v-if="Number(item.starCount) > 0" class="star-count">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
                {{ Number(item.starCount).toLocaleString() }}
              </span>
            </div>
          </div>
          <p class="result-desc">{{ item.description || '暂无描述' }}</p>
        </div>
        <div class="result-action">
          <button class="accent-btn" @click="triggerPull(item)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            拉取
          </button>
        </div>
      </div>
    </div>

    <!-- 初始提示 -->
    <div v-else class="welcome-tip">
      <div class="tip-icon">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4z"></path>
          <path d="M20 8h2c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H10c-1.1 0-2-.9-2-2v-2"></path>
        </svg>
      </div>
      <div class="tip-title">Docker Hub 镜像搜索</div>
      <div class="tip-text">输入关键词搜索官方镜像市场，找到需要的镜像后一键拉取到本机。</div>
    </div>
  </div>
</template>

<style scoped>
.search-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* === 搜索栏 === */
.search-bar {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.search-field {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 16px;
  border-radius: 16px;
  border: 1px solid var(--color-border-solid);
  background: var(--color-bg);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.search-field:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.search-icon {
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.search-field input {
  flex: 1;
  min-height: 40px;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 15px;
  outline: none;
}

.search-field input::placeholder {
  color: var(--color-text-muted);
}

.primary-btn {
  flex-shrink: 0;
  min-height: 40px;
  padding: 0 20px;
  border: none;
  border-radius: 12px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary-btn:not(:disabled):hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.search-summary {
  font-size: 13px;
  color: var(--color-text-secondary);
  padding: 0 4px;
}

.search-summary strong {
  color: var(--color-text);
}

/* === 骨架屏 === */
.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skeleton-item {
  height: 72px;
  border-radius: 16px;
  background: linear-gradient(90deg, var(--color-bg-surface), var(--color-bg-hover), var(--color-bg-surface));
  background-size: 240px 100%;
  animation: shimmer 1.4s linear infinite;
}

/* === 空状态 === */
.empty-state {
  text-align: center;
  padding: 48px 24px;
}

.empty-icon {
  color: var(--color-text-muted);
  margin-bottom: 16px;
}

.empty-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
}

.empty-text {
  margin-top: 8px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

/* === 结果列表 === */
.search-results {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.result-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.result-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-ghost);
}

.result-body {
  flex: 1;
  min-width: 0;
}

.result-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.result-name-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.result-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
  word-break: break-word;
}

.official-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-primary-ghost);
  color: var(--color-primary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.result-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.star-count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.star-count svg {
  color: var(--color-warning);
}

.result-desc {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.result-action {
  flex-shrink: 0;
}

.accent-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 18px;
  border: 1px solid var(--color-primary);
  border-radius: 12px;
  background: var(--color-primary-ghost);
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;
}

.accent-btn:hover {
  background: var(--color-primary);
  color: #fff;
  transform: translateY(-1px);
}

/* === 初始提示 === */
.welcome-tip {
  text-align: center;
  padding: 64px 24px;
}

.tip-icon {
  color: var(--color-text-muted);
  opacity: 0.5;
  margin-bottom: 18px;
}

.tip-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--color-text);
}

.tip-text {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-secondary);
  max-width: 480px;
  margin-left: auto;
  margin-right: auto;
}

@keyframes shimmer {
  0% { background-position: -240px 0; }
  100% { background-position: 240px 0; }
}
</style>