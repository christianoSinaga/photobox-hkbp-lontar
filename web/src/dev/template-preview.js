// Halaman bantu khusus development (tidak ikut build produksi).
import { loadIndex, loadImage } from '../lib/templates.js'

const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45']
const MAX_SLOTS = 8
const list = document.getElementById('list')
const detected = document.getElementById('detected')
const pngInput = document.getElementById('pngInput')
const drop = document.getElementById('drop')
const showFrame = document.getElementById('showFrame')
const frameOnTop = document.getElementById('frameOnTop')
const redraws = new Map() // kartu -> fungsi gambar ulang

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

/**
 * Cek otomatis: ukuran frame, slot di luar kanvas, slot bertumpuk, dan seberapa terbuka lubangnya.
 * Lubang boleh sebagian tertutup hiasan bingkai (frame digambar di atas foto); itu hanya jadi catatan.
 * Mengembalikan { problems, notes }.
 */
function check(t, img) {
  const problems = []
  const notes = []
  if (img && (img.naturalWidth !== t.width || img.naturalHeight !== t.height))
    problems.push(`Ukuran PNG ${img.naturalWidth}x${img.naturalHeight}, tapi JSON ${t.width}x${t.height}.`)
  if (t.slots.length > MAX_SLOTS)
    problems.push(`Ada ${t.slots.length} slot; maksimal ${MAX_SLOTS} karena satu sesi mengambil ${MAX_SLOTS} foto.`)

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
      const x0 = Math.max(0, Math.round(s.x))
      const y0 = Math.max(0, Math.round(s.y))
      const w = Math.min(t.width - x0, Math.round(s.w))
      const h = Math.min(t.height - y0, Math.round(s.h))
      if (w <= 0 || h <= 0) return
      const data = ctx.getImageData(x0, y0, w, h).data
      let open = 0
      for (let p = 3; p < data.length; p += 4) if (data[p] < 128) open++
      const pct = Math.round((open / (w * h)) * 100)
      if (pct < 50)
        problems.push(`Slot #${i + 1} hanya ${pct}% terbuka. Kemungkinan koordinatnya salah atau lubangnya tidak transparan.`)
      else if (pct < 97)
        notes.push(`Slot #${i + 1}: ${pct}% terbuka, sisanya tertutup hiasan bingkai. Normal jika memang disengaja.`)
    })
  }
  return { problems, notes }
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

/** Kartu berisi preview kanvas, tabel koordinat, dan hasil pengecekan. */
function renderCard(box, t, img, sourceLabel, { problems = [], notes = [], extra = [] } = {}) {
  const canvas = el('canvas', { width: t.width, height: t.height })
  const header = el('tr', {}, ['Slot', 'x', 'y', 'w', 'h', 'rasio'].map((h) => el('th', { textContent: h })))
  const rows = t.slots.map((s, i) =>
    el('tr', {}, [
      el('td', {}, [el('span', { className: 'swatch', style: `background:${COLORS[i % COLORS.length]}` }), `#${i + 1}`]),
      ...[s.x, s.y, s.w, s.h, (s.w / s.h).toFixed(2)].map((v) => el('td', { textContent: v })),
    ]),
  )
  const result = check(t, img)
  const allProblems = [...problems, ...result.problems]
  const allNotes = [...notes, ...result.notes]

  box.append(
    canvas,
    el('div', { className: 'info' }, [
      el('h2', { textContent: `${t.name ?? '(tanpa nama)'} — ${t.id ?? '(tanpa id)'}` }),
      el('p', { className: 'path', textContent: `${sourceLabel} · frame: ${t.frame} · ${t.width}x${t.height}` }),
      el('table', {}, [header, ...rows]),
      allProblems.length
        ? el('ul', { className: 'bad' }, allProblems.map((p) => el('li', { textContent: p })))
        : el('p', { className: 'ok', textContent: '✓ Semua pengecekan lolos.' }),
      ...(allNotes.length ? [el('ul', { className: 'note' }, allNotes.map((n) => el('li', { textContent: n })))] : []),
      ...extra,
    ]),
  )
  const redraw = () => draw(canvas, t, img)
  redraw()
  redraws.set(box, redraw)
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
  const problems = []
  try {
    img = await loadImage(t.frame)
  } catch (e) {
    problems.push(e.message)
  }
  renderCard(box, t, img, path, { problems })
}

// ---------- Deteksi lubang otomatis ----------

/**
 * Cari semua area transparan (alpha < 128) yang saling tersambung, lalu ambil kotak pembatasnya.
 * Area sangat kecil (< 0,5% gambar) diabaikan karena biasanya hanya celah atau tepi antialias.
 */
