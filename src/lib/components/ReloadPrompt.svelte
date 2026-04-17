<script lang="ts">
  import { onMount } from 'svelte';

  let needRefresh = $state(false);
  let offlineReady = $state(false);
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

  onMount(async () => {
    // Dynamic import so dev mode (no SW) doesn't blow up.
    try {
      const { useRegisterSW } = await import('virtual:pwa-register/svelte');
      const { needRefresh: nr, offlineReady: or, updateServiceWorker } = useRegisterSW({
        immediate: true,
        onRegisteredSW(_swUrl, r) {
          // Could poll for updates here. Default behavior is fine for now.
        },
        onRegisterError(err) {
          console.error('SW registration error', err);
        }
      });
      updateSW = updateServiceWorker;
      nr.subscribe((v) => (needRefresh = v));
      or.subscribe((v) => (offlineReady = v));
    } catch {
      // dev build without PWA — ignore
    }
  });

  function close() {
    needRefresh = false;
    offlineReady = false;
  }
</script>

{#if offlineReady || needRefresh}
  <div
    class="fixed inset-x-4 bottom-4 z-50 rounded-xl border border-border bg-surface p-4 shadow-lg sm:left-auto sm:right-4 sm:max-w-sm"
    role="alert"
  >
    <div class="mb-2 text-sm text-ink">
      {#if offlineReady}
        App is ready to work offline.
      {:else}
        New content available — reload to update.
      {/if}
    </div>
    <div class="flex gap-2">
      {#if needRefresh}
        <button
          class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          onclick={() => updateSW?.(true)}
        >
          Reload
        </button>
      {/if}
      <button
        class="rounded-md border border-border px-3 py-1.5 text-sm text-ink-soft hover:bg-surface-2"
        onclick={close}
      >
        Close
      </button>
    </div>
  </div>
{/if}
