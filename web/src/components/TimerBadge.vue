<script setup>
import { computed } from 'vue'

const props = defineProps({
  left: { type: Number, required: true },
  total: { type: Number, required: true },
  label: { type: String, default: 'Sisa waktu' },
})

const text = computed(() => {
  const s = Math.max(0, props.left)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
const percent = computed(() => Math.max(0, Math.min(100, (props.left / props.total) * 100)))
</script>

<template>
  <div class="timer-badge" :class="{ low: left <= 10 }" role="timer" :aria-label="`${label} ${text}`">
    <div class="row">
      <span class="label">{{ label }}</span>
      <span class="time">{{ text }}</span>
    </div>
    <div class="bar"><div :style="{ width: `${percent}%` }"></div></div>
  </div>
</template>

<style scoped>
.timer-badge {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 170px;
  padding: 10px 16px 12px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: var(--surface);
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.label {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.time {
  font-size: 1.6rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.bar {
  height: 4px;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
}

.bar > div {
  height: 100%;
  border-radius: inherit;
  background: var(--gold);
  transition: width 1s linear;
}

.low .time {
  color: #e3928c;
}

.low .bar > div {
  background: #e3928c;
}
</style>
