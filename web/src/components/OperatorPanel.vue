<script setup>
import { ref, onMounted } from 'vue'
import { ApiError, getConfig, putConfig, listSessions, publicSessionUrl } from '../lib/api.js'
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
    photos.value = await listSessions()
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
        ? 'URL tidak valid. Contoh: https://nama.github.io/photobox'
        : describe(e)
  } finally {
    saving.value = false
  }
}

async function openPhoto(p) {
  selected.value = p
  selectedQr.value = ''
  const url = publicSessionUrl(baseUrl.value, p.id)
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
        <span class="shortcut">Buka: Ctrl+Shift+S atau tahan judul 3 detik · Tutup: Esc</span>
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
            Alamat yang dipakai di kode QR. Isi dengan alamat <b>GitHub Pages</b>
            (mis. <span class="mono">https://nama.github.io/photobox</span>) jika memakai domain tetap,
            atau langsung alamat <b>port 3000</b> dari tab Ports di VS Code (visibility <b>Public</b>).
          </p>
          <form class="row" @submit.prevent="saveConfig(baseUrlInput.trim() || null)">
            <input
              v-model="baseUrlInput"
              type="text"
              inputmode="url"
              placeholder="https://nama.github.io/photobox"
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
            <h3>Galeri sesi ({{ photos.length }})</h3>
            <button class="btn ghost small" :disabled="photosLoading" @click="refresh">Muat ulang</button>
          </div>
          <p class="hint">Sentuh foto untuk menampilkan ulang kode QR-nya.</p>
          <div class="gallery">
            <button v-for="p in photos" :key="p.id" class="thumb" @click="openPhoto(p)">
              <img :src="`/f/${p.main}`" loading="lazy" alt="" />
              <span>{{ formatTime(p.createdAt) }}</span>
            </button>
            <p v-if="!photos.length && !photosLoading && !serverError" class="hint">Belum ada sesi foto.</p>
          </div>
        </section>
      </div>

      <div v-if="selected" class="detail" @click.self="selected = null">
        <div class="detail-card">
          <img class="detail-photo" :src="`/f/${selected.main}`" alt="" />
          <div class="detail-side">
            <template v-if="selectedQr">
              <h3>Scan untuk download</h3>
              <img class="qr" :src="selectedQr" alt="Kode QR" />
              <p class="mono">{{ publicSessionUrl(baseUrl, selected.id) }}</p>
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
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
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
  border: 1px solid var(--line);
  background: var(--bg);
  box-shadow: var(--shadow);
  overflow: hidden;
}

header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px 28px;
  border-bottom: 1px solid var(--line);
}

h2 {
  margin: 0;
  flex: 1;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.shortcut {
  color: var(--text-muted);
  font-size: 0.9rem;
}

h3 {
  margin: 0 0 10px;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding: 24px 28px;
}

.btn {
  min-height: 50px;
  padding: 0 22px;
  font-size: 1rem;
  white-space: nowrap;
}

.btn.small {
  min-height: 40px;
  padding: 0 16px;
  font-size: 0.9rem;
}

select,
input {
  flex: 1;
  min-width: 0;
  min-height: 50px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 1rem;
}

select:focus,
input:focus {
  outline: none;
  border-color: var(--gold);
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
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
  background: rgba(163, 58, 55, 0.18);
  border: 1px solid rgba(163, 58, 55, 0.5);
}

.active {
  margin: 0 0 8px;
  font-size: 1.05rem;
}

.hint {
  margin: 0 0 8px;
  color: var(--text-muted);
  line-height: 1.55;
  font-size: 0.95rem;
}

.hint b {
  color: var(--text);
}

.warn {
  color: #e3928c;
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
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
  align-content: start;
}

.thumb {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text-muted);
  font-size: 0.8rem;
}

.thumb:active {
  border-color: var(--gold);
}

.thumb img {
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: contain;
  background: #000;
  border-radius: 8px;
}

.detail {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(12, 22, 18, 0.96);
}

.detail-card {
  display: flex;
  gap: 40px;
  align-items: center;
  max-height: 86vh;
  padding: 24px;
}

.detail-photo {
  max-height: 80vh;
  max-width: 45vw;
  border-radius: 10px;
}

.detail-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  max-width: 400px;
  text-align: center;
}

.detail-side h3 {
  margin: 0;
}

.qr {
  width: 320px;
  padding: 14px;
  background: #fff;
  border-radius: 16px;
}

.mono {
  margin: 0;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.9rem;
  word-break: break-all;
  color: var(--text-muted);
}

.active .mono {
  color: var(--text);
  font-size: 1rem;
}

@media (max-width: 900px), (max-aspect-ratio: 1/1) {
  .panel {
    width: 96vw;
    height: 94vh;
  }

  header {
    padding: 14px 18px;
  }

  .shortcut {
    display: none;
  }

  .body {
    padding: 18px;
    gap: 20px;
    overflow-y: auto;
  }

  form.row {
    flex-wrap: wrap;
  }

  form.row input {
    flex-basis: 100%;
  }

  .gallery-section {
    min-height: 40vh;
  }

  .detail-card {
    flex-direction: column;
    gap: 20px;
    max-height: 92vh;
    overflow-y: auto;
  }

  .detail-photo {
    max-width: 80vw;
    max-height: 40vh;
  }

  .qr {
    width: min(260px, 60vw);
  }
}
</style>
