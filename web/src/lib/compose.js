/** Gambar src ke kotak tujuan dengan crop tengah (setara object-fit: cover). */
export function drawCover(ctx, src, x, y, w, h) {
  const scale = Math.max(w / src.width, h / src.height)
  const cropW = w / scale
  const cropH = h / scale
  const cropX = (src.width - cropW) / 2
  const cropY = (src.height - cropH) / 2
  ctx.drawImage(src, cropX, cropY, cropW, cropH, x, y, w, h)
}

/** Thumbnail kecil dengan crop yang sama seperti hasil akhir di slot. */
export function makeThumb(shot, slot, width = 240) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = Math.round((width * slot.h) / slot.w)
  drawCover(canvas.getContext('2d'), shot, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.7)
}

/** Susun foto ke slot template, lalu frame PNG di atasnya. Hasil: Blob JPEG kualitas 0.92. */
export function compose(template, shots) {
  const canvas = document.createElement('canvas')
  canvas.width = template.width
  canvas.height = template.height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  template.slots.forEach((slot, i) => {
    if (shots[i]) drawCover(ctx, shots[i], slot.x, slot.y, slot.w, slot.h)
  })
  ctx.drawImage(template.frameImage, 0, 0, template.width, template.height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Gagal membuat JPEG'))),
      'image/jpeg',
      0.92,
    )
  })
}
