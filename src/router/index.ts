import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import axios from 'axios'

const routes: Array<RouteRecordRaw> = [
    {
        path: '/login',
        name: 'Login',
        component: () => import('../views/Login.vue'),
        meta: { requiresAuth: false }
    },
    {
        path: '/',
        name: 'Home',
        component: () => import('../views/Home.vue'),
        meta: { requiresAuth: true }
    },
    {
        path: '/:pathMatch(.*)*',
        name: 'NotFound',
        component: () => import('../views/NotFound.vue')
    }
]

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes
})

let authChecked = false

async function checkAuth(): Promise<boolean> {
    try {
        await axios.post('/api/user/refresh', {}, { withCredentials: true })
        return true
    } catch {
        return false
    }
}

router.beforeEach(async (to, _from, next) => {
    if (to.meta.requiresAuth === false) {
        next()
        return
    }

    if (!authChecked) {
        authChecked = true
        const isAuth = await checkAuth()
        if (!isAuth) {
            next({ name: 'Login' })
            return
        }
    }

    next()
})

export function markAuthChecked() {
    authChecked = true
}

export function resetAuthChecked() {
    authChecked = false
}

export default router
