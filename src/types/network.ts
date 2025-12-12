// Network message types for Supabase Realtime

export type MessageType = 'pos' | 'fire' | 'hit' | 'death' | 'spawn'

// Position update - most frequent message
export interface PositionMessage {
  t: 'pos'
  id: string
  ts: number  // timestamp
  p: [number, number, number]  // position (ECEF)
  q: [number, number, number, number]  // quaternion
  v: [number, number, number]  // velocity
}

// Weapon fire event
export interface FireMessage {
  t: 'fire'
  id: string
  w: 'm' | 'g'  // missile or gun
  ts: number
  p: [number, number, number]  // origin
  d: [number, number, number]  // direction
  target?: string  // target player ID for missiles
}

// Hit event
export interface HitMessage {
  t: 'hit'
  attacker: string
  victim: string
  damage: number
  weapon: 'm' | 'g'
}

// Death event
export interface DeathMessage {
  t: 'death'
  victim: string
  killer: string
  weapon: 'm' | 'g'
}

// Spawn event
export interface SpawnMessage {
  t: 'spawn'
  id: string
  p: [number, number, number]
  heading: number
}

export type NetworkMessage =
  | PositionMessage
  | FireMessage
  | HitMessage
  | DeathMessage
  | SpawnMessage

// Presence state (for join/leave)
export interface PlayerPresence {
  id: string
  username: string
  joinedAt: number
}
