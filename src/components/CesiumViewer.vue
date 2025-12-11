<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useCesium } from '@/composables/useCesium'

const emit = defineEmits<{
  (e: 'initialized'): void
  (e: 'click'): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const cesium = useCesium()

defineExpose({
  cesium
})

onMounted(async () => {
  if (containerRef.value) {
    await cesium.initViewer(containerRef.value)
    emit('initialized')
  }
})

onUnmounted(() => {
  cesium.destroy()
})

function handleClick() {
  emit('click')
}
</script>

<template>
  <div
    ref="containerRef"
    class="cesium-container"
    @click="handleClick"
  />
</template>

<style scoped>
.cesium-container {
  width: 100%;
  height: 100%;
}

/* Hide Cesium credits for cleaner look */
:deep(.cesium-credit-logoContainer),
:deep(.cesium-credit-textContainer) {
  display: none !important;
}
</style>
