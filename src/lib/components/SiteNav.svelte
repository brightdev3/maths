<script lang="ts">
  import { page } from "$app/state";
  import { Github, Menu, PawPrint, X } from "@lucide/svelte/icons";
  import ThemeToggle from "$lib/components/ui/theme-toggle/theme-toggle.svelte";

  const links = [
    { url: "/utilities/number", text: "Numbers" },
    { url: "/tools", text: "Tools" },
    { url: "/mathex", text: "Mathex" }
  ];

  let mobileOpen = $state(false);
</script>

<nav class="sticky top-0 z-50 w-full border-b border-border bg-background">
  <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
    <a href="/" class="group flex items-center gap-2.5">
      <span
        class="flex h-9 w-9 items-center justify-center bg-primary text-primary-foreground transition-colors group-hover:bg-primary/90"
      >
        <PawPrint class="h-5 w-5" />
      </span>
      <span class="font-display text-xl font-bold leading-none tracking-tight">Tiger Maths</span>
    </a>

    <div class="hidden md:flex md:items-center md:gap-1">
      {#each links as link}
        {@const active = page.url.pathname.startsWith(link.url)}
        <a
          href={link.url}
          aria-current={active ? "page" : undefined}
          class={`relative px-3 py-2 font-mono text-xs font-semibold uppercase tracking-[0.18em] transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary after:transition-transform ${active ? "text-foreground after:scale-x-100" : "text-muted-foreground after:scale-x-0 hover:text-foreground hover:after:scale-x-100"}`}
          >{link.text}</a
        >
      {/each}
      <div class="ml-3 flex items-center gap-1.5 border-l border-border pl-3">
        <ThemeToggle />
        <a
          href="https://github.com/brightdev3/maths"
          target="_blank"
          class="flex h-9 w-9 items-center justify-center border border-transparent text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          aria-label="GitHub repository"><Github class="h-5 w-5" /></a
        >
      </div>
    </div>

    <button
      class="flex h-10 w-10 items-center justify-center text-foreground md:hidden"
      onclick={() => (mobileOpen = !mobileOpen)}
      aria-label="Toggle navigation menu"
      aria-expanded={mobileOpen}
    >
      {#if mobileOpen}<X class="h-6 w-6" />{:else}<Menu class="h-6 w-6" />{/if}
    </button>
  </div>
  {#if mobileOpen}
    <div class="border-t border-border bg-background md:hidden">
      <div class="divide-y divide-border px-4 pb-4 pt-1">
        {#each links as link}
          {@const active = page.url.pathname.startsWith(link.url)}
          <a
            href={link.url}
            aria-current={active ? "page" : undefined}
            class={`flex items-center justify-between px-1 py-3.5 font-mono text-sm font-semibold uppercase tracking-[0.14em] ${active ? "text-primary" : "text-muted-foreground"}`}
            onclick={() => (mobileOpen = false)}
          >
            {link.text}
            <span class="text-xs text-border" aria-hidden="true">→</span>
          </a>
        {/each}
        <div class="flex items-center gap-3 pt-4">
          <ThemeToggle />
          <a
            href="https://github.com/brightdev3/maths"
            target="_blank"
            class="flex items-center gap-2 font-mono text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            ><Github class="h-5 w-5" /> GitHub</a
          >
        </div>
      </div>
    </div>
  {/if}
</nav>
