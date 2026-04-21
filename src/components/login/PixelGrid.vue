<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref<HTMLCanvasElement | null>(null)
let animFrameId = 0
let ctx: CanvasRenderingContext2D | null = null
let mouseX = -1000
let mouseY = -1000
let cols = 0
let rows = 0
let cachedImageData: ImageData | null = null

const CELL = 20
const GAP = 4
const STRIDE = CELL + GAP
const MOUSE_RADIUS = 150
const FALL_SPEED = 0.12

const SHAPES = [
    [[0,0],[1,0],[2,0],[3,0]],
    [[0,0],[1,0],[0,1],[1,1]],
    [[0,0],[1,0],[2,0],[1,1]],
    [[1,0],[2,0],[0,1],[1,1]],
    [[0,0],[1,0],[1,1],[2,1]],
    [[0,0],[0,1],[1,1],[2,1]],
    [[2,0],[0,1],[1,1],[2,1]],
]

let grid: Uint8Array
let flashGrid: Uint8Array
let leftFlags: Uint8Array | null = null

interface Piece {
    shapeIdx: number
    col: number
    row: number
}

let pieces: Piece[] = []
let spawnCounter = 0
const SPAWN_INTERVAL = 5

let clearingRows: Set<number> = new Set()
let clearFlashTimer = 0
const CLEAR_FLASH_DURATION = 18

let screenClearing = false
let screenClearProgress = 0

function spawnPiece(): Piece {
    const shapeIdx = Math.floor(Math.random() * SHAPES.length)
    const shape = SHAPES[shapeIdx]
    const maxColOff = shape.reduce((m, s) => Math.max(m, s[0]), 0)
    const maxRowOff = shape.reduce((m, s) => Math.max(m, s[1]), 0)
    const col = Math.floor(Math.random() * Math.max(1, cols - maxColOff - 1))
    return {
        shapeIdx,
        col,
        row: -maxRowOff - 1,
    }
}

function wouldCollide(shapeIdx: number, col: number, row: number): boolean {
    const shape = SHAPES[shapeIdx]
    const baseRow = Math.floor(row)
    for (const [dc, dr] of shape) {
        const r = baseRow + dr
        const c = col + dc
        if (r >= rows) return true
        if (r >= 0 && c >= 0 && c < cols && grid[r * cols + c] === 1) return true
    }
    return false
}

function settlePiece(p: Piece) {
    const shape = SHAPES[p.shapeIdx]
    for (const [dc, dr] of shape) {
        const r = p.row + dr
        const c = p.col + dc
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
            const idx = r * cols + c
            grid[idx] = 1
            flashGrid[idx] = 12
        }
    }
}

function update() {
    for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i]
        const newRow = p.row + FALL_SPEED
        if (!wouldCollide(p.shapeIdx, p.col, newRow)) {
            p.row = newRow
        } else {
            const settleRow = Math.floor(p.row)
            if (settleRow >= -2) {
                p.row = settleRow
                settlePiece(p)
            }
            pieces.splice(i, 1)
        }
    }

    pieces = pieces.filter(p => p.row < rows + 5)

    if (!screenClearing) {
        spawnCounter++
        if (spawnCounter >= SPAWN_INTERVAL) {
            spawnCounter = 0
            const count = 2 + Math.floor(Math.random() * 2)
            for (let i = 0; i < count; i++) {
                pieces.push(spawnPiece())
            }
        }
    }

    for (let i = 0; i < flashGrid.length; i++) {
        if (flashGrid[i] > 0) flashGrid[i]--
    }

    if (clearFlashTimer > 0) {
        clearFlashTimer--
        if (clearFlashTimer === 0) {
            const newGrid = new Uint8Array(rows * cols)
            const newFlash = new Uint8Array(rows * cols)
            let writeRow = rows - 1
            for (let r = rows - 1; r >= 0; r--) {
                if (!clearingRows.has(r)) {
                    for (let c = 0; c < cols; c++) {
                        newGrid[writeRow * cols + c] = grid[r * cols + c]
                        newFlash[writeRow * cols + c] = flashGrid[r * cols + c]
                    }
                    writeRow--
                }
            }
            grid = newGrid
            flashGrid = newFlash
            clearingRows.clear()
        }
    } else {
        for (let r = 0; r < rows; r++) {
            let filled = 0
            for (let c = 0; c < cols; c++) {
                if (grid[r * cols + c] === 1) filled++
            }
            if (filled >= cols * 0.85) {
                clearingRows.add(r)
            }
        }
        if (clearingRows.size > 0) {
            clearFlashTimer = CLEAR_FLASH_DURATION
        }
    }

    if (screenClearing) {
        screenClearProgress += 0.012
        if (screenClearProgress >= 1.15) {
            screenClearing = false
            screenClearProgress = 0
            grid.fill(0)
            flashGrid.fill(0)
            pieces = []
        }
    } else {
        const threshold = Math.floor(rows * 0.18)
        let shouldClear = false
        for (let r = 0; r < threshold && !shouldClear; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r * cols + c] === 1) { shouldClear = true; break }
            }
        }
        if (shouldClear) {
            screenClearing = true
            screenClearProgress = 0
            clearingRows.clear()
            clearFlashTimer = 0
        }
    }
}

