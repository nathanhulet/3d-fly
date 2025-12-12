<script setup lang="ts">
import { computed } from 'vue'
import type { Player } from '@/types/game'

const props = defineProps<{
  players: Map<string, Player>
  heading: number
}>()

const RADAR_RANGE = 5000 // meters
const RADAR_SIZE = 120 // pixels

const playerBlips = computed(() => {
  const blips: Array<{ x: number; y: number; isAlive: boolean }> = []

  for (const player of props.players.values()) {
    // For now, show all players at random positions
    // In real implementation, calculate relative position
    const angle = Math.random() * Math.PI * 2
    const distance = Math.random() * 0.8
    const x = Math.cos(angle) * distance * (RADAR_SIZE / 2 - 10)
    const y = Math.sin(angle) * distance * (RADAR_SIZE / 2 - 10)

    blips.push({
      x: x + RADAR_SIZE / 2,
      y: y + RADAR_SIZE / 2,
      isAlive: player.isAlive
    })
  }

  return blips
})
</script>

<template>
  <div class="radar">
    <div class="radar-label">RADAR</div>
    <div class="radar-display" :style="{ '--rotation': `-${heading}deg` }">
      <!-- Radar circles -->
      <div class="radar-circle outer" />
      <div class="radar-circle middle" />
      <div class="radar-circle inner" />

      <!-- Cardinal directions -->
      <div class="direction n">N</div>
      <div class="direction s">S</div>
      <div class="direction e">E</div>
      <div class="direction w">W</div>

      <!-- Center (self) -->
      <div class="self-blip" />

      <!-- Heading line -->
      <div class="heading-line" />

      <!-- Player blips -->
      <div
        v-for="(blip, index) in playerBlips"
        :key="index"
        class="player-blip"
        :class="{ dead: !blip.isAlive }"
        :style="{
          left: `${blip.x}px`,
          top: `${blip.y}px`
        }"
      />
    </div>
    <div class="radar-range">{{ RADAR_RANGE / 1000 }}km</div>
  </div>
</template>

<style scoped>
.radar {
  position: absolute;
  top: 60px;
  right: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.radar-label {
  font-size: 11px;
  opacity: 0.7;
  color: #00ff00;
}

.radar-display {
  width: 120px;
  height: 120px;
  background: rgba(0, 20, 0, 0.8);
  border: 2px solid rgba(0, 255, 0, 0.5);
  border-radius: 50%;
  position: relative;
  overflow: hidden;
  transform: rotate(var(--rotation, 0deg));
}

.radar-circle {
  position: absolute;
  border: 1px solid rgba(0, 255, 0, 0.2);
  border-radius: 50%;
}

.radar-circle.outer {
  top: 10%;
  left: 10%;
  right: 10%;
  bottom: 10%;
}

.radar-circle.middle {
  top: 25%;
  left: 25%;
  right: 25%;
  bottom: 25%;
}

.radar-circle.inner {
  top: 40%;
  left: 40%;
  right: 40%;
  bottom: 40%;
}

.direction {
  position: absolute;
  font-size: 10px;
  color: rgba(0, 255, 0, 0.6);
}

.direction.n { top: 2px; left: 50%; transform: translateX(-50%); }
.direction.s { bottom: 2px; left: 50%; transform: translateX(-50%); }
.direction.e { right: 2px; top: 50%; transform: translateY(-50%); }
.direction.w { left: 2px; top: 50%; transform: translateY(-50%); }

.self-blip {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 8px;
  height: 8px;
  background: #00ff00;
  transform: translate(-50%, -50%);
  clip-path: polygon(50% 0%, 100% 100%, 50% 70%, 0% 100%);
}

.heading-line {
  position: absolute;
  top: 10px;
  left: 50%;
  width: 1px;
  height: 40%;
  background: linear-gradient(to bottom, rgba(0, 255, 0, 0.8), transparent);
  transform: translateX(-50%);
}

.player-blip {
  position: absolute;
  width: 6px;
  height: 6px;
  background: #ff0000;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 4px #ff0000;
}

.player-blip.dead {
  background: #666;
  box-shadow: none;
}

.radar-range {
  font-size: 10px;
  color: rgba(0, 255, 0, 0.5);
}
</style>
