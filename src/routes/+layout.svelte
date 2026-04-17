<script lang="ts">
  import '../app.css';
  import { pwaInfo } from 'virtual:pwa-info';
  import ReloadPrompt from '$lib/components/ReloadPrompt.svelte';
  import BottomNav from '$lib/components/BottomNav.svelte';
  import Toast from '$lib/components/Toast.svelte';
  import { onMount } from 'svelte';

  let { children } = $props();

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
  <div class="flex-1 overflow-y-auto">
    {@render children()}
  </div>
  <BottomNav />
</div>

<ReloadPrompt />
<Toast />
