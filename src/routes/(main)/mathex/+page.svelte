<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { ArrowRight } from "@lucide/svelte/icons";

  const steps = [
    {
      label: "Author",
      detail: "Write question sets in the collaborative editor, or use an existing set."
    },
    {
      label: "Play",
      detail: "Teams join live rooms from any device and answer questions one-by-one."
    },
    {
      label: "Score",
      detail: "View player scores on the dashboard and project the standings."
    }
  ];
</script>

<section class="mathex-shell relative isolate overflow-hidden">
  <div class="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
    <div class="max-w-3xl">
      <p class="mathex-kicker">Live competition software</p>
      <h1 class="mt-4 font-display text-5xl font-bold leading-[1.02] sm:text-6xl lg:text-7xl">
        Mathex competition
      </h1>
      <p class="mt-8 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
        An application for Mathex-style events: write the questions, run the rounds live, and view progress with
        a scoreboard that updates as players answer.
      </p>
      <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button href="/mathex/app" size="lg" class="gap-2">
          Open the app
          <ArrowRight class="h-4 w-4" />
        </Button>
        <Button href="/mathex/app/create/editor" size="lg" variant="outline">Set editor</Button>
        <Button href="/mathex/app/live" size="lg" variant="outline">Physical competition dashboard</Button>
      </div>
    </div>

    <dl class="mt-16 grid gap-px border border-border bg-border sm:grid-cols-3">
      {#each steps as step, i}
        <div class="bg-card p-6 sm:p-7">
          <dt class="flex items-baseline gap-3">
            <span class="mathex-index">{String(i + 1).padStart(2, "0")}</span>
            <span class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-foreground">{step.label}</span
            >
          </dt>
          <dd class="mt-3 text-sm leading-6 text-muted-foreground">{step.detail}</dd>
        </div>
      {/each}
    </dl>
  </div>
</section>
