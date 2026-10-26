const INDEX_URL = '/templates/index.json'

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.json()
}

function loadImage(src) {
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

/** Memuat semua template dari index.json. Template yang rusak dilewati (dicatat di console). */
export async function loadTemplates() {
  const paths = await fetchJson(INDEX_URL)
  const results = await Promise.allSettled(
    paths.map(async (path) => {
      const t = await fetchJson(path)
      validate(t, path)
      return { ...t, frameImage: await loadImage(t.frame) }
    }),
  )
  for (const r of results) if (r.status === 'rejected') console.error(r.reason)
  return results.filter((r) => r.status === 'fulfilled').map((r) => r.value)
}
