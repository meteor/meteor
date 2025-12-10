<script setup lang="ts">
const props = defineProps<{
  isOpen: boolean;
}>()
</script>

<template>
  <div :class="props.isOpen ? 'caret-btn-open ' : 'caret-btn-closed'" class="caret-btn " role="button"
    aria-label="toggle section" tabindex="0"><svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"
      viewBox="0 0 24 24" class="">
      <path
        d="M9,19c-0.3,0-0.5-0.1-0.7-0.3c-0.4-0.4-0.4-1,0-1.4l5.3-5.3L8.3,6.7c-0.4-0.4-0.4-1,0-1.4s1-0.4,1.4,0l6,6c0.4,0.4,0.4,1,0,1.4l-6,6C9.5,18.9,9.3,19,9,19z">
      </path>
    </svg>
  </div>
</template>

<style scoped>
.caret-btn {
  width: 18px;
  height: 18px;
  fill: currentColor;
  transition: transform 0.25s;
  display: inline-flex;
  vertical-align: text-top;
}

.caret-btn-closed {
  transform: rotate(0deg);
}

.caret-btn-open {
  transform: rotate(90deg);
}
</style>
