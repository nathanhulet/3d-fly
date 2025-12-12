import { ref, shallowRef, onUnmounted } from 'vue'
import * as Cesium from 'cesium'
import { ARENA, CAMERA } from '@/utils/constants'
import { FlightModel } from '@/game/physics/FlightModel'
import type { AircraftState } from '@/types/game'

/**
 * Model rotation correction applied to the body-frame orientation
 * This corrects for the model's initial facing direction vs our +Y forward convention
 * Adjust this value if the model faces the wrong direction
 */
const MODEL_ROTATION_DEGREES = -90

/**
 * Apply model rotation correction AND convert from ENU-relative to ECEF orientation
 * @param position Aircraft position (needed for ENU frame)
 * @param orientation ENU-relative orientation quaternion
 */
function getModelOrientation(position: Cesium.Cartesian3, orientation: Cesium.Quaternion): Cesium.Quaternion {
  // First apply model correction (rotate in body frame)
  const modelCorrection = Cesium.Quaternion.fromAxisAngle(
    Cesium.Cartesian3.UNIT_Z,
    Cesium.Math.toRadians(MODEL_ROTATION_DEGREES)
  )
  const correctedOrientation = Cesium.Quaternion.multiply(orientation, modelCorrection, new Cesium.Quaternion())

  // Then convert from ENU-relative to ECEF
  return FlightModel.getECEFOrientation(position, correctedOrientation)
}

