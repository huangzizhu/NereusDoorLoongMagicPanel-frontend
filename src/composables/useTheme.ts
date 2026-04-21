export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'app-theme'

function getSystemPreference(): ThemeMode {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

function getStoredTheme(): ThemeMode | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return null
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute('data-theme', mode)
}

let currentTheme: ThemeMode

export function useTheme() {
  const stored = getStoredTheme()
  currentTheme = stored ?? getSystemPreference()
  applyTheme(currentTheme)

  function getTheme(): ThemeMode {
    return currentTheme
  }

  function isDark(): boolean {
    return currentTheme === 'dark'
  }

  function setTheme(mode: ThemeMode) {
    currentTheme = mode
    applyTheme(mode)
    localStorage.setItem(STORAGE_KEY, mode)
  }

  function toggleTheme() {
    setTheme(currentTheme === 'light' ? 'dark' : 'light')
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
    getTheme,
    isDark,
    setTheme,
    toggleTheme,
    initThemeListener,
  }
}
