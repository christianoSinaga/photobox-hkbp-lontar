<script setup>
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { DEFAULT_TRANSFORM, MIN_ZOOM, MAX_ZOOM, drawComposition, panTransform } from '../lib/compose.js'
import { FILTERS, filterCss } from '../lib/filters.js'
import TimerBadge from './TimerBadge.vue'

const ZOOM_STEP = 0.25

const props = defineProps({
  templates: { type: Array, required: true },
  initialTemplateId: { type: String, default: '' },
  /** Salinan kecil foto (canvas) untuk preview. */
  shots: { type: Array, required: true },
  /** Thumbnail data URL, urutannya sama dengan shots. */
  thumbs: { type: Array, required: true },
  /** Sisa waktu edit (detik); waktu habis ditangani oleh induk lewat finish(). */
  secondsLeft: { type: Number, default: 0 },
  secondsTotal: { type: Number, default: 0 },
})
const emit = defineEmits(['save'])

const template = shallowRef(props.templates.find((t) => t.id === props.initialTemplateId) ?? props.templates[0])
const assignment = ref([]) // assignment[slot] = indeks foto
const transforms = ref([]) // transforms[slot] = posisi, zoom, dan arah balik foto di slot itu
const activeSlot = ref(0)
const filterId = ref('normal')
const tab = ref('foto')

const stageEl = ref(null)
const canvasEl = ref(null)
const canvasSize = ref({ width: 0, height: 0 })

const slotShots = computed(() => assignment.value.map((i) => (i == null ? null : props.shots[i])))
const complete = computed(() => assignment.value.every((i) => i != null))
const sampleThumb = computed(() => props.thumbs[assignment.value[activeSlot.value] ?? 0])

/** Isi slot template baru; pertahankan pilihan foto lama sebisa mungkin. */
function applyTemplate(t, previous = []) {
  const used = new Set()
  const next = t.slots.map((_, i) => {
    const p = previous[i]
    if (p != null && !used.has(p)) {
      used.add(p)
      return p
    }
    return null
  })
  let cursor = 0
  for (let i = 0; i < next.length; i++) {
    if (next[i] != null) continue
    while (cursor < props.shots.length && used.has(cursor)) cursor++
    if (cursor < props.shots.length) {
      next[i] = cursor
      used.add(cursor)
    }
  }
  template.value = t
  assignment.value = next
  transforms.value = t.slots.map(() => ({ ...DEFAULT_TRANSFORM }))
  activeSlot.value = 0
}

function chooseTemplate(t) {
  if (t.id !== template.value.id) applyTemplate(t, assignment.value)
}

/** Taruh foto ke slot aktif. Jika foto itu sudah dipakai di slot lain, kedua slot bertukar foto. */
function pickPhoto(index) {
  const slot = activeSlot.value
  const next = [...assignment.value]
  const other = next.indexOf(index)
  if (other !== -1 && other !== slot) {
    next[other] = next[slot]
    transforms.value[other] = { ...DEFAULT_TRANSFORM }
  }
  next[slot] = index
  transforms.value[slot] = { ...DEFAULT_TRANSFORM }
  assignment.value = next
  activeSlot.value = (slot + 1) % next.length
}

const slotsUsing = (index) =>
  assignment.value.flatMap((p, slot) => (p === index ? [slot + 1] : []))

// ---------- Edit per foto (slot aktif) ----------

const activeTransform = computed(() => transforms.value[activeSlot.value] ?? DEFAULT_TRANSFORM)

function updateActive(change) {
  const i = activeSlot.value
  transforms.value[i] = { ...transforms.value[i], ...change }
}

const flipHorizontal = () => updateActive({ flipX: !activeTransform.value.flipX })
const flipVertical = () => updateActive({ flipY: !activeTransform.value.flipY })
const zoomIn = () => updateActive({ zoom: Math.min(MAX_ZOOM, activeTransform.value.zoom + ZOOM_STEP) })
const zoomOut = () => updateActive({ zoom: Math.max(MIN_ZOOM, activeTransform.value.zoom - ZOOM_STEP) })
const resetActive = () => updateActive({ ...DEFAULT_TRANSFORM })

// ---------- Preview canvas ----------

let raf = 0
function scheduleRender() {
  if (!raf) raf = requestAnimationFrame(render)
}

function render() {
  raf = 0
  const canvas = canvasEl.value
  const t = template.value
  if (!canvas || !canvas.width) return
  const ctx = canvas.getContext('2d')
  const scale = canvas.width / t.width
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  drawComposition(ctx, t, slotShots.value, {
    transforms: transforms.value,
    filter: filterCss(filterId.value),
    placeholder: true,
  })
  const s = t.slots[activeSlot.value]
  if (s) {
    const line = 3 / scale
    ctx.lineWidth = line
    ctx.strokeStyle = '#c9a45c'
    ctx.strokeRect(s.x + line / 2, s.y + line / 2, s.w - line, s.h - line)
  }
}

