<script lang="ts">
  import "../../app.css";

  import DisclaimerDialog from "$lib/components/DisclaimerDialog.svelte";
  import SiteFooter from "$lib/components/SiteFooter.svelte";
  import SiteNav from "$lib/components/SiteNav.svelte";
  import { Toaster } from "$lib/components/ui/sonner";
  import { ModeWatcher } from "mode-watcher";

  interface Props {
    children?: import("svelte").Snippet;
  }

  let { children }: Props = $props();
</script>

<svelte:head>
  <title>Tiger Maths</title>
</svelte:head>

<Toaster />
<ModeWatcher defaultMode="light" />
<DisclaimerDialog />

<div class="flex min-h-screen flex-col bg-background">
  <SiteNav />

  <main class="flex-1">
    {@render children?.()}
  </main>

  <SiteFooter />
</div>
