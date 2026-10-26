<script setup>
import { ref, onMounted } from 'vue'
import { ApiError, getConfig, putConfig, listPhotos, publicPageUrl } from '../lib/api.js'
import { makeQr } from '../lib/qr.js'

defineProps({
  devices: { type: Array, required: true },
  deviceId: { type: String, default: '' },
  cameraError: { type: String, default: '' },
})
const emit = defineEmits(['select-camera', 'restart-camera', 'close'])

const serverError = ref('')
const baseUrl = ref(null)
const baseUrlInput = ref('')
const configStatus = ref('')
const saving = ref(false)
const photos = ref([])
const photosLoading = ref(false)
const selected = ref(null)
const selectedQr = ref('')

function describe(e) {
  return e instanceof ApiError && e.serverDown
    ? 'Server tidak bisa dihubungi. Pastikan jendela server masih menyala.'
    : 'Permintaan ke server gagal.'
}

async function loadConfig() {
  const cfg = await getConfig()
  baseUrl.value = cfg.publicBaseUrl
  baseUrlInput.value = cfg.publicBaseUrl ?? ''
}

async function loadPhotos() {
  photosLoading.value = true
  try {
    photos.value = await listPhotos()
  } finally {
    photosLoading.value = false
  }
}

async function refresh() {
  serverError.value = ''
  try {
    await Promise.all([loadConfig(), loadPhotos()])
  } catch (e) {
    serverError.value = describe(e)
  }
}

async function saveConfig(value) {
  configStatus.value = ''
  saving.value = true
  try {
    const cfg = await putConfig(value)
    baseUrl.value = cfg.publicBaseUrl
    baseUrlInput.value = cfg.publicBaseUrl ?? ''
    configStatus.value = cfg.publicBaseUrl ? 'Tersimpan.' : 'URL publik dikosongkan.'
    serverError.value = ''
  } catch (e) {
    configStatus.value =
      e instanceof ApiError && e.status === 400
        ? 'URL tidak valid. Contoh: https://abc123-3000.asse.devtunnels.ms'
        : describe(e)
  } finally {
    saving.value = false
  }
}

async function openPhoto(p) {
  selected.value = p
  selectedQr.value = ''
  const url = publicPageUrl(baseUrl.value, p.id)
  if (url) selectedQr.value = await makeQr(url)
}

const formatTime = (iso) =>
  new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' })

onMounted(refresh)
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="panel">
      <header>
        <h2>Pengaturan Operator</h2>
        <span class="shortcut">Ctrl+Shift+S / Esc untuk menutup</span>
        <button class="btn ghost" @click="emit('close')">Tutup</button>
      </header>

      <div class="body">
        <div v-if="serverError" class="alert">
          <span>{{ serverError }}</span>
          <button class="btn small" @click="refresh">Coba Lagi</button>
        </div>

        <section>
          <h3>URL publik</h3>
          <p class="active">
            Aktif:
            <b v-if="baseUrl" class="mono">{{ baseUrl }}</b>
            <b v-else class="warn">belum diatur (tamu tidak mendapat QR)</b>
          </p>
          <p class="hint">
            VS Code → tab <b>Ports</b> → Forward port <b>3000</b> → klik kanan → Port Visibility →
            <b>Public</b>. Salin alamatnya ke sini.
          </p>
          <form class="row" @submit.prevent="saveConfig(baseUrlInput.trim() || null)">
            <input
              v-model="baseUrlInput"
              type="text"
              inputmode="url"
              placeholder="https://xxxx-3000.asse.devtunnels.ms"
              spellcheck="false"
              autocomplete="off"
            />
            <button class="btn" type="submit" :disabled="saving">Simpan</button>
            <button class="btn ghost" type="button" :disabled="saving || !baseUrl" @click="saveConfig(null)">
              Kosongkan
            </button>
          </form>
          <p v-if="configStatus" class="hint">{{ configStatus }}</p>
        </section>

        <section>
          <h3>Kamera</h3>
          <div class="row">
            <select :value="deviceId" @change="emit('select-camera', $event.target.value)">
              <option v-if="!devices.length" value="">Tidak ada kamera terdeteksi</option>
              <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.label }}</option>
            </select>
            <button class="btn ghost" @click="emit('restart-camera')">Muat Ulang Kamera</button>
          </div>
          <p v-if="cameraError" class="hint warn">{{ cameraError }}</p>
        </section>

        <section class="gallery-section">
          <div class="row">
            <h3>Galeri ({{ photos.length }})</h3>
            <button class="btn ghost small" :disabled="photosLoading" @click="refresh">Muat ulang</button>
          </div>
          <p class="hint">Sentuh foto untuk menampilkan ulang kode QR-nya.</p>
          <div class="gallery">
            <button v-for="p in photos" :key="p.id" class="thumb" @click="openPhoto(p)">
              <img :src="`/f/${p.id}`" loading="lazy" alt="" />
              <span>{{ formatTime(p.createdAt) }}</span>
            </button>
            <p v-if="!photos.length && !photosLoading && !serverError" class="hint">Belum ada foto.</p>
          </div>
        </section>
      </div>

      <div v-if="selected" class="detail" @click.self="selected = null">
        <div class="detail-card">
          <img class="detail-photo" :src="`/f/${selected.id}`" alt="" />
          <div class="detail-side">
            <template v-if="selectedQr">
              <h3>Scan untuk download</h3>
              <img class="qr" :src="selectedQr" alt="Kode QR" />
              <p class="mono">{{ publicPageUrl(baseUrl, selected.id) }}</p>
            </template>
            <p v-else class="hint warn">Atur URL publik dulu untuk menampilkan QR.</p>
            <button class="btn" @click="selected = null">Kembali</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  user-select: text;
  -webkit-user-select: text;
}

