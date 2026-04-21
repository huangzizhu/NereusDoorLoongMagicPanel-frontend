<script setup lang="ts">
import { reactive, onMounted, onUnmounted } from 'vue'
import PixelGrid from '../components/login/PixelGrid.vue'
import LoginForm from '../components/login/LoginForm.vue'

const parallax = reactive({ x: 0, y: 0 })

function handleMouseMove(e: MouseEvent) {
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    parallax.x = (e.clientX - cx) / cx
    parallax.y = (e.clientY - cy) / cy
}

onMounted(() => {
    window.addEventListener('mousemove', handleMouseMove)
})

onUnmounted(() => {
    window.removeEventListener('mousemove', handleMouseMove)
})
</script>

<template>
    <div class="login-page">
        <div class="login-left" :style="{
            transform: `translate(${parallax.x * -8}px, ${parallax.y * -8}px)`
        }">
            <PixelGrid />
            <div class="haze haze-left" />
            <div class="brand-content" :style="{
                transform: `translate(${parallax.x * -15}px, ${parallax.y * -15}px)`
            }">
                <h1 class="brand-title">驭门龙</h1>
                <p class="brand-subtitle">运维面板</p>
                <div class="brand-divider" />
                <p class="brand-desc">NereusDoor Loong Magic Panel</p>
            </div>
        </div>

        <div class="login-right" :style="{
            transform: `translate(${parallax.x * 4}px, ${parallax.y * 4}px)`
        }">
            <PixelGrid />
            <div class="haze haze-right" />
        </div>

        <div class="diagonal-divider" :style="{
            transform: `translate(${parallax.x * -3}px, ${parallax.y * -3}px)`
        }">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="rgba(255, 200, 50, 0.6)" />
                        <stop offset="50%" stop-color="rgba(255, 215, 0, 0.8)" />
                        <stop offset="100%" stop-color="rgba(255, 200, 50, 0.6)" />
                    </linearGradient>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                <line x1="55" y1="0" x2="42" y2="100" stroke="url(#lineGrad)" stroke-width="0.4" filter="url(#glow)" />
                <line x1="55" y1="0" x2="42" y2="100" stroke="rgba(255, 220, 100, 0.15)" stroke-width="1.2" />
            </svg>
        </div>

        <div class="form-center-anchor">
            <div class="form-parallax-layer" :style="{
                transform: `translate(${parallax.x * -2}px, ${parallax.y * -2}px)`
            }">
                <LoginForm />
            </div>
        </div>
    </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@600;900&family=Inter:wght@400;500;600&display=swap');

.login-page {
    width: 100vw;
    height: 100vh;
    position: relative;
    overflow: hidden;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

.login-left {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #0a0e1a 0%, #0f172a 30%, #1a1040 60%, #0c1445 100%);
    z-index: 1;
    will-change: transform;
    transition: transform 0.15s ease-out;
    clip-path: polygon(0 0, 55% 0, 42% 100%, 0 100%);
}

.brand-content {
    position: absolute;
    bottom: 12%;
    left: 8%;
    z-index: 3;
    will-change: transform;
    transition: transform 0.15s ease-out;
}

.haze {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2;
}

.haze-left {
    background:
        radial-gradient(ellipse at 30% 50%, rgba(10, 14, 26, 0.5) 0%, transparent 70%),
        linear-gradient(135deg, rgba(10, 14, 26, 0.55) 0%, rgba(15, 23, 42, 0.4) 50%, rgba(26, 16, 64, 0.5) 100%);
}

.haze-right {
    background:
        radial-gradient(ellipse at 70% 50%, rgba(250, 251, 252, 0.6) 0%, transparent 70%),
        linear-gradient(135deg, rgba(250, 251, 252, 0.5) 0%, rgba(250, 251, 252, 0.4) 100%);
}

.brand-title {
    font-family: 'Noto Serif SC', serif;
    font-size: 4rem;
    font-weight: 900;
    color: #ffd700;
    letter-spacing: 0.15em;
    line-height: 1.1;
    text-shadow:
        0 0 30px rgba(255, 215, 0, 0.3),
        0 0 60px rgba(255, 215, 0, 0.1);
}

.brand-subtitle {
    font-family: 'Noto Serif SC', serif;
    font-size: 2rem;
    font-weight: 600;
    color: rgba(255, 235, 150, 0.85);
    letter-spacing: 0.3em;
    margin-top: 0.5rem;
}

.brand-divider {
    width: 60px;
    height: 3px;
    background: linear-gradient(90deg, #ffd700, transparent);
    margin: 1.5rem 0;
    border-radius: 2px;
}

.brand-desc {
    font-size: 0.85rem;
    color: rgba(180, 180, 220, 0.5);
    letter-spacing: 0.2em;
    text-transform: uppercase;
    font-weight: 500;
}

.login-right {
    position: absolute;
    right: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background: #fafbfc;
    z-index: 0;
    will-change: transform;
    transition: transform 0.15s ease-out;
    clip-path: polygon(55% 0, 100% 0, 100% 100%, 42% 100%);
}

.diagonal-divider {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    z-index: 5;
    pointer-events: none;
    will-change: transform;
    transition: transform 0.15s ease-out;
}

.diagonal-divider svg {
    width: 100%;
    height: 100%;
}

.form-center-anchor {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    pointer-events: none;
}

.form-parallax-layer {
    pointer-events: auto;
    will-change: transform;
    transition: transform 0.15s ease-out;
}

@media (max-width: 900px) {
    .login-left {
        clip-path: none;
        width: 100%;
    }

    .login-right {
        display: none;
    }

    .diagonal-divider {
        display: none;
    }

    .brand-content {
        bottom: auto;
        top: 5%;
        left: 50%;
        transform: translateX(-50%);
        text-align: center;
    }

    .brand-title {
        font-size: 2.5rem;
    }

    .brand-subtitle {
        font-size: 1.2rem;
    }

    .brand-divider {
        margin: 1rem auto;
    }
}
</style>
