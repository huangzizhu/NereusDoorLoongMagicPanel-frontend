<template>
  <div class="not-found">
    <div class="not-found-card">
      <h1 class="not-found-code">404</h1>
      <p class="not-found-text">Oops! Page not found</p>
      <router-link to="/" class="not-found-link">Go Home</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  padding: 32px;
}

.not-found-card {
  background: var(--color-bg-elevated);
  backdrop-filter: var(--backdrop-blur);
  -webkit-backdrop-filter: var(--backdrop-blur);
  border-radius: 24px;
  padding: 40px;
  box-shadow: var(--shadow-lg);
}

.not-found-code {
  font-size: 56px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 12px;
}

.not-found-text {
  font-size: 24px;
  color: var(--color-text-secondary);
  margin-bottom: 16px;
}

.not-found-link {
  display: inline-block;
  padding: 8px 24px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 999px;
  text-decoration: none;
  font-weight: 500;
  font-size: 14px;
  transition: background 0.2s ease;
}

.not-found-link:hover {
  background: var(--color-primary-dark);
}
</style>
