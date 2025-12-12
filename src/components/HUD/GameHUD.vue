<script setup lang="ts">
import { computed } from 'vue'
import type { Player } from '@/types/game'
import Crosshair from './Crosshair.vue'
import AmmoCounter from './AmmoCounter.vue'
import Radar from './Radar.vue'

const props = defineProps<{
  health: number
  missiles: number
  speed: number
  altitude: number
  heading: number
  throttle: number
  kills: number
  deaths: number
  players: Map<string, Player>
  lockedTarget: string | null
  isPointerLocked: boolean
}>()

const healthPercent = computed(() => Math.max(0, Math.min(100, props.health)))
const healthColor = computed(() => {
  if (props.health > 60) return '#4ade80'
  if (props.health > 30) return '#facc15'
  return '#ef4444'
})

const formattedSpeed = computed(() => `${props.speed} m/s`)
const formattedAltitude = computed(() => `${props.altitude} m`)
const formattedHeading = computed(() => {
  const h = props.heading
  let dir = 'N'
  if (h >= 22.5 && h < 67.5) dir = 'NE'
  else if (h >= 67.5 && h < 112.5) dir = 'E'
  else if (h >= 112.5 && h < 157.5) dir = 'SE'
  else if (h >= 157.5 && h < 202.5) dir = 'S'
  else if (h >= 202.5 && h < 247.5) dir = 'SW'
  else if (h >= 247.5 && h < 292.5) dir = 'W'
  else if (h >= 292.5 && h < 337.5) dir = 'NW'
  return `${h}° ${dir}`
})

const throttlePercent = computed(() => Math.round(props.throttle * 100))
</script>

<template>
  <div class="game-hud">
    <!-- Crosshair -->
    <Crosshair :is-locked="!!lockedTarget" />

    <!-- Health bar -->
    <div class="health-bar">
      <div class="health-label">HULL</div>
      <div class="health-container">
        <div
          class="health-fill"
          :style="{
            width: `${healthPercent}%`,
            backgroundColor: healthColor
          }"
        />
      </div>
      <div class="health-value">{{ health }}</div>
    </div>

    <!-- Speed & Altitude -->
    <div class="flight-info left">
      <div class="info-item">
        <span class="label">SPD</span>
        <span class="value">{{ formattedSpeed }}</span>
      </div>
      <div class="info-item">
        <span class="label">ALT</span>
        <span class="value">{{ formattedAltitude }}</span>
      </div>
      <div class="info-item">
        <span class="label">HDG</span>
        <span class="value">{{ formattedHeading }}</span>
      </div>
    </div>

    <!-- Throttle -->
    <div class="throttle-indicator">
      <div class="throttle-label">THR</div>
      <div class="throttle-bar">
        <div
          class="throttle-fill"
          :style="{ height: `${throttlePercent}%` }"
        />
      </div>
      <div class="throttle-value">{{ throttlePercent }}%</div>
    </div>

    <!-- Missiles -->
    <AmmoCounter :count="missiles" :max="6" />

    <!-- Kill/Death -->
    <div class="score">
      <span class="kills">{{ kills }} <small>KILLS</small></span>
      <span class="deaths">{{ deaths }} <small>DEATHS</small></span>
    </div>

    <!-- Radar -->
    <Radar :players="players" :heading="heading" />

    <!-- Target lock indicator -->
    <div v-if="lockedTarget" class="lock-indicator">
      TARGET LOCKED
    </div>
  </div>
</template>

<style scoped>
.game-hud {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  font-family: 'Courier New', monospace;
  color: #00ff00;
  text-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
}

/* Health bar - top center */
.health-bar {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
}

.health-label {
  font-size: 12px;
  opacity: 0.8;
}

.health-container {
  width: 200px;
  height: 8px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 2px;
  overflow: hidden;
}

.health-fill {
  height: 100%;
  transition: width 0.3s, background-color 0.3s;
}

.health-value {
  font-size: 14px;
  min-width: 30px;
}

/* Flight info - bottom left */
.flight-info {
  position: absolute;
  bottom: 20px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(0, 255, 0, 0.3);
  border-radius: 4px;
}

.flight-info.left {
  left: 20px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 2px 0;
}

.label {
  font-size: 11px;
  opacity: 0.7;
}

.value {
  font-size: 14px;
  font-weight: bold;
}

/* Throttle - bottom left, next to flight info */
.throttle-indicator {
  position: absolute;
  left: 140px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(0, 255, 0, 0.3);
  border-radius: 4px;
}

.throttle-label {
  font-size: 11px;
  opacity: 0.7;
}

.throttle-bar {
  width: 20px;
  height: 60px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(0, 255, 0, 0.5);
  position: relative;
  overflow: hidden;
}

.throttle-fill {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, #00ff00, #ffff00);
  transition: height 0.1s;
}

.throttle-value {
  font-size: 12px;
}

/* Score - top left */
.score {
  position: absolute;
  top: 20px;
  left: 20px;
  display: flex;
  gap: 20px;
}

.kills, .deaths {
  font-size: 18px;
  font-weight: bold;
}

.kills small, .deaths small {
  font-size: 10px;
  opacity: 0.7;
  margin-left: 4px;
}

.kills {
  color: #4ade80;
}

.deaths {
  color: #ef4444;
}

/* Lock indicator */
.lock-indicator {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  padding: 5px 15px;
  background: rgba(255, 0, 0, 0.3);
  border: 1px solid #ff0000;
  color: #ff0000;
  font-size: 12px;
  animation: blink 0.5s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
