import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './assets/styles/global.css'
import axios from 'axios'
import { useTheme } from './composables/useTheme'

const theme = useTheme()
theme.initThemeListener()

const app = createApp(App)

app.use(router)
app.mount('#app')

axios.defaults.withCredentials = true
