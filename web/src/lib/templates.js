const INDEX_URL = '/templates/index.json'

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.json()
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Gagal memuat gambar ${src}`))
    img.src = src
  })
}

function validate(t, path) {
  const ok =
    t && t.id && t.frame && t.width > 0 && t.height > 0 &&
    Array.isArray(t.slots) && t.slots.length > 0 &&
    t.slots.every((s) => s.w > 0 && s.h > 0)
  if (!ok) throw new Error(`Template tidak valid: ${path}`)
}

/** Daftar path JSON template dari index.json. */
export const loadIndex = () => fetchJson(INDEX_URL)

/** Satu template beserta gambar frame-nya. */
export async function loadTemplate(path) {
  const t = await fetchJson(path)
  validate(t, path)
  return { ...t, frameImage: await loadImage(t.frame) }
}

/**
 * Template dummy yang digambar lewat kode, khusus development,
 * supaya alur foto bisa dites tanpa aset desain.
 */
function createDummyTemplate() {
  const width = 1200
  const height = 1800
  const slots = [
    { x: 80, y: 80, w: 1040, h: 460 },
    { x: 80, y: 580, w: 1040, h: 460 },
    { x: 80, y: 1080, w: 1040, h: 460 },
  ]
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0f3d2a'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#d4a63a'
  ctx.lineWidth = 8
  for (const s of slots) ctx.strokeRect(s.x - 4, s.y - 4, s.w + 8, s.h + 8)
  ctx.fillStyle = '#d4a63a'
  ctx.font = 'italic bold 96px Georgia, serif'
  ctx.textAlign = 'center'
  ctx.fillText('Template Dummy', width / 2, 1690)
  for (const s of slots) ctx.clearRect(s.x, s.y, s.w, s.h)
  return {
    id: 'dummy-dev',
    name: 'Dummy (dev)',
    frame: canvas.toDataURL('image/png'),
    frameImage: canvas,
    width,
    height,
    slots,
  }
}

/** Memuat semua template dari index.json. Template yang rusak dilewati (dicatat di console). */
export async function loadTemplates() {
  let templates = []
  try {
    const paths = await loadIndex()
    const results = await Promise.allSettled(paths.map(loadTemplate))
    for (const r of results) if (r.status === 'rejected') console.error(r.reason)
    templates = results.filter((r) => r.status === 'fulfilled').map((r) => r.value)
  } catch (e) {
    if (!import.meta.env.DEV) throw e
    console.error(e)
  }
  if (import.meta.env.DEV) templates.push(createDummyTemplate())
  return templates
}