function draw() {
    if (!ctx || !canvasRef.value || !leftFlags || !cachedImageData) return
    const c = ctx
    const w = canvasRef.value.width
    const h = canvasRef.value.height
    const data = cachedImageData.data

    data.fill(0)

    const dpr = window.devicePixelRatio || 1
    const mx = mouseX * dpr
    const my = mouseY * dpr
    const mr = MOUSE_RADIUS * dpr
    const mr2 = mr * mr
    const invMr = 1 / mr

    update()

    const flashOn = clearFlashTimer > 0 && (clearFlashTimer % 4 < 2)

    const maxRow = Math.min(rows, Math.floor((h - CELL) / STRIDE) + 1)
    const maxCol = Math.min(cols, Math.floor((w - CELL) / STRIDE) + 1)
    const halfCell = CELL * 0.5

    for (let row = 0; row < maxRow; row++) {
        const py = row * STRIDE
        for (let col = 0; col < maxCol; col++) {
            const px = col * STRIDE
            const fi = row * cols + col
            const settled = grid[fi] === 1
            const clearing = settled && clearingRows.has(row)

            const dx = px + halfCell - mx
            const dy = py + halfCell - my
            const dist2m = dx * dx + dy * dy
            const near = settled && dist2m < mr2

            const left = leftFlags[fi]
            let r: number, g: number, b: number, a: number

            if (screenClearing) {
                const clearLine = (1 - screenClearProgress) * rows
                const dist = row - clearLine
                if (dist > 4) {
                    if (left) { r = 255; g = 255; b = 255; a = 15 }
                    else { r = 0; g = 0; b = 0; a = 20 }
                } else if (dist > 0) {
                    const t = 1 - dist / 4
                    r = 255; g = 255; b = 255; a = (t * 255) | 0
                } else if (settled) {
                    if (near) {
                        r = 255; g = 200; b = 0
                        const d = Math.sqrt(dist2m)
                        a = (0.6 + 0.4 * (1 - d * invMr)) * 255 | 0
                    } else {
                        r = 255; g = 223; b = 100; a = 200
                    }
                } else {
                    if (left) { r = 255; g = 255; b = 255; a = 15 }
                    else { r = 0; g = 0; b = 0; a = 20 }
                }
            } else if (clearing && flashOn) {
                r = 255; g = 255; b = 255; a = 255
            } else if (near) {
                r = 255; g = 200; b = 0
                const d = Math.sqrt(dist2m)
                a = (0.6 + 0.4 * (1 - d * invMr)) * 255 | 0
            } else if (settled) {
                const fl = flashGrid[fi]
                if (fl > 0) {
                    const t = fl / 12
                    r = 255; g = (223 + 32 * t) | 0; b = (100 + 155 * t) | 0; a = 255
                } else {
                    r = 255; g = 223; b = 100; a = 200
                }
            } else {
                if (left) { r = 255; g = 255; b = 255; a = 15 }
                else { r = 0; g = 0; b = 0; a = 20 }
            }

            for (let cy = 0; cy < CELL; cy++) {
                const rowStart = ((py + cy) * w + px) << 2
                for (let cx = 0; cx < CELL; cx++) {
                    const idx = rowStart + (cx << 2)
                    data[idx] = r
                    data[idx + 1] = g
                    data[idx + 2] = b
                    data[idx + 3] = a
                }
            }
        }
    }

    for (const p of pieces) {
        for (const [dc, dr] of SHAPES[p.shapeIdx]) {
            const px = Math.round((p.col + dc) * STRIDE)
            const py = Math.round((p.row + dr) * STRIDE)

            if (py + CELL <= 0 || py >= h || px + CELL <= 0 || px >= w) continue

            const dx = px + halfCell - mx
            const dy = py + halfCell - my
            const dist2m = dx * dx + dy * dy
            const near = dist2m < mr2

            let r: number, g: number, b: number, a: number
            if (near) {
                r = 255; g = 200; b = 0
                const d = Math.sqrt(dist2m)
                a = (0.6 + 0.4 * (1 - d * invMr)) * 255 | 0
            } else {
                r = 255; g = 235; b = 130; a = 240
            }

            const startY = Math.max(0, py)
            const endY = Math.min(h, py + CELL)
            const startX = Math.max(0, px)
            const endX = Math.min(w, px + CELL)
            for (let cy = startY; cy < endY; cy++) {
                const rowStart = (cy * w) << 2
                for (let cx = startX; cx < endX; cx++) {
                    const idx = rowStart + (cx << 2)
                    data[idx] = r
                    data[idx + 1] = g
                    data[idx + 2] = b
                    data[idx + 3] = a
                }
            }
        }
    }

    c.putImageData(cachedImageData, 0, 0)
    animFrameId = requestAnimationFrame(draw)
}

