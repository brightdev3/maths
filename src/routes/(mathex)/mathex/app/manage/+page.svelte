<script lang="ts">
  import { page } from "$app/state";

  import { io, type Socket } from "socket.io-client";
  import {
    type RoomManageServerToClientEvents,
    type RoomManageClientToServerEvents,
    type RoomSettings,
    type RoomState,
    type RoomSocketData,
    type LogEntry,
    type LeaderboardEntry,
    type LogVerbosity
  } from "$lib/mathex/schemas";

  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { Header } from "$lib/components/ui/header";
  import { Label } from "$lib/components/ui/label";
  import { Progress } from "$lib/components/ui/progress";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import * as Select from "$lib/components/ui/select";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import {
    CHAT_DISCLAIMER,
    dismissChatDisclaimer,
    hasDismissedChatDisclaimer
  } from "$lib/mathex/chat-disclaimer";
  import Identicon from "$lib/components/Identicon.svelte";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import Copy from "@lucide/svelte/icons/copy";
  import Radio from "@lucide/svelte/icons/radio";
  import UsersRound from "@lucide/svelte/icons/users-round";
  import UserX from "@lucide/svelte/icons/user-x";
  import Settings from "@lucide/svelte/icons/settings";
  import ScrollText from "@lucide/svelte/icons/scroll-text";
  import X from "@lucide/svelte/icons/x";

  const roomId = page.url.searchParams.get("id");
  const runToken = page.url.searchParams.get("runToken");

  import { toast } from "svelte-sonner";
  import { copyText, msToMinutesAndSeconds } from "$lib/utils";
  import { fade, slide } from "svelte/transition";
  import { flip } from "svelte/animate";

  const socket: Socket<RoomManageServerToClientEvents, RoomManageClientToServerEvents> = io(`/manage-${roomId}`, {
    query: {
      runToken
    },
    forceNew: true
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
  socket.on("connect", () => {
    toast.success("Connected!");
  });
  socket.on("connect_error", () => toast.error("Failed to connect!"));
  socket.on("disconnect", () => toast.warning("Disconnected!"));
  let players: RoomSocketData[] = $state([]);
  socket.on("playerData", (data) => (players = data));
  let currentState: RoomState = $state("lobby");
  socket.on("state", (state) => (currentState = state));
  let roomSettings: RoomSettings | null = $state(null);
  socket.on("roomSettings", (settings) => (roomSettings = settings));
  let endsAt: number | null = $state(null);
  socket.on("gameEndsAt", (deadline) => (endsAt = deadline));
  let timerMinutes = $state(5);
  let chatDialogOpen = $state(false);
  let chatDontShowAgain = $state(false);

  function requestChatToggle(on: boolean) {
    if (!on) {
      socket.emit("updateSettings", { allowChat: false });
      return;
    }
    if (hasDismissedChatDisclaimer()) {
      socket.emit("updateSettings", { allowChat: true });
      return;
    }
    chatDontShowAgain = false;
    chatDialogOpen = true;
  }

  function confirmChatDialog() {
    if (chatDontShowAgain) dismissChatDisclaimer();
    socket.emit("updateSettings", { allowChat: true });
    chatDialogOpen = false;
  }
  let endsInMs = $derived.by(() => {
    void tick;
    return endsAt ? Math.max(0, endsAt - Date.now()) : null;
  });

  let totalQuestions = $derived(players.length > 0 ? players[0].totalQuestions : 0);

  let alertTypes = ["normal", "action", "success", "info", "warning", "error", "loading", "default"] as const;
  let alertType: (typeof alertTypes)[number] | undefined = $state(undefined);
  let alertText = $state("");

  let logs: LogEntry[] = $state([]);
  socket.on("logs", (data) => (logs = data));
  socket.on("log", (entry) => {
    logs = [...logs, entry];
  });

  const HOST_SETTINGS_KEY = "mathex-host-settings";
  type HostSettings = {
    scoreTimesFive?: boolean;
    view?: "list" | "tiles";
    showExtras?: boolean;
    animations?: boolean;
  };
  function readHostSettings(): HostSettings {
    try {
      if (typeof localStorage === "undefined") return {};
      const raw = localStorage.getItem(HOST_SETTINGS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }
  const initialHostSettings = readHostSettings();

  let verbosity: LogVerbosity = $state("all");
  let logsOpen = $state(false);
  let settingsOpen = $state(false);
  // Scores are always visible; this only toggles the x5 multiplier. On by default.
  let scoreTimesFive: boolean = $state(initialHostSettings.scoreTimesFive ?? true);
  // List is the classic side-by-side view and the default; tiles focus on player cards.
  let viewMode: "list" | "tiles" = $state(initialHostSettings.view ?? "list");
  // Hides the controls/logs/results column so hosts can focus on players alone.
  let showExtras: boolean = $state(initialHostSettings.showExtras ?? true);
  // Master switch for view/tab/panel transitions and position animations.
  let animations: boolean = $state(initialHostSettings.animations ?? true);
  let fadeParams = $derived({ duration: animations ? 150 : 0 });
  let slideParams = $derived({ duration: animations ? 200 : 0 });
  let flipParams = $derived({ duration: animations ? 250 : 0 });
  // Small-screen tab for the list view (players vs everything else).
  let mobileTab: "players" | "extras" = $state("players");

  $effect(() => {
    try {
      const raw = localStorage.getItem(HOST_SETTINGS_KEY);
      const current: HostSettings = raw ? (JSON.parse(raw) as HostSettings) : {};
      current.scoreTimesFive = scoreTimesFive;
      current.view = viewMode;
      current.showExtras = showExtras;
      current.animations = animations;
      localStorage.setItem(HOST_SETTINGS_KEY, JSON.stringify(current));
    } catch {
      // Storage unavailable (e.g. private mode): keep settings in memory only.
    }
  });

  // Keep the small-screen tab on players when extras are hidden.
  $effect(() => {
    if (!showExtras && mobileTab === "extras") mobileTab = "players";
  });

  let filteredLogs = $derived.by(() => {
    if (verbosity === "all") return logs;
    if (verbosity === "submissions")
      return logs.filter((l) => l.type === "submitted" || l.type === "correct" || l.type === "wrong" || l.type === "skipped");
    if (verbosity === "finished")
      return logs.filter(
        (l) => l.type === "finished" || l.type === "correct" || l.type === "wrong" || l.type === "visibility"
      );
    return logs;
  });

  // Fallback for rooms created before per-player correct counts were tracked.
  let correctByName = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const log of logs) {
      if (log.type === "correct") counts.set(log.playerName, (counts.get(log.playerName) ?? 0) + 1);
    }
    return counts;
  });

  function correctOf(player: RoomSocketData): number {
    if (typeof player.correctCount === "number") return player.correctCount;
    return correctByName.get(player.name ?? "") ?? 0;
  }

  function displayScoreOf(player: RoomSocketData): number {
    const correct = correctOf(player);
    return scoreTimesFive ? correct * 5 : correct;
  }

  // Primary rank: score, then elapsed time.
  let sortedPlayers = $derived.by(() => {
    void tick;
    const elapsedOf = (p: RoomSocketData) =>
      p.startingTime ? (p.finishingTime ?? Date.now()) - p.startingTime : Number.POSITIVE_INFINITY;
    return [...players].sort((a, b) => {
      const byScore = correctOf(b) - correctOf(a);
      if (byScore !== 0) return byScore;
      const byTime = elapsedOf(a) - elapsedOf(b);
      if (byTime !== 0 && Number.isFinite(byTime)) return byTime;
      if (b.currentQuestion !== a.currentQuestion) return b.currentQuestion - a.currentQuestion;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  });

  function onQuestion(player: RoomSocketData): number {
    if (totalQuestions > 0) return Math.min(Math.max(player.currentQuestion, 1), totalQuestions);
    return player.currentQuestion;
  }

  function leaderboardCorrect(entry: LeaderboardEntry): number {
    return Math.max(0, entry.questionsCompleted - entry.skips);
  }

  function leaderboardScore(entry: LeaderboardEntry): number {
    const correct = leaderboardCorrect(entry);
    return scoreTimesFive ? correct * 5 : correct;
  }

  let leaderboard: LeaderboardEntry[] = $state([]);
  socket.on("leaderboard", (data) => (leaderboard = data));

  // Two-click confirm for kicking a player.
  let kickArmed: string | null = $state(null);
  let kickArmTimer: ReturnType<typeof setTimeout> | null = null;
  function askKick(playerId: string | null) {
    if (!playerId) return;
    if (kickArmed === playerId) {
      if (kickArmTimer) clearTimeout(kickArmTimer);
      kickArmed = null;
      socket.emit("kick", playerId);
      toast.success("Player kicked");
    } else {
      if (kickArmTimer) clearTimeout(kickArmTimer);
      kickArmed = playerId;
      kickArmTimer = setTimeout(() => (kickArmed = null), 4000);
    }
  }

  let exportFormat: "json" | "csv" = $state("json");

  let tick = $state(0);
  setInterval(() => tick++, 1000);

  function exportScores() {
    if (leaderboard.length === 0) {
      toast.error("No results to export yet!");
      return;
    }
    let content: string;
    let filename: string;
    let mimeType: string;

    if (exportFormat === "json") {
      content = JSON.stringify(leaderboard, null, 2);
      filename = `mathex-results-${roomId}.json`;
      mimeType = "application/json";
    } else {
      const header = "Rank,Name,Time (ms),Time,Questions Completed,Total Questions";
      const rows = leaderboard.map(
        (e) =>
          `${e.rank},"${e.name}",${e.totalMs ?? "DNF"},${e.totalMs ? msToMinutesAndSeconds(e.totalMs) : "DNF"},${e.questionsCompleted},${e.totalQuestions}`
      );
      content = [header, ...rows].join("\n");
      filename = `mathex-results-${roomId}.csv`;
      mimeType = "text/csv";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${exportFormat.toUpperCase()} results!`);
  }

  async function copyRoomCode() {
    try {
      await copyText(roomId || "");
      toast.success("Room code copied");
    } catch {
      toast.error("Could not copy room code");
    }
  }
</script>

{#snippet logList()}
  {#each filteredLogs as log}
    <div
      class="flex gap-2 py-0.5 {log.type === 'correct'
        ? 'text-emerald-600 dark:text-emerald-400'
        : log.type === 'wrong'
          ? 'text-red-600 dark:text-red-400'
          : log.type === 'skipped'
            ? 'text-amber-600 dark:text-amber-400'
            : log.type === 'finished'
              ? 'text-yellow-600 dark:text-yellow-400 font-bold'
              : 'text-muted-foreground'}"
    >
      <span class="shrink-0 text-muted-foreground/60">{new Date(log.timestamp).toLocaleTimeString()}</span>
      <span class="shrink-0 font-semibold">{log.playerName}</span>
      <span>
        {#if log.type === "submitted"}
          submitted Q{log.questionNumber}{verbosity === "all" ? `: ${log.detail}` : ""}
        {:else if log.type === "correct"}
          Q{log.questionNumber} correct
        {:else if log.type === "wrong"}
          Q{log.questionNumber} wrong{verbosity === "all" ? ` (${log.detail})` : ""}
        {:else if log.type === "skipped"}
          skipped Q{log.questionNumber}
        {:else if log.type === "kicked"}
          was kicked from the game
        {:else if log.type === "finished"}
          finished all questions
        {:else if log.type === "visibility"}
          {log.detail}
        {:else}
          {log.type}
        {/if}
      </span>
    </div>
  {:else}
    <p class="italic text-muted-foreground">No logs yet</p>
  {/each}
{/snippet}

{#snippet settingsPanel(uid: string)}
  <div class="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-border bg-card p-4 shadow-xl">
    <p class="text-sm font-bold">Display settings</p>
    <p class="mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">View</p>
    <div
      class="mt-1.5 grid grid-cols-2 gap-1 rounded-lg border border-border/60 bg-muted/40 p-1"
      role="group"
      aria-label="Layout view"
    >
      <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" onclick={() => (viewMode = "list")}
        >List</Button
      >
      <Button variant={viewMode === "tiles" ? "default" : "ghost"} size="sm" onclick={() => (viewMode = "tiles")}
        >Tiles</Button
      >
    </div>
    <div class="mt-3 flex items-center gap-2">
      <Checkbox id="showExtras-{uid}" bind:checked={showExtras} />
      <Label for="showExtras-{uid}" class="cursor-pointer text-sm">Show controls & results</Label>
    </div>
    <div class="mt-2.5 flex items-center gap-2">
      <Checkbox id="scoreTimesFive-{uid}" bind:checked={scoreTimesFive} />
      <Label for="scoreTimesFive-{uid}" class="cursor-pointer text-sm">Multiply score by 5</Label>
    </div>
    <div class="mt-2.5 flex items-center gap-2">
      <Checkbox id="animations-{uid}" bind:checked={animations} />
      <Label for="animations-{uid}" class="cursor-pointer text-sm">Enable animations</Label>
    </div>
  </div>
{/snippet}

{#snippet alertsPanel()}
  <div class="mathex-panel rounded-2xl p-5 sm:p-6">
    <Header size="h2">Alerts</Header>
    <form
      class="mt-4 flex w-full flex-col gap-3 sm:flex-row"
      onsubmit={(e) => {
        e.preventDefault();
        if (alertType === undefined) {
          toast.error("Choose an alert type!");
          return;
        }
        if (!alertText) {
          toast.error("Write some alert text!");
          return;
        }
        socket.emit("alertAll", alertType, alertText);
        alertText = "";
      }}
    >
      <Select.Root type="single" bind:value={alertType}>
        <Select.Trigger class="w-full sm:w-[180px]">
          {alertType ? alertType.charAt(0).toUpperCase() + alertType.substring(1).toLowerCase() : "Alert Type"}
        </Select.Trigger>
        <Select.Content>
          {#each alertTypes as type}
            <Select.Item value={type}>{type.charAt(0).toUpperCase() + type.substring(1).toLowerCase()}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
      <Input bind:value={alertText} class="flex-1" placeholder="Alert Text" />
      <Button type="submit">Send</Button>
    </form>
  </div>
{/snippet}

{#snippet leaderboardPanel()}
  {#if currentState === "finished" && leaderboard.length > 0}
    <div class="mathex-panel rounded-2xl p-5 sm:p-6">
      <div class="flex items-center justify-between">
        <Header size="h2">Leaderboard</Header>
        <div class="flex items-center gap-2">
          <Select.Root type="single" bind:value={exportFormat}>
            <Select.Trigger class="w-[80px]">
              {exportFormat.toUpperCase()}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="json">JSON</Select.Item>
              <Select.Item value="csv">CSV</Select.Item>
            </Select.Content>
          </Select.Root>
          <Button variant="outline" size="sm" onclick={exportScores}>Export</Button>
        </div>
      </div>
      <div class="mt-4 flex max-h-64 flex-col gap-1.5 overflow-y-auto scrollbar-thin">
        {#each leaderboard as entry}
          <div class="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-2.5">
            <div
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold {entry.rank ===
              1
                ? 'bg-yellow-400 text-yellow-900'
                : entry.rank === 2
                  ? 'bg-gray-300 text-gray-700'
                  : entry.rank === 3
                    ? 'bg-amber-600 text-white'
                    : 'bg-muted text-muted-foreground'}"
            >
              {entry.rank}
            </div>
            <Identicon className="w-8 h-8 shrink-0" seed={entry.name} />
            <div class="min-w-0 flex-1">
              <span class="truncate text-sm font-medium">{entry.name}</span>
            </div>
            {#if entry.visibilityFlags > 0}
              <span class="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                <TriangleAlert class="h-3.5 w-3.5" />
                {entry.visibilityFlags}
              </span>
            {/if}
            <div class="shrink-0 text-right">
              <span class="text-lg font-black tabular-nums">{leaderboardScore(entry)}</span>
              <span class="ml-1 text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground"
                >{scoreTimesFive ? "pts" : "correct"}</span
              >
              <div class="text-xs text-muted-foreground">
                {entry.totalMs !== null ? msToMinutesAndSeconds(entry.totalMs) : "DNF"} &middot; {entry.questionsCompleted}/{entry.totalQuestions}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
{/snippet}

{#snippet logsPanel(uid: string)}
  <Header size="h2">Logs ({filteredLogs.length})</Header>
  <div class="mt-3">
    <Select.Root type="single" bind:value={verbosity}>
      <Select.Trigger class="w-full">
        {verbosity === "all" ? "All activity" : verbosity === "submissions" ? "Answers" : "Results & tabs"}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="all">All activity</Select.Item>
        <Select.Item value="submissions">Answers only</Select.Item>
        <Select.Item value="finished">Results & tab activity</Select.Item>
      </Select.Content>
    </Select.Root>
  </div>
  <div
    class="mt-3 max-h-72 overflow-y-auto rounded-lg border border-border/40 bg-muted/20 p-2 font-mono text-xs scrollbar-thin"
  >
    {@render logList()}
  </div>
{/snippet}

{#snippet gameOptionsPanel(uid: string)}
  <div class="mathex-panel rounded-2xl p-5 sm:p-6">
    <Header size="h2">Game options</Header>
    {#if roomSettings}
      <div class="mt-4 space-y-4">
        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-muted-foreground">End conditions</p>
          <div class="mt-2 flex items-center gap-2">
            <Checkbox
              id="endOnPerfect-{uid}"
              checked={roomSettings.endOnPerfectScore}
              onCheckedChange={(checked) => socket.emit("updateSettings", { endOnPerfectScore: checked === true })}
            />
            <Label for="endOnPerfect-{uid}" class="cursor-pointer text-sm">End on perfect score</Label>
          </div>
          <div class="mt-3 rounded-xl border border-border/60 p-3">
            {#if currentState === "started"}
              <p class="text-sm">
                {#if endsInMs !== null}
                  Timer ends in <span class="font-bold tabular-nums">{msToMinutesAndSeconds(endsInMs)}</span>
                {:else}
                  <span class="text-muted-foreground">No timer running</span>
                {/if}
              </p>
            {:else if roomSettings.gameTimerMs}
              <p class="text-sm">
                Timer set: <span class="font-bold tabular-nums"
                  >{msToMinutesAndSeconds(roomSettings.gameTimerMs)}</span
                >
              </p>
            {:else}
              <p class="text-sm text-muted-foreground">No timer set</p>
            {/if}
            <div class="mt-2 flex gap-2">
              <Input
                type="number"
                min={1}
                max={180}
                bind:value={timerMinutes}
                class="w-24"
                aria-label="Timer minutes"
              />
              <Button size="sm" onclick={() => socket.emit("setGameTimer", timerMinutes)}>Set timer</Button>
              <Button size="sm" variant="outline" onclick={() => socket.emit("setGameTimer", null)}>Cancel</Button>
            </div>
            <p class="mt-1.5 text-xs text-muted-foreground">
              {currentState === "started"
                ? "Minutes from now. Overrides the setup timer."
                : "Applies when the game starts."}
            </p>
          </div>
        </div>
        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Access</p>
          <div class="mt-2 flex items-center gap-2">
            <Checkbox
              id="allowLateJoin-{uid}"
              checked={roomSettings.allowLateJoin}
              onCheckedChange={(checked) => socket.emit("updateSettings", { allowLateJoin: checked === true })}
            />
            <Label for="allowLateJoin-{uid}" class="cursor-pointer text-sm">Allow late joining</Label>
          </div>
        </div>
        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Player tools</p>
          <div class="mt-2 space-y-2">
            <div class="flex items-center gap-2">
              <Checkbox
                id="showLeaderboard-{uid}"
                checked={roomSettings.showLeaderboard}
                onCheckedChange={(checked) => socket.emit("updateSettings", { showLeaderboard: checked === true })}
              />
              <Label for="showLeaderboard-{uid}" class="cursor-pointer text-sm">Live leaderboard</Label>
            </div>
            <div class="flex items-center gap-2">
              <Checkbox
                id="allowCalculator-{uid}"
                checked={roomSettings.allowCalculator}
                onCheckedChange={(checked) => socket.emit("updateSettings", { allowCalculator: checked === true })}
              />
              <Label for="allowCalculator-{uid}" class="cursor-pointer text-sm">Calculator</Label>
            </div>
            <div class="flex items-center gap-2">
              <Checkbox
                id="allowChat-{uid}"
                checked={roomSettings.allowChat}
                onCheckedChange={(checked) => requestChatToggle(checked === true)}
              />
              <Label for="allowChat-{uid}" class="cursor-pointer text-sm">Player chat</Label>
            </div>
            <div class="flex items-center gap-2">
              <Checkbox
                id="allowSketch-{uid}"
                checked={roomSettings.allowSketch}
                onCheckedChange={(checked) => socket.emit("updateSettings", { allowSketch: checked === true })}
              />
              <Label for="allowSketch-{uid}" class="cursor-pointer text-sm">Sketch pad</Label>
            </div>
          </div>
        </div>
      </div>
    {:else}
      <p class="mt-3 text-sm text-muted-foreground">Loading game options…</p>
    {/if}
  </div>
{/snippet}

{#snippet extrasStack(uid: string)}
  <div class="flex min-w-0 flex-col gap-4">
    {@render alertsPanel()}
    {@render gameOptionsPanel(uid)}
    {@render leaderboardPanel()}
    <div class="mathex-panel rounded-2xl p-5 sm:p-6">
      {@render logsPanel(uid)}
    </div>
  </div>
{/snippet}

{#snippet kickButton(player: RoomSocketData)}
  {@const key = player.playerId ?? player.name ?? ""}
  {#if key}
    <button
      type="button"
      onclick={() => askKick(player.playerId)}
      title={kickArmed === key ? "Click again to confirm kick" : "Kick player"}
      aria-label={kickArmed === key ? `Confirm kick ${player.name}` : `Kick ${player.name}`}
      class="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors {kickArmed ===
      key
        ? 'bg-destructive text-destructive-foreground'
        : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'}"
    >
      <UserX class="h-3.5 w-3.5" />
      {#if kickArmed === key}<span>Kick?</span>{/if}
    </button>
  {/if}
{/snippet}

{#snippet playerListPanel(uid: string)}
  <div class="mathex-panel min-w-0 rounded-2xl p-5 sm:p-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <Header size="h2" class="text-2xl">Players</Header><span
          class="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary"
          ><UsersRound class="h-3.5 w-3.5" />{players.length} joined</span
        >
      </div>
      <div class="relative">
        <Button variant="outline" size="sm" onclick={() => (settingsOpen = !settingsOpen)} aria-label="Display settings">
          <Settings class="h-4 w-4" /> Settings
        </Button>
        {#if settingsOpen}
          {@render settingsPanel(uid)}
        {/if}
      </div>
    </div>
    <div class="mt-4 flex max-h-[55vh] flex-col gap-2 overflow-y-auto scrollbar-thin lg:max-h-[32rem]">
      {#each sortedPlayers as player, i (player.playerId ?? player.name)}
        {@const correct = correctOf(player)}
        {@const scoreProgress = totalQuestions > 0 ? (correct / totalQuestions) * 100 : 0}
        {@const elapsed =
          tick >= 0 && player.startingTime ? (player.finishingTime || Date.now()) - player.startingTime : null}
        <div
          animate:flip={flipParams}
          class="flex items-center gap-3 rounded-lg border-2 border-solid p-3 transition-colors {player.startingTime
            ? player.finishingTime
              ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
              : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
            : 'bg-muted/50 border-border'}"
        >
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold {player.finishingTime
              ? 'bg-emerald-500 text-white'
              : player.startingTime
                ? 'bg-red-500 text-white'
                : 'bg-muted text-muted-foreground'}"
          >
            {i + 1}
          </div>
          <Identicon className="w-10 h-10 shrink-0" seed={player.name || "Choosing..."} />
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-bold">{player.name || "Choosing..."}</span>
              {#if elapsed !== null}
                <span class="shrink-0 text-xs tabular-nums text-muted-foreground"
                  >{msToMinutesAndSeconds(elapsed)}</span
                >
              {/if}
            </div>
            <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {#if currentState === "started" || currentState === "finished"}
                <span class="font-semibold text-foreground">Q{onQuestion(player)}/{totalQuestions}</span>
                {#if scoreTimesFive}
                  <span>{correct} correct</span>
                {/if}
              {/if}
              {#if player.visibilityFlags > 0}
                <span class="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <TriangleAlert class="h-3.5 w-3.5" />
                  {player.visibilityFlags}
                </span>
              {/if}
              {@render kickButton(player)}
            </div>
            {#if currentState === "started" || currentState === "finished"}
              <div class="mt-1.5 flex items-center gap-2">
                <Progress value={scoreProgress} class="h-2 flex-1" />
              </div>
            {/if}
          </div>
          {#if currentState === "started" || currentState === "finished"}
            <div class="shrink-0 text-right" aria-label="{player.name} score {displayScoreOf(player)}">
              <div class="text-2xl font-black tabular-nums leading-none">{displayScoreOf(player)}</div>
              <div class="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                {scoreTimesFive ? "pts" : "correct"}
              </div>
            </div>
          {/if}
        </div>
      {:else}
        <p class="italic text-sm text-muted-foreground">No players yet</p>
      {/each}
    </div>
  </div>
{/snippet}

<div class="mathex-shell min-h-screen p-4 sm:p-6">
  <AlertDialog.Root bind:open={chatDialogOpen}>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>Enable player chat?</AlertDialog.Title>
        <AlertDialog.Description>{CHAT_DISCLAIMER}</AlertDialog.Description>
      </AlertDialog.Header>
      <div class="flex items-center gap-2">
        <Checkbox id="chat-disclaimer-manage" bind:checked={chatDontShowAgain} />
        <Label for="chat-disclaimer-manage" class="cursor-pointer text-sm">Don't show this again</Label>
      </div>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
        <AlertDialog.Action onclick={confirmChatDialog}>I understand</AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
  <main class="mx-auto flex w-full max-w-7xl flex-col gap-4">
    <header class="flex flex-col justify-between gap-4 py-2 sm:flex-row sm:items-end">
      <div>
        <p class="mathex-kicker">Host control room</p>
        <Header size="h1" class="mt-1 text-3xl tracking-[-0.04em]">Competition dashboard</Header>
      </div>
      <span
        class="flex w-fit items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400"
        ><Radio class="h-3.5 w-3.5" />
        {currentState === "lobby" ? "LOBBY OPEN" : currentState === "started" ? "ROUND LIVE" : "ROUND FINISHED"}</span
      >
    </header>
    <div class="mathex-panel rounded-2xl p-5 sm:p-6">
      <div class="flex flex-col items-center justify-center gap-3 text-center sm:flex-row sm:gap-5">
        <span class="text-sm text-muted-foreground"
          >Players join at <span class="font-mono font-medium text-foreground">{page.url.host}/mathex/app/play</span
          ></span
        >
        <button
          type="button"
          class="group flex items-center gap-3 rounded-xl bg-primary px-4 py-2.5 text-primary-foreground shadow-lg shadow-primary/20"
          onclick={copyRoomCode}
          ><span class="text-2xl font-bold tracking-[0.08em] sm:text-3xl">{roomId}</span><Copy
            class="h-4 w-4 opacity-75 transition-opacity group-hover:opacity-100"
          /></button
        >
      </div>
    </div>

    {#key viewMode}
      <div in:fade={fadeParams}>
        {#if viewMode === "list"}
          {#if showExtras}
            <div
              class="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1 lg:hidden"
              role="tablist"
              aria-label="Host panels"
            >
              <Button
                variant={mobileTab === "players" ? "default" : "ghost"}
                size="sm"
                onclick={() => (mobileTab = "players")}
                role="tab"
                aria-selected={mobileTab === "players"}>Players</Button
              >
              <Button
                variant={mobileTab === "extras" ? "default" : "ghost"}
                size="sm"
                onclick={() => (mobileTab = "extras")}
                role="tab"
                aria-selected={mobileTab === "extras"}>Controls & logs</Button
              >
            </div>
          {/if}
          <div class="lg:hidden">
            {#key mobileTab}
              <div in:fade={fadeParams}>
                {#if mobileTab === "players" || !showExtras}
                  {@render playerListPanel("list-mobile")}
                {:else}
                  {@render extrasStack("list-mobile")}
                {/if}
              </div>
            {/key}
          </div>
          <div
            class="hidden items-start gap-4 transition-all duration-300 lg:grid {showExtras
              ? 'lg:grid-cols-2'
              : 'lg:grid-cols-1'}"
          >
            {@render playerListPanel("list-desktop")}
            {#if showExtras}
              <div transition:slide={slideParams}>
                {@render extrasStack("list-desktop")}
              </div>
            {/if}
          </div>
        {:else}
          <div
            class="grid items-start gap-4 transition-all duration-300 {showExtras
              ? '2xl:grid-cols-[minmax(0,1fr)_360px]'
              : ''}"
          >
      <div class="flex min-w-0 flex-col gap-4">
        <div class="mathex-panel rounded-2xl p-5 sm:p-6">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <Header size="h2" class="text-2xl">Players</Header><span
                class="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary"
                ><UsersRound class="h-3.5 w-3.5" />{players.length} joined</span
              >
            </div>
            <div class="flex items-center gap-2">
              <div class="relative">
                <Button variant="outline" size="sm" onclick={() => (settingsOpen = !settingsOpen)} aria-label="Display settings">
                  <Settings class="h-4 w-4" /> Settings
                </Button>
                {#if settingsOpen}
                  {@render settingsPanel("tiles")}
                {/if}
              </div>
              {#if showExtras}
                <Button variant="outline" size="sm" class="2xl:hidden" onclick={() => (logsOpen = !logsOpen)}>
                  <ScrollText class="h-4 w-4" /> {logsOpen ? "Hide logs" : "Show logs"} ({filteredLogs.length})
                </Button>
              {/if}
            </div>
          </div>
          <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {#each sortedPlayers as player, i (player.playerId ?? player.name)}
              {@const correct = correctOf(player)}
              {@const scoreProgress = totalQuestions > 0 ? (correct / totalQuestions) * 100 : 0}
              {@const elapsed =
                tick >= 0 && player.startingTime ? (player.finishingTime || Date.now()) - player.startingTime : null}
              <div
                animate:flip={flipParams}
                class="flex flex-col gap-2 rounded-xl border-2 border-solid p-3 transition-colors {player.startingTime
                  ? player.finishingTime
                    ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800'
                    : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                  : 'bg-muted/50 border-border'}"
              >
                <div class="flex items-center gap-2.5">
                  <div
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold {player.finishingTime
                      ? 'bg-emerald-500 text-white'
                      : player.startingTime
                        ? 'bg-red-500 text-white'
                        : 'bg-muted text-muted-foreground'}"
                  >
                    {i + 1}
                  </div>
                  <Identicon className="w-10 h-10 shrink-0" seed={player.name || "Choosing..."} />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="truncate text-sm font-bold">{player.name || "Choosing..."}</span>
                      {#if elapsed !== null}
                        <span class="shrink-0 text-xs tabular-nums text-muted-foreground"
                          >{msToMinutesAndSeconds(elapsed)}</span
                        >
                      {/if}
                    </div>
                    <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {#if currentState === "started" || currentState === "finished"}
                        <span class="font-semibold text-foreground">Q{onQuestion(player)}/{totalQuestions}</span>
                        {#if scoreTimesFive}
                          <span>{correct} correct</span>
                        {/if}
                      {/if}
                      {#if player.visibilityFlags > 0}
                        <span
                          class="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400"
                        >
                          <TriangleAlert class="h-3.5 w-3.5" />
                          {player.visibilityFlags}
                        </span>
                      {/if}
                      {@render kickButton(player)}
                    </div>
                  </div>
                  {#if currentState === "started" || currentState === "finished"}
                    <div class="shrink-0 text-right" aria-label="{player.name} score {displayScoreOf(player)}">
                      <div class="text-2xl font-black tabular-nums leading-none">{displayScoreOf(player)}</div>
                      <div class="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                        {scoreTimesFive ? "pts" : "correct"}
                      </div>
                    </div>
                  {/if}
                </div>
                {#if currentState === "started" || currentState === "finished"}
                  <div class="flex items-center gap-2">
                    <Progress value={scoreProgress} class="h-2 flex-1" />
                  </div>
                {/if}
              </div>
            {:else}
              <p class="italic text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">No players yet</p>
            {/each}
          </div>
        </div>

        {#if showExtras && logsOpen}
          <div class="mathex-panel rounded-2xl p-5 sm:p-6 2xl:hidden" transition:slide={slideParams}>
            <div class="flex items-center justify-end">
              <Button variant="outline" size="sm" onclick={() => (logsOpen = false)} aria-label="Hide logs">
                <X class="h-4 w-4" />
              </Button>
            </div>
            <div class="mt-2">
              {@render logsPanel("tiles-mobile")}
            </div>
          </div>
        {/if}

        {#if showExtras}
          <div class="grid items-start gap-4 xl:grid-cols-2" transition:slide={slideParams}>
            {@render alertsPanel()}
            {@render gameOptionsPanel("tiles")}
            {@render leaderboardPanel()}
          </div>
        {/if}
      </div>

      {#if showExtras}
        <div class="mathex-panel hidden rounded-2xl p-5 sm:p-6 2xl:block" transition:fade={fadeParams}>
          {@render logsPanel("tiles-desktop")}
        </div>
      {/if}
          </div>
        {/if}
      </div>
    {/key}

    {#if currentState !== "finished"}
      <Button
        onclick={() => {
          if (currentState === "lobby") {
            socket.emit("start");
            currentState = "started";
          } else {
            socket.emit("finish");
            currentState = "finished";
          }
        }}
        class="w-full shadow-lg shadow-primary/20 sm:w-auto"
        size="lg">{currentState === "lobby" ? "Start" : "Finish"} Game</Button
      >
    {/if}
  </main>
</div>
