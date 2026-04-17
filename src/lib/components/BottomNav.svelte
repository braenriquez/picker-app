<script lang="ts">
  import { page } from '$app/state';
  import { base } from '$app/paths';

  const tabs = [
    { href: '/', label: 'Home', icon: '◉' },
    { href: '/import/', label: 'Import', icon: '↓' },
    { href: '/find/', label: 'Find', icon: '⌕' },
    { href: '/picklist/', label: 'List', icon: '✓' },
    { href: '/settings/', label: 'Settings', icon: '⚙' }
  ];

  function isActive(href: string): boolean {
    const p = page.url.pathname.replace(base, '') || '/';
    if (href === '/') return p === '/' || p === '';
    return p.startsWith(href);
  }
</script>

<nav
  class="sticky bottom-0 z-40 flex shrink-0 border-t border-border bg-surface/95 backdrop-blur"
  style="padding-bottom: env(safe-area-inset-bottom);"
>
  {#each tabs as t}
    {@const active = isActive(t.href)}
    <a
      href="{base}{t.href}"
      class="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors"
      class:text-accent={active}
      class:text-muted={!active}
    >
      <span class="text-lg leading-none" aria-hidden="true">{t.icon}</span>
      <span>{t.label}</span>
    </a>
  {/each}
</nav>
