<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { markAuthChecked } from '../../router'
import { login } from '../../api/user'
import { useNotification } from '../../composables/useNotification'

const emit = defineEmits<{
    (e: 'login-success'): void
}>()

const router = useRouter()
const notification = useNotification()

const form = reactive({
    account: '',
    password: '',
})
const loading = ref(false)
const errorMsg = ref('')
const showPassword = ref(false)

async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function handleLogin() {
    if (!form.account || !form.password) {
        errorMsg.value = '请输入用户名和密码'
        return
    }

    loading.value = true
    errorMsg.value = ''

    try {
        const hashedPassword = await hashPassword(form.password)
        const res = await login({ account: form.account, hashedPassword })
        if (res.data.code === 1) {
            notification.info('登录成功', '欢迎回来')
            markAuthChecked()
            emit('login-success')
            router.push('/')
        } else {
            errorMsg.value = res.data.msg || '登录失败'
            notification.error('登录失败', res.data.msg || '请检查用户名和密码')
        }
    } catch (err: any) {
        const data = err?.response?.data
        if (data?.msg) {
            errorMsg.value = data.msg
            notification.error('登录失败', data.msg)
        } else {
            errorMsg.value = '登录失败，请稍后重试'
            notification.error('登录失败', '网络异常，请稍后重试')
        }
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <div class="login-card">
        <div class="card-glow" />
        <div class="form-header">
            <div class="form-icon">
                <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 4L24 14L35 14L26 21L29 32L20 25L11 32L14 21L5 14L16 14Z"
                          fill="url(#iconGrad)" />
                    <defs>
                        <linearGradient id="iconGrad" x1="5" y1="4" x2="35" y2="32">
                            <stop offset="0%" stop-color="#FFD700" />
                            <stop offset="100%" stop-color="#FF8C00" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>
            <h2 class="form-title">欢迎回来</h2>
            <p class="form-subtitle">登录驭门龙运维面板</p>
        </div>

        <form class="login-form" @submit.prevent="handleLogin">
            <div class="form-group">
                <label class="form-label">账号</label>
                <div class="input-wrapper">
                    <svg class="input-icon" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 10a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0H3z" />
                    </svg>
                    <input
                        v-model="form.account"
                        type="text"
                        class="form-input"
                        placeholder="用户名或邮箱"
                        autocomplete="username"
                    />
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">密码</label>
                <div class="input-wrapper">
                    <svg class="input-icon" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" />
                    </svg>
                    <input
                        v-model="form.password"
                        :type="showPassword ? 'text' : 'password'"
                        class="form-input"
                        placeholder="请输入密码"
                        autocomplete="current-password"
                    />
                    <button type="button" class="toggle-password" @click="showPassword = !showPassword">
                        <svg v-if="!showPassword" viewBox="0 0 20 20" fill="currentColor" class="eye-icon">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
                        </svg>
                        <svg v-else viewBox="0 0 20 20" fill="currentColor" class="eye-icon">
                            <path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd" />
                            <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                        </svg>
                    </button>
                </div>
            </div>

            <transition name="error-fade">
                <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
            </transition>

            <button type="submit" class="submit-btn" :disabled="loading">
                <span v-if="!loading">登 录</span>
                <span v-else class="loading-spinner" />
            </button>
        </form>

        <div class="form-footer">
            <span class="footer-text">驭门龙运维面板 v1.0</span>
        </div>
    </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@600;900&family=Inter:wght@400;500;600&display=swap');

.login-card {
    width: 400px;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border-radius: 20px;
    padding: 40px 36px 32px;
    box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.08),
        0 2px 8px rgba(0, 0, 0, 0.04),
        0 0 0 1px rgba(255, 255, 255, 0.6);
    position: relative;
    overflow: hidden;
}

.card-glow {
    position: absolute;
    top: -1px;
    left: 20%;
    right: 20%;
    height: 3px;
    background: linear-gradient(90deg, transparent, #ffd700, #ff8c00, #ffd700, transparent);
    border-radius: 0 0 4px 4px;
}

.form-header {
    text-align: center;
    margin-bottom: 32px;
}

.form-icon {
    width: 48px;
    height: 48px;
    margin: 0 auto 16px;
}

.form-icon svg {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 2px 8px rgba(255, 200, 0, 0.3));
}

.form-title {
    font-family: 'Noto Serif SC', serif;
    font-size: 1.6rem;
    font-weight: 600;
    color: #1a1a2e;
    margin-bottom: 4px;
}

.form-subtitle {
    font-size: 0.85rem;
    color: #94a3b8;
    font-weight: 400;
}

.login-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.form-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #475569;
    letter-spacing: 0.05em;
}

.input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
}

.input-icon {
    position: absolute;
    left: 14px;
    width: 16px;
    height: 16px;
    color: #94a3b8;
    pointer-events: none;
    transition: color 0.2s;
}

.form-input {
    width: 100%;
    height: 46px;
    padding: 0 14px 0 42px;
    border: 1.5px solid #e2e8f0;
    border-radius: 12px;
    font-size: 0.9rem;
    color: #1e293b;
    background: #f8fafc;
    outline: none;
    transition: all 0.2s ease;
    font-family: inherit;
}

.form-input::placeholder {
    color: #cbd5e1;
}

.form-input:hover {
    border-color: #cbd5e1;
    background: #fff;
}

.form-input:focus {
    border-color: #ffd700;
    background: #fff;
    box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.1);
}

.input-wrapper:focus-within .input-icon {
    color: #d4a000;
}

.toggle-password {
    position: absolute;
    right: 12px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.eye-icon {
    width: 18px;
    height: 18px;
    color: #94a3b8;
    transition: color 0.2s;
}

.toggle-password:hover .eye-icon {
    color: #64748b;
}

.error-msg {
    font-size: 0.8rem;
    color: #ef4444;
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.06);
    border-radius: 8px;
    border: 1px solid rgba(239, 68, 68, 0.1);
    margin: 0;
}

.error-fade-enter-active,
.error-fade-leave-active {
    transition: all 0.25s ease;
}

.error-fade-enter-from,
.error-fade-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

.submit-btn {
    width: 100%;
    height: 48px;
    border: none;
    border-radius: 12px;
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0.15em;
    color: #0a0e1a;
    background: linear-gradient(135deg, #ffd700 0%, #ffb800 50%, #ff9500 100%);
    cursor: pointer;
    transition: all 0.25s ease;
    position: relative;
    overflow: hidden;
    margin-top: 4px;
    font-family: inherit;
}

.submit-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
    transition: left 0.5s ease;
}

.submit-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(255, 200, 0, 0.35);
}

.submit-btn:hover:not(:disabled)::before {
    left: 100%;
}

.submit-btn:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(255, 200, 0, 0.25);
}

.submit-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
}

.loading-spinner {
    display: inline-block;
    width: 22px;
    height: 22px;
    border: 2.5px solid rgba(10, 14, 26, 0.2);
    border-top-color: #0a0e1a;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.form-footer {
    text-align: center;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid #f1f5f9;
}

.footer-text {
    font-size: 0.72rem;
    color: #cbd5e1;
    letter-spacing: 0.05em;
}
</style>
