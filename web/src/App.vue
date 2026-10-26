<script setup>
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useCamera } from './composables/useCamera.js'
import { loadTemplates } from './lib/templates.js'
import { compose, makeThumb } from './lib/compose.js'
import { getConfig, uploadPhoto, uploadErrorMessage } from './lib/api.js'
import { makeQr } from './lib/qr.js'
import { fatalError } from './lib/fatal.js'
import OperatorPanel from './components/OperatorPanel.vue'

const COUNTDOWN_SECONDS = 3
const GET_READY_MS = 1500
const AFTER_LAST_SHOT_MS = 700
const CHOOSE_TIMEOUT_MS = 45_000
const RESULT_TIMEOUT_S = 60

const {
  videoEl,
  stream,
  devices,
  deviceId,
  error: cameraError,
  starting: cameraStarting,
  start: startCamera,
  select: selectCamera,
  grab,
} = useCamera()

// idle -> choose -> capture -> processing -> result
const phase = ref('idle')
const templates = ref([])
const templatesState = ref('loading') // loading | ready | error
const serverDown = ref(false)
const notice = ref('')
const panelOpen = ref(false)

const template = shallowRef(null)
const shotIndex = ref(0)
const thumbs = ref([])
const countdown = ref(0)
const getReady = ref(false)
const flash = ref(false)

const processStep = ref('compose') // compose | upload
const processError = ref('')
const resultBlob = shallowRef(null)
const resultUrl = ref('')
const photo = ref(null)
const qrDataUrl = ref('')
const secondsLeft = ref(0)

let session = 0
let shots = []
let phaseTimer = 0
let resultTicker = 0

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const showCamera = computed(() => phase.value === 'idle' || phase.value === 'capture')

// Saat memotret, viewport mengikuti rasio slot, jadi yang terlihat = yang tersimpan.
const viewportStyle = computed(() => {
  const slot = phase.value === 'capture' ? template.value?.slots[shotIndex.value] : null
  return { '--ar': slot ? slot.w / slot.h : 16 / 9 }
})

const canStart = computed(
  () => !!stream.value && templatesState.value === 'ready' && templates.value.length > 0,
)

// ---------- Timer per fase ----------

function clearPhaseTimers() {
  clearTimeout(phaseTimer)
  clearInterval(resultTicker)
}

function armChooseTimeout() {
  clearTimeout(phaseTimer)
  phaseTimer = setTimeout(goIdle, CHOOSE_TIMEOUT_MS)
}

watch(phase, (p) => {
  clearPhaseTimers()
  if (p === 'idle') checkServer()
  else if (p === 'choose') armChooseTimeout()
  else if (p === 'result') {
    secondsLeft.value = RESULT_TIMEOUT_S
    resultTicker = setInterval(() => {
      if (--secondsLeft.value <= 0) goIdle()
    }, 1000)
  }
})

// ---------- Data awal ----------

async function fetchTemplates() {
  templatesState.value = 'loading'
  try {
    templates.value = await loadTemplates()
    templatesState.value = templates.value.length ? 'ready' : 'error'
  } catch (e) {
    console.error(e)
    templatesState.value = 'error'
  }
}

async function checkServer() {
  try {
    await getConfig()
    serverDown.value = false
  } catch {
    serverDown.value = true
  }
}

// ---------- Alur ----------

function setResult(blob) {
  if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
  resultBlob.value = blob
  resultUrl.value = blob ? URL.createObjectURL(blob) : ''
}

function goIdle() {
  session++
  shots = []
  thumbs.value = []
  setResult(null)
  photo.value = null
  qrDataUrl.value = ''
  processError.value = ''
  countdown.value = 0
  getReady.value = false
  phase.value = 'idle'
}

function goChoose() {
  if (!canStart.value) return
  notice.value = ''
  phase.value = 'choose'
}

