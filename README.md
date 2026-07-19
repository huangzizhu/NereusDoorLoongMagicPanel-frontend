# Nereus Door Loong Magic Panel Frontend

这是 `Nereus Door Loong Magic Panel` 的前端仓库，基于 Vue 3、Vite 和 TypeScript 开发，用于提供统一的服务器运维管理界面。

前端主要负责页面展示与交互，后端负责核心业务逻辑、接口、鉴权和系统能力接入。

## 项目简介

这个项目是一个面向服务器管理场景的 Web 面板，当前前端已包含以下主要能力对应的页面与交互：

- 登录鉴权
- 首页状态概览
- 文件管理
- 终端管理
- 进程管理
- Docker 管理
- 数据库管理
- Nginx 管理
- 防火墙管理
- 定时巡检
- Agent 对话
- 系统设置与模型 / API Key 配置

整体上，这是一个“前端控制台”仓库，实际功能是否可用取决于后端接口与运行环境。

## 技术栈

- Vue 3
- Vite
- TypeScript
- Vue Router
- Axios
- CodeMirror
- xterm.js

## 本地开发

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

默认开发地址：

- 前端：`http://localhost:8001`
- 本地代理：`/api` -> `http://localhost:8000`

生产构建：

```bash
npm run build
```

## 目录说明

```text
src/
├── api/            # 各模块接口封装
├── components/     # 通用组件与业务组件
├── composables/    # 复用逻辑
├── router/         # 路由配置与鉴权拦截
├── types/          # 类型定义
├── utils/          # 请求、错误处理、markdown 等工具
└── views/          # 页面视图
```

## 文档说明

这个仓库仅保留简要说明。

项目的主要文档、后端部署方式、接口设计、系统能力说明，请移步后端仓库：

- 后端仓库：<https://github.com/huangzizhu/NereusDoorLoongMagicPanel-backend>
