import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Player } from '@/types/game'

export const useGameStore = defineStore('game', () => {
  // Local player info
  const playerId = ref<string>('')
  const username = ref<string>('')

  // Game state
  const isConnected = ref(false)
  const isAlive = ref(true)
  const respawnTimer = ref(0)

  // Stats
  const health = ref(100)
  const missiles = ref(6)
  const kills = ref(0)
  const deaths = ref(0)

  // Other players
  const players = ref<Map<string, Player>>(new Map())

  // Computed
  const playerCount = computed(() => players.value.size + 1)
  const isArenaFull = computed(() => playerCount.value >= 10)

  // Actions
  function setUsername(name: string) {
    username.value = name
    playerId.value = generatePlayerId()
  }

  function setConnected(connected: boolean) {
    isConnected.value = connected
  }

  function takeDamage(amount: number) {
    health.value = Math.max(0, health.value - amount)
    if (health.value <= 0) {
      die()
    }
  }

  function die() {
    isAlive.value = false
    deaths.value++
    respawnTimer.value = 5
  }

  function respawn() {
    isAlive.value = true
    health.value = 100
    missiles.value = 6
    respawnTimer.value = 0
  }

  function fireMissile(): boolean {
    if (missiles.value > 0) {
      missiles.value--
      return true
    }
    return false
  }

  function addKill() {
    kills.value++
  }

  function addPlayer(player: Player) {
    players.value.set(player.id, player)
  }

  function removePlayer(id: string) {
    players.value.delete(id)
  }

  function updatePlayer(id: string, updates: Partial<Player>) {
    const player = players.value.get(id)
    if (player) {
      players.value.set(id, { ...player, ...updates })
    }
  }

  function reset() {
    isConnected.value = false
    isAlive.value = true
    health.value = 100
    missiles.value = 6
    kills.value = 0
    deaths.value = 0
    respawnTimer.value = 0
    players.value.clear()
  }

  return {
    // State
    playerId,
    username,
    isConnected,
    isAlive,
    respawnTimer,
    health,
    missiles,
    kills,
    deaths,
    players,
    // Computed
    playerCount,
    isArenaFull,
    // Actions
    setUsername,
    setConnected,
    takeDamage,
    die,
    respawn,
    fireMissile,
    addKill,
    addPlayer,
    removePlayer,
    updatePlayer,
    reset
  }
})

function generatePlayerId(): string {
  return Math.random().toString(36).substring(2, 10)
}
