<script setup>
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useCamera } from './composables/useCamera.js'
import { loadTemplates } from './lib/templates.js'
import { compose, canvasToJpeg, downscale, toDataUrl } from './lib/compose.js'
import { getConfig, uploadPhoto, createSession, uploadErrorMessage } from './lib/api.js'
import { makeQr } from './lib/qr.js'
import { fatalError } from './lib/fatal.js'
import { EVENT } from './lib/event.js'
import EditorScreen from './components/EditorScreen.vue'
import OperatorPanel from './components/OperatorPanel.vue'

const SHOT_COUNT = 8
const TUTORIAL_SECONDS = 15
const SHOT_COUNTDOWN_SECONDS = 5
const BETWEEN_SHOTS_MS = 1200
const AFTER_LAST_SHOT_MS = 800
const EDITOR_IDLE_MS = 120_000
const RESULT_TIMEOUT_S = 60
const PREVIEW_WIDTH = 1280

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

// home -> tutorial -> capture -> edit -> processing -> result
const phase = ref('home')
const templates = ref([])
const templatesState = ref('loading') // loading | ready | error
const selectedTemplateId = ref('')
const serverDown = ref(false)
const notice = ref('')
const panelOpen = ref(false)

const videoAspect = ref(16 / 9)
const tutorialLeft = ref(0)
const shotIndex = ref(0)
const thumbs = ref([])
const countdown = ref(0)
const nextPose = ref(false)
const flash = ref(false)
const editorRef = ref(null)

const processStep = ref('compose') // compose | upload
const uploadProgress = ref(0)
const processError = ref('')
const resultBlob = shallowRef(null)
const resultUrl = ref('')
const sessionResult = ref(null)
const qrDataUrl = ref('')
const secondsLeft = ref(0)

let session = 0
let shots = [] // canvas resolusi penuh
const previewShots = shallowRef([]) // salinan kecil untuk editor
let edit = null // hasil editor: { template, assignment, offsets, filter }
let uploaded = { main: null, raw: [] }
let phaseTimer = 0
let ticker = 0

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const showCamera = computed(() => ['home', 'tutorial', 'capture'].includes(phase.value))
const viewportStyle = computed(() => ({ '--ar': videoAspect.value }))
const canStart = computed(
  () => !!stream.value && templatesState.value === 'ready' && templates.value.length > 0,
)
const uploadTotal = computed(() => previewShots.value.length + 1)

function onVideoMeta() {
  const v = videoEl.value
  if (v?.videoWidth && v.videoHeight) videoAspect.value = v.videoWidth / v.videoHeight
}

// ---------- Timer per fase ----------

function clearPhaseTimers() {
  clearTimeout(phaseTimer)
  clearInterval(ticker)
}

function armEditorIdle() {
  clearTimeout(phaseTimer)
  // Tamu meninggalkan editor: simpan otomatis supaya foto tidak hilang.
  phaseTimer = setTimeout(() => editorRef.value?.finish(), EDITOR_IDLE_MS)
}

function onActivity() {
  if (phase.value === 'edit') armEditorIdle()
}

watch(phase, (p) => {
  clearPhaseTimers()
  if (p === 'home') checkServer()
  else if (p === 'edit') armEditorIdle()
  else if (p === 'result') {
    secondsLeft.value = RESULT_TIMEOUT_S
    ticker = setInterval(() => {
      if (--secondsLeft.value <= 0) goHome()
    }, 1000)
  }
})

// ---------- Data awal ----------