function resize() {
  const stage = stageEl.value
  const t = template.value
  if (!stage || !canvasEl.value) return
  const ratio = t.width / t.height
  const cssW = Math.min(stage.clientWidth, stage.clientHeight * ratio)
  const cssH = cssW / ratio
  const dpr = window.devicePixelRatio || 1
  canvasSize.value = { width: cssW, height: cssH }
  canvasEl.value.width = Math.round(cssW * dpr)
  canvasEl.value.height = Math.round(cssH * dpr)
  render()
}

watch(template, () => requestAnimationFrame(resize))
watch([assignment, transforms, activeSlot, filterId], scheduleRender, { deep: true })

// ---------- Sentuh & geser ----------

let drag = null

function toTemplatePoint(e) {
  const rect = canvasEl.value.getBoundingClientRect()
  return {
    x: ((e.clientX - rect.left) / rect.width) * template.value.width,
    y: ((e.clientY - rect.top) / rect.height) * template.value.height,
  }
}

function onPointerDown(e) {
  const p = toTemplatePoint(e)
  const index = template.value.slots.findIndex(
    (s) => p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h,
  )
  if (index === -1) return
  activeSlot.value = index
  drag = { pointerId: e.pointerId, slot: index, last: p }
  canvasEl.value.setPointerCapture(e.pointerId)
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return
  const p = toTemplatePoint(e)
  const shot = slotShots.value[drag.slot]
  if (shot) {
    const slot = template.value.slots[drag.slot]
    transforms.value[drag.slot] = panTransform(shot, slot, transforms.value[drag.slot], p.x - drag.last.x, p.y - drag.last.y)
  }
  drag.last = p
}

function onPointerUp(e) {
  if (drag && e.pointerId === drag.pointerId) drag = null
}

function finish() {
  if (!complete.value) return
  emit('save', {
    template: template.value,
    assignment: [...assignment.value],
    transforms: transforms.value.map((t) => ({ ...t })),
    filter: filterCss(filterId.value),
  })
}

defineExpose({ finish })

let observer
onMounted(() => {
  applyTemplate(template.value)
  observer = new ResizeObserver(resize)
  observer.observe(stageEl.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="editor">
    <div class="stage-col">
      <div ref="stageEl" class="stage">
        <canvas
          ref="canvasEl"
          :style="{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        ></canvas>
      </div>

      <!-- Edit untuk foto di kotak yang sedang aktif -->
      <div class="toolbar" aria-label="Edit foto di kotak aktif">
        <span class="slot-label">Kotak {{ activeSlot + 1 }}</span>
        <button :class="{ on: activeTransform.flipX }" @click="flipHorizontal">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M8 7l-5 5 5 5M16 7l5 5-5 5" /></svg>
          Balik ↔
        </button>
        <button :class="{ on: activeTransform.flipY }" @click="flipVertical">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18M7 8l5-5 5 5M7 16l5 5 5-5" /></svg>
          Balik ↕
        </button>
        <button :disabled="activeTransform.zoom <= MIN_ZOOM" aria-label="Perkecil" @click="zoomOut">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M8 11h6M16.5 16.5L21 21" /></svg>
        </button>
        <span class="zoom">{{ Math.round(activeTransform.zoom * 100) }}%</span>
        <button :disabled="activeTransform.zoom >= MAX_ZOOM" aria-label="Perbesar" @click="zoomIn">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M8 11h6M11 8v6M16.5 16.5L21 21" /></svg>
        </button>
        <button class="reset" @click="resetActive">Reset</button>
      </div>
    </div>

    <div class="panel">
      <div class="heading">
        <div>
          <p class="eyebrow">Edit foto</p>
          <h2 class="title">Atur hasil fotomu</h2>
        </div>
        <TimerBadge v-if="secondsTotal" :left="secondsLeft" :total="secondsTotal" label="Waktu edit" />
      </div>

      <div class="tabs" role="tablist">
        <button :class="{ active: tab === 'tema' }" @click="tab = 'tema'">Bingkai</button>
        <button :class="{ active: tab === 'foto' }" @click="tab = 'foto'">Foto</button>
        <button :class="{ active: tab === 'filter' }" @click="tab = 'filter'">Filter</button>
      </div>

      <div class="content">
        <template v-if="tab === 'tema'">
          <p class="hint">Pilih bingkai. Foto yang sudah dipilih tetap dipertahankan.</p>
          <div class="grid themes">
            <button
              v-for="t in templates"
              :key="t.id"
              class="option"
              :class="{ selected: t.id === template.id }"
              @click="chooseTemplate(t)"
            >
              <img :src="t.frame" :alt="t.name" class="frame-thumb frame-bg" />
              <span>{{ t.name }}</span>
            </button>
          </div>
        </template>

        <template v-else-if="tab === 'foto'">
          <p class="hint">
            Sentuh kotak di bingkai (sekarang <b>kotak {{ activeSlot + 1 }}</b>), lalu pilih fotonya.
            Geser foto di bingkai untuk mengatur posisi, dan pakai tombol di bawah bingkai untuk membalik atau memperbesar.
          </p>
          <div class="grid photos">
            <button
              v-for="(thumb, i) in thumbs"
              :key="i"
              class="option photo"
              :class="{ selected: assignment[activeSlot] === i, used: slotsUsing(i).length }"
              @click="pickPhoto(i)"
            >
              <img :src="thumb" alt="" />
              <span v-if="slotsUsing(i).length" class="badge">{{ slotsUsing(i).join(', ') }}</span>
            </button>
          </div>
        </template>

        <template v-else>
          <p class="hint">Filter berlaku untuk semua foto.</p>
          <div class="grid filters">
            <button
              v-for="f in FILTERS"
              :key="f.id"
              class="option"
              :class="{ selected: f.id === filterId }"
              @click="filterId = f.id"
            >
              <img :src="sampleThumb" alt="" :style="{ filter: f.css }" />
              <span>{{ f.name }}</span>
            </button>
          </div>
        </template>
      </div>

      <button class="btn big save" :disabled="!complete" @click="finish">Simpan Foto</button>
    </div>
  </div>
</template>

<style scoped>
.editor {
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 4vw;
  padding: 4vh 4vw;
}

.stage-col {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface);
  align-self: center;
}

.toolbar button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  min-width: 52px;
  padding: 0 14px;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  font-size: 1rem;
  font-weight: 600;
  transition: background 0.15s, border-color 0.15s;
}

.toolbar button:active {
  background: var(--surface-2);
}

.toolbar button.on {
  border-color: var(--gold);
  background: var(--gold-soft);
}

.toolbar button:disabled {
  opacity: 0.35;
}

.toolbar svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.slot-label {
  padding: 0 12px 0 8px;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--gold);
}

