<script setup lang="ts">
import type { SelectValueProps } from 'reka-ui';
import { SelectValue } from 'reka-ui';

const props = defineProps<SelectValueProps>();
</script>

<template>
  <SelectValue v-bind="props" class="min-w-0 truncate">
    <slot />
  </SelectValue>
</template>
