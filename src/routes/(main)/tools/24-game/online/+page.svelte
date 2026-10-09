<script lang="ts">
  import { goto } from "$app/navigation";
  import { Header } from "$lib/components/ui/header";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { createId } from "$lib/utils";
  import { io, type Socket } from "socket.io-client";
  import { onDestroy, onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import type {
    Game24ClientToServerEvents,
    Game24OnlineUser,
    Game24RoomSummary,
    Game24ServerToClientEvents
  } from "$lib/game24/schemas";
  import { Calculator, Lock, Plus, RefreshCw, Swords, Timer, Users, Zap } from "@lucide/svelte/icons";

  const socket: Socket<Game24ServerToClientEvents, Game24ClientToServerEvents> = io("/game24", {
    forceNew: true,
    autoConnect: false
  });
  onDestroy(() => socket.disconnect());

  let rooms = $state<Game24RoomSummary[]>([]);
  let online = $state<Game24OnlineUser[]>([]);
  let connected = $state(false);
  let name = $state("");
  let playerId = $state("");
  let creating = $state(false);
  let joiningCode = $state<string | null>(null);
  let passwordFor = $state<Game24RoomSummary | null>(null);
  let password = $state("");
  let showCreate = $state(false);

  let form = $state({
    roomName: "",
    format: "multi" as "1v1" | "multi",
    visibility: "public" as "public" | "password",
    password: "",
    mode: "hit" as "time" | "hit",
    difficulty: "normal" as "easy" | "normal" | "hard",
    totalRounds: 5,
    roundSeconds: 60,
    maxPlayers: 4,
    autoAdvance: true,
    autoAdvanceSeconds: 10
  });

  onMount(() => {
    try {
      const storedName = localStorage.getItem("game24-name");
      if (storedName) name = storedName;
      let storedId = localStorage.getItem("game24-player-id");
      if (!storedId) {
        storedId = createId();
        localStorage.setItem("game24-player-id", storedId);
      }
      playerId = storedId;
    } catch {}
    socket.connect();
  });

  socket.on("connect", () => (connected = true));
  socket.on("disconnect", () => (connected = false));
  socket.on("connect_error", () => toast.error("Could not reach the game server"));
  socket.on("lobby", (list, users) => {
    rooms = list;
    online = users;
  });
  socket.on("joined", (joinedName) => persistName(joinedName));
  socket.on("alert", (type, message) => {
    if (type === "normal" || type === "action" || type === "default") {
      toast(message);
    } else {
      const notify = toast[type];
      if (typeof notify === "function") notify(message);
      else toast(message);
    }
  });

  function persistName(value: string) {
    name = value;
    try {
      localStorage.setItem("game24-name", value);
    } catch {}
  }

  function requireName(): string | null {
    const clean = name.trim();
    if (!clean) {
      toast.error("Enter your name first");
      return null;
    }
    return clean;
  }

  function createRoom() {
    const clean = requireName();
    if (!clean) return;
    creating = true;
    socket.emit(
      "createRoom",
      {
        playerId,
        playerName: clean,
        name: form.roomName.trim() || (form.format === "1v1" ? `${clean}'s 1v1` : `${clean}'s room`),
        format: form.format,
        visibility: form.visibility,
        password: form.visibility === "password" ? form.password : undefined,
        mode: form.mode,
        difficulty: form.difficulty,
        totalRounds: Number(form.totalRounds),
        roundTimeMs: Math.round(Number(form.roundSeconds) * 1000),
        maxPlayers: form.format === "1v1" ? 2 : Number(form.maxPlayers),
        autoAdvance: form.autoAdvance,
        autoAdvanceSeconds: Number(form.autoAdvanceSeconds)
      },
      (res) => {
        creating = false;
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        persistName(clean);
        goto(`/tools/24-game/online/room?id=${res.code}`);
      }
    );
  }

  function joinRoom(room: Game24RoomSummary, pw?: string) {
    const clean = requireName();
    if (!clean) return;
    joiningCode = room.code;
    socket.emit("joinRoom", { code: room.code, playerId, playerName: clean, password: pw }, (res) => {
      joiningCode = null;
      if (!res.ok) {
        if (/password/i.test(res.error)) {
          passwordFor = room;
          password = "";
          return;
        }
        toast.error(res.error);
        return;
      }
      persistName(clean);
      goto(`/tools/24-game/online/room?id=${res.code}`);
    });
  }

  function requestJoin(room: Game24RoomSummary) {
    if (room.locked) {
      passwordFor = room;
      password = "";
      return;
    }
    joinRoom(room);
  }

  function submitPassword() {
    if (!passwordFor) return;
    const room = passwordFor;
    passwordFor = null;
    joinRoom(room, password);
  }

  function formatMs(ms: number) {
    const total = Math.floor(ms / 1000);
    return `${total}s`;
  }
</script>

<svelte:head><title>24 Game - Play online</title></svelte:head>

<div class="mathex-shell relative isolate min-h-full overflow-hidden py-8 sm:py-12">
  <div class="mathex-grid pointer-events-none absolute inset-x-0 top-0 h-[32rem] opacity-65"></div>
  <div class="pointer-events-none absolute -right-24 top-40 h-72 w-72 rounded-full bg-primary/10 blur-3xl"></div>

  <div class="relative mx-auto max-w-6xl px-4 sm:px-6">
    <header class="text-center">
      <a
        href="/tools/24-game"
        class="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/75 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary backdrop-blur-sm"
      >
        <Calculator class="h-3.5 w-3.5" /> 24 Game
      </a>
      <h1 class="mt-5 text-5xl font-bold tracking-[-0.06em] sm:text-6xl">
        Live games<span class="text-primary">.</span>
      </h1>
      <p class="mt-3 text-muted-foreground sm:text-lg">
        Challenge someone to a 1v1 or open a room. Jump into any game below, or start your own.
      </p>
      <span
        class="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold {connected
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'}"
      >
        <RefreshCw class="h-3 w-3 {connected ? '' : 'animate-spin'}" />
        {connected ? "Connected" : "Connecting…"}
      </span>
    </header>

    <div class="mt-8 rounded-3xl border border-border/70 bg-card/70 p-4 backdrop-blur-sm sm:p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div class="w-full sm:max-w-xs">
          <Label for="lobby-name" class="text-sm font-medium">Your name</Label>
          <Input
            id="lobby-name"
            class="mt-2"
            maxlength={20}
            placeholder="Enter your name"
            bind:value={name}
            onblur={() => name.trim() && persistName(name.trim())}
          />
        </div>
        <Button class="gap-2" onclick={() => (showCreate = !showCreate)}>
          <Plus class="h-4 w-4" /> Create a game
        </Button>
      </div>
    </div>

    <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section>
        <div class="flex items-center justify-between">
          <h2 class="flex items-center gap-2 text-lg font-bold">
            <Swords class="h-5 w-5 text-primary" /> Open games
            <span class="text-sm font-normal text-muted-foreground">({rooms.length})</span>
          </h2>
        </div>

        {#if rooms.length === 0}
          <div class="mathex-panel mt-4 rounded-3xl p-10 text-center">
            <Swords class="mx-auto h-8 w-8 text-muted-foreground" />
            <p class="mt-3 font-semibold">No open games right now</p>
            <p class="mt-1 text-sm text-muted-foreground">Create one and it will appear here for everyone.</p>
          </div>
        {:else}
          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            {#each rooms as room (room.code)}
              <article class="mathex-panel flex flex-col rounded-3xl p-5">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-lg font-bold">{room.name}</p>
                    <p class="mt-0.5 truncate text-xs text-muted-foreground">Hosted by {room.ownerName}</p>
                  </div>
                  {#if room.locked}
                    <span class="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      <Lock class="h-3 w-3" /> Locked
                    </span>
                  {/if}
                </div>

                <div class="mt-3 flex flex-wrap gap-1.5">
                  <span class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {#if room.format === "1v1"}<Swords class="h-3 w-3" /> 1v1{:else}<Users class="h-3 w-3" /> Room{/if}
                  </span>
                  <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                    {#if room.mode === "hit"}<Zap class="h-3 w-3" /> Hit &amp; solve{:else}<Timer class="h-3 w-3" /> Fastest time{/if}
                  </span>
                  <span class="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-semibold capitalize text-muted-foreground">
                    {room.difficulty}
                  </span>
                </div>

                <div class="mt-4 flex items-center justify-between">
                  <span class="text-sm text-muted-foreground">
                    {room.playerCount}/{room.maxPlayers} players
                  </span>
                  <Button
                    size="sm"
                    class="gap-1.5"
                    onclick={() => requestJoin(room)}
                    disabled={joiningCode === room.code || room.playerCount >= room.maxPlayers}
                  >
                    {#if room.format === "1v1"}<Swords class="h-3.5 w-3.5" /> Accept{:else}<Plus class="h-3.5 w-3.5" /> Join{/if}
                  </Button>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </section>

      <aside>
        <div class="mathex-panel rounded-3xl p-5 lg:sticky lg:top-24">
          <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            <Users class="h-3.5 w-3.5" /> Online
            <span class="font-normal text-muted-foreground">({online.length})</span>
          </div>
          <div class="mt-3 grid gap-1.5">
            {#each online as user (user.socketId)}
              <div class="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-2">
                <span
                  class="h-2 w-2 shrink-0 rounded-full {user.inRoom ? 'bg-amber-500' : 'bg-emerald-500'}"
                  title={user.inRoom ? "In a game" : "In the lobby"}
                ></span>
                <span
                  class="truncate text-sm font-medium {user.playerId && user.playerId === playerId
                    ? 'text-primary'
                    : ''}"
                >
                  {user.name ?? "Choosing a name…"}{#if user.playerId && user.playerId === playerId}&nbsp;(you){/if}
                </span>
                <span class="ml-auto shrink-0 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  {user.inRoom ? "Playing" : "Lobby"}
                </span>
              </div>
            {:else}
              <p class="text-sm text-muted-foreground">No one else is here yet.</p>
            {/each}
          </div>
        </div>
      </aside>

      {#if showCreate}
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div class="mathex-panel max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-3xl p-6 sm:p-8">
            <div
              class="sticky top-0 -mx-6 -mt-6 mb-4 flex items-center justify-between gap-2 border-b border-border/60 bg-card/95 px-6 py-4 backdrop-blur-sm sm:-mx-8 sm:-mt-8 sm:px-8"
            >
              <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
                <Plus class="h-3.5 w-3.5" /> Create a game
              </div>
              <button
                type="button"
                class="text-sm font-medium text-muted-foreground hover:text-foreground"
                onclick={() => (showCreate = false)}>Close</button
              >
            </div>
            <p class="text-sm text-muted-foreground">You will play too. Start whenever you are ready.</p>

            <form
              class="mt-5 grid gap-5"
              onsubmit={(event) => {
                event.preventDefault();
                createRoom();
              }}
            >
              <div class="grid gap-1.5">
                <Label for="create-name">Room name</Label>
                <Input id="create-name" bind:value={form.roomName} maxlength={60} placeholder="Optional" />
              </div>

              <div class="grid gap-1.5">
                <span class="text-sm font-medium">Format</span>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onclick={() => (form.format = "1v1")}
                    class={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${form.format === "1v1" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50"}`}
                  >
                    <Swords class="h-4 w-4" /> 1v1
                  </button>
                  <button
                    type="button"
                    onclick={() => (form.format = "multi")}
                    class={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${form.format === "multi" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50"}`}
                  >
                    <Users class="h-4 w-4" /> Room
                  </button>
                </div>
              </div>

              <div class="grid gap-1.5">
                <span class="text-sm font-medium">Scoring</span>
                <div class="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onclick={() => (form.mode = "hit")}
                    class={`rounded-xl border px-3 py-2 text-left transition-colors ${form.mode === "hit" ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50"}`}
                  >
                    <span class="flex items-center gap-2 text-sm font-bold"><Zap class="h-4 w-4 text-primary" /> Hit &amp; solve</span>
                    <span class="mt-0.5 block text-xs text-muted-foreground">Buzz first, then 5 seconds to show it.</span>
                  </button>
                  <button
                    type="button"
                    onclick={() => (form.mode = "time")}
                    class={`rounded-xl border px-3 py-2 text-left transition-colors ${form.mode === "time" ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50"}`}
                  >
                    <span class="flex items-center gap-2 text-sm font-bold"><Timer class="h-4 w-4 text-primary" /> Fastest time</span>
                    <span class="mt-0.5 block text-xs text-muted-foreground">Lowest total time across rounds wins.</span>
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="grid gap-1.5">
                  <Label for="create-difficulty">Difficulty</Label>
                  <select
                    id="create-difficulty"
                    bind:value={form.difficulty}
                    class="h-10 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="easy">Easy</option>
                    <option value="normal">Normal</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <div class="grid gap-1.5">
                  <Label for="create-rounds">Rounds</Label>
                  <Input id="create-rounds" type="number" min={1} max={50} bind:value={form.totalRounds} />
                </div>
                <div class="grid gap-1.5">
                  <Label for="create-seconds">Sec / round</Label>
                  <Input id="create-seconds" type="number" min={5} max={1800} bind:value={form.roundSeconds} />
                </div>
                {#if form.format === "multi"}
                  <div class="grid gap-1.5">
                    <Label for="create-max">Max players</Label>
                    <Input id="create-max" type="number" min={2} max={16} bind:value={form.maxPlayers} />
                  </div>
                {/if}
              </div>

              <div
                class="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background px-3 py-2.5"
              >
                <div class="flex items-center gap-2">
                  <Checkbox id="create-auto" bind:checked={form.autoAdvance} />
                  <label for="create-auto" class="text-sm font-medium">Auto-start next round</label>
                </div>
                {#if form.autoAdvance}
                  <div class="flex items-center gap-2">
                    <Input
                      class="h-9 w-20"
                      type="number"
                      min={5}
                      max={60}
                      aria-label="Seconds before the next round"
                      bind:value={form.autoAdvanceSeconds}
                    />
                    <span class="text-xs text-muted-foreground">sec</span>
                  </div>
                {/if}
              </div>

              <div class="grid gap-1.5">
                <span class="text-sm font-medium">Access</span>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onclick={() => (form.visibility = "public")}
                    class={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${form.visibility === "public" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:border-primary/50"}`}
                  >
                    Public
                  </button>
                  <button
                    type="button"
                    onclick={() => (form.visibility = "password")}
                    class={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${form.visibility === "password" ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:border-primary/50"}`}
                  >
                    <Lock class="h-3.5 w-3.5" /> Password
                  </button>
                </div>
                {#if form.visibility === "password"}
                  <Input
                    class="mt-1"
                    type="password"
                    maxlength={60}
                    placeholder="Room password"
                    bind:value={form.password}
                  />
                {/if}
              </div>

              <Button type="submit" size="lg" class="w-full shadow-lg shadow-primary/20" disabled={creating || !connected}>
                {creating ? "Creating…" : "Create & enter"}
              </Button>
            </form>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

{#if passwordFor}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div class="mathex-panel w-full max-w-sm rounded-3xl p-6">
      <p class="mathex-kicker">Password required</p>
      <h3 class="mt-1 text-xl font-bold">{passwordFor.name}</h3>
      <form
        class="mt-4"
        onsubmit={(event) => {
          event.preventDefault();
          submitPassword();
        }}
      >
        <Label for="room-password">Password</Label>
        <Input id="room-password" class="mt-2" type="password" maxlength={60} bind:value={password} autofocus />
        <div class="mt-5 flex gap-2">
          <Button type="button" variant="outline" class="flex-1" onclick={() => (passwordFor = null)}>Cancel</Button>
          <Button type="submit" class="flex-1" disabled={!password}>Join</Button>
        </div>
      </form>
    </div>
  </div>
{/if}