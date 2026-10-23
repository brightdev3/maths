<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { ArrowRight, ArrowUpRight, Calculator } from "@lucide/svelte/icons";

  const destinations = [
    {
      href: "/utilities/number",
      title: "Number explorer",
      blurb: "Pull apart any number to see its factors, patterns and surprising properties.",
      action: "Investigate a number"
    },
    {
      href: "/tools",
      title: "Games with bite",
      blurb: "Digitle, 24 Game, Basic Facts and more — puzzles that reward pattern-spotting and nerve.",
      action: "Pick a game"
    },
    {
      href: "/mathex",
      title: "Live Mathex",
      blurb: "Host or join a real-time mathematics competition, scored as it happens.",
      action: "Open Mathex"
    }
  ];
</script>

<section class="mathex-shell relative isolate overflow-hidden">
  <div class="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <div class="grid lg:grid-cols-[1.15fr_0.85fr]">
      <div class="py-12 sm:py-16 lg:border-r lg:border-border lg:py-20 lg:pr-14">
        <p class="mathex-kicker">Mathematics to linger over</p>
        <h1 class="mt-5 max-w-3xl font-display text-5xl font-bold leading-[0.98] sm:text-7xl lg:text-8xl">
          Tiger Maths
        </h1>
        <p class="mt-8 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
          Explore interesting number facts, play fun maths games, and participate in a live Mathex round.
        </p>
        <div class="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/utilities/number" size="lg" class="gap-2">
            Explore numbers
            <ArrowRight class="h-4 w-4" />
          </Button>
          <Button href="/mathex" size="lg" variant="outline" class="gap-2.5">
            <Calculator class="h-4 w-4" />
            Open Mathex
          </Button>
        </div>
        <p class="mt-6 text-xs font-medium text-muted-foreground">Free and open-source under the GPLv3.</p>
      </div>

      <aside class="border-t border-border py-12 lg:border-t-0 lg:pl-12 lg:py-20">
        <p class="mathex-kicker">Specimen of the day</p>
        <figure class="mt-5 border border-foreground/25 bg-card">
          <figcaption>
            <div class="flex items-baseline justify-between border-b border-border px-4 py-3">
              <span class="font-mono text-xs font-semibold uppercase tracking-[0.18em]">Pi</span>
              <span class="font-mono text-[0.68rem] text-muted-foreground">Irrational & Transcendental</span>
            </div>
          </figcaption>
          <div class="px-4 pb-4 pt-6">
            <div class="font-display text-7xl leading-none sm:text-8xl">π</div>
            <p class="mt-4 border-b border-dashed border-border pb-3 font-mono text-lg font-medium tracking-tight">
              3.14159<span class="text-muted-foreground">26535…</span>
            </p>
            <p class="mt-4 text-sm leading-6 text-muted-foreground">
              The ratio of a circle’s circumference to its diameter. Over a hundred trillion digits have been computed,
              and still no last one is in sight.
            </p>
          </div>
        </figure>
      </aside>
    </div>

    <div class="border-t-2 border-foreground/85 pb-16 lg:pb-20">
      {#each destinations as destination}
        <a
          href={destination.href}
          class="group grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-b border-border px-4 py-6 transition-colors hover:bg-accent/70 sm:gap-x-8 sm:px-6 sm:py-7"
        >
          <div>
            <h2 class="font-display text-2xl font-bold leading-snug transition-colors group-hover:text-primary">
              {destination.title}
            </h2>
            <p class="mt-1.5 max-w-xl text-sm leading-6 text-muted-foreground">{destination.blurb}</p>
          </div>
          <span
            class="hidden items-center gap-2 self-center font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors group-hover:text-primary sm:flex"
          >
            {destination.action}
            <ArrowUpRight
              class="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </span>
          <ArrowUpRight class="h-5 w-5 self-center text-muted-foreground group-hover:text-primary sm:hidden" />
        </a>
      {/each}
    </div>
  </div>
</section>
