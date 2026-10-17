<script lang="ts">
  import "../app.css";

  import ErrorPage from "$lib/components/ErrorPage.svelte";
  import SiteFooter from "$lib/components/SiteFooter.svelte";
  import SiteNav from "$lib/components/SiteNav.svelte";
  import { ModeWatcher } from "mode-watcher";
</script>

<svelte:head>
  <title>Not found - Tiger Maths</title>
</svelte:head>

<ModeWatcher defaultMode="light" />

<div class="flex min-h-screen flex-col bg-background">
  <SiteNav />
  <main class="flex-1">
    <ErrorPage />
  </main>
  <SiteFooter />
</div>
