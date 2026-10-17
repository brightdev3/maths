<script lang="ts">
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { ArrowRight } from "@lucide/svelte/icons";

  let query = $state("");
  async function submit(e?: SubmitEvent) {
    e?.preventDefault();
    if (isNaN(Number(query))) return;
    requestAnimationFrame(() => goto(`/utilities/number/${query}`));
  }

  const samples = ["7", "42", "144", "1729"];
</script>

<div class="py-12 sm:py-16">
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <div class="max-w-2xl">
      <p class="mathex-kicker">Number search</p>
      <h1 class="mt-4 font-display text-5xl font-bold leading-[1.05] sm:text-6xl">
        Every number has a character of its own.
      </h1>
      <div class="tiger-stripes mt-7 h-1.5 w-36" aria-hidden="true"></div>
      <p class="mt-7 max-w-lg text-base leading-7 text-muted-foreground">
        Type in any whole number and we will pull it apart — factors, primality, patterns and oddities.
      </p>

      <form onsubmit={submit} class="mt-8 flex max-w-lg items-stretch gap-2">
        <Input
          bind:value={query}
          onkeypress={(e) => {
            if (e.key === "Enter") {
              submit();
            } else if (!"0123456789".split("").includes(e.key)) {
              e.preventDefault();
            }
          }}
          onpaste={(e) => e.preventDefault()}
          type="search"
          placeholder="e.g. 1729"
          aria-label="Search for a number"
          class="h-12 font-mono text-lg"
        />
        <Button type="submit" class="h-12 gap-2">
          Search
          <ArrowRight class="h-4 w-4" />
        </Button>
      </form>

      <p class="mt-4 text-xs text-muted-foreground">
        In a hurry?
        {#each samples as sample, i}
          <a
            href={`/utilities/number/${sample}`}
            class="font-mono font-semibold text-primary underline-offset-4 hover:underline">{sample}</a
          >{#if i < samples.length - 1}<span class="mx-1.5 text-border" aria-hidden="true">·</span>{/if}
        {/each}
      </p>
    </div>
  </div>
</div>
