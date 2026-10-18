<script lang="ts">
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button";
</script>

<section class="py-16 sm:py-24">
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <div class="max-w-xl">
      <p class="mathex-kicker">Error {page.status}</p>
      <h1 class="mt-4 font-display text-6xl font-bold leading-none">
        {page.status}<span class="text-primary">.</span>
      </h1>
      <p class="mt-6 font-display text-2xl font-semibold leading-snug">
        {page.error?.message || "Something went wrong"}
      </p>
      <p class="mt-3 text-base leading-7 text-muted-foreground">
        {#if page.status === 404}
          That page is not in the textbook. Try the number search, or solve something instead?
        {:else}
          Whoops — this one is on us. The page could not be loaded.
        {/if}
      </p>
      <div class="mt-8 flex flex-wrap items-center gap-3">
        <Button href="/" class="gap-2">Go back home</Button>
        <Button href="/tools" variant="outline">Open tools</Button>
      </div>
      <p class="mt-8 border-t border-border pt-4 text-sm text-muted-foreground">
        If this was unexpected, please
        <a href="/contact" class="font-semibold text-primary underline-offset-4 hover:underline">contact us</a>.
      </p>
    </div>
  </div>
</section>
