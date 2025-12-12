import { describe, it, expect } from 'vitest'
import * as Cesium from 'cesium'
import { FlightModel } from './FlightModel'
import { PHYSICS } from '@/utils/constants'
import type { InputState } from '@/types/game'

// Helper to create a neutral input state
function neutralInput(): InputState {
  return {
    pitch: 0,
    roll: 0,
    yaw: 0,
    throttleUp: false,
    throttleDown: false,
    fireMissile: false,
    fireGun: false
  }
}

describe('FlightModel', () => {
  describe('createInitialState', () => {
    it('should create a valid initial state', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 90)

      expect(state.position).toBeDefined()
      expect(state.orientation).toBeDefined()
      expect(state.velocity).toBeDefined()
      expect(state.angularVelocity).toBeDefined()
      expect(state.throttle).toBe(0.5)
      expect(state.speed).toBeGreaterThan(0)
    })

    it('should position aircraft at correct coordinates', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)

      const cartographic = Cesium.Cartographic.fromCartesian(state.position)
      const lon = Cesium.Math.toDegrees(cartographic.longitude)
      const lat = Cesium.Math.toDegrees(cartographic.latitude)
      const alt = cartographic.height

      expect(lon).toBeCloseTo(-110.0, 2)
      expect(lat).toBeCloseTo(37.0, 2)
      expect(alt).toBeCloseTo(3000, 0)
    })

    it('should set initial velocity at cruise speed', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)

      expect(state.speed).toBeCloseTo(PHYSICS.CRUISE_SPEED, 0)
    })
  })

  describe('update', () => {
    it('should update position based on velocity', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      const initialPosition = Cesium.Cartesian3.clone(state.position)

      const newState = FlightModel.update(state, neutralInput(), 0.1)

      expect(newState.position).not.toEqual(initialPosition)
    })

    it('should respond to pitch input (W = nose up)', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)

      const input = neutralInput()
      input.pitch = 1 // W key pressed

      const newState = FlightModel.update(state, input, 0.1)

      // Positive pitch input should create positive angular velocity on X axis
      expect(newState.angularVelocity.x).toBeGreaterThan(state.angularVelocity.x)
    })

    it('should respond to roll input (D = roll right)', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)

      const input = neutralInput()
      input.roll = 1 // D key pressed

      const newState = FlightModel.update(state, input, 0.1)

      // Positive roll input should create positive angular velocity on Y axis
      expect(newState.angularVelocity.y).toBeGreaterThan(state.angularVelocity.y)
    })

    it('should respond to yaw input', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)

      const input = neutralInput()
      input.yaw = 1 // Mouse moved right

      const newState = FlightModel.update(state, input, 0.1)

      // Positive yaw input should create negative angular velocity on Z axis (right-hand rule)
      expect(newState.angularVelocity.z).toBeLessThan(state.angularVelocity.z)
    })

    it('should increase throttle when throttleUp is true', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      state.throttle = 0.5

      const input = neutralInput()
      input.throttleUp = true

      const newState = FlightModel.update(state, input, 0.1)

      expect(newState.throttle).toBeGreaterThan(0.5)
    })

    it('should decrease throttle when throttleDown is true', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      state.throttle = 0.5

      const input = neutralInput()
      input.throttleDown = true

      const newState = FlightModel.update(state, input, 0.1)

      expect(newState.throttle).toBeLessThan(0.5)
    })

    it('should clamp throttle between 0 and 1', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      state.throttle = 0.99

      const input = neutralInput()
      input.throttleUp = true

      // Update multiple times to try to exceed 1
      let newState = state
      for (let i = 0; i < 10; i++) {
        newState = FlightModel.update(newState, input, 0.1)
      }

      expect(newState.throttle).toBeLessThanOrEqual(1)
      expect(newState.throttle).toBeGreaterThanOrEqual(0)
    })

    it('should clamp speed to MAX_SPEED', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      state.throttle = 1.0

      // Update many times with full throttle
      let newState = state
      for (let i = 0; i < 100; i++) {
        newState = FlightModel.update(newState, neutralInput(), 0.1)
      }

      expect(newState.speed).toBeLessThanOrEqual(PHYSICS.MAX_SPEED)
    })
  })

  describe('Gravity - ENU frame correctness', () => {
    it('should apply gravity toward Earth center (downward in ENU)', () => {
      // Create aircraft at Utah position
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)

      // Zero out velocity to isolate gravity effect
      state.velocity = new Cesium.Cartesian3(0, 0, 0)
      state.throttle = 0 // Minimize thrust

      // Update physics
      const newState = FlightModel.update(state, neutralInput(), 0.1)

      // Aircraft should have gained downward (toward Earth center) velocity
      // In ECEF, this means velocity should be roughly opposite to position direction
      const positionDir = Cesium.Cartesian3.normalize(state.position, new Cesium.Cartesian3())
      const velocityDir = Cesium.Cartesian3.normalize(newState.velocity, new Cesium.Cartesian3())

      // Dot product should be negative (velocity pointing toward center)
      const dot = Cesium.Cartesian3.dot(positionDir, velocityDir)
      expect(dot).toBeLessThan(0)
    })

    it('should have same gravity behavior at different Earth positions', () => {
      // Test at Utah
      const stateUtah = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      stateUtah.velocity = new Cesium.Cartesian3(0, 0, 0)
      stateUtah.throttle = 0

      // Test at equator
      const stateEquator = FlightModel.createInitialState(0, 0, 3000, 0)
      stateEquator.velocity = new Cesium.Cartesian3(0, 0, 0)
      stateEquator.throttle = 0

      const newUtah = FlightModel.update(stateUtah, neutralInput(), 0.1)
      const newEquator = FlightModel.update(stateEquator, neutralInput(), 0.1)

      // Both should gain similar downward speed (gravity is same everywhere)
      const speedUtah = Cesium.Cartesian3.magnitude(newUtah.velocity)
      const speedEquator = Cesium.Cartesian3.magnitude(newEquator.velocity)

      // Should be within 10% of each other (accounting for lift differences)
      expect(Math.abs(speedUtah - speedEquator) / speedUtah).toBeLessThan(0.1)
    })
  })

  describe('getForwardDirection', () => {
    it('should return a unit vector', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      const forward = FlightModel.getForwardDirection(state.position, state.orientation)

      const magnitude = Cesium.Cartesian3.magnitude(forward)
      expect(magnitude).toBeCloseTo(1, 5)
    })

    it('should align with initial velocity direction', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 90) // Heading East

      const forward = FlightModel.getForwardDirection(state.position, state.orientation)
      const velocityDir = Cesium.Cartesian3.normalize(state.velocity, new Cesium.Cartesian3())

      // Forward should align with velocity
      const dot = Cesium.Cartesian3.dot(forward, velocityDir)
      expect(dot).toBeGreaterThan(0.99)
    })
  })

  describe('getUpDirection', () => {
    it('should return a unit vector', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      const up = FlightModel.getUpDirection(state.position, state.orientation)

      const magnitude = Cesium.Cartesian3.magnitude(up)
      expect(magnitude).toBeCloseTo(1, 5)
    })

    it('should be perpendicular to forward', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 45)
      const forward = FlightModel.getForwardDirection(state.position, state.orientation)
      const up = FlightModel.getUpDirection(state.position, state.orientation)

      const dot = Cesium.Cartesian3.dot(forward, up)
      expect(Math.abs(dot)).toBeLessThan(0.01)
    })

    it('should point roughly away from Earth center for level flight', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      const up = FlightModel.getUpDirection(state.position, state.orientation)

      // Position direction (away from Earth center)
      const positionDir = Cesium.Cartesian3.normalize(state.position, new Cesium.Cartesian3())

      // Up should point roughly same direction as position (away from Earth)
      const dot = Cesium.Cartesian3.dot(up, positionDir)
      expect(dot).toBeGreaterThan(0.9)
    })
  })

  describe('getRightDirection', () => {
    it('should return a unit vector', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      const right = FlightModel.getRightDirection(state.position, state.orientation)

      const magnitude = Cesium.Cartesian3.magnitude(right)
      expect(magnitude).toBeCloseTo(1, 5)
    })

    it('should be perpendicular to forward and up', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 45)
      const forward = FlightModel.getForwardDirection(state.position, state.orientation)
      const up = FlightModel.getUpDirection(state.position, state.orientation)
      const right = FlightModel.getRightDirection(state.position, state.orientation)

      const dotForward = Cesium.Cartesian3.dot(right, forward)
      const dotUp = Cesium.Cartesian3.dot(right, up)

      expect(Math.abs(dotForward)).toBeLessThan(0.01)
      expect(Math.abs(dotUp)).toBeLessThan(0.01)
    })
  })

  describe('getECEFOrientation', () => {
    it('should return a valid quaternion', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      const ecefOrientation = FlightModel.getECEFOrientation(state.position, state.orientation)

      // Quaternion should be normalized (magnitude = 1)
      const magnitude = Cesium.Quaternion.magnitude(ecefOrientation)
      expect(magnitude).toBeCloseTo(1, 5)
    })
  })

  describe('Control Effectiveness', () => {
    it('should have reduced control effectiveness at low speed', () => {
      // Create state at stall speed
      const stateSlow = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      stateSlow.speed = PHYSICS.MIN_SPEED - 10 // Below stall
      Cesium.Cartesian3.multiplyByScalar(
        Cesium.Cartesian3.normalize(stateSlow.velocity, new Cesium.Cartesian3()),
        stateSlow.speed,
        stateSlow.velocity
      )

      // Create state at cruise speed
      const stateFast = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)

      const input = neutralInput()
      input.pitch = 1

      const newSlow = FlightModel.update(stateSlow, input, 0.1)
      const newFast = FlightModel.update(stateFast, input, 0.1)

      // Fast aircraft should have more pitch rate change
      expect(Math.abs(newFast.angularVelocity.x)).toBeGreaterThan(Math.abs(newSlow.angularVelocity.x))
    })
  })
})
