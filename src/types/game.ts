import * as Cesium from 'cesium'

// Player types
export interface Player {
  id: string
  username: string
  position: Cesium.Cartesian3
  orientation: Cesium.Quaternion
  velocity: Cesium.Cartesian3
  health: number
  isAlive: boolean
  kills: number
  deaths: number
  lastUpdate: number
}

// Aircraft state for physics
export interface AircraftState {
  position: Cesium.Cartesian3
  orientation: Cesium.Quaternion
  velocity: Cesium.Cartesian3
  angularVelocity: Vector3
  throttle: number
  speed: number
}

// Simple 3D vector (for local calculations)
export interface Vector3 {
  x: number
  y: number
  z: number
}

// Input state
export interface InputState {
  pitch: number      // -1 to 1 (W/S)
  roll: number       // -1 to 1 (A/D)
  yaw: number        // -1 to 1 (mouse X)
  throttleUp: boolean
  throttleDown: boolean
  fireMissile: boolean
  fireGun: boolean
}

// Weapon types
export interface Missile {
  id: string
  ownerId: string
  position: Cesium.Cartesian3
  velocity: Cesium.Cartesian3
  targetId: string | null
  createdAt: number
}

export interface Bullet {
  id: string
  ownerId: string
  position: Cesium.Cartesian3
  velocity: Cesium.Cartesian3
  createdAt: number
}

// Collision events
export interface CollisionEvent {
  type: 'missile_hit' | 'bullet_hit' | 'terrain'
  attackerId?: string
  victimId: string
  damage: number
  position: Cesium.Cartesian3
}

// Game state
export interface GameState {
  players: Map<string, Player>
  missiles: Missile[]
  bullets: Bullet[]
  localPlayerId: string
}

// Spawn point
export interface SpawnPoint {
  position: Cesium.Cartesian3
  heading: number
}