.panel {
  position: relative;
  width: min(1100px, 94vw);
  height: 92vh;
  display: flex;
  flex-direction: column;
  border-radius: 20px;
  border: 3px solid var(--gold);
  background: var(--green);
  box-shadow: var(--shadow);
  overflow: hidden;
}

header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 24px;
  background: var(--red-dark);
}

h2 {
  margin: 0;
  flex: 1;
  font-family: var(--serif);
  color: var(--gold);
}

.shortcut {
  opacity: 0.7;
  font-size: 0.9rem;
}

h3 {
  margin: 0 0 8px;
  color: var(--gold-light);
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px 24px;
}

.btn {
  min-height: 52px;
  padding: 0 22px;
  font-size: 1.05rem;
  box-shadow: none;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.5;
}

.btn.small {
  min-height: 40px;
  font-size: 0.95rem;
}

select,
input {
  flex: 1;
  min-width: 0;
  min-height: 52px;
  padding: 0 16px;
  border-radius: 12px;
  border: 2px solid rgba(212, 166, 58, 0.6);
  background: rgba(255, 255, 255, 0.95);
  color: #1b1b1b;
  font: inherit;
  font-size: 1.1rem;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.row h3 {
  margin: 0;
  flex: 1;
}

.alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 10px 10px 18px;
  border-radius: 12px;
  background: var(--red);
  border: 2px solid var(--gold);
}

.active {
  margin: 0 0 8px;
  font-size: 1.1rem;
}

.hint {
  margin: 0 0 8px;
  opacity: 0.85;
  line-height: 1.5;
}

.warn {
  color: #ffb4a8;
  opacity: 1;
}

.gallery-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gallery {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  align-content: start;
}

.thumb {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border-radius: 10px;
  border: 2px solid transparent;
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.85rem;
}

.thumb:active {
  border-color: var(--gold);
}

.thumb img {
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: contain;
  background: #000;
  border-radius: 6px;
}

.detail {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
}

.detail-card {
  display: flex;
  gap: 32px;
  align-items: center;
  max-height: 86vh;
  padding: 24px;
}

.detail-photo {
  max-height: 80vh;
  max-width: 45vw;
  border: 3px solid var(--gold);
  border-radius: 8px;
}

.detail-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  max-width: 400px;
  text-align: center;
}

.qr {
  width: 340px;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
}

.mono {
  margin: 0;
  font-family: ui-monospace, Consolas, monospace;
  word-break: break-all;
}
</style>
