<script setup lang="ts">
import type { DropdownMenuSeparatorProps } from 'reka-ui';
import { computed, type HTMLAttributes } from 'vue';
import { DropdownMenuSeparator, useForwardProps } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<DropdownMenuSeparatorProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  const delegated = { ...props };
  delete delegated.class;
  return delegated;
});

const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <DropdownMenuSeparator v-bind="forwarded" :class="cn('-mx-1 my-1 h-px bg-border', props.class)" />
</template>
