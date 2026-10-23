<script lang="ts">
  import {
    ArrowUpRight,
    Brain,
    Calculator,
    CircleDot,
    Gamepad2,
    PenTool,
    Pencil,
    Radio,
    Zap
  } from "@lucide/svelte/icons";

  interface Entry {
    name: string;
    description: string;
    url: string;
    icon: typeof Gamepad2;
  }

  const games: Entry[] = [
    {
      name: "Digitle",
      description: "Guess a five-digit number in six attempts, with colour-coded feedback after every move.",
      url: "/tools/digitle",
      icon: Gamepad2
    },
    {
      name: "Basic Facts",
      description: "Sixty seconds of arithmetic, multiplication, powers and roots against the clock.",
      url: "/tools/basic-facts",
      icon: Zap
    },
    {
      name: "Sequencing",
      description: "Read increasingly devious number patterns and choose the value that comes next.",
      url: "/tools/sequencing",
      icon: Brain
    },
    {
      name: "Factor Finder",
      description: "Test your divisibility instincts by finding every factor of the target number.",
      url: "/tools/factor-finder",
      icon: CircleDot
    },
    {
      name: "24 Game",
      description: "Combine four numbers with +, −, × and ÷ to make exactly 24 — solo or against friends.",
      url: "/tools/24-game",
      icon: Calculator
    }
  ];

  const toolkit: Entry[] = [
    {
      name: "Mathex Set Editor",
      description: "Write and arrange question sets for a Mathex round, with live collaboration.",
      url: "/mathex/app/create/editor",
      icon: Pencil
    },
    {
      name: "Mathex Live Dashboard",
      description: "Score a physical Mathex competition in real time and project the standings.",
      url: "/mathex/app/live",
      icon: Radio
    }
  ];

  const utilities: Entry[] = [
    {
      name: "Sketchpad",
      description: "A full-screen drawing pad with pens, shapes, construction tools and an optional dot grid.",
      url: "/tools/sketchpad",
      icon: PenTool
    }
  ];
</script>

<div class="py-12 sm:py-16">
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <header
      class="flex flex-col gap-5 border-b-2 border-foreground/85 pb-8 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <h1 class="mt-3 font-display text-5xl font-bold sm:text-6xl">Tools</h1>
      </div>
      <p class="max-w-sm text-sm leading-6 text-muted-foreground">
        Play games built for quick thinking, or set up a Mathex competition of your own.
      </p>
    </header>

    {#snippet entryRow(entry: Entry)}
      <li>
        <a
          href={entry.url}
          class="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-4 border-b border-border py-5 transition-colors hover:bg-accent/70 sm:gap-x-8 sm:py-6"
        >
          <span
            class="flex h-10 w-10 items-center justify-center border border-border bg-card text-muted-foreground transition-colors group-hover:border-foreground/40 group-hover:text-primary"
          >
            <entry.icon class="h-5 w-5" />
          </span>
          <div>
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 class="font-display text-xl font-bold leading-snug transition-colors group-hover:text-primary">
                {entry.name}
              </h2>
            </div>
            <p class="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{entry.description}</p>
          </div>
          <ArrowUpRight
            class="h-5 w-5 justify-self-end text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
          />
        </a>
      </li>
    {/snippet}

    <p class="mathex-kicker mt-12">Games</p>
    <ul class="mt-4 border-t border-border">
      {#each games as game}
        {@render entryRow(game)}
      {/each}
    </ul>

    <p class="mathex-kicker mt-12">Utilities</p>
    <ul class="mt-4 border-t border-border">
      {#each utilities as entry}
        {@render entryRow(entry)}
      {/each}
    </ul>

    <p class="mathex-kicker mt-12">Mathex toolkit</p>
    <ul class="mt-4 border-t border-border">
      {#each toolkit as entry}
        {@render entryRow(entry)}
      {/each}
    </ul>
  </div>
</div>
