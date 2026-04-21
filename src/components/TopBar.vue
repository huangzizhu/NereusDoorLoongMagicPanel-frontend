<template>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="topbar-left">
        <div class="brand">
          <div class="brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <span class="brand-text">{{ appTitle }}</span>
        </div>
      </div>

      <div class="topbar-right">
        <div class="datetime">
          <span class="datetime-time">{{ currentTime }}</span>
          <span class="datetime-date">{{ currentDate }}</span>
        </div>

        <div class="divider-v"></div>

        <button class="theme-toggle" @click="handleToggleTheme" :aria-label="isDark ? '切换到亮色模式' : '切换到暗色模式'">
          <div class="theme-toggle-track" :class="{ 'is-dark': isDark }">
            <div class="theme-toggle-thumb">
              <svg class="icon-sun" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              <svg class="icon-moon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </div>
            <span class="star star-1"></span>
            <span class="star star-2"></span>
            <span class="star star-3"></span>
            <span class="star star-4"></span>
          </div>
        </button>

        <div class="divider-v"></div>

        <div class="avatar-area" ref="avatarAreaRef">
          <button class="avatar-btn" @click.stop="toggleMenu">
            <img :src="avatarUrl" alt="avatar" class="avatar-img" />
            <svg class="chevron" :class="{ open: showMenu }" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <Transition name="menu">
            <div class="dropdown" v-if="showMenu" @click.stop>
              <div class="dropdown-header">
                <img :src="avatarUrl" alt="avatar" class="dropdown-avatar" />
                <div class="dropdown-user">
                  <span class="dropdown-name">用户名</span>
                  <span class="dropdown-email">user@example.com</span>
                </div>
              </div>
              <div class="dropdown-divider"></div>
              <div class="dropdown-items">
                <button class="dropdown-item" @click="handleMenuAction('profile')">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>个人中心</span>
                </button>
                <button class="dropdown-item" @click="handleMenuAction('settings')">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>设置</span>
                </button>
              </div>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item danger" @click="handleLogout">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span>退出登录</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTheme } from '../composables/useTheme'

const router = useRouter()
const theme = useTheme()

const appTitle = '前端模板系统'
const showMenu = ref(false)
const isDark = ref(theme.isDark())
const avatarUrl = ref('https://cube.elemecdn.com/0/88/03b0d39583f48206768a7534e55bcpng.png')
const avatarAreaRef = ref<HTMLElement | null>(null)

let timer: ReturnType<typeof setInterval> | null = null
const nowTs = ref(Date.now())

const currentTime = computed(() => {
  const d = new Date(nowTs.value)
  return d.toTimeString().slice(0, 8)
})

