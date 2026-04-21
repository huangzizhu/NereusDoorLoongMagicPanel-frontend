# Vue3 + Vite + TypeScript 前端项目模板

一个开箱即用的 Vue3 前端基础模板，集成 Vite、TypeScript、Vue Router、Axios 封装，内置标准布局组件与主题系统，支持快速开发页面。

## ✨ 特性

- **极速开发**：基于 Vite 构建，热更新速度快
- **类型安全**：完整支持 TypeScript
- **路由集成**：已配置 Vue Router，直接使用
- **请求封装**：Axios 统一封装，支持接口代理
- **标准布局**：内置 TopBar + Sidebar 固定布局，支持侧边栏折叠
- **主题系统**：内置 Light / Dark 双主题，支持一键切换与系统偏好跟随
- **全局样式**：CSS 变量驱动的全局样式管理，易于扩展新主题
- **开箱即用**：无需额外配置，克隆后直接开发

## 📦 技术栈

- **框架**：Vue 3 + Composition API
- **构建工具**：Vite
- **语言**：TypeScript
- **路由**：Vue Router
- **请求库**：Axios（已封装）

## 📁 项目结构

```
src/
├── assets/
│   └── styles/
│       ├── variables.css    # CSS 变量定义（Light / Dark 主题变量）
│       └── global.css       # 全局基础样式（reset、滚动条、body 等）
├── components/
│   ├── TopBar.vue           # 顶部导航栏（品牌、时间、主题切换、用户菜单）
│   └── SideBar.vue          # 侧边栏（分组导航、折叠/展开）
├── composables/
│   ├── useTheme.ts          # 主题切换 composable
│   └── useSidebarState.ts   # 侧边栏折叠状态 composable
├── router/
│   └── index.ts             # 路由配置
├── utils/
│   └── request.ts           # Axios 请求封装
├── views/
│   └── NotFound.vue         # 404 页面
├── App.vue                  # 根布局组件
└── main.ts                  # 项目入口
```

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/huangzizhu/vue-template
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动开发服务

```bash
npm run dev
```

- 开发地址：`http://localhost:8001`
- 后端接口代理已配置，前端请求 `/api/xxx` 自动转发到后端 `http://localhost:8000`

### 4. 生产构建

```bash
npm run build
```

## 📝 核心配置说明

### 1. 路由配置（src/router/index.ts）

已完成基础路由配置，直接添加路由规则即可使用。

### 2. 请求封装（src/utils/request.ts）

统一封装 Axios，支持请求/响应拦截、错误处理，直接导入使用：

```typescript
import request from '@/utils/request'

// 示例请求
request.get('/api/user/list')
request.post('/api/user/add', { name: 'test' })
```

### 3. 布局与页面开发（src/App.vue）

已内置 **TopBar + Sidebar** 标准布局，**无需修改布局代码**：

- TopBar 包含品牌标识、实时时间、主题切换开关、用户头像下拉菜单
- Sidebar 支持分组导航、折叠/展开，折叠后仅显示图标
- 只需要在 Sidebar 的 `navSections` 中添加菜单项和路由配置
- 新建页面组件后，配置路由即可快速接入系统

### 4. 主题系统

项目通过 CSS 变量 + `data-theme` 属性实现主题切换，预置了 **Light** 和 **Dark** 两套主题。

**样式文件：**

- `src/assets/styles/variables.css` — 定义所有 CSS 变量，包括颜色、阴影、间距、布局尺寸等，Light 主题为默认值，Dark 主题通过 `[data-theme="dark"]` 覆盖
- `src/assets/styles/global.css` — 全局 reset、body 样式、滚动条样式等

**切换主题：**

使用 `useTheme` composable 进行主题切换：

```typescript
import { useTheme } from '@/composables/useTheme'

const theme = useTheme()

theme.toggleTheme()          // 切换 Light / Dark
theme.setTheme('dark')       // 设置为 Dark
theme.setTheme('light')      // 设置为 Light
theme.isDark()               // 判断当前是否为 Dark
theme.getTheme()             // 获取当前主题名
theme.initThemeListener()    // 监听系统主题偏好变化（可选）
```

**特性：**

- 主题偏好自动持久化到 `localStorage`，刷新后保持用户选择
- 未手动设置时，自动跟随系统 `prefers-color-scheme` 偏好
- TopBar 内置主题切换开关，带有太阳/月亮动画效果

### 5. 侧边栏状态管理

使用 `useSidebarState` composable 管理侧边栏折叠状态：

```typescript
import { useSidebarState } from '@/composables/useSidebarState'

const { isCollapsed, toggleCollapse } = useSidebarState()
```

- 折叠状态在组件间共享（基于模块级 `ref`）
- 移动端（≤768px）自动折叠侧边栏

### 6. 服务代理（vite.config.ts）

已配置接口代理和服务端口：

- 前端端口：`8001`
- 后端代理：`/api` → `http://localhost:8000`
- 支持跨域访问，本地开发无需处理跨域

## 🎯 快速新增页面

1. 在 `src/views/` 新建页面组件（如 `Home.vue`）
2. 在 `src/router/index.ts` 添加路由规则
3. 在 `src/components/SideBar.vue` 的 `navSections` 中添加菜单项
4. 重启服务，即可访问新页面
