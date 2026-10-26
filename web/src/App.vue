<script setup>
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useCamera } from './composables/useCamera.js'
import { loadTemplates } from './lib/templates.js'
import { composeTemplate, grabFrame } from './lib/compose.js'
import { uploadPhoto } from './lib/api.js'
import { makeQr } from './lib/qr.js'
import OperatorPanel from './components/OperatorPanel.vue'

const COUNTDOWN_SECONDS = 3
const GET_READY_MS = 1500
const BETWEEN_SHOTS_MS = 1200
const DONE_TIMEOUT_MS = 90_000
const PANEL_HOLD_MS = 1000

const {
  stream,
  devices,
  deviceId,
  error: cameraError,
  start: startCamera,
  select: selectCamera,
} = useCamera()

const videoEl = ref(null)
// home -> capture -> processing -> review -> uploading -> done
const phase = ref('home')
const templates = ref([])
const templatesError = ref('')
const template = shallowRef(null)
const shotIndex = ref(0)
const countdown = ref(0)
const getReady = ref(false)
const flash = ref(false)
const resultBlob = shallowRef(null)
const resultUrl = ref('')
const photo = ref(null)
const qrDataUrl = ref('')
const errorMsg = ref('')
const panelOpen = ref(false)

let session = 0
let doneTimer = 0
let holdTimer = 0

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

watch([stream, videoEl], ([s, el]) => {
  if (el && el.srcObject !== s) el.srcObject = s
})

// Saat memotret, viewport mengikuti rasio slot, jadi yang terlihat = yang tersimpan.
const viewportStyle = computed(() => {
  const slot = phase.value === 'capture' ? template.value?.slots[shotIndex.value] : null
  return { '--ar': slot ? slot.w / slot.h : 16 / 9 }
})

function setResult(blob) {
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
  resultBlob.value = blob
  resultUrl.value = blob ? URL.createObjectURL(blob) : ''
}

function reset() {
  session++
  clearTimeout(doneTimer)
  setResult(null)
  photo.value = null
  qrDataUrl.value = ''
  countdown.value = 0
  getReady.value = false
}

async function startSession(t) {
  if (!stream.value) return
  reset()
  errorMsg.value = ''
  const my = session
  template.value = t
  shotIndex.value = 0
  phase.value = 'capture'

  const shots = []
  for (let i = 0; i < t.slots.length; i++) {
    shotIndex.value = i
    getReady.value = true
    await sleep(i === 0 ? GET_READY_MS : BETWEEN_SHOTS_MS)
    getReady.value = false
    for (let n = COUNTDOWN_SECONDS; n > 0; n--) {
      if (my !== session) return
      countdown.value = n
      await sleep(1000)
    }
    if (my !== session) return
    countdown.value = 0

    const frame = grabFrame(videoEl.value)
    if (!frame) {
      phase.value = 'home'
      errorMsg.value = 'Kamera tidak siap. Coba lagi.'
      return
    }
    shots.push(frame)
    flash.value = true
    setTimeout(() => (flash.value = false), 200)
  }

  phase.value = 'processing'
  try {
    const blob = await composeTemplate(t, shots)
    if (my !== session) return
    setResult(blob)
    phase.value = 'review'
  } catch (e) {
    console.error(e)
    phase.value = 'home'
    errorMsg.value = 'Gagal menyusun foto. Coba lagi.'
  }
}

function cancel() {
  reset()
  phase.value = 'home'
}

async function save() {
  const my = session
  errorMsg.value = ''
  phase.value = 'uploading'
  try {
    const res = await uploadPhoto(resultBlob.value)
    const qr = res.url ? await makeQr(res.url) : ''
    if (my !== session) return
    photo.value = res
    qrDataUrl.value = qr
    phase.value = 'done'
    doneTimer = setTimeout(finish, DONE_TIMEOUT_MS)
  } catch (e) {
    console.error(e)
    if (my !== session) return
    errorMsg.value = 'Gagal menyimpan foto. Coba lagi.'
    phase.value = 'review'
  }
}

function finish() {
  reset()
  phase.value = 'home'
}

function holdStart() {
  clearTimeout(holdTimer)
  holdTimer = setTimeout(() => (panelOpen.value = true), PANEL_HOLD_MS)
}

function holdEnd() {
  clearTimeout(holdTimer)
}

