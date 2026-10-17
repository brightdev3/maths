<script lang="ts">
  import { Github, PawPrint } from "@lucide/svelte/icons";

  const buildCommit = __BUILD_COMMIT__;
  const buildTime = __BUILD_TIME__;
</script>

<footer class="bg-secondary text-secondary-foreground">
  <div class="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
    <div class="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
      <div class="max-w-md">
        <div class="flex items-center gap-2.5">
          <span class="flex h-8 w-8 items-center justify-center bg-primary text-primary-foreground">
            <PawPrint class="h-4 w-4" />
          </span>
          <span class="font-display text-lg font-bold leading-none">Tiger Maths</span>
        </div>
        <p class="mt-4 text-sm leading-6 text-secondary-foreground/80">
          Made with ♥ by <a href="https://qincai.xyz" class="font-semibold underline underline-offset-4">Raymont</a> to
          celebrate Maths Week. Originally built by
          <a href="https://devarsh.me" class="font-semibold underline underline-offset-4">Devarsh</a>
          in Room 22 @ BBI, then improved by
          <a href="https://devenwei.me" class="font-semibold underline underline-offset-4">Deven</a> as Tiger Maths.
        </p>
      </div>

      <div class="flex flex-col gap-4 sm:flex-row sm:gap-16">
        <div>
          <p class="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-secondary-foreground/60">
            Explore
          </p>
          <ul class="mt-3 space-y-2 text-sm font-medium">
            <li><a href="/utilities/number" class="underline-offset-4 hover:underline">Number search</a></li>
            <li><a href="/tools" class="underline-offset-4 hover:underline">Tools and games</a></li>
            <li><a href="/mathex" class="underline-offset-4 hover:underline">Mathex</a></li>
          </ul>
        </div>
        <div>
          <p class="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-secondary-foreground/60">
            Source
          </p>
          <ul class="mt-3 space-y-2 text-sm font-medium">
            <li>
              <a
                href="https://github.com/brightdev3/maths"
                target="_blank"
                class="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
              >
                <Github class="h-4 w-4" /> GitHub repository
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div
      class="mt-10 flex flex-col items-start justify-between gap-2 border-t border-secondary-foreground/25 pt-5 sm:flex-row sm:items-center"
    >
      <p class="text-xs text-secondary-foreground/70">Built with SvelteKit, Tailwind CSS and Bun.</p>
      <code class="font-mono text-[0.7rem] text-secondary-foreground/70">git:{buildCommit} · build:{buildTime}</code>
    </div>
  </div>
</footer>
