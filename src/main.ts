import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './assets/styles/global.css'
import { useTheme } from './composables/useTheme'

const theme = useTheme()
theme.initThemeListener()

const app = createApp(App)

app.use(router)
app.mount('#app')
