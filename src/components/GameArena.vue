<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import * as Cesium from 'cesium'
import CesiumViewer from './CesiumViewer.vue'
import GameHUD from './HUD/GameHUD.vue'
import DeathScreen from './DeathScreen.vue'
import { useGameStore } from '@/stores/gameStore'
import { useInput } from '@/composables/useInput'
import { useWeapons } from '@/composables/useWeapons'
import { useNetworking } from '@/composables/useNetworking'
import { useDeadReckoning } from '@/composables/useDeadReckoning'
import { FlightModel } from '@/game/physics/FlightModel'
import { SPAWN_POINTS, GAME, WEAPONS, ARENA, PHYSICS } from '@/utils/constants'
import type { AircraftState, Player } from '@/types/game'

const router = useRouter()
const gameStore = useGameStore()
const input = useInput()
const weapons = useWeapons()
const networking = useNetworking()
const deadReckoning = useDeadReckoning()

const cesiumViewerRef = ref<InstanceType<typeof CesiumViewer> | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const isInitialized = ref(false)

// Local player state
const aircraftState = reactive<AircraftState>({
  position: new Cesium.Cartesian3(),
  orientation: new Cesium.Quaternion(),
  velocity: new Cesium.Cartesian3(),
  angularVelocity: { x: 0, y: 0, z: 0 },
  throttle: 0.5,
  speed: 0
})

// Game state
const isAlive = ref(true)
const respawnTimer = ref(0)
const killedBy = ref('')
const lockedTarget = ref<string | null>(null)

// Stats for HUD
const altitude = ref(0)
const speed = ref(0)
const heading = ref(0)

// Game loop
let animationFrameId: number | null = null
let lastTime = 0

const players = computed(() => {
  const result = new Map<string, Player>()
  networking.players.forEach((p, id) => result.set(id, p))
  return result
})

async function onCesiumInitialized() {
  const cesium = cesiumViewerRef.value?.cesium
  if (!cesium) return

  // Connect to multiplayer
  await networking.connect(gameStore.playerId, gameStore.username)

  // Set up network event handlers
  setupNetworkHandlers()

  // Spawn player
  spawnPlayer()

  // Create aircraft entity
  await cesium.createLocalAircraft(aircraftState)

  isInitialized.value = true

  // Start game loop
  lastTime = performance.now()
  gameLoop()
}

function setupNetworkHandlers() {
  networking.onPlayerJoin.value = (presence) => {
    const spawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)]
    const position = Cesium.Cartesian3.fromDegrees(spawn.lon, spawn.lat, spawn.alt)

    const player: Player = {
      id: presence.id,
      username: presence.username,
      position,
      orientation: new Cesium.Quaternion(),
      velocity: new Cesium.Cartesian3(),
      health: 100,
      isAlive: true,
      kills: 0,
      deaths: 0,
      lastUpdate: Date.now()
    }

    networking.addPlayer(player)
    gameStore.addPlayer(player)

    // Create aircraft entity
    cesiumViewerRef.value?.cesium.createRemoteAircraft(
      player.id,
      player.position,
      player.orientation
    )
  }

  networking.onPlayerLeave.value = (playerId) => {
    networking.removePlayer(playerId)
    gameStore.removePlayer(playerId)
    deadReckoning.removePlayer(playerId)
    cesiumViewerRef.value?.cesium.removeRemoteAircraft(playerId)
  }

  networking.onPositionUpdate.value = (msg) => {
    const player = networking.players.get(msg.id)
    if (player) {
      const position = new Cesium.Cartesian3(msg.p[0], msg.p[1], msg.p[2])
      const orientation = new Cesium.Quaternion(msg.q[0], msg.q[1], msg.q[2], msg.q[3])
      const velocity = new Cesium.Cartesian3(msg.v[0], msg.v[1], msg.v[2])

      // Update player record
      player.position = position
      player.orientation = orientation
      player.velocity = velocity
      player.lastUpdate = msg.ts

      // Send to dead-reckoning system for smooth interpolation
      deadReckoning.receiveUpdate(msg.id, position, orientation, velocity, msg.ts)
    }
  }

  networking.onFire.value = (msg) => {
    // Handle remote player firing
    const player = networking.players.get(msg.id)
    if (!player) return

    if (msg.w === 'm') {
      // Create missile visual
      const missile = weapons.fireMissile(
        msg.id,
        {
          position: new Cesium.Cartesian3(msg.p[0], msg.p[1], msg.p[2]),
          orientation: player.orientation,
          velocity: player.velocity,
          angularVelocity: { x: 0, y: 0, z: 0 },
          throttle: 0,
          speed: 0
        },
        msg.target || null
      )
      if (missile) {
        cesiumViewerRef.value?.cesium.createMissile(
          missile.id,
          missile.position,
          player.orientation
        )
      }
    }
  }

  networking.onHit.value = (msg) => {
    if (msg.victim === gameStore.playerId) {
      gameStore.takeDamage(msg.damage)
      if (gameStore.health <= 0) {
        die(msg.attacker, msg.weapon)
      }
    }
  }

  networking.onDeath.value = (msg) => {
    const victim = networking.players.get(msg.victim)
    if (victim) {
      victim.isAlive = false
      victim.deaths++
    }

    if (msg.killer === gameStore.playerId) {
      gameStore.addKill()
    }
  }

  networking.onSpawn.value = (msg) => {
    const player = networking.players.get(msg.id)
    if (player) {
      player.isAlive = true
      player.position = new Cesium.Cartesian3(msg.p[0], msg.p[1], msg.p[2])
    }
  }
}

