<script setup lang="ts">
import { useLoadingOverlay } from '../composables/useLoadingOverlay'

const { isVisible } = useLoadingOverlay()
</script>

<template>
  <Transition name="overlay">
    <div v-if="isVisible" class="loading-overlay">
      <div class="spinner">
        <div class="spinner-cube"></div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-elevated);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
}

.spinner {
  perspective: 200px;
}

.spinner-cube {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--color-gradient-start), var(--color-gradient-end));
  box-shadow: 0 4px 16px var(--color-primary-shadow);
  animation: bounce-rotate 1.2s ease-in-out infinite;
}

@keyframes bounce-rotate {
  0% {
    transform: translateY(0) rotate(0deg) scale(1);
  }
  25% {
    transform: translateY(-20px) rotate(90deg) scale(0.9);
  }
  50% {
    transform: translateY(0) rotate(180deg) scale(1);
  }
  75% {
    transform: translateY(-10px) rotate(270deg) scale(0.95);
  }
  100% {
    transform: translateY(0) rotate(360deg) scale(1);
  }
}

.overlay-enter-active {
  transition: opacity 0.25s ease;
}

.overlay-leave-active {
  transition: opacity 0.3s ease;
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}
</style>
