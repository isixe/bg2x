import { readonly, shallowRef } from 'vue';

const visible = shallowRef(false);
let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function useModelRequiredToast() {
  function showModelRequired() {
    visible.value = true;
    if (hideTimer !== undefined) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      visible.value = false;
      hideTimer = undefined;
    }, 3000);
  }

  function disposeModelRequiredToast() {
    if (hideTimer !== undefined) clearTimeout(hideTimer);
    hideTimer = undefined;
    visible.value = false;
  }

  return {
    modelRequiredVisible: readonly(visible),
    showModelRequired,
    disposeModelRequiredToast,
  };
}
