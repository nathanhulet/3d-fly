import { ref, shallowRef, onUnmounted } from 'vue'
import * as Cesium from 'cesium'
import { ARENA, CAMERA } from '@/utils/constants'
import type { AircraftState } from '@/types/game'

/**
 * Apply model rotation correction to orientation quaternion
 * Adjust MODEL_ROTATION_DEGREES until the model faces forward
 */
const MODEL_ROTATION_DEGREES = -90  // Rotate from facing right to facing forward

function applyModelRotation(orientation: Cesium.Quaternion): Cesium.Quaternion {
  const modelCorrection = Cesium.Quaternion.fromAxisAngle(
    Cesium.Cartesian3.UNIT_Z,
    Cesium.Math.toRadians(MODEL_ROTATION_DEGREES)
  )
  return Cesium.Quaternion.multiply(orientation, modelCorrection, new Cesium.Quaternion())
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
      orientation: new Cesium.CallbackProperty(() => applyModelRotation(state.orientation), false) as any,
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

    // Create position/orientation properties that we'll update
    const positionProperty = new Cesium.SampledPositionProperty()
    positionProperty.addSample(Cesium.JulianDate.now(), position)

    const entity = viewer.value.entities.add({
      id: `aircraft-${playerId}`,
      position: positionProperty,
      orientation: new Cesium.ConstantProperty(applyModelRotation(orientation)),
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
   */
  function updateRemoteAircraft(playerId: string, position: Cesium.Cartesian3, orientation: Cesium.Quaternion) {
    const entity = remoteAircraftEntities.value.get(playerId)
    if (!entity || !viewer.value) return

    // Update position using sampled property for interpolation
    const positionProperty = entity.position as Cesium.SampledPositionProperty
    if (positionProperty instanceof Cesium.SampledPositionProperty) {
      positionProperty.addSample(Cesium.JulianDate.now(), position)
    }

    // Update orientation (with model rotation correction)
    entity.orientation = new Cesium.ConstantProperty(applyModelRotation(orientation)) as any
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

    // Get aircraft's local coordinate frame
    const transform = Cesium.Transforms.eastNorthUpToFixedFrame(state.position)

    // Get aircraft's heading from orientation
    const hpr = Cesium.HeadingPitchRoll.fromQuaternion(state.orientation)

    // Apply the same rotation correction used for the model
    // so camera is behind the aircraft's visual forward direction
    const correctedHeading = hpr.heading + Cesium.Math.toRadians(MODEL_ROTATION_DEGREES)

    // Calculate camera position behind and above aircraft
    const behindDistance = CAMERA.FOLLOW_DISTANCE
    const aboveDistance = CAMERA.FOLLOW_HEIGHT

    // Camera offset in local ENU coordinates (using corrected heading)
    const offsetLocal = new Cesium.Cartesian3(
      -Math.sin(correctedHeading) * behindDistance,
      -Math.cos(correctedHeading) * behindDistance,
      aboveDistance
    )

    // Transform offset to world coordinates
    const offsetWorld = Cesium.Matrix4.multiplyByPointAsVector(
      transform,
      offsetLocal,
      new Cesium.Cartesian3()
    )

    const cameraPosition = Cesium.Cartesian3.add(
      state.position,
      offsetWorld,
      new Cesium.Cartesian3()
    )

    // Set camera position and look at aircraft (using corrected heading)
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
   * Create missile entity
   */
  function createMissile(id: string, position: Cesium.Cartesian3, orientation: Cesium.Quaternion): Cesium.Entity | null {
    if (!viewer.value) return null

    return viewer.value.entities.add({
      id: `missile-${id}`,
      position: new Cesium.ConstantPositionProperty(position),
      orientation: new Cesium.ConstantProperty(orientation),
      cylinder: {
        length: 4,
        topRadius: 0.15,
        bottomRadius: 0.15,
        material: Cesium.Color.RED
      }
    })
  }

  /**
   * Update missile position
   */
  function updateMissile(id: string, position: Cesium.Cartesian3, orientation: Cesium.Quaternion) {
    if (!viewer.value) return

    const entity = viewer.value.entities.getById(`missile-${id}`)
    if (entity) {
      entity.position = new Cesium.ConstantPositionProperty(position) as any
      entity.orientation = new Cesium.ConstantProperty(orientation) as any
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
