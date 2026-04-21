import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

// 定义路由规则
const routes: Array<RouteRecordRaw> = [
    {
        path: '/',
        name: 'Home',
        component: () => import('../views/Home.vue') // 懒加载
    },
    // {
    //     path: '/about',
    //     name: 'About',
    //     component: () => import('../views/About.vue')
    // },
    // // 嵌套路由示例
    // {
    //     path: '/user',
    //     name: 'User',
    //     component: () => import('../views/User.vue'),
    //     children: [
    //         {
    //             path: 'profile',
    //             name: 'UserProfile',
    //             component: () => import('../views/UserProfile.vue')
    //         },
    //         {
    //             path: 'settings',
    //             name: 'UserSettings',
    //             component: () => import('../views/UserSettings.vue')
    //         }
    //     ]
    // },
    // 404 页面
    {
        path: '/:pathMatch(.*)*',
        name: 'NotFound',
        component: () => import('../views/NotFound.vue')
    }
]

// 创建 router 实例
const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes
})

export default router