function detectSlots(img) {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const c = el('canvas', { width: w, height: h })
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const pixels = ctx.getImageData(0, 0, w, h).data

  const total = w * h
  const hole = new Uint8Array(total)
  for (let i = 0; i < total; i++) hole[i] = pixels[i * 4 + 3] < 128 ? 1 : 0

  const seen = new Uint8Array(total)
  const queue = new Int32Array(total)
  const regions = []
  for (let start = 0; start < total; start++) {
    if (!hole[start] || seen[start]) continue
    let head = 0
    let tail = 0
    queue[tail++] = start
    seen[start] = 1
    let minX = w, minY = h, maxX = 0, maxY = 0, count = 0
    while (head < tail) {
      const p = queue[head++]
      const x = p % w
      const y = (p - x) / w
      count++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x > 0 && hole[p - 1] && !seen[p - 1]) (seen[p - 1] = 1), (queue[tail++] = p - 1)
      if (x < w - 1 && hole[p + 1] && !seen[p + 1]) (seen[p + 1] = 1), (queue[tail++] = p + 1)
      if (y > 0 && hole[p - w] && !seen[p - w]) (seen[p - w] = 1), (queue[tail++] = p - w)
      if (y < h - 1 && hole[p + w] && !seen[p + w]) (seen[p + w] = 1), (queue[tail++] = p + w)
    }
    regions.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, count })
  }

  const minArea = total * 0.005
  const slots = regions.filter((r) => r.count >= minArea)
  // Urutan baca: baris demi baris dari atas, dalam satu baris dari kiri.
  slots.sort((a, b) => (Math.abs(a.y - b.y) < Math.min(a.h, b.h) / 2 ? a.x - b.x : a.y - b.y))

  const notes = []
  const ignored = regions.length - slots.length
  if (ignored) notes.push(`${ignored} area transparan kecil diabaikan (bukan lubang foto).`)
  slots.forEach((s, i) => {
    if (s.x === 0 || s.y === 0 || s.x + s.w === w || s.y + s.h === h)
      notes.push(`Lubang #${i + 1} menyentuh tepi gambar. Pastikan memang disengaja (bukan latar transparan).`)
  })
  return { slots: slots.map(({ x, y, w, h }) => ({ x, y, w, h })), notes }
}

function templateJson(t) {
  const slots = t.slots.map((s) => `    { "x": ${s.x}, "y": ${s.y}, "w": ${s.w}, "h": ${s.h} }`).join(',\n')
  return (
    `{\n  "id": ${JSON.stringify(t.id)},\n  "name": ${JSON.stringify(t.name)},\n` +
    `  "frame": ${JSON.stringify(t.frame)},\n  "width": ${t.width},\n  "height": ${t.height},\n` +
    `  "slots": [\n${slots}\n  ]\n}\n`
  )
}

