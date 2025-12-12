import * as Cesium from 'cesium'
import { PHYSICS } from '@/utils/constants'
import type { AircraftState, InputState, Vector3 } from '@/types/game'

/**
 * 6DOF Flight Model
 * Calculates forces and updates aircraft state based on physics
 */
export class FlightModel {
  /**
   * Update aircraft state based on physics and input
   */
  static update(state: AircraftState, input: InputState, dt: number): AircraftState {
    // Clone state to avoid mutation
    const newState = { ...state }

    // 1. Update throttle based on input
    newState.throttle = this.updateThrottle(state.throttle, input, dt)

    // 2. Calculate current speed
    newState.speed = Cesium.Cartesian3.magnitude(state.velocity)

    // 3. Update angular velocity based on control inputs
    newState.angularVelocity = this.updateAngularVelocity(
      state.angularVelocity,
      input,
      newState.speed,
      dt
    )

    // 4. Update orientation based on angular velocity
    newState.orientation = this.updateOrientation(
      state.orientation,
      newState.angularVelocity,
      dt
    )

    // 5. Calculate forces
    const forces = this.calculateForces(newState)

    // 6. Update velocity based on forces
    newState.velocity = this.updateVelocity(
      state.velocity,
      forces,
      newState.orientation,
      dt
    )

    // 7. Clamp speed
    newState.speed = Cesium.Cartesian3.magnitude(newState.velocity)
    if (newState.speed > PHYSICS.MAX_SPEED) {
      Cesium.Cartesian3.normalize(newState.velocity, newState.velocity)
      Cesium.Cartesian3.multiplyByScalar(newState.velocity, PHYSICS.MAX_SPEED, newState.velocity)
      newState.speed = PHYSICS.MAX_SPEED
    }

    // 8. Update position based on velocity
    newState.position = this.updatePosition(state.position, newState.velocity, dt)

    return newState
  }

  /**
   * Update throttle (0-1)
   */
  private static updateThrottle(throttle: number, input: InputState, dt: number): number {
    let newThrottle = throttle

    if (input.throttleUp) {
      newThrottle += PHYSICS.THROTTLE_RATE * dt
    }
    if (input.throttleDown) {
      newThrottle -= PHYSICS.THROTTLE_RATE * dt
    }

    return Math.max(0, Math.min(1, newThrottle))
  }

  /**
   * Update angular velocity based on control inputs
   * At low speeds, controls become less effective (stall behavior)
   */
  private static updateAngularVelocity(
    angularVelocity: Vector3,
    input: InputState,
    speed: number,
    dt: number
  ): Vector3 {
    // Control effectiveness based on speed (0 at stall, 1 at cruise+)
    const effectiveness = Math.min(1, Math.max(0, (speed - PHYSICS.MIN_SPEED) / (PHYSICS.CRUISE_SPEED - PHYSICS.MIN_SPEED)))

    // Apply damping
    const newAngularVelocity: Vector3 = {
      x: angularVelocity.x * PHYSICS.ANGULAR_DAMPING,
      y: angularVelocity.y * PHYSICS.ANGULAR_DAMPING,
      z: angularVelocity.z * PHYSICS.ANGULAR_DAMPING
    }

    // Apply control inputs (with effectiveness)
    // Pitch (x-axis): W/S keys
    newAngularVelocity.x += input.pitch * PHYSICS.PITCH_SENSITIVITY * effectiveness * dt

    // Roll (z-axis): A/D keys
    newAngularVelocity.z += input.roll * PHYSICS.ROLL_SENSITIVITY * effectiveness * dt

    // Yaw (y-axis): Mouse X
    newAngularVelocity.y += input.yaw * PHYSICS.YAW_SENSITIVITY * effectiveness * dt

    // Clamp angular velocities
    newAngularVelocity.x = Math.max(-PHYSICS.MAX_PITCH_RATE, Math.min(PHYSICS.MAX_PITCH_RATE, newAngularVelocity.x))
    newAngularVelocity.y = Math.max(-PHYSICS.MAX_YAW_RATE, Math.min(PHYSICS.MAX_YAW_RATE, newAngularVelocity.y))
    newAngularVelocity.z = Math.max(-PHYSICS.MAX_ROLL_RATE, Math.min(PHYSICS.MAX_ROLL_RATE, newAngularVelocity.z))

    return newAngularVelocity
  }