export function useCesium() {
  const viewer = shallowRef<Cesium.Viewer | null>(null)
  const isInitialized = ref(false)
  const localAircraftEntity = shallowRef<Cesium.Entity | null>(null)
  const remoteAircraftEntities = shallowRef<Map<string, Cesium.Entity>>(new Map())

  /**
   * Initialize Cesium viewer
   */
  async function initViewer(container: HTMLElement) {
    // Set Cesium Ion access token
    const token = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN
    if (token) {
      Cesium.Ion.defaultAccessToken = token
    }

    // Create viewer with Utah terrain
    viewer.value = new Cesium.Viewer(container, {
      terrainProvider: await Cesium.CesiumTerrainProvider.fromIonAssetId(1),
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,
      selectionIndicator: false,
      shadows: false,
      shouldAnimate: true
    })

    // Disable default camera controls (we'll control it ourselves)
    const scene = viewer.value.scene
    scene.screenSpaceCameraController.enableRotate = false
    scene.screenSpaceCameraController.enableTranslate = false
    scene.screenSpaceCameraController.enableZoom = false
    scene.screenSpaceCameraController.enableTilt = false
    scene.screenSpaceCameraController.enableLook = false

    // Set initial camera to Utah
    viewer.value.camera.flyTo({
      destination: ARENA.CENTER,
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-30),
        roll: 0
      },
      duration: 0
    })

    isInitialized.value = true
    return viewer.value
  }

  /**
   * Create local player aircraft entity
   */
  async function createLocalAircraft(state: AircraftState): Promise<Cesium.Entity | null> {
    if (!viewer.value) return null

    const entity = viewer.value.entities.add({
      position: new Cesium.CallbackProperty(() => state.position, false) as any,
      orientation: new Cesium.CallbackProperty(() => getModelOrientation(state.position, state.orientation), false) as any,
      model: {
        uri: '/models/f16.glb',
        scale: 1.0,
        minimumPixelSize: 64,
        maximumScale: 200,
        runAnimations: false
      }
    })

    localAircraftEntity.value = entity
    return entity
  }

  /**
   * Create remote player aircraft entity
   */
  async function createRemoteAircraft(playerId: string, position: Cesium.Cartesian3, orientation: Cesium.Quaternion): Promise<Cesium.Entity | null> {
    if (!viewer.value) return null

    // For remote aircraft, we use ConstantPositionProperty so we can update it directly
    // (Dead-reckoning system handles the interpolation)
    const entity = viewer.value.entities.add({
      id: `aircraft-${playerId}`,
      position: new Cesium.ConstantPositionProperty(position),
      orientation: new Cesium.ConstantProperty(getModelOrientation(position, orientation)),
      model: {
        uri: '/models/f16.glb',
        scale: 1.0,
        minimumPixelSize: 32,
        maximumScale: 200,
        runAnimations: false
      },
      // Add label for player name
      label: {
        text: playerId.substring(0, 8),
        font: '12px sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -50),
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    })

    remoteAircraftEntities.value.set(playerId, entity)
    return entity
  }

  /**
   * Update remote aircraft position/orientation
   * Called by the dead-reckoning system with interpolated positions
   */
  function updateRemoteAircraft(playerId: string, position: Cesium.Cartesian3, orientation: Cesium.Quaternion) {
    const entity = remoteAircraftEntities.value.get(playerId)
    if (!entity || !viewer.value) return

    // Update position directly (dead-reckoning handles interpolation)
    entity.position = new Cesium.ConstantPositionProperty(position) as any

    // Update orientation (with model rotation correction and ENU->ECEF conversion)
    entity.orientation = new Cesium.ConstantProperty(getModelOrientation(position, orientation)) as any
  }

  /**
   * Remove remote aircraft
   */
  function removeRemoteAircraft(playerId: string) {
    const entity = remoteAircraftEntities.value.get(playerId)
    if (entity && viewer.value) {
      viewer.value.entities.remove(entity)
      remoteAircraftEntities.value.delete(playerId)
    }
  }

  /**
   * Update camera to follow aircraft (third-person)
   */
  function updateCamera(state: AircraftState) {
    if (!viewer.value) return

    const camera = viewer.value.camera

    // Get aircraft's local ENU coordinate frame
    const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(state.position)

    // Get the aircraft's forward direction in ENU frame
    // Our orientation is ENU-relative, and body +Y is forward
    const bodyToENU = Cesium.Matrix3.fromQuaternion(state.orientation)
    const forwardBody = new Cesium.Cartesian3(0, 1, 0)
    const forwardENU = Cesium.Matrix3.multiplyByVector(bodyToENU, forwardBody, new Cesium.Cartesian3())

    // Calculate heading from forward direction in ENU (E=X, N=Y)
    // Heading 0 = North (+Y), 90 = East (+X)
    const heading = Math.atan2(forwardENU.x, forwardENU.y)

    // Apply model rotation correction for camera positioning
    const correctedHeading = heading + Cesium.Math.toRadians(MODEL_ROTATION_DEGREES)

    // Calculate camera position behind and above aircraft
    const behindDistance = CAMERA.FOLLOW_DISTANCE
    const aboveDistance = CAMERA.FOLLOW_HEIGHT

    // Camera offset in local ENU coordinates (behind the aircraft)
    const offsetLocal = new Cesium.Cartesian3(
      -Math.sin(correctedHeading) * behindDistance,
      -Math.cos(correctedHeading) * behindDistance,
      aboveDistance
    )

    // Transform offset to ECEF coordinates
    const offsetWorld = Cesium.Matrix4.multiplyByPointAsVector(
      enuTransform,
      offsetLocal,
      new Cesium.Cartesian3()
    )

    const cameraPosition = Cesium.Cartesian3.add(
      state.position,
      offsetWorld,
      new Cesium.Cartesian3()
    )

    // Set camera position and look at aircraft
    camera.setView({
      destination: cameraPosition,
      orientation: {
        heading: correctedHeading,
        pitch: Cesium.Math.toRadians(-15),
        roll: 0
      }
    })
  }

  /**
   * Create missile entity using AIM-120D model
   */
  function createMissile(id: string, position: Cesium.Cartesian3, orientation: Cesium.Quaternion): Cesium.Entity | null {
    if (!viewer.value) return null

    // Apply missile model rotation correction and convert to ECEF
    const missileOrientation = getModelOrientation(position, orientation)

    return viewer.value.entities.add({
      id: `missile-${id}`,
      position: new Cesium.ConstantPositionProperty(position),
      orientation: new Cesium.ConstantProperty(missileOrientation),
      model: {
        uri: '/models/AIM120D.glb',
        scale: 1.0,
        minimumPixelSize: 16,
        maximumScale: 50,
        runAnimations: false
      }
    })
  }

  /**
   * Update missile position and orientation
   */
  function updateMissile(id: string, position: Cesium.Cartesian3, orientation: Cesium.Quaternion) {
    if (!viewer.value) return

    const entity = viewer.value.entities.getById(`missile-${id}`)
    if (entity) {
      entity.position = new Cesium.ConstantPositionProperty(position) as any
      // Convert ENU-relative orientation to ECEF for rendering
      const ecefOrientation = getModelOrientation(position, orientation)
      entity.orientation = new Cesium.ConstantProperty(ecefOrientation) as any
    }
  }

  /**
   * Remove missile entity
   */
  function removeMissile(id: string) {
    if (!viewer.value) return

    const entity = viewer.value.entities.getById(`missile-${id}`)
    if (entity) {
      viewer.value.entities.remove(entity)
    }
  }

  /**
   * Create explosion effect at position
   */
  function createExplosion(position: Cesium.Cartesian3) {
    if (!viewer.value) return

    const explosion = viewer.value.entities.add({
      position: position,
      ellipsoid: {
        radii: new Cesium.Cartesian3(20, 20, 20),
        material: Cesium.Color.ORANGE.withAlpha(0.8)
      }
    })

    // Remove after 500ms
    setTimeout(() => {
      if (viewer.value) {
        viewer.value.entities.remove(explosion)
      }
    }, 500)
  }

  /**
   * Get cartographic position (lon, lat, alt) from Cartesian
   */
  function getCartographic(position: Cesium.Cartesian3): { longitude: number; latitude: number; altitude: number } {
    const cartographic = Cesium.Cartographic.fromCartesian(position)
    return {
      longitude: Cesium.Math.toDegrees(cartographic.longitude),
      latitude: Cesium.Math.toDegrees(cartographic.latitude),
      altitude: cartographic.height
    }
  }

  /**
   * Check if position is within arena bounds
   */
  function isInArena(position: Cesium.Cartesian3): boolean {
    const distance = Cesium.Cartesian3.distance(position, ARENA.CENTER)
    return distance <= ARENA.RADIUS
  }

  /**
   * Cleanup
   */
  function destroy() {
    if (viewer.value) {
      viewer.value.destroy()
      viewer.value = null
    }
    isInitialized.value = false
    localAircraftEntity.value = null
    remoteAircraftEntities.value.clear()
  }

  onUnmounted(() => {
    destroy()
  })

  return {
    viewer,
    isInitialized,
    localAircraftEntity,
    remoteAircraftEntities,
    initViewer,
    createLocalAircraft,
    createRemoteAircraft,
    updateRemoteAircraft,
    removeRemoteAircraft,
    updateCamera,
    createMissile,
    updateMissile,
    removeMissile,
    createExplosion,
    getCartographic,
    isInArena,
    destroy
  }
}
