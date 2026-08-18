<template>
  <aside class="sidebar" :class="{ collapsed: isCollapsed }">
    <div class="sidebar-inner">
      <button class="collapse-btn" @click="toggleCollapse" :title="isCollapsed ? '展开菜单' : '收起菜单'">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <nav class="nav-sections">
        <div v-for="section in navSections" :key="section.label" class="nav-section">
          <div class="section-label" v-show="!isCollapsed">{{ section.label }}</div>
          <ul class="nav-list">
            <li v-for="item in section.items" :key="item.path">
              <router-link :to="item.path" class="nav-link" active-class="active">
                <span class="nav-icon" v-html="item.icon"></span>
                <Transition name="fade">
                  <span class="nav-text" v-show="!isCollapsed">{{ item.name }}</span>
                </Transition>
              </router-link>
            </li>
          </ul>
        </div>
      </nav>

    </div>
  </aside>
</template>

<script setup lang="ts">
import { useSidebarState } from '../composables/useSidebarState'

interface NavItem {
  path: string
  name: string
  icon: string
}

interface NavSection {
  label: string
  items: NavItem[]
}

const { isCollapsed, toggleCollapse } = useSidebarState()

const svgHome = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'
const svgFile = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
const svgShield = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l7 3v6c0 5-3.5 9-7 11-3.5-2-7-6-7-11V5l7-3z"/><path d="M9 12l2 2 4-4"/></svg>'
const svgProcess = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3"/><path d="M15 1v3"/><path d="M9 20v3"/><path d="M15 20v3"/><path d="M20 9h3"/><path d="M20 14h3"/><path d="M1 9h3"/><path d="M1 14h3"/></svg>'
const svgTerminal = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>'
const svgDocker = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h3v3H4z"/><path d="M8 10h3v3H8z"/><path d="M12 10h3v3h-3z"/><path d="M8 6h3v3H8z"/><path d="M12 6h3v3h-3z"/><path d="M16 10h2.5c.7 0 1.4-.2 1.9-.6l.6-.4c.3 1.2.1 2.5-.5 3.5-.9 1.6-2.7 2.5-4.5 2.5H10c-2.9 0-5.4-2-6-4.8V10"/></svg>'
const svgDatabase = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.66 3.13 3 7 3s7-1.34 7-3V5"/><path d="M5 11v8c0 1.66 3.13 3 7 3s7-1.34 7-3v-8"/></svg>'
const svgNginx = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 6.5v11L12 22l8-4.5v-11L12 2Z"/><path d="M9 16V8l6 8V8"/></svg>'
const svgBot = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>'
const svgSchedule = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4"/><path d="M16 2v4"/><path d="M3 10h18"/><path d="M12 14v3l2 1"/></svg>'
const svgOpsBook = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
const svgSettings = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'

const navSections: NavSection[] = [
  {
    label: '概览',
    items: [
      { path: '/', name: '首页', icon: svgHome },
    ]
  },
  {
    label: '功能',
    items: [
      { path: '/file', name: '文件管理', icon: svgFile },
      { path: '/firewall', name: '防火墙', icon: svgShield },
      { path: '/process', name: '进程管理', icon: svgProcess },
      { path: '/terminal', name: '终端', icon: svgTerminal },
      { path: '/docker', name: 'Docker 管理', icon: svgDocker },
      { path: '/database', name: '数据库管理', icon: svgDatabase },
      { path: '/nginx', name: 'Nginx 管理', icon: svgNginx },
    ]
  },
  {
    label: 'AI 功能',
    items: [
      { path: '/agent', name: 'Agent 对话', icon: svgBot },
      { path: '/scheduled-inspection', name: '任务巡检', icon: svgSchedule },
      { path: '/ops-experience', name: '运维经验库', icon: svgOpsBook },
    ]
  },
  {
    label: '系统',
    items: [
      { path: '/settings', name: '设置', icon: svgSettings },
    ]
  },
]
</script>

<style scoped>
.sidebar {
  position: fixed;
  top: 60px;
  left: 0;
  bottom: 0;
  width: var(--sidebar-width);
  z-index: 150;
  background: var(--color-bg-elevated);
  backdrop-filter: var(--backdrop-blur);
  -webkit-backdrop-filter: var(--backdrop-blur);
  border-right: 1px solid var(--color-border);
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), background 0.3s ease;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar.collapsed {
  width: var(--sidebar-collapsed-width);
}

.sidebar-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px 12px;
  gap: 4px;
}

.collapse-btn {
  align-self: flex-end;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
  margin-bottom: 8px;
}

.collapse-btn:hover {
  background: var(--color-primary-ghost);
  color: var(--color-primary);
}

.sidebar.collapsed .collapse-btn {
  align-self: center;
}

.nav-sections {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-right: 4px;
}

.nav-sections::-webkit-scrollbar {
  width: 3px;
}

.nav-sections::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 3px;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 0 12px;
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
}

.nav-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  text-decoration: none;
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
  overflow: hidden;
  position: relative;
}

.nav-link:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.nav-link.active {
  background: var(--color-bg-active);
  color: var(--color-primary);
  font-weight: 600;
}

.nav-link.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, var(--color-gradient-start), var(--color-gradient-end));
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

.nav-icon :deep(svg) {
  width: 20px;
  height: 20px;
}

.nav-link.active .nav-icon :deep(svg) {
  stroke: var(--color-primary);
}

.nav-text {
  overflow: hidden;
}

.fade-enter-active {
  transition: opacity 0.2s ease 0.1s;
}
.fade-leave-active {
  transition: opacity 0.1s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .sidebar {
    width: var(--sidebar-collapsed-width);
  }
  .section-label,
  .nav-text {
    display: none;
  }
  .collapse-btn {
    align-self: center;
  }
}
</style>
