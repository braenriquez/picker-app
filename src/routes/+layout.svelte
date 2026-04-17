<script lang="ts">
  import '../app.css';
  import { pwaInfo } from 'virtual:pwa-info';
  import ReloadPrompt from '$lib/components/ReloadPrompt.svelte';
  import { onMount } from 'svelte';

  let { children } = $props();

  // Loads the PWA register script once Kit is mounted.
  // The virtual import gives us the right path at build time.
  onMount(() => {
    if (pwaInfo?.webManifest?.linkTag) {
      const manifestTag = document.createElement('link');
      manifestTag.rel = 'manifest';
      manifestTag.href = pwaInfo.webManifest.href;
      document.head.appendChild(manifestTag);
    }
  });
</script>

<div class="flex min-h-dvh flex-col">
  {@render children()}
</div>

<ReloadPrompt />
