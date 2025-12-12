<script setup lang="ts">
defineProps<{
  isLocked: boolean
}>()
</script>

<template>
  <div class="crosshair" :class="{ locked: isLocked }">
    <div class="crosshair-horizontal" />
    <div class="crosshair-vertical" />
    <div class="crosshair-center" />
    <div v-if="isLocked" class="lock-brackets">
      <div class="bracket top-left" />
      <div class="bracket top-right" />
      <div class="bracket bottom-left" />
      <div class="bracket bottom-right" />
    </div>
  </div>
</template>

<style scoped>
.crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
}

.crosshair-horizontal,
.crosshair-vertical {
  position: absolute;
  background: rgba(0, 255, 0, 0.8);
}

.crosshair-horizontal {
  top: 50%;
  left: 0;
  right: 0;
  height: 2px;
  transform: translateY(-50%);
}

.crosshair-vertical {
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  transform: translateX(-50%);
}

.crosshair-center {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 6px;
  height: 6px;
  transform: translate(-50%, -50%);
  border: 2px solid rgba(0, 255, 0, 0.8);
  border-radius: 50%;
}

/* Locked state */
.crosshair.locked .crosshair-horizontal,
.crosshair.locked .crosshair-vertical {
  background: rgba(255, 0, 0, 0.9);
}

.crosshair.locked .crosshair-center {
  border-color: rgba(255, 0, 0, 0.9);
  background: rgba(255, 0, 0, 0.3);
}

/* Lock brackets */
.lock-brackets {
  position: absolute;
  top: -15px;
  left: -15px;
  right: -15px;
  bottom: -15px;
}

.bracket {
  position: absolute;
  width: 15px;
  height: 15px;
  border: 2px solid #ff0000;
}

.bracket.top-left {
  top: 0;
  left: 0;
  border-right: none;
  border-bottom: none;
}

.bracket.top-right {
  top: 0;
  right: 0;
  border-left: none;
  border-bottom: none;
}

.bracket.bottom-left {
  bottom: 0;
  left: 0;
  border-right: none;
  border-top: none;
}

.bracket.bottom-right {
  bottom: 0;
  right: 0;
  border-left: none;
  border-top: none;
}

.crosshair.locked .lock-brackets {
  animation: pulse 0.3s infinite alternate;
}

@keyframes pulse {
  from { transform: scale(1); }
  to { transform: scale(1.1); }
}
</style>
