import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',  // 后端服务地址
        changeOrigin: true,  // 如果后端是不同域名，设置为true
        rewrite: (path) => path.replace(/^\/api/, ''),  // 重写路径
      },
    },
    port: 8001,
    host: '0.0.0.0',
  },
})
