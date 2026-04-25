<script setup lang="ts">
import { useRouter } from 'vue-router'
import SettingRow from '../components/settings/SettingRow.vue'
import { useTheme, type ThemeMode } from '../composables/useTheme'

const router = useRouter()
const { currentTheme, setTheme } = useTheme()

const themeOptions: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'light', label: '浅色模式', icon: '' },
  { value: 'dark', label: '深色模式', icon: '' },
  { value: 'purple', label: '紫色主题', icon: '' },
]

function handleThemeChange(e: Event) {
  const val = (e.target as HTMLSelectElement).value as ThemeMode
  setTheme(val)
}

const svgKey = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>'
const svgPalette = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>'

function navigateToApiKey() {
  router.push('/settings/apikey')
}
</script>

<template>
  <div class="settings-page">
    <div class="page-header">
      <h1 class="page-title">设置</h1>
    </div>

    <div class="settings-list">
      <div class="section-label">通用</div>

      <SettingRow
        :icon="svgPalette"
        title="主题外观"
        description="切换界面主题风格"
      >
        <template #action>
          <div class="theme-select-wrapper">
            <select class="theme-select" :value="currentTheme" @change="handleThemeChange">
              <option v-for="opt in themeOptions" :key="opt.value" :value="opt.value">{{ opt.icon }} {{ opt.label }}</option>
            </select>
            <svg class="select-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </template>
      </SettingRow>

      <div class="section-label" style="margin-top: 24px;">服务</div>

      <SettingRow
        :icon="svgKey"
        title="API Key 凭证"
        description="管理 AI 服务商的 API Key 配置"
        :navigable="true"
        @click="navigateToApiKey"
      />
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  padding: 24px;
  max-width: 720px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 28px;
}

.page-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--color-text);
  letter-spacing: -0.5px;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 0 4px;
  margin-bottom: 4px;
}

.theme-select-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.theme-select {
  appearance: none;
  -webkit-appearance: none;
  padding: 10px 40px 10px 16px;
  border-radius: 12px;
  border: 1.5px solid var(--color-border-solid);
  background: var(--color-bg-surface);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  outline: none;
  min-width: 150px;
  box-shadow: var(--shadow-sm);
}

.theme-select:hover {
  border-color: var(--color-primary-light);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.theme-select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
}

.theme-select option {
  padding: 8px 12px;
  font-size: 14px;
}

.select-chevron {
  position: absolute;
  right: 14px;
  pointer-events: none;
  color: var(--color-text-muted);
  transition: color 0.2s ease;
}

@media (max-width: 768px) {
  .settings-page {
    padding: 16px;
  }
}
</style>
