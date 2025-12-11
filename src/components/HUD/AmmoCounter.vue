<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  count: number
  max: number
}>()

const missiles = computed(() => {
  return Array.from({ length: props.max }, (_, i) => i < props.count)
})
</script>

<template>
  <div class="ammo-counter">
    <div class="ammo-label">MISSILES</div>
    <div class="missiles">
      <div
        v-for="(loaded, index) in missiles"
        :key="index"
        class="missile"
        :class="{ loaded, empty: !loaded }"
      >
        <svg viewBox="0 0 24 60" class="missile-icon">
          <path
            d="M12 0 L18 15 L18 50 L15 55 L15 60 L9 60 L9 55 L6 50 L6 15 Z"
            :fill="loaded ? 'currentColor' : 'transparent'"
            :stroke="loaded ? 'currentColor' : '#666'"
            stroke-width="2"
          />
          <rect x="8" y="40" width="8" height="3" fill="#ff6b6b" v-if="loaded" />
        </svg>
      </div>
    </div>
    <div class="ammo-value">{{ count }} / {{ max }}</div>
  </div>
</template>

<style scoped>
.ammo-counter {
  position: absolute;
  bottom: 20px;
  right: 20px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(0, 255, 0, 0.3);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.ammo-label {
  font-size: 11px;
  opacity: 0.7;
  color: #00ff00;
}

.missiles {
  display: flex;
  gap: 6px;
}

.missile {
  width: 16px;
  height: 40px;
}

.missile-icon {
  width: 100%;
  height: 100%;
}

.missile.loaded {
  color: #00ff00;
}

.missile.empty {
  color: #333;
  opacity: 0.5;
}

.ammo-value {
  font-size: 12px;
  color: #00ff00;
}
</style>
