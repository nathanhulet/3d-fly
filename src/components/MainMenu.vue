<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'

const router = useRouter()
const gameStore = useGameStore()

const username = ref('')
const isConnecting = ref(false)
const error = ref<string | null>(null)

const isValidUsername = computed(() => {
  return username.value.length >= 3 &&
         username.value.length <= 16 &&
         /^[a-zA-Z0-9_]+$/.test(username.value)
})

async function handlePlay() {
  if (!isValidUsername.value) {
    error.value = 'Username must be 3-16 alphanumeric characters'
    return
  }

  isConnecting.value = true
  error.value = null

  try {
    gameStore.setUsername(username.value)
    router.push('/game')
  } catch (e) {
    error.value = 'Failed to connect. Please try again.'
    isConnecting.value = false
  }
}
</script>

<template>
  <div class="main-menu">
    <div class="menu-container">
      <h1 class="title">SKYCOMBAT</h1>
      <p class="subtitle">Multiplayer Aerial Warfare</p>

      <div class="input-group">
        <input
          v-model="username"
          type="text"
          placeholder="Enter callsign..."
          maxlength="16"
          :disabled="isConnecting"
          @keyup.enter="handlePlay"
        />
        <p v-if="error" class="error">{{ error }}</p>
      </div>

      <button
        class="play-button"
        :disabled="!isValidUsername || isConnecting"
        @click="handlePlay"
      >
        {{ isConnecting ? 'CONNECTING...' : 'SCRAMBLE' }}
      </button>

      <div class="controls-hint">
        <h3>Controls</h3>
        <ul>
          <li><kbd>W</kbd><kbd>S</kbd> Pitch</li>
          <li><kbd>A</kbd><kbd>D</kbd> Roll</li>
          <li><kbd>Mouse</kbd> Aim/Yaw</li>
          <li><kbd>Shift</kbd><kbd>Ctrl</kbd> Throttle</li>
          <li><kbd>Space</kbd> Fire Missile (6 max)</li>
          <li><kbd>Click</kbd> Fire Guns</li>
        </ul>
      </div>

      <p class="player-count">
        Arena: Utah Desert | Max 10 players
      </p>
    </div>
  </div>
</template>

<style scoped>
.main-menu {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  background-image:
    radial-gradient(circle at 20% 80%, rgba(255, 100, 100, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(100, 100, 255, 0.1) 0%, transparent 50%),
    linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

.menu-container {
  text-align: center;
  padding: 3rem;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  max-width: 400px;
  width: 90%;
}

.title {
  font-size: 3rem;
  font-weight: 900;
  color: #fff;
  text-shadow: 0 0 20px rgba(255, 100, 100, 0.5);
  letter-spacing: 0.2em;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: rgba(255, 255, 255, 0.6);
  font-size: 1rem;
  margin-bottom: 2rem;
  letter-spacing: 0.1em;
}

.input-group {
  margin-bottom: 1.5rem;
}

input {
  width: 100%;
  padding: 1rem 1.5rem;
  font-size: 1.1rem;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  outline: none;
  transition: all 0.3s ease;
  text-align: center;
  letter-spacing: 0.1em;
}

input:focus {
  border-color: rgba(255, 100, 100, 0.6);
  background: rgba(255, 255, 255, 0.15);
}

input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.error {
  color: #ff6b6b;
  font-size: 0.85rem;
  margin-top: 0.5rem;
}

.play-button {
  width: 100%;
  padding: 1rem 2rem;
  font-size: 1.3rem;
  font-weight: 700;
  background: linear-gradient(135deg, #e63946 0%, #c62828 100%);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

.play-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(230, 57, 70, 0.4);
}

.play-button:disabled {
  background: #444;
  cursor: not-allowed;
  opacity: 0.6;
}

.controls-hint {
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  text-align: left;
}

.controls-hint h3 {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
  letter-spacing: 0.1em;
}

.controls-hint ul {
  list-style: none;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.5);
}

kbd {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.2em 0.5em;
  border-radius: 4px;
  font-family: inherit;
  margin-right: 0.25rem;
}

.player-count {
  margin-top: 1.5rem;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.85rem;
}
</style>
