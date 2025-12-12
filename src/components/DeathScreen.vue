<script setup lang="ts">
defineProps<{
  killedBy: string
  respawnTime: number
}>()
</script>

<template>
  <div class="death-screen">
    <div class="death-content">
      <h1 class="death-title">SHOT DOWN</h1>

      <p v-if="killedBy" class="killed-by">
        by <span class="killer-name">{{ killedBy.substring(0, 8) }}</span>
      </p>

      <div class="respawn-info">
        <div class="respawn-label">Respawning in</div>
        <div class="respawn-timer">{{ respawnTime }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.death-screen {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(139, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.death-content {
  text-align: center;
  color: white;
}

.death-title {
  font-size: 4rem;
  font-weight: 900;
  letter-spacing: 0.2em;
  text-shadow: 0 0 30px rgba(255, 0, 0, 0.8);
  margin-bottom: 20px;
  animation: pulse 1s infinite alternate;
}

@keyframes pulse {
  from { transform: scale(1); }
  to { transform: scale(1.05); }
}

.killed-by {
  font-size: 1.2rem;
  opacity: 0.8;
  margin-bottom: 40px;
}

.killer-name {
  color: #ff6b6b;
  font-weight: bold;
}

.respawn-info {
  background: rgba(0, 0, 0, 0.5);
  padding: 20px 40px;
  border-radius: 8px;
  display: inline-block;
}

.respawn-label {
  font-size: 1rem;
  opacity: 0.8;
  margin-bottom: 10px;
}

.respawn-timer {
  font-size: 3rem;
  font-weight: bold;
  font-family: 'Courier New', monospace;
}
</style>