function onKey(e) {
  if (e.key === 'F2') panelOpen.value = true
  else if (e.key === 'Escape') {
    if (panelOpen.value) panelOpen.value = false
    else if (phase.value === 'capture') cancel()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  startCamera()
  try {
    templates.value = await loadTemplates()
    if (!templates.value.length) templatesError.value = 'Belum ada template bingkai.'
  } catch (e) {
    console.error(e)
    templatesError.value = 'Template bingkai gagal dimuat.'
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearTimeout(doneTimer)
  clearTimeout(holdTimer)
})
</script>

<template>
  <div class="app" :class="`phase-${phase}`">
    <!-- Video selalu terpasang supaya stream kamera tidak perlu dibuka ulang. -->
    <section v-show="phase === 'home' || phase === 'capture'" class="stage">
      <header v-if="phase === 'home'" class="brand">
        <div class="star">★</div>
        <h1>Natal Naposo</h1>
        <p>HKBP Lontar · 19 Desember 2026</p>
      </header>

      <div class="viewport" :style="viewportStyle">
        <video ref="videoEl" class="mirror" autoplay playsinline muted></video>

        <div v-if="cameraError" class="overlay camera-error">
          <p>{{ cameraError }}</p>
          <button class="btn" @click="startCamera()">Coba Lagi</button>
        </div>

        <template v-if="phase === 'capture'">
          <div class="shot-label">Foto {{ shotIndex + 1 }} / {{ template.slots.length }}</div>
          <div v-if="countdown" :key="countdown" class="countdown">{{ countdown }}</div>
          <div v-else-if="getReady" class="ready">{{ shotIndex === 0 ? 'Bersiap!' : 'Gaya berikutnya!' }}</div>
        </template>
        <div class="flash" :class="{ on: flash }"></div>
      </div>

      <div v-if="phase === 'home'" class="picker">
        <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
        <p v-if="templatesError" class="error">{{ templatesError }}</p>
        <template v-else>
          <p class="picker-title">Sentuh bingkai untuk mulai</p>
          <div class="cards">
            <button
              v-for="t in templates"
              :key="t.id"
              class="card"
              :disabled="!stream"
              @click="startSession(t)"
            >
              <img :src="t.frame" :alt="t.name" />
              <span class="card-name">{{ t.name }}</span>
              <span class="card-count">{{ t.slots.length }} foto</span>
            </button>
          </div>
        </template>
      </div>

      <button v-if="phase === 'capture'" class="btn ghost cancel" @click="cancel">Batal</button>
    </section>

    <section v-if="['processing', 'review', 'uploading'].includes(phase)" class="review">
      <div class="result">
        <img v-if="resultUrl" :src="resultUrl" alt="Hasil foto" />
        <span v-else class="spinner big-spinner"></span>
      </div>
      <div class="side">
        <template v-if="phase === 'review'">
          <h2>Suka hasilnya?</h2>
          <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
          <button class="btn big green" @click="save">Simpan</button>
          <button class="btn big ghost" @click="startSession(template)">Ulangi</button>
        </template>
        <p v-else class="status">
          <span class="spinner"></span>
          {{ phase === 'processing' ? 'Menyusun foto…' : 'Menyimpan foto…' }}
        </p>
      </div>
    </section>

    <section v-if="phase === 'done'" class="done">
      <div class="result">
        <img :src="resultUrl" alt="Hasil foto" />
      </div>
      <div class="side">
        <template v-if="qrDataUrl">
          <h2>Scan untuk download</h2>
          <img class="qr" :src="qrDataUrl" alt="Kode QR" />
          <p>Arahkan kamera HP ke kode QR</p>
        </template>
        <template v-else>
          <h2>Foto tersimpan!</h2>
          <p>Kode QR belum tersedia.<br />Minta bantuan operator.</p>
          <p class="photo-id">{{ photo?.id }}</p>
        </template>
        <button class="btn big" @click="finish">Selesai</button>
      </div>
    </section>

    <button
      v-if="phase === 'home'"
      class="gear"
      aria-label="Panel operator (tahan)"
      @pointerdown="holdStart"
      @pointerup="holdEnd"
      @pointerleave="holdEnd"
      @pointercancel="holdEnd"
    >
      ⚙
    </button>

    <OperatorPanel
      v-if="panelOpen"
      :devices="devices"
      :device-id="deviceId"
      @select-camera="selectCamera"
      @close="panelOpen = false"
    />
  </div>
</template>

<style scoped>
.app {
  height: 100%;
}

section {
  height: 100%;
  padding: 4vh 4vw;
}

/* ---------- Beranda & pemotretan ---------- */

.stage {
  display: grid;
  gap: 3vh 3vw;
}

.phase-home .stage {
  grid-template-columns: 1.5fr 1fr;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    'view brand'
    'view picker';
  align-items: center;
}

.phase-capture .stage {
  grid-template-rows: 1fr auto;
  justify-items: center;
  align-items: center;
}

.brand {
  grid-area: brand;
  text-align: center;
}

.brand .star {
  color: var(--gold);
  font-size: 2.5rem;
  line-height: 1;
}

.brand h1 {
  margin: 0.2em 0 0;
  font-family: var(--serif);
  font-style: italic;
  font-size: clamp(2.5rem, 5vw, 4.5rem);
  color: var(--gold);
}

.brand p {
  margin: 0.4em 0 0;
  font-size: clamp(1.1rem, 1.8vw, 1.6rem);
  letter-spacing: 0.06em;
  opacity: 0.9;
}

.viewport {
  grid-area: view;
  position: relative;
  aspect-ratio: var(--ar);
  overflow: hidden;
  border-radius: 20px;
  border: 4px solid var(--gold);
  background: #000;
  box-shadow: var(--shadow);
  justify-self: center;
}

.phase-home .viewport {
  width: min(100%, calc(88vh * var(--ar)));
}

.phase-capture .viewport {
  width: min(92vw, calc(78vh * var(--ar)));
}

video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mirror {
  transform: scaleX(-1);
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 24px;
  text-align: center;
  background: rgba(15, 61, 42, 0.9);
  font-size: 1.6rem;
}

.shot-label {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 28px;
  border-radius: 999px;
  background: rgba(122, 18, 25, 0.85);
  border: 2px solid var(--gold);
  font-size: 1.8rem;
  font-weight: 700;
}

.countdown,
.ready {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--white);
  text-shadow: 0 6px 30px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}

