<script setup lang="ts">
import { computed } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<{
  value?: number;
  max?: number;
  class?: string;
}>();

const percentage = computed(() => {
  const max = props.max || 100;
  const value = props.value || 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
});
</script>

<template>
  <div :class="cn('relative h-4 w-full overflow-hidden rounded-full bg-secondary', props.class)">
    <div
      class="h-full w-full flex-1 bg-primary transition-all"
      :style="{ transform: `translateX(-${100 - percentage}%)` }"
    />
  </div>
</template>
