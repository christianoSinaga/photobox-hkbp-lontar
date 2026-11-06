/**
 * Pengaturan foto di dalam slot:
 * - x, y (0..1): posisi crop; 0.5 = tengah, 0 = kiri/atas, 1 = kanan/bawah.
 * - zoom (1..MAX_ZOOM): 1 = foto pas memenuhi slot (crop "cover"); lebih besar = diperbesar.
 * - flipX / flipY: dibalik horizontal / vertikal.
 */
export const DEFAULT_TRANSFORM = Object.freeze({ x: 0.5, y: 0.5, zoom: 1, flipX: false, flipY: false })
export const MIN_ZOOM = 1
export const MAX_ZOOM = 3

const clamp01 = (v) => Math.min(1, Math.max(0, v))

export function drawCover(ctx, src, x, y, w, h, t = DEFAULT_TRANSFORM) {
  const scale = Math.max(w / src.width, h / src.height) * (t.zoom ?? 1)
  const cropW = w / scale
  const cropH = h / scale
  const cropX = (src.width - cropW) * (t.x ?? 0.5)
  const cropY = (src.height - cropH) * (t.y ?? 0.5)
  if (!t.flipX && !t.flipY) {
    ctx.drawImage(src, cropX, cropY, cropW, cropH, x, y, w, h)
    return
  }
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.scale(t.flipX ? -1 : 1, t.flipY ? -1 : 1)
  ctx.drawImage(src, cropX, cropY, cropW, cropH, -w / 2, -h / 2, w, h)
  ctx.restore()
}

/** Pengaturan baru setelah foto di slot digeser sejauh (dx, dy) piksel template. */
export function panTransform(src, slot, t, dx, dy) {
  const scale = Math.max(slot.w / src.width, slot.h / src.height) * (t.zoom ?? 1)
  const spareX = src.width - slot.w / scale
  const spareY = src.height - slot.h / scale
  // Foto yang dibalik bergerak berlawanan arah terhadap jendela crop-nya.
  const sx = t.flipX ? -dx : dx
  const sy = t.flipY ? -dy : dy
  return {
    ...t,
    x: spareX > 0.5 ? clamp01(t.x - sx / scale / spareX) : 0.5,
    y: spareY > 0.5 ? clamp01(t.y - sy / scale / spareY) : 0.5,
  }
}

/**
 * Gambar seluruh komposisi pada ctx dalam koordinat template.
 * shots[i] = foto untuk slot i. Filter hanya mengenai foto, tidak mengenai frame.
 */
export function drawComposition(ctx, template, shots, { transforms = [], filter = 'none', placeholder = false } = {}) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, template.width, template.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.filter = filter
  template.slots.forEach((slot, i) => {
    if (shots[i]) drawCover(ctx, shots[i], slot.x, slot.y, slot.w, slot.h, transforms[i] ?? DEFAULT_TRANSFORM)
    else if (placeholder) {
      ctx.fillStyle = '#2b3a33'
      ctx.fillRect(slot.x, slot.y, slot.w, slot.h)
    }
  })
  ctx.filter = 'none'
  ctx.drawImage(template.frameImage, 0, 0, template.width, template.height)
}

export function canvasToJpeg(canvas, quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Gagal membuat JPEG'))),
      'image/jpeg',
      quality,
    )
  })
}

/** Susun foto ke slot template (dengan offset dan filter), lalu frame di atasnya. Hasil: Blob JPEG 0.92. */
export function compose(template, shots, options = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = template.width
  canvas.height = template.height
  drawComposition(canvas.getContext('2d'), template, shots, options)
  return canvasToJpeg(canvas)
}

/** Salinan kecil dari canvas (untuk preview editor agar ringan saat digeser). */
export function downscale(src, maxWidth) {
  const ratio = Math.min(1, maxWidth / src.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(src.width * ratio)
  canvas.height = Math.round(src.height * ratio)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
  return canvas
}

export const toDataUrl = (canvas, width = 320) => downscale(canvas, width).toDataURL('image/jpeg', 0.75)
