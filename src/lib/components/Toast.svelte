<script lang="ts">
  import { toastState } from '$lib/stores/toast.svelte';
  import { fly } from 'svelte/transition';
</script>

{#if toastState.visible}
  <div
    class="pointer-events-none fixed inset-x-0 z-50 flex justify-center"
    style="bottom: calc(72px + env(safe-area-inset-bottom));"
    transition:fly={{ y: 20, duration: 180 }}
  >
    <div
      class="pointer-events-auto rounded-full px-4 py-2 text-sm font-medium shadow-lg"
      class:bg-accent={toastState.kind === 'info'}
      class:text-white={toastState.kind === 'info'}
      class:bg-danger={toastState.kind === 'error'}
      role="status"
    >
      {toastState.message}
    </div>
  </div>
{/if}
