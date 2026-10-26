async function request(path, options) {
  const res = await fetch(path, options)
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
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
