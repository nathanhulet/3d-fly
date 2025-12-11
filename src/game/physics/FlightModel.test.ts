import { describe, it, expect } from 'vitest'
import * as Cesium from 'cesium'
import { FlightModel } from './FlightModel'
import type { InputState } from '@/types/game'

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
  })

  describe('update', () => {
    it('should update position based on velocity', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      const initialPosition = Cesium.Cartesian3.clone(state.position)

      const input: InputState = {
        pitch: 0,
        roll: 0,
        yaw: 0,
        throttleUp: false,
        throttleDown: false,
        fireMissile: false,
        fireGun: false
      }

      const newState = FlightModel.update(state, input, 0.1)

      expect(newState.position).not.toEqual(initialPosition)
    })

    it('should respond to pitch input', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)

      const input: InputState = {
        pitch: 1,
        roll: 0,
        yaw: 0,
        throttleUp: false,
        throttleDown: false,
        fireMissile: false,
        fireGun: false
      }

      const newState = FlightModel.update(state, input, 0.1)

      expect(newState.angularVelocity.x).toBeGreaterThan(state.angularVelocity.x)
    })

    it('should increase throttle when throttleUp is true', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      state.throttle = 0.5

      const input: InputState = {
        pitch: 0,
        roll: 0,
        yaw: 0,
        throttleUp: true,
        throttleDown: false,
        fireMissile: false,
        fireGun: false
      }

      const newState = FlightModel.update(state, input, 0.1)

      expect(newState.throttle).toBeGreaterThan(0.5)
    })

    it('should clamp throttle between 0 and 1', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      state.throttle = 0.99

      const input: InputState = {
        pitch: 0,
        roll: 0,
        yaw: 0,
        throttleUp: true,
        throttleDown: false,
        fireMissile: false,
        fireGun: false
      }

      // Update multiple times to try to exceed 1
      let newState = state
      for (let i = 0; i < 10; i++) {
        newState = FlightModel.update(newState, input, 0.1)
      }

      expect(newState.throttle).toBeLessThanOrEqual(1)
    })
  })

  describe('getForwardDirection', () => {
    it('should return a unit vector', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      const forward = FlightModel.getForwardDirection(state.orientation)

      const magnitude = Cesium.Cartesian3.magnitude(forward)
      expect(magnitude).toBeCloseTo(1, 5)
    })
  })

  describe('getUpDirection', () => {
    it('should return a unit vector', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      const up = FlightModel.getUpDirection(state.orientation)

      const magnitude = Cesium.Cartesian3.magnitude(up)
      expect(magnitude).toBeCloseTo(1, 5)
    })

    it('should be perpendicular to forward', () => {
      const state = FlightModel.createInitialState(-110.0, 37.0, 3000, 0)
      const forward = FlightModel.getForwardDirection(state.orientation)
      const up = FlightModel.getUpDirection(state.orientation)

      const dot = Cesium.Cartesian3.dot(forward, up)
      expect(dot).toBeCloseTo(0, 5)
    })
  })
})
