import { ref, shallowRef, onMounted, onBeforeUnmount } from 'vue'

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
      return 'Akses kamera ditolak. Izinkan kamera di browser.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Kamera tidak ditemukan.'
    case 'NotReadableError':
      return 'Kamera sedang dipakai aplikasi lain.'
    default:
      return `Kamera gagal dibuka${e?.message ? `: ${e.message}` : '.'}`
  }
}

function openStream(deviceId) {
  const video = { width: { ideal: 1920 }, height: { ideal: 1080 } }
  if (deviceId) video.deviceId = { exact: deviceId }
  return navigator.mediaDevices.getUserMedia({ video, audio: false })
}

/**
 * Kamera dengan pilihan perangkat yang diingat di localStorage.
 * Jika kamera pilihan (mis. kamera Pubdok) belum tercolok, pakai kamera lain dulu,
 * lalu otomatis pindah begitu kamera pilihan muncul.
 */
export function useCamera() {
  const stream = shallowRef(null)
  const devices = ref([])
  const deviceId = ref('')
  const error = ref('')
  let preferredId = readPreferred()
  let attempt = 0

  async function refreshDevices() {
    const all = await navigator.mediaDevices.enumerateDevices()
    devices.value = all
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Kamera ${i + 1}` }))
  }

  function stop() {
    stream.value?.getTracks().forEach((t) => t.stop())
    stream.value = null
  }

  async function start(id = preferredId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = 'Browser ini tidak mendukung kamera.'
      return
    }
    const current = ++attempt
    stop()
    error.value = ''
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
          error.value = 'Kamera terputus.'
        }
      })
      stream.value = s
      deviceId.value = track.getSettings().deviceId || ''
      await refreshDevices()
    } catch (e) {
      if (current === attempt) error.value = describeError(e)
    }
  }

  function select(id) {
    preferredId = id
    savePreferred(id)
    return start(id)
  }

  async function onDeviceChange() {
    await refreshDevices()
    const preferredPresent = preferredId && devices.value.some((d) => d.id === preferredId)
    if (!stream.value || (preferredPresent && deviceId.value !== preferredId)) start()
  }

  onMounted(() => navigator.mediaDevices?.addEventListener('devicechange', onDeviceChange))
  onBeforeUnmount(() => {
    navigator.mediaDevices?.removeEventListener('devicechange', onDeviceChange)
    stop()
  })

  return { stream, devices, deviceId, error, start, select }
}
