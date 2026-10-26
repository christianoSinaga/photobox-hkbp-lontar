// Halaman bantu khusus development (tidak ikut build produksi).
import { loadIndex, loadImage } from '../lib/templates.js'

const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45']
const list = document.getElementById('list')
const showFrame = document.getElementById('showFrame')
const frameOnTop = document.getElementById('frameOnTop')
const redraws = []

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

/** Cek otomatis: ukuran frame, slot di luar kanvas, slot bertumpuk, lubang slot tidak transparan. */
function check(t, img) {
  const problems = []
  if (img && (img.naturalWidth !== t.width || img.naturalHeight !== t.height))
    problems.push(`Ukuran PNG ${img.naturalWidth}x${img.naturalHeight}, tapi JSON ${t.width}x${t.height}.`)

  t.slots.forEach((s, i) => {
    if (s.x < 0 || s.y < 0 || s.x + s.w > t.width || s.y + s.h > t.height)
      problems.push(`Slot #${i + 1} keluar dari kanvas.`)
    t.slots.slice(i + 1).forEach((o, j) => {
      if (s.x < o.x + o.w && o.x < s.x + s.w && s.y < o.y + o.h && o.y < s.y + s.h)
        problems.push(`Slot #${i + 1} bertumpuk dengan slot #${i + j + 2}.`)
    })
  })

  if (img) {
    const c = el('canvas', { width: t.width, height: t.height })
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, t.width, t.height)
    t.slots.forEach((s, i) => {
      // Sampel grid 9x9 di dalam slot (2px dari tepi); semuanya harus transparan.
      let opaque = 0
      for (let a = 0; a < 9; a++)
        for (let b = 0; b < 9; b++) {
          const x = Math.round(s.x + 2 + ((s.w - 5) * a) / 8)
          const y = Math.round(s.y + 2 + ((s.h - 5) * b) / 8)
          if (ctx.getImageData(x, y, 1, 1).data[3] > 10) opaque++
        }
      if (opaque) problems.push(`Lubang slot #${i + 1} tidak transparan di ${opaque} dari 81 titik sampel.`)
    })
  }
  return problems
}

function draw(canvas, t, img) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, t.width, t.height)
  const drawFrame = () => {
    if (img && showFrame.checked) ctx.drawImage(img, 0, 0, t.width, t.height)
  }
  if (!frameOnTop.checked) drawFrame()
  t.slots.forEach((s, i) => {
    ctx.globalAlpha = 0.55
    ctx.fillStyle = COLORS[i % COLORS.length]
    ctx.fillRect(s.x, s.y, s.w, s.h)
    ctx.globalAlpha = 1
  })
  if (frameOnTop.checked) drawFrame()
  t.slots.forEach((s, i) => {
    ctx.strokeStyle = COLORS[i % COLORS.length]
    ctx.lineWidth = 3
    ctx.setLineDash([12, 8])
    ctx.strokeRect(s.x + 1.5, s.y + 1.5, s.w - 3, s.h - 3)
    ctx.setLineDash([])
    const size = Math.max(24, Math.min(s.w, s.h) / 6)
    ctx.font = `bold ${size}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = size / 6
    ctx.strokeStyle = '#000'
    ctx.fillStyle = '#fff'
    const label = `#${i + 1}  ${s.w}×${s.h}`
    ctx.strokeText(label, s.x + s.w / 2, s.y + s.h / 2)
    ctx.fillText(label, s.x + s.w / 2, s.y + s.h / 2)
  })
}

async function renderTemplate(path) {
  const box = el('div', { className: 'tpl' })
  list.append(box)
  let t
  try {
    const res = await fetch(path, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    t = await res.json()
  } catch (e) {
    box.append(el('p', { className: 'bad', textContent: `${path}: gagal dimuat (${e.message})` }))
    return
  }
  if (!Array.isArray(t.slots) || !(t.width > 0) || !(t.height > 0)) {
    box.append(el('p', { className: 'bad', textContent: `${path}: width, height, atau slots tidak valid.` }))
    return
  }

  let img = null
  let imgError = ''
  try {
    img = await loadImage(t.frame)
  } catch (e) {
    imgError = e.message
  }

  const canvas = el('canvas', { width: t.width, height: t.height })
  const header = el('tr', {}, ['Slot', 'x', 'y', 'w', 'h', 'rasio'].map((h) => el('th', { textContent: h })))
  const rows = t.slots.map((s, i) =>
    el('tr', {}, [
      el('td', {}, [el('span', { className: 'swatch', style: `background:${COLORS[i % COLORS.length]}` }), `#${i + 1}`]),
      ...[s.x, s.y, s.w, s.h, (s.w / s.h).toFixed(2)].map((v) => el('td', { textContent: v })),
    ]),
  )
  const problems = check(t, img)
  if (imgError) problems.unshift(imgError)

  box.append(
    canvas,
    el('div', { className: 'info' }, [
      el('h2', { textContent: `${t.name ?? '(tanpa nama)'} — ${t.id ?? '(tanpa id)'}` }),
      el('p', { className: 'path', textContent: `${path} · frame: ${t.frame} · ${t.width}x${t.height}` }),
      el('table', {}, [header, ...rows]),
      problems.length
        ? el('ul', { className: 'bad' }, problems.map((p) => el('li', { textContent: p })))
        : el('p', { className: 'ok', textContent: '✓ Semua pengecekan lolos.' }),
    ]),
  )
  const redraw = () => draw(canvas, t, img)
  redraw()
  redraws.push(redraw)
}

async function main() {
  const single = new URLSearchParams(location.search).get('t')
  let paths
  try {
    paths = single ? [single] : await loadIndex()
  } catch (e) {
    list.append(el('p', { className: 'bad', textContent: `index.json gagal dimuat: ${e.message}` }))
    return
  }
  for (const path of paths) await renderTemplate(path)
}

for (const box of [showFrame, frameOnTop]) box.addEventListener('change', () => redraws.forEach((fn) => fn()))
main()
