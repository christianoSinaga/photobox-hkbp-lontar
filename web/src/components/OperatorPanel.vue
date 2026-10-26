<script setup>
import { ref, onMounted } from 'vue'
import { getConfig, putConfig, listPhotos, publicPageUrl } from '../lib/api.js'
import { makeQr } from '../lib/qr.js'

defineProps({
  devices: { type: Array, required: true },
  deviceId: { type: String, default: '' },
})
const emit = defineEmits(['select-camera', 'close'])

const baseUrl = ref(null)
const baseUrlInput = ref('')
const configStatus = ref('')
const photos = ref([])
const photosError = ref('')
const selected = ref(null)
const selectedQr = ref('')

async function loadConfig() {
  try {
    const cfg = await getConfig()
    baseUrl.value = cfg.publicBaseUrl
    baseUrlInput.value = cfg.publicBaseUrl ?? ''
  } catch {
    configStatus.value = 'Server tidak bisa dihubungi.'
  }
}

async function saveConfig() {
  configStatus.value = ''
  try {
    const cfg = await putConfig(baseUrlInput.value.trim() || null)
    baseUrl.value = cfg.publicBaseUrl
    baseUrlInput.value = cfg.publicBaseUrl ?? ''
    configStatus.value = cfg.publicBaseUrl ? 'Tersimpan.' : 'URL publik dikosongkan.'
  } catch (e) {
    configStatus.value = e.status === 400 ? 'URL tidak valid. Contoh: https://abc123-3000.asse.devtunnels.ms' : 'Gagal menyimpan.'
  }
}

async function loadPhotos() {
  photosError.value = ''
  try {
    photos.value = await listPhotos()
  } catch {
    photosError.value = 'Galeri gagal dimuat.'
  }
}

async function openPhoto(p) {
  selected.value = p
  const url = publicPageUrl(baseUrl.value, p.id)
  selectedQr.value = url ? await makeQr(url) : ''
}

const formatTime = (iso) =>
  new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' })

onMounted(() => {
  loadConfig()
  loadPhotos()
})
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="panel">
      <header>
        <h2>Panel Operator</h2>
        <button class="btn ghost" @click="emit('close')">Tutup</button>
      </header>

      <div class="body">
        <section>
          <h3>Kamera</h3>
          <select
            :value="deviceId"
            @change="emit('select-camera', $event.target.value)"
          >
            <option v-if="!devices.length" value="">Tidak ada kamera</option>
            <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.label }}</option>
          </select>
        </section>

        <section>
          <h3>URL publik (port 3000)</h3>
          <p class="hint">
            Di VS Code: tab <b>Ports</b> → Forward port 3000 → klik kanan → Port Visibility → <b>Public</b>.
            Salin alamatnya ke sini.
          </p>
          <form class="row" @submit.prevent="saveConfig">
            <input
              v-model="baseUrlInput"
              type="url"
              placeholder="https://xxxx-3000.asse.devtunnels.ms"
              spellcheck="false"
            />
            <button class="btn" type="submit">Simpan</button>
          </form>
          <p v-if="configStatus" class="hint">{{ configStatus }}</p>
        </section>

        <section class="gallery-section">
          <div class="row">
            <h3>Galeri ({{ photos.length }})</h3>
            <button class="btn ghost small" @click="loadPhotos">Muat ulang</button>
          </div>
          <p v-if="photosError" class="hint">{{ photosError }}</p>
          <div class="gallery">
            <button v-for="p in photos" :key="p.id" class="thumb" @click="openPhoto(p)">
              <img :src="`/f/${p.id}`" loading="lazy" alt="" />
              <span>{{ formatTime(p.createdAt) }}</span>
            </button>
          </div>
        </section>
      </div>

      <div v-if="selected" class="detail" @click.self="selected = null">
        <div class="detail-card">
          <img class="detail-photo" :src="`/f/${selected.id}`" alt="" />
          <div class="detail-side">
            <img v-if="selectedQr" class="qr" :src="selectedQr" alt="Kode QR" />
            <p v-else class="hint">Atur URL publik dulu untuk menampilkan QR.</p>
            <p v-if="baseUrl" class="mono">{{ publicPageUrl(baseUrl, selected.id) }}</p>
            <p class="mono">{{ selected.id }}</p>
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
  z-index: 10;
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
  height: 90vh;
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
  justify-content: space-between;
  padding: 16px 24px;
  background: var(--red-dark);
}

h2 {
  margin: 0;
  font-family: var(--serif);
  color: var(--gold);
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
  gap: 20px;
  padding: 20px 24px;
}

.btn {
  min-height: 52px;
  padding: 0 24px;
  font-size: 1.1rem;
  box-shadow: none;
}

.btn.small {
  min-height: 40px;
  font-size: 1rem;
}

select,
input {
  width: 100%;
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

.hint {
  margin: 0 0 8px;
  opacity: 0.85;
  line-height: 1.5;
}

.gallery-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  background: rgba(0, 0, 0, 0.75);
}

.detail-card {
  display: flex;
  gap: 32px;
  align-items: center;
  max-height: 84vh;
  padding: 24px;
}

.detail-photo {
  max-height: 76vh;
  max-width: 45vw;
  border: 3px solid var(--gold);
  border-radius: 8px;
}

.detail-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 380px;
  text-align: center;
}

.qr {
  width: 320px;
  padding: 12px;
  background: #fff;
  border-radius: 12px;
}

.mono {
  margin: 0;
  font-family: ui-monospace, Consolas, monospace;
  word-break: break-all;
  opacity: 0.85;
}
</style>
