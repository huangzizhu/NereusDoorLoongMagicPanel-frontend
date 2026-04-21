<script setup lang="ts">
import Sidebar from './components/SideBar.vue'
import TopBar from "./components/TopBar.vue"
import { useSidebarState } from './composables/useSidebarState'

const { isCollapsed } = useSidebarState()
</script>

<template>
  <div class="app-container">
    <TopBar />
    <Sidebar />
    <main class="content-container" :class="{ 'sidebar-collapsed': isCollapsed }">
      <router-view />
    </main>
  </div>
</template>

<style>
.app-container {
  width: 100vw;
  height: 100vh;
  background: var(--color-bg);
  position: relative;
  overflow: hidden;
}

.content-container {
  width: 100vw;
  height: 100vh;
  padding-top: var(--topbar-height);
  padding-left: var(--sidebar-width);
  background: var(--color-bg);
  overflow-y: auto;
  transition: padding-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.content-container.sidebar-collapsed {
  padding-left: var(--sidebar-collapsed-width);
}

@media (max-width: 768px) {
  .content-container {
    padding-left: var(--sidebar-collapsed-width);
  }
}
</style>
