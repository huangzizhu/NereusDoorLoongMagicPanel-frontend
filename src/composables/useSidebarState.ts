import { ref } from 'vue'

const isCollapsed = ref(false)

export function useSidebarState() {
  const toggleCollapse = () => {
    isCollapsed.value = !isCollapsed.value
  }

  return {
    isCollapsed,
    toggleCollapse,
  }
}
