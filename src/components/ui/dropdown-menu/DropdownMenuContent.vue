<script setup lang="ts">
import type { DropdownMenuContentEmits, DropdownMenuContentProps } from 'reka-ui';
import { computed, type HTMLAttributes } from 'vue';
import { DropdownMenuContent, DropdownMenuPortal, useForwardPropsEmits } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = withDefaults(
  defineProps<DropdownMenuContentProps & { class?: HTMLAttributes['class'] }>(),
  { sideOffset: 6, align: 'end', class: '' },
);
const emits = defineEmits<DropdownMenuContentEmits>();

const delegatedProps = computed(() => {
  const delegated = { ...props };
  delete delegated.class;
  return delegated;
});

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <DropdownMenuPortal>
    <DropdownMenuContent
      v-bind="forwarded"
      :class="
        cn(
          'z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md',
          props.class,
        )
      "
    >
      <slot />
    </DropdownMenuContent>
  </DropdownMenuPortal>
</template>
