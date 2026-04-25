import { ref } from 'vue'

const isVisible = ref(false)

export function useLoadingOverlay() {
  function show() {
    isVisible.value = true
  }

  function hide() {
    isVisible.value = false
  }

  return {
    isVisible,
    show,
    hide,
  }
}