  /**
   * Update orientation quaternion based on angular velocity
   */
  private static updateOrientation(
    orientation: Cesium.Quaternion,
    angularVelocity: Vector3,
    dt: number
  ): Cesium.Quaternion {
    // Convert angular velocity to rotation quaternion
    const angle = Math.sqrt(
      angularVelocity.x * angularVelocity.x +
      angularVelocity.y * angularVelocity.y +
      angularVelocity.z * angularVelocity.z
    ) * dt

    if (angle < 0.0001) {
      return Cesium.Quaternion.clone(orientation)
    }

    const axis = new Cesium.Cartesian3(
      angularVelocity.x / (angle / dt),
      angularVelocity.y / (angle / dt),
      angularVelocity.z / (angle / dt)
    )

    const deltaRotation = Cesium.Quaternion.fromAxisAngle(axis, angle)

    // Multiply quaternions: newOrientation = orientation * deltaRotation
    const newOrientation = Cesium.Quaternion.multiply(
      orientation,
      deltaRotation,
      new Cesium.Quaternion()
    )

    // Normalize to prevent drift
    Cesium.Quaternion.normalize(newOrientation, newOrientation)

    return newOrientation
  }

  /**
   * Calculate forces acting on aircraft
   */
  private static calculateForces(state: AircraftState): {
    thrust: number
    lift: number
    drag: number
    weight: number
  } {
    const speed = state.speed
    const dynamicPressure = 0.5 * PHYSICS.AIR_DENSITY * speed * speed

    // Thrust: linear interpolation between idle and max
    const thrust = PHYSICS.IDLE_THRUST + (PHYSICS.MAX_THRUST - PHYSICS.IDLE_THRUST) * state.throttle

    // Lift: proportional to dynamic pressure and wing area
    // Lift increases with angle of attack (simplified)
    const lift = dynamicPressure * PHYSICS.WING_AREA * PHYSICS.LIFT_COEFFICIENT

    // Drag: proportional to dynamic pressure
    const drag = dynamicPressure * PHYSICS.WING_AREA * PHYSICS.DRAG_COEFFICIENT

    // Weight: constant
    const weight = PHYSICS.MASS * PHYSICS.GRAVITY

    return { thrust, lift, drag, weight }
  }

