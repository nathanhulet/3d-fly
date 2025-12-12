import { ref, reactive, onMounted, onUnmounted } from 'vue'
import type { InputState } from '@/types/game'

export function useInput() {
  // Key states
  const keys = reactive({
    w: false,
    a: false,
    s: false,
    d: false,
    shift: false,
    ctrl: false,
    space: false
  })

  // Mouse state
  const mouse = reactive({
    x: 0,
    y: 0,
    leftButton: false
  })

  const isPointerLocked = ref(false)
  const mouseSensitivity = ref(0.002)

  // Accumulated mouse movement (reset each frame)
  let accumulatedMouseX = 0
  let accumulatedMouseY = 0

  function onKeyDown(e: KeyboardEvent) {
    // Prevent default for game keys
    if (['w', 'a', 's', 'd', ' ', 'Shift', 'Control'].includes(e.key)) {
      e.preventDefault()
    }

    const key = e.key.toLowerCase()
    if (key === 'w') keys.w = true
    if (key === 'a') keys.a = true
    if (key === 's') keys.s = true
    if (key === 'd') keys.d = true
    if (e.key === 'Shift') keys.shift = true
    if (e.key === 'Control') keys.ctrl = true
    if (e.key === ' ') keys.space = true
  }

  function onKeyUp(e: KeyboardEvent) {
    const key = e.key.toLowerCase()
    if (key === 'w') keys.w = false
    if (key === 'a') keys.a = false
    if (key === 's') keys.s = false
    if (key === 'd') keys.d = false
    if (e.key === 'Shift') keys.shift = false
    if (e.key === 'Control') keys.ctrl = false
    if (e.key === ' ') keys.space = false
  }

  function onMouseMove(e: MouseEvent) {
    if (isPointerLocked.value) {
      // Accumulate mouse movement
      accumulatedMouseX += e.movementX * mouseSensitivity.value
      accumulatedMouseY += e.movementY * mouseSensitivity.value
    }
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button === 0) {
      mouse.leftButton = true
    }
  }

  function onMouseUp(e: MouseEvent) {
    if (e.button === 0) {
      mouse.leftButton = false
    }
  }

  function onPointerLockChange() {
    isPointerLocked.value = document.pointerLockElement !== null
  }

  function requestPointerLock(element: HTMLElement) {
    element.requestPointerLock()
  }

  function exitPointerLock() {
    document.exitPointerLock()
  }

  /**
   * Get current input state and reset accumulated values
   */
  function getInputState(): InputState {
    const state: InputState = {
      pitch: (keys.w ? 1 : 0) - (keys.s ? 1 : 0),  // W = nose up, S = nose down
      roll: (keys.d ? 1 : 0) - (keys.a ? 1 : 0),   // D = roll right, A = roll left
      yaw: accumulatedMouseX,
      throttleUp: keys.shift,
      throttleDown: keys.ctrl,
      fireMissile: keys.space,
      fireGun: mouse.leftButton
    }

    // Reset accumulated mouse movement
    accumulatedMouseX = 0
    accumulatedMouseY = 0

    return state
  }

  /**
   * Check if missile fire was just pressed (for single-shot)
   */
  const missilePressed = ref(false)

  function checkMissileFire(): boolean {
    if (keys.space && !missilePressed.value) {
      missilePressed.value = true
      return true
    }
    if (!keys.space) {
      missilePressed.value = false
    }
    return false
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    document.addEventListener('pointerlockchange', onPointerLockChange)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mouseup', onMouseUp)
    document.removeEventListener('pointerlockchange', onPointerLockChange)
  })

  return {
    keys,
    mouse,
    isPointerLocked,
    mouseSensitivity,
    getInputState,
    checkMissileFire,
    requestPointerLock,
    exitPointerLock
  }
}
