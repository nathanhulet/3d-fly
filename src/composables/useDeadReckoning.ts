import { reactive } from 'vue'
import * as Cesium from 'cesium'

/**
 * Dead-reckoning state for a remote player
 */
interface RemotePlayerDR {
  // Last confirmed state from network
  confirmedPosition: Cesium.Cartesian3
  confirmedOrientation: Cesium.Quaternion
  confirmedVelocity: Cesium.Cartesian3
  confirmedTimestamp: number

  // Interpolated/extrapolated state for rendering
  renderPosition: Cesium.Cartesian3
  renderOrientation: Cesium.Quaternion

  // For smooth correction when new data arrives
  correctionOffset: Cesium.Cartesian3
  correctionAlpha: number
}

// How long to blend position corrections (ms)
const CORRECTION_DURATION = 200

// Maximum extrapolation time before snapping (ms)
const MAX_EXTRAPOLATION = 500

// Error threshold for snapping instead of blending (meters)
const SNAP_THRESHOLD = 50

/**
 * Dead-reckoning composable for smooth remote player movement
 *
 * This system:
 * 1. Extrapolates remote player positions using velocity between network updates
 * 2. Smoothly blends corrections when new position data arrives
 * 3. Snaps to new position if error is too large (prevents rubber-banding)
 */
export function useDeadReckoning() {
  const players = reactive<Map<string, RemotePlayerDR>>(new Map())

  /**
   * Initialize dead-reckoning state for a new player
   */
  function initPlayer(
    playerId: string,
    position: Cesium.Cartesian3,
    orientation: Cesium.Quaternion,
    velocity: Cesium.Cartesian3
  ): void {
    players.set(playerId, {
      confirmedPosition: Cesium.Cartesian3.clone(position),
      confirmedOrientation: Cesium.Quaternion.clone(orientation),
      confirmedVelocity: Cesium.Cartesian3.clone(velocity),
      confirmedTimestamp: Date.now(),

      renderPosition: Cesium.Cartesian3.clone(position),
      renderOrientation: Cesium.Quaternion.clone(orientation),

      correctionOffset: new Cesium.Cartesian3(0, 0, 0),
      correctionAlpha: 0
    })
  }

  /**
   * Receive new network update for player
   * This calculates the prediction error and sets up correction blending
   */
  function receiveUpdate(
    playerId: string,
    position: Cesium.Cartesian3,
    orientation: Cesium.Quaternion,
    velocity: Cesium.Cartesian3,
    timestamp: number
  ): void {
    let player = players.get(playerId)

    if (!player) {
      initPlayer(playerId, position, orientation, velocity)
      return
    }

    // Calculate where we predicted they would be
    const timeSinceConfirmed = (timestamp - player.confirmedTimestamp) / 1000
    const predictedPosition = extrapolatePosition(
      player.confirmedPosition,
      player.confirmedVelocity,
      timeSinceConfirmed
    )

    // Error between prediction and actual
    const error = Cesium.Cartesian3.subtract(
      position,
      predictedPosition,
      new Cesium.Cartesian3()
    )
    const errorMagnitude = Cesium.Cartesian3.magnitude(error)

    // If error is too large, snap instead of blend
    if (errorMagnitude > SNAP_THRESHOLD) {
      player.renderPosition = Cesium.Cartesian3.clone(position)
      player.renderOrientation = Cesium.Quaternion.clone(orientation)
      player.correctionOffset = new Cesium.Cartesian3(0, 0, 0)
      player.correctionAlpha = 0
    } else {
      // Set up smooth correction
      // correctionOffset = current render position - new confirmed position
      Cesium.Cartesian3.subtract(
        player.renderPosition,
        position,
        player.correctionOffset
      )
      player.correctionAlpha = 1.0 // Will decay to 0 over CORRECTION_DURATION
    }

    // Update confirmed state
    player.confirmedPosition = Cesium.Cartesian3.clone(position)
    player.confirmedOrientation = Cesium.Quaternion.clone(orientation)
    player.confirmedVelocity = Cesium.Cartesian3.clone(velocity)
    player.confirmedTimestamp = timestamp
  }

  /**
   * Update dead-reckoning for all players (call each frame)
   * @param dt Delta time in seconds
   */
  function update(dt: number): void {
    const now = Date.now()

    for (const [_, player] of players) {
      const timeSinceConfirmed = (now - player.confirmedTimestamp) / 1000

      // Don't extrapolate too far into the future
      const clampedTime = Math.min(timeSinceConfirmed, MAX_EXTRAPOLATION / 1000)

      // Extrapolate position from confirmed state
      const extrapolated = extrapolatePosition(
        player.confirmedPosition,
        player.confirmedVelocity,
        clampedTime
      )

      // Apply correction offset (blended out over time)
      if (player.correctionAlpha > 0.001) {
        const correctionDecay = dt / (CORRECTION_DURATION / 1000)
        player.correctionAlpha = Math.max(0, player.correctionAlpha - correctionDecay)

        // Render position = extrapolated + correction * alpha
        const scaledCorrection = Cesium.Cartesian3.multiplyByScalar(
          player.correctionOffset,
          player.correctionAlpha,
          new Cesium.Cartesian3()
        )
        Cesium.Cartesian3.add(extrapolated, scaledCorrection, player.renderPosition)
      } else {
        Cesium.Cartesian3.clone(extrapolated, player.renderPosition)
      }

      // For orientation, just use the confirmed orientation
      // Could add SLERP interpolation here if angular velocity was transmitted
      Cesium.Quaternion.clone(player.confirmedOrientation, player.renderOrientation)
    }
  }

  /**
   * Get render state for a player
   */
  function getRenderState(playerId: string): {
    position: Cesium.Cartesian3
    orientation: Cesium.Quaternion
  } | null {
    const player = players.get(playerId)
    if (!player) return null

    return {
      position: player.renderPosition,
      orientation: player.renderOrientation
    }
  }

  /**
   * Get confirmed velocity for a player (for collision prediction)
   */
  function getVelocity(playerId: string): Cesium.Cartesian3 | null {
    const player = players.get(playerId)
    return player ? player.confirmedVelocity : null
  }

  /**
   * Check if a player exists in the dead-reckoning system
   */
  function hasPlayer(playerId: string): boolean {
    return players.has(playerId)
  }

  /**
   * Remove player from dead-reckoning
   */
  function removePlayer(playerId: string): void {
    players.delete(playerId)
  }

  /**
   * Clear all players
   */
  function clear(): void {
    players.clear()
  }

  return {
    players,
    initPlayer,
    receiveUpdate,
    update,
    getRenderState,
    getVelocity,
    hasPlayer,
    removePlayer,
    clear
  }
}

/**
 * Helper function to extrapolate position using velocity
 */
function extrapolatePosition(
  position: Cesium.Cartesian3,
  velocity: Cesium.Cartesian3,
  dt: number
): Cesium.Cartesian3 {
  return Cesium.Cartesian3.add(
    position,
    Cesium.Cartesian3.multiplyByScalar(velocity, dt, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  )
}
