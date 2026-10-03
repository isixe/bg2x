<script setup lang="ts">
import type { SelectItemProps } from 'reka-ui';
import { computed, type HTMLAttributes } from 'vue';
import { SelectItem, SelectItemIndicator, SelectItemText, useForwardProps } from 'reka-ui';
import { Check } from 'lucide-vue-next';
import { cn } from '@/lib/utils';

const props = defineProps<SelectItemProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  const delegated = { ...props };
  delete delegated.class;
  return delegated;
});

const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <SelectItem
    v-bind="forwarded"
    :class="
      cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        props.class,
      )
    "
  >
    <SelectItemText class="min-w-0 truncate">
      <slot />
    </SelectItemText>
    <span class="absolute right-2 flex size-3.5 items-center justify-center">
      <SelectItemIndicator>
        <Check class="size-4" />
      </SelectItemIndicator>
    </span>
  </SelectItem>
</template>
