<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  currentPath: string
}>()

const emit = defineEmits<{
  navigate: [path: string]
}>()

const inputPath = ref(props.currentPath)
const isEditing = ref(false)

watch(() => props.currentPath, (val) => {
  if (!isEditing.value) {
    inputPath.value = val
  }
})

function startEdit() {
  inputPath.value = props.currentPath
  isEditing.value = true
}

function commitPath() {
  isEditing.value = false
  const trimmed = inputPath.value.trim()
  if (trimmed && trimmed !== props.currentPath) {
    emit('navigate', trimmed)
  } else {
    inputPath.value = props.currentPath
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    commitPath()
  } else if (e.key === 'Escape') {
    isEditing.value = false
    inputPath.value = props.currentPath
  }
}

const segments = computed(() => {
  const parts = props.currentPath.split('/').filter(Boolean)
  let accumulated = ''
  return parts.map((name) => {
    accumulated += '/' + name
    return { name, path: accumulated }
  })
})

import { computed } from 'vue'
</script>

<template>
  <div class="path-bar">
    <div class="path-display" v-if="!isEditing" @click="startEdit">
      <svg class="path-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <div class="breadcrumb">
        <button class="breadcrumb-item" @click.stop="emit('navigate', '/')">/</button>
        <template v-for="(seg, idx) in segments" :key="seg.path">
          <svg class="breadcrumb-sep" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <button
            class="breadcrumb-item"
            :class="{ current: idx === segments.length - 1 }"
            @click.stop="emit('navigate', seg.path)"
          >{{ seg.name }}</button>
        </template>
      </div>
    </div>
    <div class="path-input-wrapper" v-else>
      <svg class="path-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <input
        ref="pathInput"
        class="path-input"
        v-model="inputPath"
        @keydown="handleKeydown"
        @blur="commitPath"
        spellcheck="false"
      />
    </div>
  </div>
</template>

<style scoped>
.path-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  background: var(--color-bg-elevated);
  backdrop-filter: var(--backdrop-blur);
  -webkit-backdrop-filter: var(--backdrop-blur);
  border-bottom: 1px solid var(--color-border);
}

.path-display,
.path-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 700px;
  width: 100%;
  padding: 6px 14px;
  border-radius: 10px;
  background: var(--color-bg-inset);
  border: 1.5px solid transparent;
  cursor: text;
  transition: all 0.2s ease;
}

.path-display:hover {
  border-color: var(--color-border-solid);
}

.path-input-wrapper {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-ghost);
  cursor: default;
}

.path-icon {
  flex-shrink: 0;
  color: var(--color-primary);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
  flex: 1;
}

.breadcrumb::-webkit-scrollbar {
  display: none;
}

.breadcrumb-item {
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.breadcrumb-item:hover {
  background: var(--color-bg-hover);
  color: var(--color-primary);
}

.breadcrumb-item.current {
  color: var(--color-text);
  font-weight: 600;
}

.breadcrumb-sep {
  flex-shrink: 0;
  color: var(--color-text-faint);
}

.path-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--color-text);
  font-size: 13px;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
}

.path-input::placeholder {
  color: var(--color-text-faint);
}
</style>
