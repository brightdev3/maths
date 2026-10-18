<script lang="ts">
  import { goto } from "$app/navigation";
  import * as InputOTP from "$lib/components/ui/input-otp";
  import type {
    PhysicalCreateClientToServerEvents,
    PhysicalCreateServerToClientEvents
  } from "$lib/mathex/physical.schemas";
  import { ArrowLeft, KeyRound } from "@lucide/svelte/icons";
  import { REGEXP_ONLY_DIGITS } from "bits-ui";
  import { io, type Socket } from "socket.io-client";
  import { toast } from "svelte-sonner";

  const socket: Socket<PhysicalCreateServerToClientEvents, PhysicalCreateClientToServerEvents> = io("/physical");
  let code = $state("");
  let lastCode = "";

  async function setCode(value: string) {
    code = value;
    if (code.length !== 6 || lastCode === code) return;
    lastCode = code;
    if (await socket.emitWithAck("checkCompetition", code)) {
      socket.disconnect();
      goto(`/mathex/app/live/marker/${code}`);
    } else {
      lastCode = "";
      toast.error("That live competition does not exist. Check the room code and try again.");
    }
  }
</script>

<svelte:head><title>Marker Desk - Mathex Live</title></svelte:head>

<div class="mathex-shell min-h-full px-4 py-10 sm:px-6 sm:py-14">
  <main class="mx-auto w-full max-w-2xl">
    <a
      href="/mathex/app/live"
      class="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-primary"
    >
      <ArrowLeft class="h-3.5 w-3.5" /> Live dashboard setup
    </a>

    <header class="mt-8 border-b border-border pb-6">
      <p class="mathex-kicker">Marker desk</p>
      <h1 class="mt-3 font-display text-4xl font-bold leading-tight sm:text-5xl">
        Enter the room<span class="text-primary">.</span>
      </h1>
      <p class="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
        Type the six-digit live competition code, then use the marker PIN.
      </p>
    </header>

    <div class="mt-8">
      <p class="mathex-kicker">Room code</p>
      <div class="mt-3 border border-border bg-card p-5">
        <InputOTP.Root maxlength={6} spellcheck="false" pattern={REGEXP_ONLY_DIGITS} bind:value={() => code, setCode}>
          {#snippet children({ cells })}
            <div class="flex w-full justify-between gap-1.5 sm:gap-2">
              {#each cells as cell (cell)}
                <InputOTP.Group class="min-w-0 flex-1"
                  ><InputOTP.Slot
                    class="h-12 w-full border-border bg-muted/50 text-base font-bold text-foreground sm:h-14"
                    {cell}
                  /></InputOTP.Group
                >
              {/each}
            </div>
          {/snippet}
        </InputOTP.Root>
      </div>
      <div class="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <KeyRound class="h-4 w-4 text-primary" /> The marker PIN is requested on the next screen.
      </div>
    </div>
  </main>
</div>