function spawnPlayer() {
  const spawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)]
  const initialState = FlightModel.createInitialState(
    spawn.lon,
    spawn.lat,
    spawn.alt,
    spawn.heading
  )

  Object.assign(aircraftState, initialState)

  isAlive.value = true
  gameStore.health = 100
  gameStore.missiles = 6

  networking.broadcastSpawn(aircraftState.position, spawn.heading)
}

function die(killerId: string, weapon: 'm' | 'g') {
  isAlive.value = false
  killedBy.value = killerId
  respawnTimer.value = GAME.RESPAWN_TIME / 1000
  gameStore.die()

  networking.broadcastDeath(killerId, weapon)

  // Start respawn countdown
  const countdown = setInterval(() => {
    respawnTimer.value -= 1
    if (respawnTimer.value <= 0) {
      clearInterval(countdown)
      spawnPlayer()
    }
  }, 1000)
}

function gameLoop() {
  const currentTime = performance.now()
  const dt = Math.min((currentTime - lastTime) / 1000, 0.1) // Cap at 100ms
  lastTime = currentTime

  if (isAlive.value && isInitialized.value) {
    // Get input
    const inputState = input.getInputState()

    // Update physics
    const newState = FlightModel.update(aircraftState, inputState, dt)
    Object.assign(aircraftState, newState)

    // Enforce arena boundaries
    enforceArenaBounds()

    // Enforce altitude limits
    enforceAltitudeLimits()

    // Update HUD values
    updateHUDValues()

    // Handle weapon input
    handleWeaponInput(inputState)

    // Update weapons
    weapons.updateMissiles(players.value, dt)
    weapons.updateBullets(dt)

    // Check collisions
    checkCollisions()

    // Update Cesium visuals
    updateVisuals()

    // Broadcast position
    networking.broadcastPosition(
      aircraftState.position,
      aircraftState.orientation,
      aircraftState.velocity
    )
  }

  // Always update dead-reckoning and remote aircraft visuals (even when dead)
  if (isInitialized.value) {
    deadReckoning.update(dt)

    // Update remote aircraft positions using dead-reckoned state
    for (const [playerId] of networking.players) {
      const renderState = deadReckoning.getRenderState(playerId)
      if (renderState) {
        cesiumViewerRef.value?.cesium.updateRemoteAircraft(
          playerId,
          renderState.position,
          renderState.orientation
        )
      }
    }
  }

  animationFrameId = requestAnimationFrame(gameLoop)
}

