<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import * as InputOTP from "$lib/components/ui/input-otp";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import UsersRound from "@lucide/svelte/icons/users-round";
  import { toast } from "svelte-sonner";
  import { REGEXP_ONLY_DIGITS } from "bits-ui";

  import { goto } from "$app/navigation";

  import { io, type Socket } from "socket.io-client";
  import type { RoomCreateClientToServerEvents, RoomCreateServerToClientEvents } from "$lib/mathex/schemas";
  const socket: Socket<RoomCreateServerToClientEvents, RoomCreateClientToServerEvents> = io("/rooms");

  let code: string = $state("");
  let lastCode: string = "";
  async function setCode(newCode: string) {
    code = newCode;
    if (code.length === 6 && lastCode !== code) {
      lastCode = code;
      toast.promise(
        new Promise<void>(async (resolve, reject) => {
          if (await socket.emitWithAck("checkRoom", code)) {
            resolve();
          } else reject();
        }),
        {
          loading: "Loading...",
          success() {
            socket.disconnect();
            goto("/mathex/app/play/" + code);
            return "Going to room...";
          },
          error: "That room does not exist! Try typing the room ID again."
        }
      );
    }
  }
</script>

<div class="mathex-shell min-h-full px-4 py-10 sm:px-6 sm:py-14">
  <main class="mx-auto w-full max-w-2xl">
    <a
      href="/mathex/app"
      class="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-primary"
      ><ArrowLeft class="h-3.5 w-3.5" /> Competition home</a
    >

    <header class="mt-8 border-b border-border pb-6">
      <p class="mathex-kicker">Player check-in</p>
      <h1 class="mt-3 font-display text-4xl font-bold leading-tight sm:text-5xl">
        Enter the room<span class="text-primary">.</span>
      </h1>
      <p class="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
        Your host has a six-digit access code. Type it below to join the competition lobby.
      </p>
    </header>

    <div class="mt-8">
      <p class="mathex-kicker">Room code</p>
      <div class="mt-3 border border-border bg-card p-5">
        <InputOTP.Root maxlength={6} spellcheck="false" pattern={REGEXP_ONLY_DIGITS} bind:value={() => code, setCode}>
          {#snippet children({ cells })}
            <div class="flex w-full justify-between gap-1.5 sm:gap-2">
              {#each cells as cell (cell)}
                <InputOTP.Group class="min-w-0 flex-1">
                  <InputOTP.Slot
                    class="h-12 w-full border-border bg-muted/50 text-base font-bold text-foreground sm:h-14"
                    {cell}
                  />
                </InputOTP.Group>
              {/each}
            </div>
          {/snippet}
        </InputOTP.Root>
      </div>
      <div class="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
        <UsersRound class="h-4 w-4 text-primary" /> You will choose a display name next.
      </div>
    </div>
  </main>
</div>
