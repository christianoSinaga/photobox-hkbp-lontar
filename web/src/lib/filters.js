/** Filter foto. `css` dipakai untuk CanvasRenderingContext2D.filter dan juga CSS preview. */
export const FILTERS = [
  { id: 'normal', name: 'Normal', css: 'none' },
  { id: 'cerah', name: 'Cerah', css: 'brightness(1.12) contrast(1.05) saturate(1.15)' },
  { id: 'hangat', name: 'Hangat', css: 'sepia(0.25) saturate(1.3) brightness(1.05)' },
  { id: 'lembut', name: 'Lembut', css: 'brightness(1.08) contrast(0.9) saturate(0.85)' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(0.55) contrast(0.9) brightness(1.05)' },
  { id: 'dramatis', name: 'Dramatis', css: 'contrast(1.35) saturate(1.2) brightness(0.95)' },
  { id: 'hitam-putih', name: 'Hitam Putih', css: 'grayscale(1) contrast(1.1)' },
]

export const filterCss = (id) => FILTERS.find((f) => f.id === id)?.css ?? 'none'
