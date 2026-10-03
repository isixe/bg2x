<script setup lang="ts">
import type { DropdownMenuItemProps } from 'reka-ui';
import { computed, type HTMLAttributes } from 'vue';
import { DropdownMenuItem, useForwardProps } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<
  DropdownMenuItemProps & { class?: HTMLAttributes['class']; inset?: boolean }
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
  <DropdownMenuItem
    v-bind="forwarded"
    :class="
      cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        inset && 'pl-8',
        props.class,
      )
    "
  >
    <slot />
  </DropdownMenuItem>
</template>