async function startSession(t) {
  if (!stream.value) {
    goIdle()
    return
  }
  const my = ++session
  template.value = t
  shots = []
  thumbs.value = t.slots.map(() => null)
  setResult(null)
  phase.value = 'capture'

  for (let i = 0; i < t.slots.length; i++) {
    shotIndex.value = i
    getReady.value = true
    await sleep(GET_READY_MS)
    getReady.value = false
    for (let n = COUNTDOWN_SECONDS; n > 0; n--) {
      if (my !== session) return
      countdown.value = n
      await sleep(1000)
    }
    if (my !== session) return
    countdown.value = 0

    const frame = grab()
    if (!frame) {
      goIdle()
      notice.value = 'Kamera terputus saat memotret. Silakan coba lagi.'
      return
    }
    shots.push(frame)
    thumbs.value[i] = makeThumb(frame, t.slots[i])
    flash.value = true
    setTimeout(() => (flash.value = false), 150)
  }

  await sleep(AFTER_LAST_SHOT_MS)
  if (my !== session) return
  processSession()
}

async function processSession() {
  const my = session
  phase.value = 'processing'
  processError.value = ''
  try {
    if (!resultBlob.value) {
      processStep.value = 'compose'
      setResult(await compose(template.value, shots))
    }
    if (my !== session) return
    processStep.value = 'upload'
    const res = await uploadPhoto(resultBlob.value)
    const qr = res.url ? await makeQr(res.url) : ''
    if (my !== session) return
    photo.value = res
    qrDataUrl.value = qr
    serverDown.value = false
    phase.value = 'result'
  } catch (e) {
    console.error(e)
    if (my !== session) return
    processError.value =
      processStep.value === 'compose' ? 'Foto gagal disusun. Silakan coba lagi.' : uploadErrorMessage(e)
  }
}

function cancelSession() {
  goIdle()
}

// ---------- Panel operator (Ctrl+Shift+S, tanpa tombol yang terlihat tamu) ----------

function onKey(e) {
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyS') {
    e.preventDefault()
    panelOpen.value = !panelOpen.value
  } else if (e.key === 'Escape' && panelOpen.value) {
    panelOpen.value = false
  }
}

function closePanel() {
  panelOpen.value = false
  checkServer()
}

function reloadApp() {
  location.reload()
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  startCamera()
  fetchTemplates()
  checkServer()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  clearPhaseTimers()
})
</script>

