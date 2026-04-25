import { ref } from 'vue'

export type NotificationType = 'info' | 'warning' | 'error'

export interface Notification {
  id: number
  type: NotificationType
  title: string
  message?: string
  duration: number
}

const notifications = ref<Notification[]>([])
let nextId = 0

export function useNotification() {
  function notify(type: NotificationType, title: string, message?: string, duration = 5000) {
    const id = nextId++
    notifications.value.push({ id, type, title, message, duration })
    return id
  }

  function info(title: string, message?: string, duration?: number) {
    return notify('info', title, message, duration)
  }

  function warning(title: string, message?: string, duration?: number) {
    return notify('warning', title, message, duration)
  }

  function error(title: string, message?: string, duration?: number) {
    return notify('error', title, message, duration)
  }

  function remove(id: number) {
    notifications.value = notifications.value.filter(n => n.id !== id)
  }

  return {
    notifications,
    notify,
    info,
    warning,
    error,
    remove,
  }
}
