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

      <div class="sidebar-footer" v-show="!isCollapsed">
        <div class="footer-hint">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>在 navSections 中添加页面</span>
        </div>
      </div>
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
const svgDashboard = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>'
const svgTable = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>'
const svgForm = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>'
const svgUser = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
const svgSettings = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'

const navSections: NavSection[] = [
  {
    label: '概览',
    items: [
      { path: '/', name: '首页', icon: svgHome },
      { path: '/dashboard', name: '仪表盘', icon: svgDashboard },
    ]
  },
  {
    label: '功能',
    items: [
      { path: '/table', name: '表格', icon: svgTable },
      { path: '/form', name: '表单', icon: svgForm },
    ]
  },
  {
    label: '系统',
    items: [
      { path: '/profile', name: '个人中心', icon: svgUser },
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

.sidebar-footer {
  flex-shrink: 0;
  padding-top: 12px;
  border-top: 1px solid var(--color-divider);
}

.footer-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-text-faint);
  padding: 8px 12px;
  line-height: 1.4;
}

@media (max-width: 768px) {
  .sidebar {
    width: var(--sidebar-collapsed-width);
  }
  .section-label,
  .nav-text,
  .sidebar-footer {
    display: none;
  }
  .collapse-btn {
    align-self: center;
  }
}
</style>
