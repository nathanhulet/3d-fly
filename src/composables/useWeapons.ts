import { reactive } from 'vue'
import * as Cesium from 'cesium'
import { WEAPONS, COLLISION } from '@/utils/constants'
import { FlightModel } from '@/game/physics/FlightModel'
import type { Missile, Bullet, AircraftState, Player } from '@/types/game'

export function useWeapons() {
  const missiles = reactive<Map<string, Missile>>(new Map())
  const bullets = reactive<Map<string, Bullet>>(new Map())

  let lastMissileTime = 0
  let lastGunTime = 0

  /**
   * Fire a missile from aircraft
   */
  function fireMissile(
    ownerId: string,
    state: AircraftState,
    targetId: string | null = null
  ): Missile | null {
    const now = Date.now()
    if (now - lastMissileTime < WEAPONS.MISSILE.COOLDOWN) {
      return null
    }

    const forward = FlightModel.getForwardDirection(state.orientation)
    const velocity = Cesium.Cartesian3.multiplyByScalar(
      forward,
      WEAPONS.MISSILE.SPEED,
      new Cesium.Cartesian3()
    )

    // Offset missile spawn position slightly in front of aircraft
    const spawnOffset = Cesium.Cartesian3.multiplyByScalar(forward, 15, new Cesium.Cartesian3())
    const position = Cesium.Cartesian3.add(state.position, spawnOffset, new Cesium.Cartesian3())

    const missile: Missile = {
      id: generateId(),
      ownerId,
      position,
      velocity,
      targetId,
      createdAt: now
    }

    missiles.set(missile.id, missile)
    lastMissileTime = now

    return missile
  }

  /**
   * Fire gun from aircraft
   */
  function fireGun(ownerId: string, state: AircraftState): Bullet | null {
    const now = Date.now()
    if (now - lastGunTime < WEAPONS.GUN.COOLDOWN) {
      return null
    }

    const forward = FlightModel.getForwardDirection(state.orientation)

    // Add random spread
    const spread = WEAPONS.GUN.SPREAD
    const spreadX = (Math.random() - 0.5) * spread
    const spreadY = (Math.random() - 0.5) * spread

    // Apply spread by rotating the forward vector slightly
    const direction = applySpread(forward, spreadX, spreadY)

    const velocity = Cesium.Cartesian3.multiplyByScalar(
      direction,
      WEAPONS.GUN.SPEED,
      new Cesium.Cartesian3()
    )

    // Add aircraft velocity to bullet velocity
    Cesium.Cartesian3.add(velocity, state.velocity, velocity)

    // Offset spawn position
    const spawnOffset = Cesium.Cartesian3.multiplyByScalar(forward, 10, new Cesium.Cartesian3())
    const position = Cesium.Cartesian3.add(state.position, spawnOffset, new Cesium.Cartesian3())

    const bullet: Bullet = {
      id: generateId(),
      ownerId,
      position,
      velocity,
      createdAt: now
    }

    bullets.set(bullet.id, bullet)
    lastGunTime = now

    return bullet
  }

  /**
   * Update all missiles (tracking, movement)
   */
  function updateMissiles(players: Map<string, Player>, dt: number): void {
    const now = Date.now()

    for (const [id, missile] of missiles) {
      // Remove expired missiles
      if (now - missile.createdAt > WEAPONS.MISSILE.LIFETIME) {
        missiles.delete(id)
        continue
      }

      // Track target if we have one
      if (missile.targetId) {
        const target = players.get(missile.targetId)
        if (target && target.isAlive) {
          // Proportional navigation
          const toTarget = Cesium.Cartesian3.subtract(
            target.position,
            missile.position,
            new Cesium.Cartesian3()
          )
          Cesium.Cartesian3.normalize(toTarget, toTarget)

          // Current direction
          const currentDir = Cesium.Cartesian3.normalize(
            missile.velocity,
            new Cesium.Cartesian3()
          )

          // Blend towards target
          const turnAmount = WEAPONS.MISSILE.TURN_RATE * dt
          const newDir = Cesium.Cartesian3.lerp(
            currentDir,
            toTarget,
            Math.min(turnAmount, 1),
            new Cesium.Cartesian3()
          )
          Cesium.Cartesian3.normalize(newDir, newDir)

          // Update velocity
          Cesium.Cartesian3.multiplyByScalar(
            newDir,
            WEAPONS.MISSILE.SPEED,
            missile.velocity
          )
        }
      }

      // Update position
      const deltaPos = Cesium.Cartesian3.multiplyByScalar(
        missile.velocity,
        dt,
        new Cesium.Cartesian3()
      )
      Cesium.Cartesian3.add(missile.position, deltaPos, missile.position)
    }
  }

  /**
   * Update all bullets (movement only, no tracking)
   */
  function updateBullets(dt: number): void {
    const now = Date.now()
    const maxLifetime = (WEAPONS.GUN.RANGE / WEAPONS.GUN.SPEED) * 1000

    for (const [id, bullet] of bullets) {
      // Remove expired bullets
      if (now - bullet.createdAt > maxLifetime) {
        bullets.delete(id)
        continue
      }

      // Update position
      const deltaPos = Cesium.Cartesian3.multiplyByScalar(
        bullet.velocity,
        dt,
        new Cesium.Cartesian3()
      )
      Cesium.Cartesian3.add(bullet.position, deltaPos, bullet.position)
    }
  }

  /**
   * Check missile collisions with players
   */
  function checkMissileCollisions(players: Map<string, Player>): Array<{
    missileId: string
    playerId: string
    ownerId: string
  }> {
    const hits: Array<{ missileId: string; playerId: string; ownerId: string }> = []

    for (const [missileId, missile] of missiles) {
      for (const [playerId, player] of players) {
        // Skip own missiles
        if (playerId === missile.ownerId) continue
        if (!player.isAlive) continue

        const distance = Cesium.Cartesian3.distance(missile.position, player.position)
        if (distance < COLLISION.AIRCRAFT + WEAPONS.MISSILE.PROXIMITY_FUSE) {
          hits.push({
            missileId,
            playerId,
            ownerId: missile.ownerId
          })
          missiles.delete(missileId)
          break
        }
      }
    }

    return hits
  }

  /**
   * Check bullet collisions with players
   */
  function checkBulletCollisions(players: Map<string, Player>): Array<{
    bulletId: string
    playerId: string
    ownerId: string
  }> {
    const hits: Array<{ bulletId: string; playerId: string; ownerId: string }> = []

    for (const [bulletId, bullet] of bullets) {
      for (const [playerId, player] of players) {
        // Skip own bullets
        if (playerId === bullet.ownerId) continue
        if (!player.isAlive) continue

        const distance = Cesium.Cartesian3.distance(bullet.position, player.position)
        if (distance < COLLISION.AIRCRAFT + COLLISION.BULLET) {
          hits.push({
            bulletId,
            playerId,
            ownerId: bullet.ownerId
          })
          bullets.delete(bulletId)
          break
        }
      }
    }

    return hits
  }

  /**
   * Find best lock-on target for missile
   */
  function findLockOnTarget(
    state: AircraftState,
    playerId: string,
    players: Map<string, Player>
  ): string | null {
    const forward = FlightModel.getForwardDirection(state.orientation)
    const lockAngleRad = Cesium.Math.toRadians(WEAPONS.MISSILE.LOCK_ANGLE)

    let bestTarget: string | null = null
    let bestScore = -1

    for (const [id, player] of players) {
      if (id === playerId) continue
      if (!player.isAlive) continue

      const toTarget = Cesium.Cartesian3.subtract(
        player.position,
        state.position,
        new Cesium.Cartesian3()
      )
      const distance = Cesium.Cartesian3.magnitude(toTarget)

      // Check range
      if (distance > WEAPONS.MISSILE.LOCK_RANGE) continue

      // Check angle
      Cesium.Cartesian3.normalize(toTarget, toTarget)
      const dot = Cesium.Cartesian3.dot(forward, toTarget)
      const angle = Math.acos(Math.min(1, Math.max(-1, dot)))

      if (angle > lockAngleRad) continue

      // Score based on angle (smaller angle = better target)
      const score = 1 - (angle / lockAngleRad)
      if (score > bestScore) {
        bestScore = score
        bestTarget = id
      }
    }

    return bestTarget
  }

  /**
   * Remove missile by ID
   */
  function removeMissile(id: string): void {
    missiles.delete(id)
  }

  /**
   * Remove bullet by ID
   */
  function removeBullet(id: string): void {
    bullets.delete(id)
  }

  /**
   * Clear all projectiles
   */
  function clear(): void {
    missiles.clear()
    bullets.clear()
  }

  return {
    missiles,
    bullets,
    fireMissile,
    fireGun,
    updateMissiles,
    updateBullets,
    checkMissileCollisions,
    checkBulletCollisions,
    findLockOnTarget,
    removeMissile,
    removeBullet,
    clear
  }
}

// Helper functions
function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

function applySpread(direction: Cesium.Cartesian3, spreadX: number, spreadY: number): Cesium.Cartesian3 {
  // Simple spread application using axis rotations
  const result = Cesium.Cartesian3.clone(direction)

  // Rotate around arbitrary perpendicular axes
  const up = new Cesium.Cartesian3(0, 0, 1)
  const right = Cesium.Cartesian3.cross(direction, up, new Cesium.Cartesian3())
  Cesium.Cartesian3.normalize(right, right)

  const perpUp = Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3())
  Cesium.Cartesian3.normalize(perpUp, perpUp)

  // Apply spread offsets
  Cesium.Cartesian3.add(
    result,
    Cesium.Cartesian3.multiplyByScalar(right, spreadX, new Cesium.Cartesian3()),
    result
  )
  Cesium.Cartesian3.add(
    result,
    Cesium.Cartesian3.multiplyByScalar(perpUp, spreadY, new Cesium.Cartesian3()),
    result
  )

  Cesium.Cartesian3.normalize(result, result)
  return result
}