function precompute() {
    const canvas = canvasRef.value
    if (!canvas) return
    const w = canvas.width
    const h = canvas.height
    const topX = w * 0.55
    const botX = w * 0.42
    const slope = (botX - topX) / h

    leftFlags = new Uint8Array(rows * cols)
    let idx = 0
    for (let r = 0; r < rows; r++) {
        const boundaryX = topX + slope * (r * STRIDE)
        for (let c = 0; c < cols; c++) {
            leftFlags[idx++] = (c * STRIDE < boundaryX) ? 1 : 0
        }
    }

    grid = new Uint8Array(rows * cols)
    flashGrid = new Uint8Array(rows * cols)
    pieces = []
    clearingRows = new Set()
    clearFlashTimer = 0
    screenClearing = false
    screenClearProgress = 0
    spawnCounter = 0
}

function initCanvas() {
    if (!canvasRef.value) return
    const canvas = canvasRef.value
    const container = canvas.parentElement
    if (!container) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = container.clientWidth * dpr
    canvas.height = container.clientHeight * dpr
    canvas.style.width = container.clientWidth + 'px'
    canvas.style.height = container.clientHeight + 'px'

    cols = Math.floor(canvas.width / STRIDE)
    rows = Math.floor(canvas.height / STRIDE)

    ctx = canvas.getContext('2d')!
    cachedImageData = ctx.createImageData(canvas.width, canvas.height)
    precompute()
    draw()
}

function handleResize() {
    if (animFrameId) cancelAnimationFrame(animFrameId)
    initCanvas()
}

function handleMouseMove(e: MouseEvent) {
    mouseX = e.clientX
    mouseY = e.clientY
}

function handleMouseLeave() {
    mouseX = -1000
    mouseY = -1000
}

onMounted(() => {
    initCanvas()
    window.addEventListener('resize', handleResize)
    window.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseleave', handleMouseLeave)
})

onUnmounted(() => {
    if (animFrameId) cancelAnimationFrame(animFrameId)
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseleave', handleMouseLeave)
})
</script>

<template>
    <canvas ref="canvasRef" class="pixel-grid-canvas" />
</template>

<style scoped>
.pixel-grid-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}
</style>
