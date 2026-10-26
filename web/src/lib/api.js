export class ApiError extends Error {
  /** @param {'network' | 'http'} kind */
  constructor(kind, status = 0) {
    super(kind === 'network' ? 'Server tidak bisa dihubungi' : `HTTP ${status}`)
    this.kind = kind
    this.status = status
  }

  /** Server mati, tidak terjangkau, atau error di sisi server (proxy Vite membalas 5xx saat server mati). */
  get serverDown() {
    return this.kind === 'network' || this.status >= 500
  }
}

async function request(path, options) {
  let res
  try {
    res = await fetch(path, options)
  } catch {
    throw new ApiError('network')
  }
  if (!res.ok) throw new ApiError('http', res.status)
  return res.json()
}

export const getConfig = () => request('/api/config')

export const putConfig = (publicBaseUrl) =>
  request('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicBaseUrl }),
  })

export const listPhotos = () => request('/api/photos')

export const uploadPhoto = (blob) =>
  request('/api/photos', {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: blob,
  })

export const publicPageUrl = (baseUrl, id) => (baseUrl ? `${baseUrl}/p/${id}` : null)

export function uploadErrorMessage(e) {
  if (e instanceof ApiError && e.serverDown)
    return 'Server tidak bisa dihubungi. Minta operator memeriksa server, lalu coba lagi.'
  return 'Foto gagal disimpan. Silakan coba lagi.'
}
