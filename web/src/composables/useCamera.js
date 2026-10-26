import { ref, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue'

const STORAGE_KEY = 'photobox.cameraId'

function readPreferred() {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function savePreferred(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // localStorage tidak tersedia; pilihan hanya berlaku sampai halaman dimuat ulang.
  }
}

function describeError(e) {
  switch (e?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Izin kamera ditolak. Minta operator mengizinkan kamera di browser.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Kamera tidak terdeteksi. Pastikan kamera sudah tercolok.'
    case 'NotReadableError':
    case 'AbortError':
      return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi tersebut, lalu coba lagi.'
    default:
      return 'Kamera gagal dibuka. Coba lagi.'
  }
}

function openStream(deviceId) {
  const video = { width: { ideal: 1920 }, height: { ideal: 1080 } }
  if (deviceId) video.deviceId = { exact: deviceId }
  return navigator.mediaDevices.getUserMedia({ video, audio: false })
}

/**
 * Kamera dengan pilihan perangkat yang diingat di localStorage.
 * Pasang `videoEl` ke elemen <video> (ref="videoEl"); stream dipasang otomatis.
 * Jika kamera pilihan (mis. kamera Pubdok) belum tercolok, pakai kamera lain dulu,
 * lalu otomatis pindah begitu kamera pilihan muncul.
 */
export function useCamera() {
  const videoEl = ref(null)
  const stream = shallowRef(null)
  const devices = ref([])
  const deviceId = ref('')
  const error = ref('')
  const starting = ref(false)
  let preferredId = readPreferred()
  let attempt = 0

  watch([stream, videoEl], ([s, el]) => {
    if (el && el.srcObject !== s) el.srcObject = s
  })

  async function refreshDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      devices.value = all
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({ id: d.deviceId, label: d.label || `Kamera ${i + 1}` }))
    } catch {
      devices.value = []
    }
  }

  function stop() {
    attempt++
    stream.value?.getTracks().forEach((t) => t.stop())
    stream.value = null
  }

  async function start(id = preferredId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = 'Browser ini tidak mendukung kamera.'
      return
    }
    stop()
    const current = attempt
    error.value = ''
    starting.value = true
    try {
      let s
      try {
        s = await openStream(id)
      } catch (e) {
        if (!id || !['OverconstrainedError', 'NotFoundError'].includes(e.name)) throw e
        s = await openStream('')
      }
      if (current !== attempt) {
        s.getTracks().forEach((t) => t.stop())
        return
      }
      const track = s.getVideoTracks()[0]
      track.addEventListener('ended', () => {
        if (stream.value === s) {
          stream.value = null
          error.value = 'Kamera terputus. Periksa kabel kamera, lalu coba lagi.'
        }
      })
      stream.value = s
      deviceId.value = track.getSettings().deviceId || ''
    } catch (e) {
      console.error(e)
      if (current === attempt) error.value = describeError(e)
    } finally {
      if (current === attempt) starting.value = false
      await refreshDevices()
    }
  }

  function select(id) {
    preferredId = id
    savePreferred(id)
    return start(id)
  }

  /** Ambil frame saat ini ke canvas pada resolusi asli kamera. Tidak di-mirror. */
  function grab() {
    const video = videoEl.value
    if (!stream.value || !video || !video.videoWidth) return null
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    return canvas
  }

  async function onDeviceChange() {
    await refreshDevices()
    const preferredPresent = preferredId && devices.value.some((d) => d.id === preferredId)
    if (starting.value) return
    if (!stream.value || (preferredPresent && deviceId.value !== preferredId)) start()
  }

  onMounted(() => navigator.mediaDevices?.addEventListener('devicechange', onDeviceChange))
  onBeforeUnmount(() => {
    navigator.mediaDevices?.removeEventListener('devicechange', onDeviceChange)
    stop()
  })

  return { videoEl, stream, devices, deviceId, error, starting, start, stop, select, grab }
}
