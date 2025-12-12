import * as Cesium from 'cesium'
import { PHYSICS } from '@/utils/constants'
import type { AircraftState, InputState, Vector3 } from '@/types/game'

/**
 * 6DOF Flight Model with proper ECEF/ENU coordinate handling
 *
 * Coordinate Frame Conventions:
 * - ECEF: Earth-Centered, Earth-Fixed (Cesium.Cartesian3) - for storage/rendering
 * - ENU: East-North-Up local tangent frame at aircraft position - for physics
 * - Body: Aircraft body frame (X=right, Y=forward, Z=up) - for controls
 *
 * The orientation quaternion represents rotation from ENU frame to body frame
 */
export class FlightModel {
  /**
   * Update aircraft state based on physics and input
   * All physics calculations done in ENU frame, then converted to ECEF for storage
   */
  static update(state: AircraftState, input: InputState, dt: number): AircraftState {
    // Clone state to avoid mutation
    const newState = { ...state }

    // Get ENU transformation matrices for current position
    const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(state.position)
    const enuToEcef = Cesium.Matrix4.getMatrix3(enuTransform, new Cesium.Matrix3())
    const ecefToEnu = Cesium.Matrix3.inverse(enuToEcef, new Cesium.Matrix3())

    // 1. Update throttle based on input
    newState.throttle = this.updateThrottle(state.throttle, input, dt)

    // 2. Convert velocity from ECEF to ENU for physics calculations
    const velocityENU = Cesium.Matrix3.multiplyByVector(
      ecefToEnu,
      state.velocity,
      new Cesium.Cartesian3()
    )
    newState.speed = Cesium.Cartesian3.magnitude(velocityENU)

    // 3. Update angular velocity based on control inputs (in body frame)
    newState.angularVelocity = this.updateAngularVelocity(
      state.angularVelocity,
      input,
      newState.speed,
      dt
    )

    // 4. Update orientation quaternion (ENU to body frame rotation)
    newState.orientation = this.updateOrientation(
      state.orientation,
      newState.angularVelocity,
      dt
    )

    // 5. Calculate acceleration in ENU frame
    const accelerationENU = this.calculateAcceleration(newState, velocityENU)

    // 6. Update velocity in ENU frame
    const newVelocityENU = Cesium.Cartesian3.add(
      velocityENU,
      Cesium.Cartesian3.multiplyByScalar(accelerationENU, dt, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    )

    // 7. Clamp speed
    const newSpeed = Cesium.Cartesian3.magnitude(newVelocityENU)
    if (newSpeed > PHYSICS.MAX_SPEED) {
      Cesium.Cartesian3.normalize(newVelocityENU, newVelocityENU)
      Cesium.Cartesian3.multiplyByScalar(newVelocityENU, PHYSICS.MAX_SPEED, newVelocityENU)
    }

    // 8. Convert velocity back to ECEF for storage
    newState.velocity = Cesium.Matrix3.multiplyByVector(
      enuToEcef,
      newVelocityENU,
      new Cesium.Cartesian3()
    )
    newState.speed = Cesium.Cartesian3.magnitude(newState.velocity)

    // 9. Update position in ECEF
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
   * Angular velocity is in body frame: x=pitch rate, y=roll rate, z=yaw rate
   * At low speeds, controls become less effective (stall behavior)
   */
  private static updateAngularVelocity(
    angularVelocity: Vector3,
    input: InputState,
    speed: number,
    dt: number
  ): Vector3 {
    // Control effectiveness based on speed (0 at stall, 1 at cruise+)
    const effectiveness = Math.min(1, Math.max(0,
      (speed - PHYSICS.MIN_SPEED) / (PHYSICS.CRUISE_SPEED - PHYSICS.MIN_SPEED)
    ))

    // Apply damping
    const newAngularVelocity: Vector3 = {
      x: angularVelocity.x * PHYSICS.ANGULAR_DAMPING,
      y: angularVelocity.y * PHYSICS.ANGULAR_DAMPING,
      z: angularVelocity.z * PHYSICS.ANGULAR_DAMPING
    }

    // Apply control inputs with effectiveness scaling
    // Body frame axes: X=right wing (pitch), Y=nose (roll), Z=up through canopy (yaw)

    // Pitch: rotation around X axis (right wing)
    // Positive input (W key) = nose up = positive rotation around X
    newAngularVelocity.x += input.pitch * PHYSICS.PITCH_SENSITIVITY * effectiveness * dt

    // Roll: rotation around Y axis (nose/forward)
    // Positive input (D key) = roll right = positive rotation around Y
    newAngularVelocity.y += input.roll * PHYSICS.ROLL_SENSITIVITY * effectiveness * dt

    // Yaw: rotation around Z axis (up through canopy)
    // Positive mouse X = yaw right = negative rotation around Z (right-hand rule)
    newAngularVelocity.z -= input.yaw * PHYSICS.YAW_SENSITIVITY * effectiveness * dt

    // Clamp angular velocities
    newAngularVelocity.x = Math.max(-PHYSICS.MAX_PITCH_RATE, Math.min(PHYSICS.MAX_PITCH_RATE, newAngularVelocity.x))
    newAngularVelocity.y = Math.max(-PHYSICS.MAX_ROLL_RATE, Math.min(PHYSICS.MAX_ROLL_RATE, newAngularVelocity.y))
    newAngularVelocity.z = Math.max(-PHYSICS.MAX_YAW_RATE, Math.min(PHYSICS.MAX_YAW_RATE, newAngularVelocity.z))

    return newAngularVelocity
  }

  /**
   * Update orientation quaternion based on angular velocity
   * Uses quaternion integration for proper rotation composition
   */
  private static updateOrientation(
    orientation: Cesium.Quaternion,
    angularVelocity: Vector3,
    dt: number
  ): Cesium.Quaternion {
    const angle = Math.sqrt(
      angularVelocity.x * angularVelocity.x +
      angularVelocity.y * angularVelocity.y +
      angularVelocity.z * angularVelocity.z
    ) * dt

    if (angle < 0.0001) {
      return Cesium.Quaternion.clone(orientation)
    }

    // Rotation axis in body frame (normalized angular velocity)
    const axis = new Cesium.Cartesian3(
      angularVelocity.x / (angle / dt),
      angularVelocity.y / (angle / dt),
      angularVelocity.z / (angle / dt)
    )

    const deltaRotation = Cesium.Quaternion.fromAxisAngle(axis, angle)

    // For body-frame angular velocity: new = old * delta
    // This applies the rotation in the body's local frame
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
   * Calculate acceleration in ENU frame
   */
  private static calculateAcceleration(
    state: AircraftState,
    velocityENU: Cesium.Cartesian3
  ): Cesium.Cartesian3 {
    const speed = Cesium.Cartesian3.magnitude(velocityENU)
    const dynamicPressure = 0.5 * PHYSICS.AIR_DENSITY * speed * speed

    // Get body axes in ENU frame by applying orientation quaternion
    const bodyToENU = Cesium.Matrix3.fromQuaternion(state.orientation)

    // Body frame: X=right, Y=forward, Z=up
    const forwardBody = new Cesium.Cartesian3(0, 1, 0)
    const upBody = new Cesium.Cartesian3(0, 0, 1)

    const forwardENU = Cesium.Matrix3.multiplyByVector(bodyToENU, forwardBody, new Cesium.Cartesian3())
    const upENU = Cesium.Matrix3.multiplyByVector(bodyToENU, upBody, new Cesium.Cartesian3())

    Cesium.Cartesian3.normalize(forwardENU, forwardENU)
    Cesium.Cartesian3.normalize(upENU, upENU)

    const acceleration = new Cesium.Cartesian3(0, 0, 0)

    // === THRUST ===
    // Thrust acts along aircraft forward axis
    const thrust = PHYSICS.IDLE_THRUST + (PHYSICS.MAX_THRUST - PHYSICS.IDLE_THRUST) * state.throttle
    const thrustAccel = Cesium.Cartesian3.multiplyByScalar(
      forwardENU,
      thrust / PHYSICS.MASS,
      new Cesium.Cartesian3()
    )
    Cesium.Cartesian3.add(acceleration, thrustAccel, acceleration)

    // === LIFT ===
    // Lift acts along aircraft up axis (perpendicular to wings)
    // Simplified model: lift magnitude based on dynamic pressure
    const liftMagnitude = dynamicPressure * PHYSICS.WING_AREA * PHYSICS.LIFT_COEFFICIENT
    const liftAccel = Cesium.Cartesian3.multiplyByScalar(
      upENU,
      liftMagnitude / PHYSICS.MASS,
      new Cesium.Cartesian3()
    )
    Cesium.Cartesian3.add(acceleration, liftAccel, acceleration)

    // === DRAG ===
    // Drag opposes velocity direction
    if (speed > 0.1) {
      const dragMagnitude = dynamicPressure * PHYSICS.WING_AREA * PHYSICS.DRAG_COEFFICIENT
      const velocityDir = Cesium.Cartesian3.normalize(velocityENU, new Cesium.Cartesian3())
      const dragAccel = Cesium.Cartesian3.multiplyByScalar(
        velocityDir,
        -dragMagnitude / PHYSICS.MASS,
        new Cesium.Cartesian3()
      )
      Cesium.Cartesian3.add(acceleration, dragAccel, acceleration)
    }

    // === GRAVITY ===
    // In ENU frame, gravity is always (0, 0, -g) pointing toward Earth center
    // This is the key fix - gravity direction is now correct regardless of position on Earth
    acceleration.z -= PHYSICS.GRAVITY

    return acceleration
  }

  /**
   * Update position based on velocity (in ECEF)
   */
  private static updatePosition(
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

  /**
   * Get forward direction in ECEF coordinates
   * Requires position to compute ENU frame transformation
   */
  static getForwardDirection(
    position: Cesium.Cartesian3,
    orientation: Cesium.Quaternion
  ): Cesium.Cartesian3 {
    // Get ENU to ECEF transformation at position
    const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(position)
    const enuToEcef = Cesium.Matrix4.getMatrix3(enuTransform, new Cesium.Matrix3())

    // Forward in body frame is +Y
    const forwardBody = new Cesium.Cartesian3(0, 1, 0)

    // Transform body -> ENU
    const bodyToENU = Cesium.Matrix3.fromQuaternion(orientation)
    const forwardENU = Cesium.Matrix3.multiplyByVector(bodyToENU, forwardBody, new Cesium.Cartesian3())

    // Transform ENU -> ECEF
    const forwardECEF = Cesium.Matrix3.multiplyByVector(enuToEcef, forwardENU, new Cesium.Cartesian3())
    Cesium.Cartesian3.normalize(forwardECEF, forwardECEF)

    return forwardECEF
  }

  /**
   * Get up direction in ECEF coordinates
   * Requires position to compute ENU frame transformation
   */
  static getUpDirection(
    position: Cesium.Cartesian3,
    orientation: Cesium.Quaternion
  ): Cesium.Cartesian3 {
    // Get ENU to ECEF transformation at position
    const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(position)
    const enuToEcef = Cesium.Matrix4.getMatrix3(enuTransform, new Cesium.Matrix3())

    // Up in body frame is +Z
    const upBody = new Cesium.Cartesian3(0, 0, 1)

    // Transform body -> ENU
    const bodyToENU = Cesium.Matrix3.fromQuaternion(orientation)
    const upENU = Cesium.Matrix3.multiplyByVector(bodyToENU, upBody, new Cesium.Cartesian3())

    // Transform ENU -> ECEF
    const upECEF = Cesium.Matrix3.multiplyByVector(enuToEcef, upENU, new Cesium.Cartesian3())
    Cesium.Cartesian3.normalize(upECEF, upECEF)

    return upECEF
  }

  /**
   * Get right direction in ECEF coordinates
   * Requires position to compute ENU frame transformation
   */
  static getRightDirection(
    position: Cesium.Cartesian3,
    orientation: Cesium.Quaternion
  ): Cesium.Cartesian3 {
    // Get ENU to ECEF transformation at position
    const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(position)
    const enuToEcef = Cesium.Matrix4.getMatrix3(enuTransform, new Cesium.Matrix3())

    // Right in body frame is +X
    const rightBody = new Cesium.Cartesian3(1, 0, 0)

    // Transform body -> ENU
    const bodyToENU = Cesium.Matrix3.fromQuaternion(orientation)
    const rightENU = Cesium.Matrix3.multiplyByVector(bodyToENU, rightBody, new Cesium.Cartesian3())

    // Transform ENU -> ECEF
    const rightECEF = Cesium.Matrix3.multiplyByVector(enuToEcef, rightENU, new Cesium.Cartesian3())
    Cesium.Cartesian3.normalize(rightECEF, rightECEF)

    return rightECEF
  }

  /**
   * Create initial aircraft state at a spawn point
   * Orientation is relative to ENU frame at the spawn position
   */
  static createInitialState(
    longitude: number,
    latitude: number,
    altitude: number,
    heading: number
  ): AircraftState {
    const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude)

    // Create orientation from heading in ENU frame
    // Heading: 0 = North, 90 = East, 180 = South, 270 = West
    // In ENU frame: E=X, N=Y, U=Z
    // Body frame: X=right, Y=forward, Z=up
    //
    // At heading 0 (North), aircraft forward (+Y body) should point North (+Y ENU)
    // This requires no rotation around Z axis
    // At heading 90 (East), aircraft forward should point East (+X ENU)
    // This requires -90 degree rotation around Z axis
    const headingRad = Cesium.Math.toRadians(heading)

    // Rotation around ENU Z axis (up) to align forward with heading
    // Negative because we rotate the body frame, not the direction
    const orientation = Cesium.Quaternion.fromAxisAngle(
      Cesium.Cartesian3.UNIT_Z,
      -headingRad
    )

    // Calculate initial velocity in ENU frame
    // Forward direction in ENU based on heading
    const forwardENU = new Cesium.Cartesian3(
      Math.sin(headingRad),  // East component
      Math.cos(headingRad),  // North component
      0                       // Up component (level flight)
    )

    const velocityENU = Cesium.Cartesian3.multiplyByScalar(
      forwardENU,
      PHYSICS.CRUISE_SPEED,
      new Cesium.Cartesian3()
    )

    // Transform velocity from ENU to ECEF
    const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(position)
    const enuToEcef = Cesium.Matrix4.getMatrix3(enuTransform, new Cesium.Matrix3())

    const velocity = Cesium.Matrix3.multiplyByVector(
      enuToEcef,
      velocityENU,
      new Cesium.Cartesian3()
    )

    return {
      position,
      orientation,
      velocity,
      angularVelocity: { x: 0, y: 0, z: 0 },
      throttle: 0.5,
      speed: PHYSICS.CRUISE_SPEED
    }
  }

  /**
   * Convert ECEF orientation to Cesium's HeadingPitchRoll for rendering
   * This is needed because Cesium models expect HPR orientation
   */
  static orientationToHPR(
    position: Cesium.Cartesian3,
    orientation: Cesium.Quaternion
  ): Cesium.HeadingPitchRoll {
    // Get the full transformation from body to ECEF
    const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(position)
    const enuToEcef = Cesium.Matrix4.getMatrix3(enuTransform, new Cesium.Matrix3())
    const bodyToENU = Cesium.Matrix3.fromQuaternion(orientation)

    // Combine: body -> ENU -> ECEF
    const bodyToEcef = Cesium.Matrix3.multiply(enuToEcef, bodyToENU, new Cesium.Matrix3())

    // Extract forward and up directions in ECEF
    const forward = Cesium.Matrix3.multiplyByVector(bodyToEcef, new Cesium.Cartesian3(0, 1, 0), new Cesium.Cartesian3())
    const up = Cesium.Matrix3.multiplyByVector(bodyToEcef, new Cesium.Cartesian3(0, 0, 1), new Cesium.Cartesian3())

    // Convert to HPR using Cesium's built-in function
    // This creates a quaternion that Cesium understands for model orientation
    const hpr = new Cesium.HeadingPitchRoll()

    // Get the local transform at position
    const localTransform = Cesium.Transforms.eastNorthUpToFixedFrame(position)
    const inverseLocal = Cesium.Matrix4.inverse(localTransform, new Cesium.Matrix4())

    // Transform forward to local frame
    const forwardLocal = Cesium.Matrix4.multiplyByPointAsVector(inverseLocal, forward, new Cesium.Cartesian3())
    Cesium.Cartesian3.normalize(forwardLocal, forwardLocal)

    // Calculate heading from forward direction in local frame
    // In ENU: East=X, North=Y
    hpr.heading = Math.atan2(forwardLocal.x, forwardLocal.y)

    // Calculate pitch from forward direction
    const horizontalMag = Math.sqrt(forwardLocal.x * forwardLocal.x + forwardLocal.y * forwardLocal.y)
    hpr.pitch = Math.atan2(forwardLocal.z, horizontalMag)

    // Calculate roll from up direction
    const upLocal = Cesium.Matrix4.multiplyByPointAsVector(inverseLocal, up, new Cesium.Cartesian3())
    Cesium.Cartesian3.normalize(upLocal, upLocal)

    // Project up onto the plane perpendicular to forward
    const rightExpected = new Cesium.Cartesian3(-Math.cos(hpr.heading), Math.sin(hpr.heading), 0)
    const upExpected = Cesium.Cartesian3.cross(forwardLocal, rightExpected, new Cesium.Cartesian3())

    // Roll is the angle between actual up and expected up
    const rightActual = Cesium.Cartesian3.cross(forwardLocal, upLocal, new Cesium.Cartesian3())
    hpr.roll = Math.atan2(
      Cesium.Cartesian3.dot(rightActual, rightExpected),
      Cesium.Cartesian3.dot(upLocal, upExpected)
    )

    return hpr
  }

  /**
   * Get the full orientation quaternion for Cesium rendering
   * Combines ENU-relative orientation with position-based ENU frame
   */
  static getECEFOrientation(
    position: Cesium.Cartesian3,
    orientation: Cesium.Quaternion
  ): Cesium.Quaternion {
    // Get the ENU frame quaternion at position
    const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(position)
    const enuQuaternion = Cesium.Quaternion.fromRotationMatrix(
      Cesium.Matrix4.getMatrix3(enuTransform, new Cesium.Matrix3())
    )

    // Combine: ECEF orientation = ENU frame * body orientation
    return Cesium.Quaternion.multiply(enuQuaternion, orientation, new Cesium.Quaternion())
  }
}