<template>
  <div class="app" :class="`phase-${phase}`" @pointerdown="phase === 'choose' && armChooseTimeout()">
    <!-- Satu elemen video untuk semua fase, supaya stream kamera tidak perlu dibuka ulang. -->
    <div v-show="showCamera" class="viewport" :style="viewportStyle">
      <video ref="videoEl" class="mirror" autoplay playsinline muted></video>
      <template v-if="phase === 'capture'">
        <div class="shot-label">Foto {{ shotIndex + 1 }} / {{ template.slots.length }}</div>
        <div v-if="countdown" :key="countdown" class="countdown">{{ countdown }}</div>
        <div v-else-if="getReady" class="ready">
          {{ shotIndex === 0 ? 'Bersiap!' : 'Gaya berikutnya!' }}
        </div>
      </template>
      <div class="flash" :class="{ on: flash }"></div>
    </div>

    <!-- ========== IDLE: layar sambutan ========== -->
    <section v-if="phase === 'idle'" class="idle" @click="goChoose">
      <div class="welcome">
        <div class="star">★</div>
        <h1>Natal Naposo</h1>
        <p class="subtitle">HKBP Lontar · 19 Desember 2026</p>

        <div v-if="cameraError" class="card" @click.stop>
          <p>{{ cameraError }}</p>
          <button class="btn" :disabled="cameraStarting" @click="startCamera()">
            {{ cameraStarting ? 'Membuka kamera…' : 'Coba Lagi' }}
          </button>
        </div>
        <div v-else-if="templatesState === 'error'" class="card" @click.stop>
          <p>Bingkai foto gagal dimuat.</p>
          <button class="btn" @click="fetchTemplates">Coba Lagi</button>
        </div>
        <p v-else-if="!canStart" class="hint"><span class="spinner"></span> Menyiapkan…</p>
        <template v-else>
          <p v-if="notice" class="notice">{{ notice }}</p>
          <p class="tap">Sentuh layar untuk mulai</p>
        </template>
      </div>

      <div v-if="serverDown" class="server-banner" @click.stop>
        <span>Server belum tersambung, foto belum bisa disimpan.</span>
        <button class="btn small" @click="checkServer">Coba Lagi</button>
      </div>
    </section>

    <!-- ========== PILIH TEMPLATE ========== -->
    <section v-else-if="phase === 'choose'" class="choose">
      <h2>Pilih bingkai</h2>
      <div class="cards">
        <button v-for="t in templates" :key="t.id" class="tpl" @click="startSession(t)">
          <img :src="t.frame" :alt="t.name" />
          <span class="tpl-name">{{ t.name }}</span>
          <span class="tpl-count">{{ t.slots.length }} foto</span>
        </button>
      </div>
      <button class="btn ghost" @click="goIdle">Kembali</button>
    </section>

    <!-- ========== SESI FOTO ========== -->
    <section v-else-if="phase === 'capture'" class="capture-bar">
      <div class="thumbs">
        <div
          v-for="(slot, i) in template.slots"
          :key="i"
          class="thumb"
          :class="{ current: i === shotIndex && !thumbs[i] }"
          :style="{ aspectRatio: `${slot.w} / ${slot.h}` }"
        >
          <img v-if="thumbs[i]" :src="thumbs[i]" alt="" />
          <span v-else>{{ i + 1 }}</span>
        </div>
      </div>
      <button class="btn ghost small" @click="cancelSession">Batal</button>
    </section>

    <!-- ========== PROSES ========== -->
    <section v-else-if="phase === 'processing'" class="processing">
      <template v-if="!processError">
        <span class="spinner big-spinner"></span>
        <p class="status">{{ processStep === 'compose' ? 'Menyusun foto…' : 'Menyimpan foto…' }}</p>
      </template>
      <div v-else class="card">
        <img v-if="resultUrl" class="mini-result" :src="resultUrl" alt="" />
        <p>{{ processError }}</p>
        <div class="row">
          <button class="btn big" @click="processSession">Coba Lagi</button>
          <button class="btn big ghost" @click="cancelSession">Batal</button>
        </div>
      </div>
    </section>

    <!-- ========== HASIL ========== -->
    <section v-else-if="phase === 'result'" class="result">
      <div class="result-photo">
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
          <p>Link download belum tersedia.<br />Minta operator untuk menampilkan kode QR-nya nanti.</p>
        </template>
        <button class="btn big" @click="goIdle">Selesai</button>
        <p class="countdown-note">Kembali otomatis dalam {{ secondsLeft }} detik</p>
      </div>
    </section>

    <OperatorPanel
      v-if="panelOpen"
      :devices="devices"
      :device-id="deviceId"
      :camera-error="cameraError"
      @select-camera="selectCamera"
      @restart-camera="startCamera()"
      @close="closePanel"
    />

    <div v-if="fatalError" class="fatal">
      <div class="card">
        <p>{{ fatalError }}</p>
        <button class="btn big" @click="reloadApp">Muat Ulang</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  height: 100%;
  position: relative;
}

section {
  height: 100%;
}

.row {
  display: flex;
  gap: 20px;
  justify-content: center;
  flex-wrap: wrap;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  max-width: 720px;
  padding: 32px 40px;
  border-radius: 24px;
  border: 3px solid var(--gold);
  background: rgba(15, 61, 42, 0.92);
  box-shadow: var(--shadow);
  text-align: center;
  font-size: 1.6rem;
}

.card p {
  margin: 0;
}

.btn.small {
  min-height: 52px;
  padding: 0 24px;
  font-size: 1.2rem;
}

/* ---------- Kamera ---------- */

.viewport {
  position: absolute;
  overflow: hidden;
  background: #000;
}

.phase-idle .viewport {
  inset: 0;
}

.phase-idle video {
  filter: brightness(0.45) saturate(0.9);
}

.phase-capture .viewport {
  top: 3vh;
  left: 50%;
  transform: translateX(-50%);
  width: min(94vw, calc(70vh * var(--ar)));
  aspect-ratio: var(--ar);
  border-radius: 20px;
  border: 4px solid var(--gold);
  box-shadow: var(--shadow);
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

.shot-label {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 28px;
  border-radius: 999px;
  background: rgba(122, 18, 25, 0.85);
  border: 2px solid var(--gold);
  font-size: 1.8rem;
  font-weight: 700;
  white-space: nowrap;
}

.countdown,
.ready {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-shadow: 0 6px 30px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}

.countdown {
  font-size: min(42vh, 24vw);
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
  transition: opacity 0.4s ease-out;
}

.flash.on {
  opacity: 1;
  transition: none;
}

/* ---------- Idle ---------- */

.idle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  padding: 24px;
}