  /**
   * Update velocity based on forces
   */
  private static updateVelocity(
    velocity: Cesium.Cartesian3,
    forces: { thrust: number; lift: number; drag: number; weight: number },
    orientation: Cesium.Quaternion,
    dt: number
  ): Cesium.Cartesian3 {
    // Get aircraft axes in world coordinates
    // Standard orientation: +Y forward, +Z up
    const forwardLocal = new Cesium.Cartesian3(0, 1, 0)   // +Y forward
    const upLocal = new Cesium.Cartesian3(0, 0, 1)        // +Z up

    const rotationMatrix = Cesium.Matrix3.fromQuaternion(orientation)

    const forward = Cesium.Matrix3.multiplyByVector(rotationMatrix, forwardLocal, new Cesium.Cartesian3())
    const up = Cesium.Matrix3.multiplyByVector(rotationMatrix, upLocal, new Cesium.Cartesian3())

    Cesium.Cartesian3.normalize(forward, forward)
    Cesium.Cartesian3.normalize(up, up)

    // Calculate drag direction (opposite to velocity)
    const speed = Cesium.Cartesian3.magnitude(velocity)
    let dragDirection = new Cesium.Cartesian3()
    if (speed > 0.1) {
      Cesium.Cartesian3.normalize(velocity, dragDirection)
      Cesium.Cartesian3.negate(dragDirection, dragDirection)
    }

    // Apply forces
    const acceleration = new Cesium.Cartesian3(0, 0, 0)

    // Thrust along forward axis
    const thrustForce = Cesium.Cartesian3.multiplyByScalar(forward, forces.thrust / PHYSICS.MASS, new Cesium.Cartesian3())
    Cesium.Cartesian3.add(acceleration, thrustForce, acceleration)

    // Lift along up axis
    const liftForce = Cesium.Cartesian3.multiplyByScalar(up, forces.lift / PHYSICS.MASS, new Cesium.Cartesian3())
    Cesium.Cartesian3.add(acceleration, liftForce, acceleration)

    // Drag opposite to velocity
    if (speed > 0.1) {
      const dragForce = Cesium.Cartesian3.multiplyByScalar(dragDirection, forces.drag / PHYSICS.MASS, new Cesium.Cartesian3())
      Cesium.Cartesian3.add(acceleration, dragForce, acceleration)
    }

    // Gravity (simplified - points down in ECEF)
    const gravityForce = Cesium.Cartesian3.multiplyByScalar(
      new Cesium.Cartesian3(0, 0, -1),
      PHYSICS.GRAVITY,
      new Cesium.Cartesian3()
    )
    Cesium.Cartesian3.add(acceleration, gravityForce, acceleration)

    // Update velocity: v = v + a * dt
    const newVelocity = new Cesium.Cartesian3()
    Cesium.Cartesian3.add(
      velocity,
      Cesium.Cartesian3.multiplyByScalar(acceleration, dt, new Cesium.Cartesian3()),
      newVelocity
    )

    return newVelocity
  }

  /**
   * Update position based on velocity
   */
  private static updatePosition(
    position: Cesium.Cartesian3,
    velocity: Cesium.Cartesian3,
    dt: number
  ): Cesium.Cartesian3 {
    const newPosition = new Cesium.Cartesian3()
    Cesium.Cartesian3.add(
      position,
      Cesium.Cartesian3.multiplyByScalar(velocity, dt, new Cesium.Cartesian3()),
      newPosition
    )
    return newPosition
  }

  /**
   * Get forward direction from orientation
   */
  static getForwardDirection(orientation: Cesium.Quaternion): Cesium.Cartesian3 {
    const forwardLocal = new Cesium.Cartesian3(0, 0, -1)  // -Z forward
    const rotationMatrix = Cesium.Matrix3.fromQuaternion(orientation)
    const forward = Cesium.Matrix3.multiplyByVector(rotationMatrix, forwardLocal, new Cesium.Cartesian3())
    Cesium.Cartesian3.normalize(forward, forward)
    return forward
  }

  /**
   * Get up direction from orientation
   */
  static getUpDirection(orientation: Cesium.Quaternion): Cesium.Cartesian3 {
    const upLocal = new Cesium.Cartesian3(1, 0, 0)   // X is up
    const rotationMatrix = Cesium.Matrix3.fromQuaternion(orientation)
    const up = Cesium.Matrix3.multiplyByVector(rotationMatrix, upLocal, new Cesium.Cartesian3())
    Cesium.Cartesian3.normalize(up, up)
    return up
  }

  /**
   * Create initial aircraft state at a spawn point
   */
  static createInitialState(
    longitude: number,
    latitude: number,
    altitude: number,
    heading: number
  ): AircraftState {
    const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude)

    // Create orientation from heading
    const hpr = new Cesium.HeadingPitchRoll(
      Cesium.Math.toRadians(heading),
      0,
      0
    )
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, hpr)

    // Initial velocity (forward at cruise speed)
    const forward = this.getForwardDirection(orientation)
    const velocity = Cesium.Cartesian3.multiplyByScalar(forward, PHYSICS.CRUISE_SPEED, new Cesium.Cartesian3())

    return {
      position,
      orientation,
      velocity,
      angularVelocity: { x: 0, y: 0, z: 0 },
      throttle: 0.5,
      speed: PHYSICS.CRUISE_SPEED
    }
  }
}
