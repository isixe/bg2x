<script setup lang="ts">
import type { DropdownMenuLabelProps } from 'reka-ui';
import { computed, type HTMLAttributes } from 'vue';
import { DropdownMenuLabel, useForwardProps } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<
  DropdownMenuLabelProps & { class?: HTMLAttributes['class']; inset?: boolean }
>();

const delegatedProps = computed(() => {
  const delegated = { ...props };
  delete delegated.class;
  delete delegated.inset;
  return delegated;
});

const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <DropdownMenuLabel
    v-bind="forwarded"
    :class="
      cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', inset && 'pl-8', props.class)
    "
  >
    <slot />
  </DropdownMenuLabel>
</template>
