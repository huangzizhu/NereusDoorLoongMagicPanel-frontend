<script setup lang="ts">
import { useNotification } from '../../composables/useNotification'
import NotificationCard from './NotificationCard.vue'

const { notifications } = useNotification()
</script>

<template>
  <div class="notification-container">
    <TransitionGroup name="notification">
      <NotificationCard
        v-for="item in notifications"
        :key="item.id"
        :notification="item"
      />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notification-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
  max-width: 380px;
  width: 100%;
}

.notification-enter-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.notification-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 1, 1);
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(80px) scale(0.95);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(40px) scale(0.95);
}

.notification-move {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
</style>
