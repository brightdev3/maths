<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Header } from "$lib/components/ui/header";
  import { ArrowUpRight, Calculator, CirclePlay, FileQuestion, Radio, ShieldCheck, Timer } from "@lucide/svelte/icons";
</script>

<div class="mathex-shell relative min-h-full overflow-hidden px-4 py-5 sm:px-8 sm:py-8">
  <main class="relative mx-auto max-w-6xl">
    <section class="grid items-center gap-10 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
      <div>
        <p class="mathex-kicker">Fast. Focused. Fair.</p>
        <Header size="h1" class="mt-3 max-w-3xl text-5xl leading-[0.95] tracking-[-0.055em] sm:text-7xl">
          Maths competition,<br /><span class="text-primary">in real time.</span>
        </Header>
        <p class="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
          Run a polished Mathex round from one host console, or join a live room and race through every question.
        </p>
        <div class="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button href="/mathex/app/play" size="lg" class="gap-2.5">
            <CirclePlay class="h-5 w-5" />
            Join a competition
          </Button>
          <Button href="/mathex/app/create" size="lg" variant="outline" class="gap-2.5">
            Host a room
            <ArrowUpRight class="h-4 w-4" />
          </Button>
        </div>
        <a
          href="/mathex/app/live"
          class="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <Radio class="h-4 w-4" /> Running an in-person event? Open the Live Dashboard <ArrowUpRight class="h-4 w-4" />
        </a>
      </div>

      <aside class="border border-foreground/25 bg-card">
        <div class="p-5 sm:p-7">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="mathex-kicker">Built for the round</p>
              <h2 class="mt-2 font-display text-xl font-bold">Everything stays in sync.</h2>
            </div>
            <Calculator class="h-6 w-6 shrink-0 text-primary" />
          </div>
          <ul class="mt-6 divide-y divide-border border-t border-border">
            <li class="flex gap-3.5 py-4">
              <FileQuestion class="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p class="text-sm font-semibold">One question at a time</p>
                <p class="mt-0.5 text-sm leading-5 text-muted-foreground">
                  Players focus on the next problem while the host sees progress as it happens.
                </p>
              </div>
            </li>
            <li class="flex gap-3.5 py-4">
              <Timer class="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p class="text-sm font-semibold">A pace you control</p>
                <p class="mt-0.5 text-sm leading-5 text-muted-foreground">
                  Set the time between submissions to match your format.
                </p>
              </div>
            </li>
            <li class="flex gap-3.5 py-4">
              <ShieldCheck class="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p class="text-sm font-semibold">Fair play signals</p>
                <p class="mt-0.5 text-sm leading-5 text-muted-foreground">
                  Optionally record when a player leaves the competition tab.
                </p>
              </div>
            </li>
          </ul>
        </div>
      </aside>
    </section>
  </main>
</div>