function enforceArenaBounds() {
  const cesium = cesiumViewerRef.value?.cesium
  if (!cesium) return

  const distance = Cesium.Cartesian3.distance(aircraftState.position, ARENA.CENTER)

  if (distance > ARENA.RADIUS * 0.9) {
    // Near boundary - start turning back
    const toCenter = Cesium.Cartesian3.subtract(
      ARENA.CENTER,
      aircraftState.position,
      new Cesium.Cartesian3()
    )
    Cesium.Cartesian3.normalize(toCenter, toCenter)

    // Blend velocity toward center
    const currentDir = Cesium.Cartesian3.normalize(
      aircraftState.velocity,
      new Cesium.Cartesian3()
    )
    const blendedDir = Cesium.Cartesian3.lerp(
      currentDir,
      toCenter,
      0.02,
      new Cesium.Cartesian3()
    )
    Cesium.Cartesian3.normalize(blendedDir, blendedDir)

    const speed = Cesium.Cartesian3.magnitude(aircraftState.velocity)
    Cesium.Cartesian3.multiplyByScalar(blendedDir, speed, aircraftState.velocity)
  }

  if (distance > ARENA.RADIUS) {
    // Hard boundary - teleport back
    const toCenter = Cesium.Cartesian3.subtract(
      ARENA.CENTER,
      aircraftState.position,
      new Cesium.Cartesian3()
    )
    Cesium.Cartesian3.normalize(toCenter, toCenter)
    Cesium.Cartesian3.multiplyByScalar(toCenter, ARENA.RADIUS * 0.95, toCenter)
    Cesium.Cartesian3.add(ARENA.CENTER, toCenter, aircraftState.position)
  }
}

function enforceAltitudeLimits() {
  const cesium = cesiumViewerRef.value?.cesium
  if (!cesium) return

  const cartographic = cesium.getCartographic(aircraftState.position)

  if (cartographic.altitude < PHYSICS.MIN_ALTITUDE) {
    // Too low - force climb
    const newPosition = Cesium.Cartesian3.fromDegrees(
      cartographic.longitude,
      cartographic.latitude,
      PHYSICS.MIN_ALTITUDE + 50
    )
    aircraftState.position = newPosition

    // Zero out downward velocity
    if (aircraftState.velocity.z < 0) {
      aircraftState.velocity.z = 0
    }
  }

  if (cartographic.altitude > PHYSICS.MAX_ALTITUDE) {
    // Too high - force descend
    const newPosition = Cesium.Cartesian3.fromDegrees(
      cartographic.longitude,
      cartographic.latitude,
      PHYSICS.MAX_ALTITUDE - 50
    )
    aircraftState.position = newPosition
  }
}

function updateHUDValues() {
  const cesium = cesiumViewerRef.value?.cesium
  if (!cesium) return

  const cartographic = cesium.getCartographic(aircraftState.position)
  altitude.value = Math.round(cartographic.altitude)
  speed.value = Math.round(aircraftState.speed)

  // Calculate heading from ENU-relative orientation
  // Our orientation is ENU-relative, body +Y is forward
  const bodyToENU = Cesium.Matrix3.fromQuaternion(aircraftState.orientation)
  const forwardBody = new Cesium.Cartesian3(0, 1, 0)
  const forwardENU = Cesium.Matrix3.multiplyByVector(bodyToENU, forwardBody, new Cesium.Cartesian3())

  // Heading in ENU: 0 = North (+Y), 90 = East (+X)
  const headingRad = Math.atan2(forwardENU.x, forwardENU.y)
  heading.value = Math.round(Cesium.Math.toDegrees(headingRad))
  if (heading.value < 0) heading.value += 360
}

function handleWeaponInput(inputState: ReturnType<typeof input.getInputState>) {
  // Missile fire (single shot on press)
  if (input.checkMissileFire() && gameStore.missiles > 0) {
    // Find lock-on target
    lockedTarget.value = weapons.findLockOnTarget(
      aircraftState,
      gameStore.playerId,
      players.value
    )

    if (gameStore.fireMissile()) {
      const missile = weapons.fireMissile(
        gameStore.playerId,
        aircraftState,
        lockedTarget.value
      )

      if (missile) {
        const forward = FlightModel.getForwardDirection(aircraftState.position, aircraftState.orientation)
        networking.broadcastFire(
          'm',
          missile.position,
          forward,
          lockedTarget.value || undefined
        )

        cesiumViewerRef.value?.cesium.createMissile(
          missile.id,
          missile.position,
          aircraftState.orientation
        )
      }
    }
  }

  // Gun fire (continuous)
  if (inputState.fireGun) {
    const bullet = weapons.fireGun(gameStore.playerId, aircraftState)
    if (bullet) {
      const forward = FlightModel.getForwardDirection(aircraftState.position, aircraftState.orientation)
      networking.broadcastFire('g', bullet.position, forward)
    }
  }

  // Update lock-on target for HUD
  lockedTarget.value = weapons.findLockOnTarget(
    aircraftState,
    gameStore.playerId,
    players.value
  )
}

