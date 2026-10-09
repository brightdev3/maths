<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { Header } from "$lib/components/ui/header";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { createId } from "$lib/utils";
  import { io, type Socket } from "socket.io-client";
  import { onDestroy, onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import type {
    Game24ClientToServerEvents,
    Game24OperationResult,
    Game24ServerToClientEvents,
    Game24Snapshot
  } from "$lib/game24/schemas";
  import type { Move } from "$lib/game24/engine";
  import Board from "$lib/game24/Board.svelte";
  import {
    CircleCheckBig,
    CirclePlay,
    CircleX,
    Crown,
    Flag,
    LoaderCircle,
    LogOut,
    Swords,
    Timer,
    Trophy,
    Users,
    UserX,
    Zap
  } from "@lucide/svelte/icons";

  const id = page.url.searchParams.get("id") || "";
  const socket: Socket<Game24ServerToClientEvents, Game24ClientToServerEvents> = io("/game24", {
    forceNew: true,
    autoConnect: false
  });
  onDestroy(() => socket.disconnect());

  let connected = $state(false);
  let inRoom = $state(false);
  let snapshot = $state<Game24Snapshot | null>(null);
  let name = $state("");
  let playerId = $state("");
  let gateVisible = $state(true);
  let joinError = $state("");
  let needPassword = $state(false);
  let password = $state("");
  let roundStartedAt = $state<number | null>(null);
  let lastRound = 0;
  let receivedAt = $state(Date.now());
  let serverNow = $state(Date.now());
  let now = $state(Date.now());
  let confirmFinishOpen = $state(false);

  let settingsInitialized = false;
  let form = $state({
    name: "",
    mode: "hit" as "time" | "hit",
    difficulty: "normal" as "easy" | "normal" | "hard",
    totalRounds: 5,
    roundSeconds: 60,
    maxPlayers: 4
  });

  onMount(() => {
    try {
      name = localStorage.getItem("game24-name") || "";
      let storedId = localStorage.getItem("game24-player-id");
      if (!storedId) {
        storedId = createId();
        localStorage.setItem("game24-player-id", storedId);
      }
      playerId = storedId;
    } catch {}
    socket.connect();
  });

  socket.on("connect", () => {
    connected = true;
    tryJoin();
  });
  socket.on("disconnect", () => (connected = false));
  socket.on("connect_error", () => toast.error("Could not reach the game server"));
  socket.on("room", (next) => {
    snapshot = next;
    receivedAt = Date.now();
    serverNow = next?.serverNow ?? Date.now();
    if (!next) {
      inRoom = false;
      return;
    }
    inRoom = true;
    if (next.state === "playing" && next.round !== lastRound) {
      lastRound = next.round;
      roundStartedAt = Date.now();
    }
  });
  socket.on("kicked", () => {
    toast.error("You were removed from the room");
    inRoom = false;
    snapshot = null;
    gateVisible = false;
    setTimeout(() => goto("/tools/24-game/online"), 1200);
  });
  socket.on("alert", (type, message) => {
    if (type === "normal" || type === "action" || type === "default") {
      toast(message);
    } else {
      const notify = toast[type];
      if (typeof notify === "function") notify(message);
      else toast(message);
    }
  });

  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(timer);
  });

  function persistName(value: string) {
    name = value;
    try {
      localStorage.setItem("game24-name", value);
    } catch {}
  }

  function tryJoin() {
    const clean = name.trim();
    if (!id || !clean) {
      gateVisible = true;
      return;
    }
    socket.emit("joinRoom", { code: id, playerId, playerName: clean, password: password || undefined }, (res) => {
      if (res.ok) {
        inRoom = true;
        gateVisible = false;
        joinError = "";
        needPassword = false;
        persistName(clean);
      } else {
        gateVisible = true;
        joinError = res.error;
        needPassword = /password/i.test(res.error);
      }
    });
  }

  function submitGate() {
    const clean = name.trim();
    if (!clean) {
      toast.error("Enter a name");
      return;
    }
    persistName(clean);
    tryJoin();
  }

  function result(res: Game24OperationResult) {
    if (!res.ok) toast.error(res.error);
  }

  function liveServerNow() {
    return now - (receivedAt - serverNow);
  }

  const myPlayer = $derived.by(() => snapshot?.players.find((player) => player.id === playerId) ?? null);
  const isOwner = $derived(snapshot?.ownerId === playerId);
  const ownerName = $derived.by(
    () => snapshot?.players.find((player) => player.id === snapshot?.ownerId)?.name ?? "the host"
  );
  const remainingMs = $derived.by(() =>
    snapshot?.roundEndsAt ? Math.max(0, snapshot.roundEndsAt - liveServerNow()) : null
  );
  const hitRemainingMs = $derived.by(() =>
    snapshot?.hit && snapshot.hit.playerId === playerId ? Math.max(0, snapshot.hit.deadline - liveServerNow()) : null
  );
  const boardDisabled = $derived.by(() => {
    const current = snapshot;
    if (!current || current.state !== "playing" || current.roundComplete || !myPlayer) return true;
    if (current.mode === "time") return myPlayer.solvedThisRound;
    return current.hit?.playerId !== playerId;
  });

  $effect(() => {
    if (snapshot && snapshot.state === "lobby" && snapshot.ownerId === playerId && !settingsInitialized) {
      settingsInitialized = true;
      form = {
        name: snapshot.name,
        mode: snapshot.mode,
        difficulty: snapshot.difficulty,
        totalRounds: snapshot.totalRounds,
        roundSeconds: Math.round(snapshot.roundTimeMs / 1000),
        maxPlayers: snapshot.maxPlayers
      };
    }
  });

  function start() {
    socket.emit("start", result);
  }
  function advance() {
    socket.emit("advance", result);
  }
  function finish() {
    confirmFinishOpen = false;
    socket.emit("finish", result);
  }
  function restart() {
    socket.emit("restart", result);
  }
  function kick(targetId: string) {
    socket.emit("kick", targetId, result);
  }
  function hit() {
    socket.emit("hit", result);
  }
  function leave() {
    socket.emit("leaveRoom", () => {});
    goto("/tools/24-game/online");
  }
  function saveSettings() {
    socket.emit(
      "configure",
      {
        name: form.name.trim() || snapshot?.name,
        mode: form.mode,
        difficulty: form.difficulty,
        totalRounds: Number(form.totalRounds),
        roundTimeMs: Math.round(Number(form.roundSeconds) * 1000),
        maxPlayers: Number(form.maxPlayers)
      },
      result
    );
  }
  function handleSolved({ moves, expression, elapsedMs }: { moves: Move[]; expression: string; elapsedMs: number }) {
    if (!snapshot) return;
    socket.emit("submit", { round: snapshot.round, moves, expression, elapsedMs }, result);
  }
  function formatMs(ms: number) {
    const total = Math.floor(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }
</script>

<svelte:head><title>{snapshot?.name || "24 Game"} - Room</title></svelte:head>

<div class="mathex-shell min-h-screen p-4 sm:p-6">
  {#if !inRoom}
    <div class="flex min-h-[calc(100vh-3rem)] items-center justify-center">
      <div class="mathex-panel w-full max-w-md rounded-3xl p-7 sm:p-9">
        <p class="mathex-kicker">Join room</p>
        <Header size="h1" class="mt-2 text-3xl tracking-[-0.04em]">
          {joinError || (connected ? "Enter this room" : "Connecting…")}
        </Header>
        <form
          class="mt-5 space-y-4"
          onsubmit={(event) => {
            event.preventDefault();
            submitGate();
          }}
        >
          <div class="space-y-2">
            <Label for="join-name">Your name</Label>
            <Input id="join-name" bind:value={name} maxlength={20} placeholder="Enter your name" />
          </div>
          {#if needPassword}
            <div class="space-y-2">
              <Label for="join-password">Room password</Label>
              <Input id="join-password" type="password" maxlength={60} bind:value={password} />
            </div>
          {/if}
          <Button type="submit" class="w-full shadow-lg shadow-primary/20" size="lg" disabled={!connected}>
            {needPassword ? "Join with password" : "Join"}
          </Button>
          <Button type="button" variant="ghost" class="w-full" href="/tools/24-game/online">Back to lobby</Button>
        </form>
      </div>
    </div>
  {:else if !snapshot}
    <div class="flex min-h-[calc(100vh-3rem)] items-center justify-center">
      <span class="mathex-panel flex items-center gap-3 rounded-2xl px-5 py-4 text-lg font-medium text-muted-foreground">
        <LoaderCircle class="h-5 w-5 animate-spin" /> Loading room…
      </span>
    </div>
  {:else if snapshot.state === "lobby"}
    <div class="mx-auto w-full max-w-3xl">
      <header class="mathex-panel flex items-center justify-between rounded-2xl p-4 sm:p-5">
        <div class="flex items-center gap-3">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {#if snapshot.format === "1v1"}<Swords class="h-5 w-5" />{:else}<Users class="h-5 w-5" />{/if}
          </span>
          <div>
            <p class="text-lg font-bold">{snapshot.name}</p>
            <p class="text-xs text-muted-foreground">
              {snapshot.format === "1v1" ? "1v1" : "Room"} ·
              {snapshot.mode === "hit" ? "Hit & solve" : "Fastest time"} ·
              {snapshot.players.length}/{snapshot.maxPlayers} players
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" class="gap-1.5" onclick={leave}>
          <LogOut class="h-4 w-4" /> Leave
        </Button>
      </header>

      <section class="mathex-panel mt-4 rounded-3xl p-5">
        <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
          <Users class="h-3.5 w-3.5" /> Players
        </div>
        <div class="mt-3 grid gap-1.5">
          {#each snapshot.players as player (player.id)}
            <div
              class="flex items-center gap-2 rounded-lg border p-2 {player.id === playerId
                ? 'border-primary/40 bg-primary/10'
                : 'border-border/60 bg-muted/30'}"
            >
              {#if player.isOwner}<Crown class="h-4 w-4 shrink-0 text-yellow-500" />{/if}
              <span class="truncate text-sm font-medium {player.id === playerId ? 'text-primary' : ''}"
                >{player.name}{player.id === playerId ? " (you)" : ""}{player.connected ? "" : " (away)"}</span
              >
              {#if isOwner && player.id !== playerId}
                <Button
                  variant="ghost"
                  size="icon"
                  class="ml-auto h-7 w-7"
                  aria-label="Remove {player.name}"
                  onclick={() => kick(player.id)}
                >
                  <UserX class="h-4 w-4" />
                </Button>
              {/if}
            </div>
          {/each}
        </div>

        <div class="mt-5">
          {#if isOwner}
            {#if snapshot.format === "1v1"}
              <p class="text-sm text-muted-foreground">
                {snapshot.players.length < 2
                  ? "Waiting for an opponent to accept… The game starts automatically."
                  : "Starting…"}
              </p>
            {:else}
              <Button class="w-full gap-2" size="lg" onclick={start} disabled={!connected || snapshot.players.length < 2}>
                <CirclePlay class="h-4 w-4" /> Start game
              </Button>
              <p class="mt-2 text-center text-xs text-muted-foreground">
                {snapshot.players.length < 2 ? "You need at least 2 players." : "Everyone in this room will play."}
              </p>
            {/if}
          {:else}
            <p class="text-center text-sm text-muted-foreground">
              Waiting for <span class="font-semibold text-foreground">{ownerName}</span> to start the game…
            </p>
          {/if}
        </div>
      </section>

      {#if isOwner}
        <section class="mathex-panel mt-4 rounded-3xl p-5 sm:p-6">
          <p class="mathex-kicker">Room settings</p>
          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <div class="grid gap-1.5">
              <Label for="room-name">Room name</Label>
              <Input id="room-name" bind:value={form.name} maxlength={60} />
            </div>
            <div class="grid gap-1.5">
              <Label for="room-mode">Scoring</Label>
              <select
                id="room-mode"
                bind:value={form.mode}
                class="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="hit">Hit &amp; solve</option>
                <option value="time">Fastest time</option>
              </select>
            </div>
            <div class="grid gap-1.5">
              <Label for="room-difficulty">Difficulty</Label>
              <select
                id="room-difficulty"
                bind:value={form.difficulty}
                class="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="easy">Easy</option>
                <option value="normal">Normal</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div class="grid gap-1.5">
              <Label for="room-rounds">Rounds</Label>
              <Input id="room-rounds" type="number" min={1} max={50} bind:value={form.totalRounds} />
            </div>
            <div class="grid gap-1.5">
              <Label for="room-seconds">Seconds per round</Label>
              <Input id="room-seconds" type="number" min={5} max={1800} bind:value={form.roundSeconds} />
            </div>
            {#if snapshot.format === "multi"}
              <div class="grid gap-1.5">
                <Label for="room-max">Maximum players</Label>
                <Input id="room-max" type="number" min={2} max={16} bind:value={form.maxPlayers} />
              </div>
            {/if}
          </div>
          <Button class="mt-4" variant="outline" onclick={saveSettings} disabled={!connected}>Save settings</Button>
        </section>
      {/if}
    </div>
  {:else}
    <div class="mx-auto w-full max-w-3xl">
      <header class="mathex-panel flex items-center justify-between rounded-2xl p-3.5 sm:p-4">
        <div class="flex items-center gap-3">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {#if snapshot.mode === "hit"}<Zap class="h-4 w-4" />{:else}<Timer class="h-4 w-4" />{/if}
          </span>
          <div>
            <p class="text-lg font-bold">
              {snapshot.state === "finished" ? "Game over" : `Round ${snapshot.round} / ${snapshot.totalRounds}`}
            </p>
            <p class="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
              {snapshot.mode === "hit" ? "Hit & solve" : "Fastest time"}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          {#if snapshot.state === "playing"}
            {#if snapshot.mode === "hit" && hitRemainingMs !== null}
              <div class="text-right">
                <p class="text-2xl font-black tabular-nums text-primary">{(hitRemainingMs / 1000).toFixed(1)}s</p>
                <p class="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">To prove it</p>
              </div>
            {:else if remainingMs !== null}
              <div class="text-right">
                <p class="text-2xl font-black tabular-nums">{formatMs(remainingMs)}</p>
                <p class="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">Time left</p>
              </div>
            {/if}
          {/if}
          <Button variant="ghost" size="sm" class="gap-1.5" onclick={leave}><LogOut class="h-4 w-4" /> Leave</Button>
        </div>
      </header>

      {#if snapshot.state === "playing"}
        {#if isOwner}
          <div class="mt-3 flex flex-wrap gap-2">
            <Button class="gap-2" onclick={advance} disabled={!connected}>
              <CirclePlay class="h-4 w-4" />
              {snapshot.roundComplete
                ? snapshot.round >= snapshot.totalRounds
                  ? "Finish game"
                  : "Next round"
                : "Skip to next round"}
            </Button>
            <Button variant="destructive" class="gap-2" onclick={() => (confirmFinishOpen = true)} disabled={!connected}>
              <Flag class="h-4 w-4" /> End game
            </Button>
          </div>
        {/if}

        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3 text-sm">
            <span class="font-semibold">{myPlayer?.name ?? name}</span>
            {#if snapshot.mode === "hit"}
              <span class="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary"
                >{myPlayer?.score ?? 0} won</span
              >
            {:else if myPlayer}
              <span class="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground"
                >{formatMs(myPlayer.totalTimeMs)}</span
              >
            {/if}
          </div>
          {#if snapshot.mode === "hit" && myPlayer}
            {#if myPlayer.solvedThisRound}
              <span class="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                <CircleCheckBig class="h-4 w-4" /> You won this round
              </span>
            {:else if myPlayer.lockedThisRound}
              <span class="flex items-center gap-1.5 text-sm font-semibold text-destructive">
                <CircleX class="h-4 w-4" /> Locked out this round
              </span>
            {:else if snapshot.hit?.playerId === playerId}
              <span class="text-sm font-semibold text-primary">Quick — show your solution!</span>
            {:else}
              <Button size="lg" class="gap-2 shadow-lg shadow-primary/20" onclick={hit} disabled={!!snapshot.hit}>
                <Zap class="h-4 w-4" /> Hit!
              </Button>
            {/if}
          {/if}
        </div>

        {#if snapshot.puzzle}
          <div class="mathex-panel mt-4 rounded-3xl p-5 sm:p-7">
            {#if snapshot.roundComplete}
              <p class="text-center text-sm font-semibold text-muted-foreground">
                Round over. Waiting for the host to continue…
              </p>
            {:else if snapshot.mode === "hit" && snapshot.hit && snapshot.hit.playerId !== playerId}
              <p class="text-center text-sm font-semibold text-muted-foreground">
                {snapshot.players.find((player) => player.id === snapshot?.hit?.playerId)?.name ?? "Someone"} has the
                floor…
              </p>
            {/if}
            <div class="mt-2">
              <Board
                numbers={snapshot.puzzle.numbers}
                disabled={boardDisabled}
                solved={myPlayer?.solvedThisRound ?? false}
                startedAt={roundStartedAt}
                onSolved={handleSolved}
              />
            </div>
          </div>
        {/if}
      {:else if snapshot.state === "finished"}
        <section class="mathex-panel mt-4 rounded-3xl p-6 text-center sm:p-9">
          <div
            class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          >
            <Trophy class="h-7 w-7" />
          </div>
          <p class="mathex-kicker mt-4">Final result</p>
          <Header size="h2" class="mt-1 text-3xl">{snapshot.players[0]?.name ?? "Nobody"} wins!</Header>
          {#if isOwner}
            <div class="mt-6 flex flex-wrap justify-center gap-2">
              <Button class="gap-2" onclick={restart} disabled={!connected}><CirclePlay class="h-4 w-4" /> Play again</Button>
              <Button variant="outline" class="gap-2" onclick={leave}><LogOut class="h-4 w-4" /> Leave</Button>
            </div>
          {:else}
            <p class="mt-4 text-sm text-muted-foreground">
              Waiting for <span class="font-semibold text-foreground">{ownerName}</span> to start a new game…
            </p>
            <Button variant="outline" class="mt-5 gap-2" onclick={leave}><LogOut class="h-4 w-4" /> Leave</Button>
          {/if}
        </section>
      {/if}

      <section class="mathex-panel mt-4 rounded-3xl p-5">
        <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
          <Trophy class="h-3.5 w-3.5" /> {snapshot.state === "finished" ? "Final standings" : "Standings"}
        </div>
        <div class="mt-3 grid gap-1.5">
          {#each snapshot.players as player, index (player.id)}
            <div
              class="flex items-center gap-2 rounded-lg border p-2 {player.id === playerId
                ? 'border-primary/40 bg-primary/10'
                : 'border-border/60 bg-muted/30'}"
            >
              <div
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold {index === 0
                  ? 'bg-yellow-400 text-yellow-900'
                  : 'bg-muted text-muted-foreground'}"
              >
                {index + 1}
              </div>
              <span class="truncate text-sm font-medium {player.id === playerId ? 'text-primary' : ''}"
                >{player.name}{player.connected ? "" : " (away)"}</span
              >
              {#if isOwner && player.id !== playerId}
                <Button
                  variant="ghost"
                  size="icon"
                  class="ml-auto h-7 w-7"
                  aria-label="Remove {player.name}"
                  onclick={() => kick(player.id)}
                >
                  <UserX class="h-4 w-4" />
                </Button>
              {:else}
                <span class="ml-auto shrink-0 text-xs text-muted-foreground">
                  {#if snapshot.mode === "hit"}
                    {player.score} won · {player.failedHits} missed
                  {:else}
                    {formatMs(player.totalTimeMs)}
                  {/if}
                </span>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</div>

{#if confirmFinishOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div class="mathex-panel w-full max-w-sm rounded-3xl p-6">
      <h3 class="text-xl font-bold">End the game?</h3>
      <p class="mt-2 text-sm text-muted-foreground">Everyone will see the final standings.</p>
      <div class="mt-5 flex gap-2">
        <Button variant="outline" class="flex-1" onclick={() => (confirmFinishOpen = false)}>Cancel</Button>
        <Button variant="destructive" class="flex-1" onclick={finish}>End game</Button>
      </div>
    </div>
  </div>
{/if}