.countdown {
  font-size: min(40vh, 22vw);
  font-weight: 800;
  animation: pop 1s ease-out;
}

.ready {
  font-family: var(--serif);
  font-style: italic;
  font-size: clamp(3rem, 8vw, 7rem);
  color: var(--gold-light);
}

@keyframes pop {
  0% {
    transform: scale(1.6);
    opacity: 0;
  }
  20% {
    transform: scale(1);
    opacity: 1;
  }
  85% {
    opacity: 1;
  }
  100% {
    opacity: 0.2;
  }
}

.flash {
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.35s ease-out;
}

.flash.on {
  opacity: 1;
  transition: none;
}

.cancel {
  min-height: 60px;
  font-size: 1.3rem;
}

.picker {
  grid-area: picker;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.picker-title {
  margin: 0 0 16px;
  text-align: center;
  font-size: 1.5rem;
  color: var(--gold-light);
}

.cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  min-height: 0;
  padding: 4px;
}

.card {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: 1fr 1fr;
  column-gap: 20px;
  align-items: center;
  padding: 14px;
  border-radius: 18px;
  border: 3px solid rgba(212, 166, 58, 0.6);
  background: rgba(255, 255, 255, 0.06);
  text-align: left;
  transition: transform 0.1s, border-color 0.15s;
}

.card:active {
  transform: scale(0.98);
  border-color: var(--gold);
}

.card:disabled {
  opacity: 0.4;
}

.card img {
  grid-row: span 2;
  height: 16vh;
  max-width: 14vw;
  object-fit: contain;
  border-radius: 6px;
  /* Lubang transparan pada frame tampil sebagai area gelap. */
  background: repeating-linear-gradient(45deg, #1c2a24, #1c2a24 10px, #24352d 10px, #24352d 20px);
}

.card-name {
  align-self: end;
  font-size: 1.5rem;
  font-weight: 700;
}

.card-count {
  align-self: start;
  font-size: 1.2rem;
  color: var(--gold-light);
}

.error {
  margin: 0 0 16px;
  padding: 12px 18px;
  border-radius: 12px;
  background: rgba(179, 32, 42, 0.85);
  font-size: 1.3rem;
  text-align: center;
}

/* ---------- Hasil & QR ---------- */

.review,
.done {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 4vw;
  align-items: center;
}

.result {
  height: 92vh;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.result img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
  border: 4px solid var(--gold);
  box-shadow: var(--shadow);
}

.side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  text-align: center;
}

.side h2 {
  margin: 0;
  font-family: var(--serif);
  font-style: italic;
  font-size: clamp(2rem, 3.5vw, 3.2rem);
  color: var(--gold);
}

.side p {
  margin: 0;
  font-size: 1.5rem;
}

.qr {
  width: min(32vw, 52vh);
  aspect-ratio: 1;
  padding: 16px;
  background: #fff;
  border-radius: 16px;
  border: 4px solid var(--gold);
}

.photo-id {
  font-family: ui-monospace, Consolas, monospace;
  opacity: 0.7;
}

.status {
  font-size: 2rem !important;
}

.big-spinner {
  font-size: 5rem;
}

/* ---------- Tombol operator tersembunyi ---------- */

.gear {
  position: fixed;
  right: 12px;
  bottom: 12px;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 50%;
  background: transparent;
  font-size: 1.6rem;
  opacity: 0.25;
}
</style>