.zoom {
  min-width: 52px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

.toolbar .reset {
  color: var(--text-muted);
}

canvas {
  display: block;
  border-radius: 8px;
  box-shadow: var(--shadow);
  touch-action: none;
  cursor: grab;
}

.panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.panel .title {
  margin-top: 8px;
}

.tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 5px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
}

.tabs button {
  min-height: 58px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-muted);
  font-size: 1.15rem;
  font-weight: 600;
  transition: background 0.15s, color 0.15s;
}

.tabs button.active {
  background: var(--surface-2);
  color: var(--text);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
}

.content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px;
}

.hint {
  margin: 0 0 16px;
  font-size: 1.05rem;
  line-height: 1.5;
  color: var(--text-muted);
}

.hint b {
  color: var(--text);
  font-weight: 600;
}

.grid {
  display: grid;
  gap: 12px;
}

.photos {
  grid-template-columns: repeat(2, 1fr);
}

.themes,
.filters {
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
}

.option {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 6px;
  border-radius: 12px;
  border: 2px solid transparent;
  background: transparent;
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-muted);
  transition: border-color 0.15s, color 0.15s;
}

.option span {
  padding: 0 4px 4px;
}

.option.selected {
  border-color: var(--gold);
  color: var(--text);
}

.option img {
  width: 100%;
  border-radius: 8px;
  display: block;
}

.photo img {
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.photo.used:not(.selected) img {
  opacity: 0.45;
}

.filters img {
  aspect-ratio: 4 / 3;
  object-fit: cover;
}

.frame-thumb {
  height: 22vh;
  object-fit: contain;
}

.photo .badge {
  position: absolute;
  top: 14px;
  left: 14px;
  min-width: 32px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--gold);
  color: #1a1408;
  font-size: 0.95rem;
  font-weight: 700;
  text-align: center;
}

.save {
  width: 100%;
}

/* Layar tegak: kanvas di atas, panel di bawah. */
@media (max-aspect-ratio: 1/1) {
  .editor {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(0, 1.05fr);
    gap: 2.5vh;
    padding: 3vh 5vw;
  }

  /* Judul disembunyikan supaya hemat tempat, tapi timer tetap terlihat. */
  .heading > div {
    display: none;
  }

  .heading {
    justify-content: flex-end;
  }

  .toolbar button {
    min-height: 46px;
    padding: 0 10px;
  }

  .panel {
    gap: 14px;
  }

  .photos {
    grid-template-columns: repeat(4, 1fr);
  }

  .frame-thumb {
    height: 15vh;
  }
}

/* Layar sempit atau pendek: rapatkan. */
@media (max-width: 760px), (max-height: 700px) {
  .heading .title {
    font-size: 1.5rem;
  }

  .tabs button {
    min-height: 48px;
    font-size: 1rem;
  }

  .hint {
    font-size: 0.95rem;
    margin-bottom: 10px;
  }

  .save {
    min-height: 64px;
    font-size: 1.25rem;
  }
}
</style>
