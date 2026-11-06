/** Filter foto. `css` dipakai untuk CanvasRenderingContext2D.filter dan juga CSS preview. */
export const FILTERS = [
  { id: 'normal', name: 'Normal', css: 'none' },
  { id: 'cerah', name: 'Cerah', css: 'brightness(1.12) contrast(1.05) saturate(1.15)' },
  { id: 'hangat', name: 'Hangat', css: 'sepia(0.25) saturate(1.3) brightness(1.05)' },
  { id: 'sejuk', name: 'Sejuk', css: 'brightness(1.05) saturate(0.85) contrast(1.05) hue-rotate(-8deg)' },
  { id: 'lembut', name: 'Lembut', css: 'brightness(1.08) contrast(0.9) saturate(0.85)' },
  { id: 'pudar', name: 'Pudar', css: 'contrast(0.8) brightness(1.1) saturate(0.7)' },
  { id: 'natal', name: 'Natal', css: 'saturate(1.35) contrast(1.08) sepia(0.12) brightness(1.03)' },
  { id: 'keemasan', name: 'Keemasan', css: 'sepia(0.4) saturate(1.5) brightness(1.05) hue-rotate(-5deg)' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(0.55) contrast(0.9) brightness(1.05)' },
  { id: 'retro', name: 'Retro', css: 'sepia(0.35) hue-rotate(-15deg) saturate(1.4) contrast(1.1)' },
  { id: 'kontras', name: 'Kontras', css: 'contrast(1.25) saturate(1.1)' },
  { id: 'dramatis', name: 'Dramatis', css: 'contrast(1.35) saturate(1.2) brightness(0.95)' },
  { id: 'sepia', name: 'Sepia', css: 'sepia(0.9) contrast(1.05)' },
  { id: 'hitam-putih', name: 'Hitam Putih', css: 'grayscale(1) contrast(1.1)' },
  { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.45) brightness(0.92)' },
]

export const filterCss = (id) => FILTERS.find((f) => f.id === id)?.css ?? 'none'