const currentDate = computed(() => {
  const d = new Date(nowTs.value)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const weeks = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${y}-${m}-${day} ${weeks[d.getDay()]}`
})

const handleToggleTheme = () => {
  theme.toggleTheme()
  isDark.value = theme.isDark()
}

const toggleMenu = () => {
  showMenu.value = !showMenu.value
}

const handleMenuAction = (action: string) => {
  showMenu.value = false
  if (action === 'profile') router.push('/profile')
  if (action === 'settings') router.push('/settings')
}

const handleLogout = () => {
  localStorage.removeItem('userInfo')
  sessionStorage.removeItem('userInfo')
  showMenu.value = false
  router.push('/login')
}

const onClickOutside = (e: MouseEvent) => {
  if (avatarAreaRef.value && !avatarAreaRef.value.contains(e.target as Node)) {
    showMenu.value = false
  }
}

onMounted(() => {
  timer = setInterval(() => { nowTs.value = Date.now() }, 1000)
  document.addEventListener('click', onClickOutside)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  document.removeEventListener('click', onClickOutside)
})
</script>

<style scoped>
.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 200;
  height: var(--topbar-height);
  background: var(--color-bg-elevated);
  backdrop-filter: var(--backdrop-blur);
  -webkit-backdrop-filter: var(--backdrop-blur);
  border-bottom: 1px solid var(--color-border);
  transition: background 0.3s ease, border-color 0.3s ease;
}

.topbar-inner {
  max-width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
}

.topbar-left {
  display: flex;
  align-items: center;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--color-gradient-start) 0%, var(--color-gradient-end) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 2px 8px var(--color-primary-shadow);
}

.brand-text {
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.3px;
  transition: color 0.3s ease;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.datetime {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  min-width: 130px;
}

.datetime-time {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
  transition: color 0.3s ease;
}

.datetime-date {
  font-size: 12px;
  color: var(--color-text-muted);
  font-weight: 500;
  transition: color 0.3s ease;
}

.divider-v {
  width: 1px;
  height: 28px;
  background: var(--color-border-solid);
  border-radius: 1px;
  transition: background 0.3s ease;
}

.theme-toggle {
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.theme-toggle-track {
  position: relative;
  width: 56px;
  height: 28px;
  border-radius: 14px;
  background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: background 0.5s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.5s ease;
  overflow: hidden;
}

.theme-toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.4s ease, box-shadow 0.4s ease;
  z-index: 2;
}

.theme-toggle-thumb .icon-sun {
  position: absolute;
  color: #f59e0b;
  transition: opacity 0.3s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  opacity: 1;
  transform: rotate(0deg) scale(1);
}

.theme-toggle-thumb .icon-moon {
  position: absolute;
  color: #6366f1;
  transition: opacity 0.3s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  opacity: 0;
  transform: rotate(-90deg) scale(0.5);
}

.star {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #fbbf24;
  opacity: 0;
  transition: opacity 0.4s ease 0.15s, transform 0.4s ease 0.15s;
  z-index: 1;
}

.star-1 {
  top: 6px;
  right: 8px;
  transform: scale(0);
  transition-delay: 0.1s;
}

.star-2 {
  top: 14px;
  right: 5px;
  width: 2px;
  height: 2px;
  transform: scale(0);
  transition-delay: 0.2s;
}

.star-3 {
  bottom: 7px;
  right: 10px;
  width: 2px;
  height: 2px;
  transform: scale(0);
  transition-delay: 0.15s;
}

.star-4 {
  top: 10px;
  right: 14px;
  width: 2px;
  height: 2px;
  transform: scale(0);
  transition-delay: 0.25s;
}

.theme-toggle-track.is-dark {
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2);
}

.theme-toggle-track.is-dark .theme-toggle-thumb {
  transform: translateX(28px);
  background: #1e1b4b;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4), 0 0 8px rgba(99, 102, 241, 0.3);
}

.theme-toggle-track.is-dark .icon-sun {
  opacity: 0;
  transform: rotate(90deg) scale(0.5);
}

.theme-toggle-track.is-dark .icon-moon {
  opacity: 1;
  transform: rotate(0deg) scale(1);
}

.theme-toggle-track.is-dark .star {
  opacity: 1;
  transform: scale(1);
  background: #e0e7ff;
}

.theme-toggle-track.is-dark .star-1 {
  animation: twinkle 2s ease-in-out infinite;
}

.theme-toggle-track.is-dark .star-2 {
  animation: twinkle 2s ease-in-out infinite 0.5s;
}

.theme-toggle-track.is-dark .star-3 {
  animation: twinkle 2s ease-in-out infinite 1s;
}

.theme-toggle-track.is-dark .star-4 {
  animation: twinkle 2s ease-in-out infinite 1.5s;
}

@keyframes twinkle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(0.6); }
}

.avatar-area {
  position: relative;
}

.avatar-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 4px;
  border: none;
  background: transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.avatar-btn:hover {
  background: var(--color-primary-ghost);
}

.avatar-img {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  object-fit: cover;
  border: 2px solid var(--color-avatar-border);
  transition: border-color 0.3s ease;
}

.chevron {
  color: var(--color-text-muted);
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.chevron.open {
  transform: rotate(180deg);
}

.dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 240px;
  background: var(--color-bg-surface);
  border-radius: 16px;
  box-shadow: var(--shadow-lg);
  padding: 8px;
  z-index: 210;
  overflow: hidden;
  transition: background 0.3s ease;
}

.menu-enter-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.menu-leave-active {
  transition: all 0.15s cubic-bezier(0.4, 0, 1, 1);
}
.menu-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
}
.menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

.dropdown-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.04) 0%, rgba(139, 92, 246, 0.04) 100%);
  transition: background 0.3s ease;
}

:global([data-theme="dark"]) .dropdown-header {
  background: linear-gradient(135deg, rgba(129, 140, 248, 0.06) 0%, rgba(167, 139, 250, 0.06) 100%);
}

.dropdown-avatar {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: cover;
}

.dropdown-user {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dropdown-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  transition: color 0.3s ease;
}

.dropdown-email {
  font-size: 12px;
  color: var(--color-text-muted);
  transition: color 0.3s ease;
}

.dropdown-divider {
  height: 1px;
  background: var(--color-divider);
  margin: 6px 8px;
  transition: background 0.3s ease;
}

.dropdown-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 10px;
  font-size: 14px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.dropdown-item:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.dropdown-item.danger {
  color: var(--color-danger);
}

.dropdown-item.danger:hover {
  background: var(--color-danger-bg);
  color: var(--color-danger-hover);
}

@media (max-width: 768px) {
  .datetime { display: none; }
  .divider-v:first-of-type { display: none; }
  .topbar-inner { padding: 0 16px; }
  .brand-text { font-size: 15px; }
}
</style>
