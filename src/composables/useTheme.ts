import { ref } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'purple'

const STORAGE_KEY = 'app-theme'

const validThemes: ThemeMode[] = ['light', 'dark', 'purple']

function getSystemPreference(): ThemeMode {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

function getStoredTheme(): ThemeMode | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && validThemes.includes(stored as ThemeMode)) return stored as ThemeMode
  return null
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute('data-theme', mode)
}

const currentTheme = ref<ThemeMode>(getStoredTheme() ?? getSystemPreference())
let initialized = false

export function useTheme() {
  if (!initialized) {
    initialized = true
    applyTheme(currentTheme.value)
  }

  function getTheme(): ThemeMode {
    return currentTheme.value
  }

  function isDark(): boolean {
    return currentTheme.value === 'dark' || currentTheme.value === 'purple'
  }

  function setTheme(mode: ThemeMode) {
    currentTheme.value = mode
    applyTheme(mode)
    localStorage.setItem(STORAGE_KEY, mode)
  }

  function toggleTheme() {
    const order: ThemeMode[] = ['light', 'dark', 'purple']
    const idx = order.indexOf(currentTheme.value)
    setTheme(order[(idx + 1) % order.length])
  }

  function initThemeListener() {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      if (!getStoredTheme()) {
        setTheme(e.matches ? 'dark' : 'light')
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }

  return {
    currentTheme,
    getTheme,
    isDark,
    setTheme,
    toggleTheme,
    initThemeListener,
  }
}
