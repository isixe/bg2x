<script setup lang="ts">
import type { SelectTriggerProps } from 'reka-ui';
import { computed, type HTMLAttributes } from 'vue';
import { SelectIcon, SelectTrigger, useForwardProps } from 'reka-ui';
import { ChevronDown } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

const props = defineProps<SelectTriggerProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  const delegated = { ...props };
  delete delegated.class;
  return delegated;
});

const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <SelectTrigger
    v-bind="forwarded"
    :class="
      cn(
        'flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )
    "
  >
    <slot />
    <SelectIcon as-child>
      <ChevronDown class="size-4 shrink-0 opacity-60" />
    </SelectIcon>
  </SelectTrigger>
</template>