.star {
  color: var(--gold);
  font-size: 4rem;
  line-height: 1;
}

.welcome h1 {
  margin: 0;
  font-family: var(--serif);
  font-style: italic;
  font-size: clamp(4rem, 10vw, 9rem);
  color: var(--gold);
  text-shadow: 0 6px 30px rgba(0, 0, 0, 0.5);
}

.subtitle {
  margin: 0 0 40px;
  font-size: clamp(1.4rem, 2.6vw, 2.4rem);
  letter-spacing: 0.06em;
}

.tap {
  margin: 0;
  padding: 20px 56px;
  border-radius: 999px;
  border: 3px solid var(--gold);
  background: var(--red);
  font-size: clamp(1.8rem, 3vw, 2.6rem);
  font-weight: 700;
  box-shadow: var(--shadow);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  50% {
    transform: scale(1.05);
  }
}

.hint {
  font-size: 1.6rem;
}

.notice {
  margin: 0 0 16px;
  font-size: 1.4rem;
  color: var(--gold-light);
}

.server-banner {
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 12px 10px 28px;
  border-radius: 999px;
  background: rgba(122, 18, 25, 0.92);
  border: 2px solid var(--gold);
  font-size: 1.2rem;
  white-space: nowrap;
}

/* ---------- Pilih template ---------- */

.choose {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3vh;
  padding: 4vh 4vw;
}

.choose h2 {
  margin: 0;
  font-family: var(--serif);
  font-style: italic;
  font-size: clamp(2.5rem, 5vw, 4.5rem);
  color: var(--gold);
}

.cards {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: stretch;
  gap: 3vw;
}

.tpl {
  flex: 0 1 26vw;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  min-height: 0;
  padding: 20px;
  border-radius: 24px;
  border: 3px solid rgba(212, 166, 58, 0.6);
  background: rgba(255, 255, 255, 0.06);
  transition: transform 0.1s, border-color 0.15s;
}

.tpl:active {
  transform: scale(0.97);
  border-color: var(--gold);
}

.tpl img {
  flex: 1;
  min-height: 0;
  max-width: 100%;
  object-fit: contain;
  border-radius: 8px;
  /* Lubang transparan pada frame tampil sebagai area bergaris. */
  background: repeating-linear-gradient(45deg, #1c2a24, #1c2a24 10px, #24352d 10px, #24352d 20px);
}

.tpl-name {
  font-size: 1.6rem;
  font-weight: 700;
}

.tpl-count {
  font-size: 1.3rem;
  color: var(--gold-light);
}

/* ---------- Bar sesi foto ---------- */

.capture-bar {
  position: absolute;
  inset: auto 0 0 0;
  height: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 0 4vw 3vh;
}

.thumbs {
  display: flex;
  gap: 14px;
  height: 17vh;
}

.thumb {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 10px;
  border: 3px dashed rgba(255, 250, 242, 0.35);
  background: rgba(255, 255, 255, 0.05);
  font-size: 2rem;
  font-weight: 700;
  color: rgba(255, 250, 242, 0.5);
}

.thumb.current {
  border-color: var(--gold);
  color: var(--gold);
}

.thumb:has(img) {
  border: 3px solid var(--gold);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  animation: appear 0.4s ease-out;
}

@keyframes appear {
  from {
    transform: scale(1.3);
    opacity: 0;
  }
}

/* ---------- Proses ---------- */

.processing {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.status {
  margin: 0;
  font-size: 2.2rem;
}

.big-spinner {
  font-size: 6rem;
}

.mini-result {
  max-height: 30vh;
  border-radius: 8px;
  border: 3px solid var(--gold);
}

/* ---------- Hasil ---------- */

.result {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 4vw;
  align-items: center;
  padding: 4vh 4vw;
}

.result-photo {
  height: 92vh;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-photo img {
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
  gap: 22px;
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
  line-height: 1.4;
}

.qr {
  width: min(30vw, 50vh);
  aspect-ratio: 1;
  padding: 16px;
  background: #fff;
  border-radius: 16px;
  border: 4px solid var(--gold);
}

.side .countdown-note {
  font-size: 1.1rem;
  opacity: 0.7;
}

/* ---------- Error fatal ---------- */

.fatal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--green);
}
</style>