async function fetchTemplates() {
  templatesState.value = 'loading'
  try {
    templates.value = await loadTemplates()
    templatesState.value = templates.value.length ? 'ready' : 'error'
    if (!templates.value.some((t) => t.id === selectedTemplateId.value))
      selectedTemplateId.value = templates.value[0]?.id ?? ''
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

function resetSession() {
  session++
  shots = []
  previewShots.value = []
  thumbs.value = []
  edit = null
  uploaded = { main: null, raw: [] }
  setResult(null)
  sessionResult.value = null
  qrDataUrl.value = ''
  processError.value = ''
  countdown.value = 0
  nextPose.value = false
  tutorialLeft.value = 0
}

function goHome() {
  resetSession()
  phase.value = 'home'
}

/** Layar penuh di tablet (harus dipanggil dari sentuhan tamu). Di Chrome kiosk tidak berpengaruh. */
function enterFullscreen() {
  const el = document.documentElement
  if (document.fullscreenElement || document.webkitFullscreenElement) return
  const request = el.requestFullscreen ?? el.webkitRequestFullscreen
  try {
    request?.call(el)?.catch?.(() => {})
  } catch {
    // Browser menolak layar penuh; aplikasi tetap berjalan biasa.
  }
}

async function startSession() {
  if (!canStart.value) return
  enterFullscreen()
  keepAwake()
  resetSession()
  notice.value = ''
  const my = session
  phase.value = 'tutorial'
  for (tutorialLeft.value = TUTORIAL_SECONDS; tutorialLeft.value > 0; tutorialLeft.value--) {
    await sleep(1000)
    if (my !== session || phase.value !== 'tutorial') return
  }
  runCapture(my)
}

function skipTutorial() {
  if (phase.value === 'tutorial') runCapture(session)
}

async function runCapture(my) {
  phase.value = 'capture'
  thumbs.value = Array(SHOT_COUNT).fill(null)

  for (let i = 0; i < SHOT_COUNT; i++) {
    shotIndex.value = i
    if (i > 0) {
      nextPose.value = true
      await sleep(BETWEEN_SHOTS_MS)
      nextPose.value = false
    }
    for (let n = SHOT_COUNTDOWN_SECONDS; n > 0; n--) {
      if (my !== session) return
      countdown.value = n
      await sleep(1000)
    }
    if (my !== session) return
    countdown.value = 0

    const frame = grab()
    if (!frame) {
      goHome()
      notice.value = 'Kamera terputus saat memotret. Silakan coba lagi.'
      return
    }
    shots.push(frame)
    const preview = downscale(frame, PREVIEW_WIDTH)
    previewShots.value = [...previewShots.value, preview]
    thumbs.value[i] = toDataUrl(preview)
    flash.value = true
    setTimeout(() => (flash.value = false), 150)
  }

  await sleep(AFTER_LAST_SHOT_MS)
  if (my !== session) return
  phase.value = 'edit'
}

function onEditorSave(result) {
  edit = result
  setResult(null)
  uploaded = { main: null, raw: [] }
  saveSession()
}

/** Compose, lalu upload foto template + semua foto mentah, lalu buat sesi. Bisa diulang tanpa upload ganda. */
async function saveSession() {
  const my = session
  phase.value = 'processing'
  processError.value = ''
  try {
    if (!resultBlob.value) {
      processStep.value = 'compose'
      const slotShots = edit.assignment.map((i) => shots[i])
      setResult(await compose(edit.template, slotShots, { offsets: edit.offsets, filter: edit.filter }))
    }
    if (my !== session) return

    processStep.value = 'upload'
    if (!uploaded.main) uploaded.main = (await uploadPhoto(resultBlob.value)).id
    uploadProgress.value = 1
    for (let i = uploaded.raw.length; i < shots.length; i++) {
      const blob = await canvasToJpeg(shots[i])
      uploaded.raw.push((await uploadPhoto(blob)).id)
      if (my !== session) return
      uploadProgress.value = i + 2
    }
    const res = await createSession(uploaded.main, uploaded.raw)
    const qr = res.url ? await makeQr(res.url) : ''
    if (my !== session) return
    sessionResult.value = res
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

// ---------- Layar tetap menyala (tablet) ----------

let wakeLock = null

async function keepAwake() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock) return
  try {
    wakeLock = await navigator.wakeLock.request('screen')
    wakeLock.addEventListener('release', () => (wakeLock = null))
  } catch {
    // Tidak didukung atau ditolak; atur "layar tidak pernah mati" di pengaturan tablet.
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') keepAwake()
}

// ---------- Panel operator ----------
// Keyboard: Ctrl+Shift+S. Layar sentuh: tahan judul di beranda selama 3 detik.
// Tidak ada tombol yang terlihat tamu.

const PANEL_HOLD_MS = 3000
let holdTimer = 0

function holdStart() {
  clearTimeout(holdTimer)
  holdTimer = setTimeout(() => (panelOpen.value = true), PANEL_HOLD_MS)
}

function holdEnd() {
  clearTimeout(holdTimer)
}

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
  document.addEventListener('visibilitychange', onVisibilityChange)
  keepAwake()
  startCamera()
  fetchTemplates()
  checkServer()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  wakeLock?.release()
  clearPhaseTimers()
  clearTimeout(holdTimer)
})
</script>

<template>
  <div class="app" :class="`phase-${phase}`" @pointerdown="onActivity">
    <!-- Satu elemen video untuk semua fase, supaya stream kamera tidak perlu dibuka ulang. -->
    <div v-show="showCamera" class="viewport" :style="viewportStyle">
      <video
        ref="videoEl"
        class="mirror"
        autoplay
        playsinline
        muted
        @loadedmetadata="onVideoMeta"
        @resize="onVideoMeta"
      ></video>
      <template v-if="phase === 'capture'">
        <div class="shot-label glass">Foto {{ shotIndex + 1 }} <span>dari {{ SHOT_COUNT }}</span></div>
        <div v-if="countdown" class="countdown">
          <div :key="countdown" class="count">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle class="track" cx="60" cy="60" r="54" />
              <circle class="drain" cx="60" cy="60" r="54" />
            </svg>
            <span>{{ countdown }}</span>
          </div>
        </div>
        <div v-else-if="nextPose" class="next-pose"><span class="glass">Ganti gaya</span></div>
      </template>
      <div class="flash" :class="{ on: flash }"></div>
    </div>

    <!-- ========== BERANDA ========== -->
    <section v-if="phase === 'home'" class="home">
      <div class="home-intro">
        <p class="eyebrow">{{ EVENT.eyebrow }}</p>
        <h1
          class="display"
          @pointerdown="holdStart"
          @pointerup="holdEnd"
          @pointerleave="holdEnd"
          @pointercancel="holdEnd"
        >
          <span v-for="line in EVENT.titleLines" :key="line">{{ line }}</span>
        </h1>
        <p class="lead muted">Photobox</p>

        <div v-if="cameraError" class="alert surface">
          <p>{{ cameraError }}</p>
          <button class="btn" :disabled="cameraStarting" @click="startCamera()">
            {{ cameraStarting ? 'Membuka kamera…' : 'Coba Lagi' }}
          </button>
        </div>
        <div v-else-if="templatesState === 'error'" class="alert surface">
          <p>Bingkai foto gagal dimuat.</p>
          <button class="btn" @click="fetchTemplates">Coba Lagi</button>
        </div>
        <p v-else-if="!canStart" class="muted loading"><span class="spinner"></span> Menyiapkan kamera…</p>
        <template v-else>
          <p v-if="notice" class="notice">{{ notice }}</p>
          <button class="btn big" @click="startSession">Mulai Foto</button>
          <p class="meta muted">{{ SHOT_COUNT }} foto · bingkai bisa diganti setelah berfoto</p>
        </template>
      </div>

      <div v-if="canStart" class="home-frames">
        <p class="eyebrow">Pilihan bingkai</p>
        <div class="previews">
          <button
            v-for="t in templates"
            :key="t.id"
            class="preview"
            :class="{ selected: t.id === selectedTemplateId }"
            @click="selectedTemplateId = t.id"
          >
            <img :src="t.frame" :alt="t.name" class="frame-bg" />
            <span>{{ t.name }}</span>
          </button>
        </div>
      </div>

      <div v-if="serverDown" class="server-banner glass">
        <span class="dot"></span>
        <span>Server belum tersambung. Foto belum bisa disimpan.</span>
        <button class="btn small ghost" @click="checkServer">Coba Lagi</button>
      </div>
    </section>

    <!-- ========== TUTORIAL (bersiap) ========== -->
    <section v-else-if="phase === 'tutorial'" class="tutorial">
      <div class="tutorial-card glass">
        <p class="eyebrow">Sebelum mulai</p>
        <h2 class="title">Bersiap untuk {{ SHOT_COUNT }} foto</h2>
        <ol class="steps">
          <li>
            <span class="num">1</span>
            <div><b>Hitungan {{ SHOT_COUNTDOWN_SECONDS }} detik</b> sebelum setiap foto diambil.</div>
          </li>
          <li>
            <span class="num">2</span>
            <div><b>Ganti gaya</b> di setiap foto supaya hasilnya bervariasi.</div>
          </li>
          <li>
            <span class="num">3</span>
            <div><b>Lihat ke kamera</b>, bukan ke layar.</div>
          </li>
          <li>
            <span class="num">4</span>
            <div>Setelah selesai, <b>pilih foto</b>, atur posisinya, dan tambahkan filter.</div>
          </li>
        </ol>
        <div class="tutorial-footer">
          <div class="timer">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle class="track" cx="60" cy="60" r="54" />
              <circle
                class="progress"
                cx="60"
                cy="60"
                r="54"
                :style="{ strokeDashoffset: 339.3 * (1 - tutorialLeft / TUTORIAL_SECONDS) }"
              />
            </svg>
            <span>{{ tutorialLeft }}</span>
          </div>
          <button class="btn big" @click="skipTutorial">Saya Siap</button>
        </div>
      </div>
    </section>

    <!-- ========== SESI FOTO ========== -->
    <section v-else-if="phase === 'capture'" class="capture-bar" :style="viewportStyle">
      <div class="thumbs">
        <div
          v-for="(thumb, i) in thumbs"
          :key="i"
          class="thumb"
          :class="{ current: i === shotIndex && !thumb, done: !!thumb }"
          :style="{ aspectRatio: videoAspect }"
        >
          <img v-if="thumb" :src="thumb" alt="" />
          <span v-else>{{ i + 1 }}</span>
        </div>
      </div>
      <button class="btn small ghost" @click="goHome">Batal</button>
    </section>

    <!-- ========== EDIT ========== -->
    <EditorScreen
      v-else-if="phase === 'edit'"
      ref="editorRef"
      :templates="templates"
      :initial-template-id="selectedTemplateId"
      :shots="previewShots"
      :thumbs="thumbs"
      @save="onEditorSave"
    />

    <!-- ========== PROSES ========== -->
    <section v-else-if="phase === 'processing'" class="processing">
      <div v-if="!processError" class="progress-block">
        <span class="spinner big-spinner"></span>
        <p class="title">
          {{ processStep === 'compose' ? 'Menyusun foto' : 'Menyimpan foto' }}
        </p>
        <template v-if="processStep === 'upload'">
          <div class="bar"><div :style="{ width: `${(uploadProgress / uploadTotal) * 100}%` }"></div></div>
          <p class="muted">{{ uploadProgress }} dari {{ uploadTotal }}</p>
        </template>
      </div>
      <div v-else class="alert surface wide">
        <img v-if="resultUrl" class="mini-result" :src="resultUrl" alt="" />
        <p>{{ processError }}</p>
        <div class="row">
          <button class="btn big" @click="saveSession">Coba Lagi</button>
          <button class="btn big ghost" @click="goHome">Batal</button>
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
          <p class="eyebrow">Foto siap</p>
          <h2 class="title">Scan untuk mengunduh</h2>
          <div class="qr-card"><img :src="qrDataUrl" alt="Kode QR" /></div>
          <p class="muted">
            Foto berbingkai dan {{ previewShots.length }} foto asli<br />bisa diunduh lewat HP.
          </p>
        </template>
        <template v-else>
          <p class="eyebrow">Tersimpan</p>
          <h2 class="title">Fotomu sudah tersimpan</h2>
          <p class="muted">Link unduhan belum tersedia.<br />Minta operator menampilkan kode QR-nya nanti.</p>
        </template>
        <button class="btn big" @click="goHome">Selesai</button>
        <div class="auto-return">
          <div class="bar thin"><div :style="{ width: `${(secondsLeft / RESULT_TIMEOUT_S) * 100}%` }"></div></div>
          <p class="muted">Kembali otomatis dalam {{ secondsLeft }} detik</p>
        </div>
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
      <div class="alert surface">
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
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.alert {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 18px;
  max-width: 560px;
  padding: 28px 32px;
  font-size: 1.25rem;
  line-height: 1.5;
}

.alert p {
  margin: 0;
}

.alert.wide {
  align-items: center;
  text-align: center;
}

/* ---------- Kamera ---------- */

.viewport {
  position: absolute;
  overflow: hidden;
  background: #000;
}

.phase-home .viewport,
.phase-tutorial .viewport {
  inset: 0;
}

.phase-home .viewport::after,
.phase-tutorial .viewport::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.phase-home .viewport::after {
  background: linear-gradient(90deg, rgba(12, 22, 18, 0.96) 0%, rgba(12, 22, 18, 0.85) 45%, rgba(12, 22, 18, 0.55) 100%);
}

.phase-tutorial .viewport::after {
  background: rgba(12, 22, 18, 0.55);
}

.phase-capture .viewport {
  top: 3vh;
  left: 50%;
  transform: translateX(-50%);
  width: min(94vw, calc(72vh * var(--ar)));
  aspect-ratio: var(--ar);
  border-radius: 20px;
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
  top: 20px;
  left: 20px;
  padding: 10px 18px;
  border-radius: 999px;
  font-size: 1.15rem;
  font-weight: 700;
  z-index: 2;
}

.shot-label span {
  font-weight: 500;
  color: var(--text-muted);
}

.countdown,
.next-pose {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  /* Di atas lapisan flash, supaya tidak tertutup putih saat foto baru diambil. */
  z-index: 2;
}

.count {
  position: relative;
  width: min(36vh, 22vw);
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(12, 22, 18, 0.35);
  backdrop-filter: blur(6px);
  animation: appear-count 0.25s ease-out;
}

.count svg {
  position: absolute;
  inset: 0;
  transform: rotate(-90deg);
}

.count span {
  font-size: min(18vh, 11vw);
  font-weight: 300;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

circle {
  fill: none;
  stroke-width: 3;
}

.track {
  stroke: rgba(244, 241, 234, 0.18);
}

.drain {
  stroke: var(--white);
  stroke-linecap: round;
  stroke-dasharray: 339.3;
  animation: drain 1s linear forwards;
}

@keyframes drain {
  to {
    stroke-dashoffset: 339.3;
  }
}

@keyframes appear-count {
  from {
    opacity: 0;
    transform: scale(0.94);
  }
}

.next-pose span {
  padding: 16px 32px;
  border-radius: 999px;
  font-size: clamp(1.6rem, 3vw, 2.4rem);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.flash {
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.4s ease-out;
  z-index: 1;
}

.flash.on {
  opacity: 1;
  transition: none;
}

/* ---------- Beranda ---------- */

.home {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  align-items: center;
  gap: 5vw;
  padding: 7vh 6vw;
}

.home-intro {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
}

.home-intro .display {
  margin-top: 8px;
  font-size: clamp(4rem, 6.8vw, 8rem);
}

.home-intro .display span {
  display: block;
  white-space: nowrap;
}

.lead {
  margin: 0 0 32px;
  font-size: clamp(1.3rem, 2vw, 1.8rem);
  font-weight: 400;
  letter-spacing: 0.02em;
}

.meta {
  margin: 4px 0 0;
  font-size: 1.05rem;
}

.loading {
  font-size: 1.2rem;
}

.notice {
  margin: 0;
  padding: 12px 16px;
  border-left: 3px solid var(--gold);
  background: var(--gold-soft);
  border-radius: 4px;
  font-size: 1.1rem;
}

.home-frames {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.previews {
  display: flex;
  gap: 18px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.preview {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: rgba(19, 33, 27, 0.7);
  font-size: 1.05rem;
  font-weight: 600;
  transition: border-color 0.15s, background 0.15s;
}

.preview.selected {
  border-color: var(--gold);
  background: rgba(201, 164, 92, 0.1);
}

.preview img {
  height: 46vh;
  border-radius: 6px;
}

.server-banner {
  position: absolute;
  left: 6vw;
  bottom: 4vh;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 8px 8px 20px;
  border-radius: 999px;
  font-size: 1rem;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--red);
  box-shadow: 0 0 0 4px rgba(163, 58, 55, 0.25);
}

/* ---------- Tutorial ---------- */

.tutorial {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5vh 5vw;
}

.tutorial-card {
  width: min(880px, 100%);
  padding: 48px 56px;
  border-radius: 24px;
}

.tutorial-card .title {
  margin: 10px 0 32px;
}

.steps {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 22px;
  font-size: clamp(1.15rem, 1.7vw, 1.45rem);
  line-height: 1.45;
  color: var(--text-muted);
}

.steps li {
  display: flex;
  align-items: center;
  gap: 20px;
}

.steps b {
  color: var(--text);
  font-weight: 600;
}

.num {
  flex: none;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--gold);
  color: var(--gold);
  font-size: 1.1rem;
  font-weight: 700;
}

.tutorial-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  margin-top: 40px;
  padding-top: 32px;
  border-top: 1px solid var(--line);
}

.timer {
  position: relative;
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.timer svg {
  position: absolute;
  inset: 0;
  transform: rotate(-90deg);
}

.timer span {
  font-size: 2rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.timer .progress {
  stroke: var(--gold);
  stroke-linecap: round;
  stroke-dasharray: 339.3;
  transition: stroke-dashoffset 1s linear;
}

/* ---------- Bar sesi foto ---------- */

.capture-bar {
  position: absolute;
  inset: auto 0 0 0;
  height: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 0 3vw 3vh;
}

/* 8 thumbnail selalu muat: tinggi maksimal 10vh, tapi menyusut jika layar sempit. */
.thumbs {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 8px;
  width: min(calc(100vw - 6vw - 140px), calc(10vh * var(--ar) * 8 + 56px));
  min-width: 0;
}

.thumb {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-muted);
  transition: border-color 0.2s;
}

.thumb.current {
  border-color: var(--gold);
  color: var(--gold);
}

.thumb.done {
  border-color: transparent;
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  animation: fade-in 0.35s ease-out;
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
}

/* ---------- Proses ---------- */

.processing {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5vh 5vw;
}

.progress-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  width: min(480px, 100%);
}

.progress-block p {
  margin: 0;
}

.big-spinner {
  font-size: 3.5rem;
}

.bar {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
}

.bar.thin {
  height: 3px;
}

.bar > div {
  height: 100%;
  border-radius: inherit;
  background: var(--gold);
  transition: width 0.4s ease;
}

.mini-result {
  max-height: 28vh;
  border-radius: 8px;
}

/* ---------- Hasil ---------- */

.result {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 5vw;
  align-items: center;
  padding: 5vh 5vw;
}

.result-photo {
  height: 90vh;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-photo img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 10px;
  box-shadow: var(--shadow);
}

.side {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
}

.side p {
  margin: 0;
  font-size: 1.15rem;
  line-height: 1.5;
}

.side .title {
  margin-bottom: 8px;
}

.qr-card {
  width: min(28vw, 44vh);
  aspect-ratio: 1;
  padding: 18px;
  background: var(--white);
  border-radius: 20px;
}

.qr-card img {
  width: 100%;
  height: 100%;
  display: block;
}

.side .btn {
  margin-top: 12px;
}

.auto-return {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.auto-return p {
  font-size: 0.95rem;
}

.auto-return .bar > div {
  background: var(--text-muted);
  transition: width 1s linear;
}

/* ---------- Error fatal ---------- */

.fatal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
}

/* ---------- Responsif: layar tegak (tablet portrait) ---------- */

@media (max-aspect-ratio: 1/1) {
  .home {
    grid-template-columns: minmax(0, 1fr);
    align-content: center;
    gap: 6vh;
    padding: 6vh 7vw;
  }

  .phase-home .viewport::after {
    background: rgba(12, 22, 18, 0.82);
  }

  .home-intro .display {
    font-size: clamp(3rem, 11vw, 7rem);
  }

  .lead {
    margin-bottom: 20px;
  }

  .preview img {
    height: 26vh;
  }

  .server-banner {
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
  }

  .phase-capture .viewport {
    top: 10vh;
  }

  .count {
    width: 40vw;
  }

  .count span {
    font-size: 20vw;
  }

  .capture-bar {
    flex-direction: column;
    gap: 16px;
    padding-bottom: 4vh;
  }

  .thumbs {
    width: 94vw;
  }

  .result {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 3vh;
    padding: 4vh 6vw;
  }

  .result-photo {
    height: 100%;
    min-height: 0;
  }

  .side {
    align-items: center;
    text-align: center;
  }

  .qr-card {
    width: min(42vw, 26vh);
  }

  .auto-return {
    align-self: center;
  }
}

/* ---------- Responsif: layar kecil ---------- */

@media (max-width: 760px) {
  .tutorial {
    padding: 4vh 4vw;
  }

  .tutorial-card {
    padding: 28px 24px;
  }

  .tutorial-footer {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .timer {
    align-self: center;
  }

  .btn.big {
    min-width: 0;
    width: 100%;
    padding: 0 24px;
    font-size: 1.3rem;
  }

  .shot-label {
    top: 12px;
    left: 12px;
    font-size: 1rem;
  }

  .alert {
    padding: 22px;
    font-size: 1.1rem;
  }
}

/* Layar pendek (tablet landscape kecil). */
@media (max-height: 700px) and (min-aspect-ratio: 1/1) {
  .home {
    padding: 5vh 5vw;
  }

  .lead {
    margin-bottom: 16px;
  }

  .tutorial-card {
    padding: 28px 36px;
  }

  .steps {
    gap: 14px;
  }

  .tutorial-footer {
    margin-top: 24px;
    padding-top: 20px;
  }
}
</style>