function checkCollisions() {
  // Check missile hits
  const missileHits = weapons.checkMissileCollisions(players.value)
  for (const hit of missileHits) {
    if (hit.ownerId === gameStore.playerId) {
      networking.broadcastHit(hit.playerId, WEAPONS.MISSILE.DAMAGE, 'm')
    }
    cesiumViewerRef.value?.cesium.removeMissile(hit.missileId)

    // Create explosion
    const victim = players.value.get(hit.playerId)
    if (victim) {
      cesiumViewerRef.value?.cesium.createExplosion(victim.position)
    }
  }

  // Check bullet hits
  const bulletHits = weapons.checkBulletCollisions(players.value)
  for (const hit of bulletHits) {
    if (hit.ownerId === gameStore.playerId) {
      networking.broadcastHit(hit.playerId, WEAPONS.GUN.DAMAGE, 'g')
    }
  }

  // Check if local player was hit by remote missiles/bullets
  // (This is handled by onHit callback from networking)
}

function updateVisuals() {
  const cesium = cesiumViewerRef.value?.cesium
  if (!cesium) return

  // Update camera
  cesium.updateCamera(aircraftState)

  // Update missile visuals
  for (const [id, missile] of weapons.missiles) {
    const direction = Cesium.Cartesian3.normalize(missile.velocity, new Cesium.Cartesian3())
    const orientation = Cesium.Quaternion.fromHeadingPitchRoll(
      new Cesium.HeadingPitchRoll(
        Math.atan2(direction.x, direction.y),
        -Math.asin(direction.z),
        0
      )
    )
    cesium.updateMissile(id, missile.position, orientation)
  }
}

function handleContainerClick() {
  if (containerRef.value && !input.isPointerLocked.value) {
    input.requestPointerLock(containerRef.value)
  }
}

function handleExit() {
  networking.disconnect()
  gameStore.reset()
  router.push('/')
}

onMounted(() => {
  // Check if we have a username
  if (!gameStore.username) {
    router.push('/')
    return
  }
})

onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }
  networking.disconnect()
  weapons.clear()
  deadReckoning.clear()
})
</script>

<template>
  <div
    ref="containerRef"
    class="game-arena"
    @click="handleContainerClick"
  >
    <CesiumViewer
      ref="cesiumViewerRef"
      @initialized="onCesiumInitialized"
    />

    <GameHUD
      v-if="isAlive && isInitialized"
      :health="gameStore.health"
      :missiles="gameStore.missiles"
      :speed="speed"
      :altitude="altitude"
      :heading="heading"
      :throttle="aircraftState.throttle"
      :kills="gameStore.kills"
      :deaths="gameStore.deaths"
      :players="players"
      :locked-target="lockedTarget"
      :is-pointer-locked="input.isPointerLocked.value"
    />

    <DeathScreen
      v-if="!isAlive"
      :killed-by="killedBy"
      :respawn-time="respawnTimer"
    />

    <!-- Exit button -->
    <button class="exit-button" @click="handleExit">
      EXIT
    </button>

    <!-- Pointer lock hint -->
    <div v-if="!input.isPointerLocked.value && isInitialized && isAlive" class="pointer-hint">
      Click to enable flight controls
    </div>
  </div>
</template>

<style scoped>
.game-arena {
  width: 100%;
  height: 100%;
  position: relative;
  cursor: crosshair;
}

.exit-button {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  letter-spacing: 0.1em;
  z-index: 100;
}

.exit-button:hover {
  background: rgba(230, 57, 70, 0.8);
}

.pointer-hint {
  position: absolute;
  bottom: 50%;
  left: 50%;
  transform: translate(-50%, 50%);
  padding: 20px 40px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border-radius: 8px;
  font-size: 18px;
  z-index: 100;
  pointer-events: none;
}
</style>
