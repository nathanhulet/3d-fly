import { ref, reactive, onUnmounted } from 'vue'
import { createClient, RealtimeChannel } from '@supabase/supabase-js'
import * as Cesium from 'cesium'
import { GAME } from '@/utils/constants'
import type { Player } from '@/types/game'
import type {
  NetworkMessage,
  PositionMessage,
  FireMessage,
  HitMessage,
  DeathMessage,
  SpawnMessage,
  PlayerPresence
} from '@/types/network'

export function useNetworking() {
  const isConnected = ref(false)
  const playerId = ref('')
  const username = ref('')
  const players = reactive<Map<string, Player>>(new Map())

  let supabase: ReturnType<typeof createClient> | null = null
  let channel: RealtimeChannel | null = null
  let lastBroadcastTime = 0

  // Event callbacks
  const onPlayerJoin = ref<((player: PlayerPresence) => void) | null>(null)
  const onPlayerLeave = ref<((playerId: string) => void) | null>(null)
  const onPositionUpdate = ref<((msg: PositionMessage) => void) | null>(null)
  const onFire = ref<((msg: FireMessage) => void) | null>(null)
  const onHit = ref<((msg: HitMessage) => void) | null>(null)
  const onDeath = ref<((msg: DeathMessage) => void) | null>(null)
  const onSpawn = ref<((msg: SpawnMessage) => void) | null>(null)

  /**
   * Initialize Supabase connection
   */
  function init() {
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

    if (!url || !key) {
      console.warn('Supabase credentials not configured. Running in offline mode.')
      return false
    }

    supabase = createClient(url, key)
    return true
  }

  /**
   * Connect to game arena
   */
  async function connect(id: string, name: string): Promise<boolean> {
    if (!supabase) {
      if (!init()) {
        // Offline mode - still allow playing
        playerId.value = id
        username.value = name
        isConnected.value = true
        return true
      }
    }

    playerId.value = id
    username.value = name

    try {
      channel = supabase!.channel('game-arena', {
        config: {
          broadcast: { ack: false, self: false },
          presence: { key: id }
        }
      })

      // Handle presence (join/leave)
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel!.presenceState<PlayerPresence>()
        // Update players from presence state
        for (const [key, presences] of Object.entries(state)) {
          if (key !== playerId.value && presences.length > 0) {
            const presence = presences[0] as PlayerPresence
            if (!players.has(key)) {
              onPlayerJoin.value?.(presence)
            }
          }
        }
      })

      channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (key !== playerId.value && newPresences.length > 0) {
          onPlayerJoin.value?.(newPresences[0] as unknown as PlayerPresence)
        }
      })

      channel.on('presence', { event: 'leave' }, ({ key }) => {
        if (key !== playerId.value) {
          onPlayerLeave.value?.(key)
          players.delete(key)
        }
      })

      // Handle broadcast messages
      channel.on('broadcast', { event: 'game' }, ({ payload }) => {
        handleMessage(payload as NetworkMessage)
      })

      // Subscribe and track presence
      await channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel!.track({
            id: playerId.value,
            username: username.value,
            joinedAt: Date.now()
          })
          isConnected.value = true
        }
      })

      return true
    } catch (error) {
      console.error('Failed to connect:', error)
      return false
    }
  }

  /**
   * Handle incoming network message
   */
  function handleMessage(msg: NetworkMessage) {
    switch (msg.t) {
      case 'pos':
        onPositionUpdate.value?.(msg)
        break
      case 'fire':
        onFire.value?.(msg)
        break
      case 'hit':
        onHit.value?.(msg)
        break
      case 'death':
        onDeath.value?.(msg)
        break
      case 'spawn':
        onSpawn.value?.(msg)
        break
    }
  }

  /**
   * Broadcast position update
   */
  function broadcastPosition(
    position: Cesium.Cartesian3,
    orientation: Cesium.Quaternion,
    velocity: Cesium.Cartesian3
  ) {
    const now = Date.now()
    const minInterval = 1000 / GAME.NETWORK_TICK_RATE

    if (now - lastBroadcastTime < minInterval) {
      return
    }

    const msg: PositionMessage = {
      t: 'pos',
      id: playerId.value,
      ts: now,
      p: [position.x, position.y, position.z],
      q: [orientation.x, orientation.y, orientation.z, orientation.w],
      v: [velocity.x, velocity.y, velocity.z]
    }

    broadcast(msg)
    lastBroadcastTime = now
  }

  /**
   * Broadcast weapon fire
   */
  function broadcastFire(
    weapon: 'm' | 'g',
    position: Cesium.Cartesian3,
    direction: Cesium.Cartesian3,
    targetId?: string
  ) {
    const msg: FireMessage = {
      t: 'fire',
      id: playerId.value,
      w: weapon,
      ts: Date.now(),
      p: [position.x, position.y, position.z],
      d: [direction.x, direction.y, direction.z],
      target: targetId
    }

    broadcast(msg)
  }

  /**
   * Broadcast hit event
   */
  function broadcastHit(victimId: string, damage: number, weapon: 'm' | 'g') {
    const msg: HitMessage = {
      t: 'hit',
      attacker: playerId.value,
      victim: victimId,
      damage,
      weapon
    }

    broadcast(msg)
  }

  /**
   * Broadcast death event
   */
  function broadcastDeath(killerId: string, weapon: 'm' | 'g') {
    const msg: DeathMessage = {
      t: 'death',
      victim: playerId.value,
      killer: killerId,
      weapon
    }

    broadcast(msg)
  }

  /**
   * Broadcast spawn event
   */
  function broadcastSpawn(position: Cesium.Cartesian3, heading: number) {
    const msg: SpawnMessage = {
      t: 'spawn',
      id: playerId.value,
      p: [position.x, position.y, position.z],
      heading
    }

    broadcast(msg)
  }

  /**
   * Send broadcast message
   */
  function broadcast(msg: NetworkMessage) {
    if (channel && isConnected.value) {
      channel.send({
        type: 'broadcast',
        event: 'game',
        payload: msg
      })
    }
  }

  /**
   * Update remote player data
   */
  function updatePlayer(id: string, updates: Partial<Player>) {
    const player = players.get(id)
    if (player) {
      Object.assign(player, updates)
    }
  }

  /**
   * Add remote player
   */
  function addPlayer(player: Player) {
    players.set(player.id, player)
  }

  /**
   * Remove remote player
   */
  function removePlayer(id: string) {
    players.delete(id)
  }

  /**
   * Disconnect from arena
   */
  async function disconnect() {
    if (channel) {
      await channel.unsubscribe()
      channel = null
    }
    isConnected.value = false
    players.clear()
  }

  onUnmounted(() => {
    disconnect()
  })

  return {
    isConnected,
    playerId,
    username,
    players,
    // Connection
    connect,
    disconnect,
    // Broadcasting
    broadcastPosition,
    broadcastFire,
    broadcastHit,
    broadcastDeath,
    broadcastSpawn,
    // Player management
    addPlayer,
    updatePlayer,
    removePlayer,
    // Event callbacks
    onPlayerJoin,
    onPlayerLeave,
    onPositionUpdate,
    onFire,
    onHit,
    onDeath,
    onSpawn
  }
}