async function handlePng(file) {
  if (!file || file.type !== 'image/png') {
    detected.replaceChildren(el('p', { className: 'bad', textContent: 'Pilih file PNG.' }))
    return
  }
  const url = URL.createObjectURL(file)
  const img = await loadImage(url)
  const id = file.name.replace(/\.png$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template-baru'
  const { slots, notes } = detectSlots(img)
  const t = {
    id,
    name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    frame: `/templates/${id}.png`,
    width: img.naturalWidth,
    height: img.naturalHeight,
    slots,
  }

  const card = el('div', { className: 'tpl detected' })
  const tools = el('div', { className: 'tools' })
  detected.replaceChildren(card, tools)
  if (!slots.length) {
    card.append(
      el('p', {
        className: 'bad',
        textContent: 'Tidak ada lubang transparan yang ditemukan. Pastikan PNG diekspor dengan latar/lubang transparan.',
      }),
    )
    return
  }

  const label = `Deteksi dari ${file.name}`
  const status = el('p', { className: 'note' })
  const output = el('textarea', { className: 'json', spellcheck: false })

  // Kartu preview digambar ulang; alat edit di bawahnya tetap (supaya fokus ketik tidak hilang).
  function refresh({ fromEditor = false } = {}) {
    redraws.delete(card)
    card.replaceChildren()
    renderCard(card, t, img, label, { notes })
    if (!fromEditor) {
      output.value = templateJson(t)
      output.rows = output.value.split('\n').length
    }
  }

  // JSON bisa diedit langsung; preview mengikuti selama isinya valid.
  output.addEventListener('input', () => {
    try {
      const edited = JSON.parse(output.value)
      const valid =
        Array.isArray(edited.slots) &&
        edited.slots.every((s) => [s.x, s.y, s.w, s.h].every(Number.isFinite) && s.w > 0 && s.h > 0)
      if (!valid) throw new Error('slots harus berisi x, y, w, h berupa angka')
      Object.assign(t, edited, { width: img.naturalWidth, height: img.naturalHeight })
      status.textContent = ''
      refresh({ fromEditor: true })
    } catch (e) {
      status.textContent = `JSON belum valid: ${e.message}`
    }
  })

  // Gabungkan beberapa lubang (mis. lubang yang terbelah oleh hiasan) menjadi satu kotak.
  const mergeInput = el('input', { type: 'text', placeholder: 'mis. 1, 2', size: 10 })
  const mergeBtn = el('button', { type: 'button', textContent: 'Gabungkan' })
  mergeBtn.addEventListener('click', () => {
    const picked = [...new Set(mergeInput.value.split(/[^0-9]+/).filter(Boolean).map((n) => Number(n) - 1))]
      .filter((i) => i >= 0 && i < t.slots.length)
      .sort((a, b) => a - b)
    if (picked.length < 2) {
      status.textContent = 'Isi minimal dua nomor slot yang ada, mis. "1, 2".'
      return
    }
    const parts = picked.map((i) => t.slots[i])
    const x = Math.min(...parts.map((s) => s.x))
    const y = Math.min(...parts.map((s) => s.y))
    const merged = {
      x,
      y,
      w: Math.max(...parts.map((s) => s.x + s.w)) - x,
      h: Math.max(...parts.map((s) => s.y + s.h)) - y,
    }
    t.slots = t.slots.filter((_, i) => !picked.includes(i))
    t.slots.splice(picked[0], 0, merged)
    mergeInput.value = ''
    status.textContent = `Slot ${picked.map((i) => i + 1).join(', ')} digabung menjadi slot #${picked[0] + 1}.`
    refresh()
  })

  const copy = el('button', { type: 'button', textContent: 'Salin JSON' })
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(output.value)
      copy.textContent = 'Tersalin ✓'
    } catch {
      output.select()
      copy.textContent = 'Tekan Ctrl+C untuk menyalin'
    }
  })

  tools.append(
    el('h3', { textContent: 'Lubang terbelah oleh hiasan?' }),
    el('p', {
      className: 'hint',
      textContent:
        'Jika satu lubang terdeteksi sebagai beberapa slot (karena hiasan memotongnya), tulis nomor-nomornya lalu klik Gabungkan.',
    }),
    el('div', { className: 'row' }, [mergeInput, mergeBtn]),
    el('h3', { textContent: 'JSON template' }),
    el('p', { className: 'hint', textContent: 'Bisa diedit langsung; preview di atas ikut berubah.' }),
    output,
    el('div', { className: 'row' }, [copy, status]),
    el('h3', { textContent: 'Langkah selanjutnya' }),
    el('ol', { className: 'steps' }, [
      el('li', { innerHTML: `Simpan PNG sebagai <code>web/public/templates/${id}.png</code>.` }),
      el('li', { innerHTML: `Simpan JSON di atas sebagai <code>web/public/templates/${id}.json</code> (ubah <code>name</code> sesuai keinginan).` }),
      el('li', { innerHTML: `Tambahkan <code>"/templates/${id}.json"</code> ke <code>index.json</code>, lalu muat ulang halaman ini untuk mengecek.` }),
    ]),
  )
  refresh()
}

pngInput.addEventListener('change', () => handlePng(pngInput.files[0]))
drop.addEventListener('dragover', (e) => {
  e.preventDefault()
  drop.classList.add('over')
})
drop.addEventListener('dragleave', () => drop.classList.remove('over'))
drop.addEventListener('drop', (e) => {
  e.preventDefault()
  drop.classList.remove('over')
  handlePng(e.dataTransfer.files[0])
})

// ---------- Template terdaftar ----------

async function main() {
  // ?png=/templates/nama.png langsung menjalankan deteksi lubang pada PNG tersebut.
  const pngUrl = new URLSearchParams(location.search).get('png')
  if (pngUrl) {
    try {
      const res = await fetch(pngUrl, { cache: 'no-cache' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      await handlePng(new File([blob], pngUrl.split('/').pop(), { type: 'image/png' }))
    } catch (e) {
      detected.replaceChildren(el('p', { className: 'bad', textContent: `${pngUrl}: gagal dimuat (${e.message})` }))
    }
  }

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
