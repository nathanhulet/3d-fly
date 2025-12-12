import * as Cesium from 'cesium'

// Arena configuration - Utah Desert (Monument Valley area)
export const ARENA = {
  CENTER_LON: -110.0,
  CENTER_LAT: 37.0,
  CENTER_ALT: 2000,  // meters above sea level
  RADIUS: 50000,     // 50km radius
  get CENTER() {
    return Cesium.Cartesian3.fromDegrees(this.CENTER_LON, this.CENTER_LAT, this.CENTER_ALT)
  }
}

// Physics constants (simplified F-16)
export const PHYSICS = {
  MASS: 12000,              // kg (loaded F-16)
  MAX_THRUST: 130000,       // Newtons (with afterburner)
  IDLE_THRUST: 20000,       // Newtons (idle)
  WING_AREA: 28,            // m^2
  LIFT_COEFFICIENT: 1.2,
  DRAG_COEFFICIENT: 0.025,
  AIR_DENSITY: 1.225,       // kg/m^3 at sea level
  GRAVITY: 9.81,            // m/s^2

  // Speed limits
  MIN_SPEED: 80,            // m/s (stall speed)
  MAX_SPEED: 600,           // m/s (~Mach 2)
  CRUISE_SPEED: 250,        // m/s

  // Control rates
  MAX_PITCH_RATE: 2.0,      // rad/s
  MAX_YAW_RATE: 1.0,        // rad/s
  MAX_ROLL_RATE: 4.0,       // rad/s

  // Control sensitivity
  PITCH_SENSITIVITY: 3.0,
  ROLL_SENSITIVITY: 5.0,
  YAW_SENSITIVITY: 1.5,

  // Damping (angular velocity decay)
  ANGULAR_DAMPING: 0.95,

  // Altitude limits
  MIN_ALTITUDE: 100,        // meters (terrain buffer)
  MAX_ALTITUDE: 15000,      // meters (service ceiling)

  // Throttle rate
  THROTTLE_RATE: 0.5        // per second
}

// Weapon constants
export const WEAPONS = {
  MISSILE: {
    COUNT: 6,
    SPEED: 400,             // m/s
    TURN_RATE: 3.0,         // rad/s
    DAMAGE: 100,            // instant kill
    LOCK_RANGE: 2000,       // meters
    LOCK_ANGLE: 30,         // degrees
    LIFETIME: 10000,        // ms
    COOLDOWN: 2000,         // ms between launches
    PROXIMITY_FUSE: 15      // meters - explode within this distance
  },
  GUN: {
    SPEED: 1000,            // m/s
    DAMAGE: 10,             // 10 hits to kill
    FIRE_RATE: 10,          // rounds per second
    SPREAD: 0.02,           // radians
    RANGE: 1500,            // meters (bullet lifetime)
    COOLDOWN: 100           // ms between shots
  }
}

// Collision radii
export const COLLISION = {
  AIRCRAFT: 10,             // meters
  MISSILE: 2,
  BULLET: 0.5
}

// Game settings
export const GAME = {
  MAX_PLAYERS: 10,
  RESPAWN_TIME: 5000,       // ms
  TICK_RATE_NEAR: 10,       // Hz for nearby players
  TICK_RATE_FAR: 5,         // Hz for distant players
  NEAR_THRESHOLD: 500,      // meters
  NETWORK_TICK_RATE: 10,    // Hz for position updates
  PHYSICS_TICK_RATE: 60     // Hz for physics updates
}

// Camera settings
export const CAMERA = {
  FOLLOW_DISTANCE: 50,      // meters behind aircraft
  FOLLOW_HEIGHT: 15,        // meters above aircraft
  SMOOTHING: 0.1,           // lower = smoother
  FOV: 60                   // degrees
}

// Spawn points around Utah arena
export const SPAWN_POINTS = [
  { lon: -110.0, lat: 37.1, alt: 3000, heading: 180 },   // North
  { lon: -110.0, lat: 36.9, alt: 3000, heading: 0 },     // South
  { lon: -109.9, lat: 37.0, alt: 3000, heading: 270 },   // East
  { lon: -110.1, lat: 37.0, alt: 3000, heading: 90 },    // West
  { lon: -109.95, lat: 37.05, alt: 3000, heading: 225 }, // NE
  { lon: -110.05, lat: 37.05, alt: 3000, heading: 135 }, // NW
  { lon: -109.95, lat: 36.95, alt: 3000, heading: 315 }, // SE
  { lon: -110.05, lat: 36.95, alt: 3000, heading: 45 }   // SW
]
