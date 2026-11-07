<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ analyser: AnalyserNode | null; active: boolean }>()
const canvas = ref<HTMLCanvasElement | null>(null)
let raf = 0

function draw() {
  const c = canvas.value
  if (!c) return
  const g = c.getContext('2d')!
  const dpr = window.devicePixelRatio || 1
  const w = c.clientWidth
  const h = c.clientHeight
  if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr }
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  const color = getComputedStyle(c).color
  g.strokeStyle = color
  g.lineWidth = 2
  g.lineCap = 'round'
  g.beginPath()
  if (props.analyser && props.active) {
    const data = new Uint8Array(props.analyser.fftSize)
    props.analyser.getByteTimeDomainData(data)
    const step = Math.max(1, Math.floor(data.length / w))
    for (let x = 0; x < w; x++) {
      const v = (data[Math.min(data.length - 1, x * step)] - 128) / 128
      const y = h / 2 + v * (h / 2) * 1.6
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y)
    }
  } else {
    g.globalAlpha = 0.35
    g.moveTo(0, h / 2)
    g.lineTo(w, h / 2)
  }
  g.stroke()
  g.globalAlpha = 1
  raf = requestAnimationFrame(draw)
}

onMounted(() => { raf = requestAnimationFrame(draw) })
onBeforeUnmount(() => cancelAnimationFrame(raf))
watch(() => props.active, () => {})
</script>

<template>
  <canvas ref="canvas" class="h-16 w-full text-emerald2" aria-label="Microphone waveform" />
</template>
