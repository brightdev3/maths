<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Confetti } from "svelte-confetti";
  import { Calculator, Lightbulb, RefreshCw, RotateCcw, Swords, Trophy } from "@lucide/svelte/icons";
  import {
    addFractions,
    divideFractions,
    equalFractions,
    fraction,
    formatFraction,
    generatePuzzle,
    maxFor,
    multiplyFractions,
    operatorSymbols,
    subtractFractions,
    type Difficulty,
    type Fraction,
    type Operator
  } from "$lib/game24/engine";

  type Tile = { id: number; value: Fraction; expr: string };

  let nextTileId = 0;
  const makeTile = (value: Fraction, expr: string): Tile => ({ id: nextTileId++, value, expr });
  const makeTiles = (numbers: number[]) => numbers.map((number) => makeTile(fraction(number), String(number)));

  const initial = generatePuzzle(maxFor("normal"));

  let difficulty = $state<Difficulty>("normal");
  let startingNumbers = $state<number[]>(initial.tiles);
  let tiles = $state<Tile[]>(makeTiles(initial.tiles));
  let solution = $state<string | null>(initial.solution);
  let selectedId = $state<number | null>(null);
  let pendingOperator = $state<Operator | null>(null);
  let history = $state<Tile[][]>([]);
  let outcome = $state<"correct" | "wrong" | null>(null);
  let message = $state("");
  let solved = $state(0);
  let showHint = $state(false);
  let showConfetti = $state(false);

  function resetInteraction() {
    selectedId = null;
    pendingOperator = null;
    outcome = null;
    message = "";
    showHint = false;
  }

  function loadPuzzle(numbers: number[], nextSolution: string | null) {
    startingNumbers = numbers;
    tiles = makeTiles(numbers);
    solution = nextSolution;
    history = [];
    resetInteraction();
    showConfetti = false;
  }

  function newPuzzle() {
    const puzzle = generatePuzzle(maxFor(difficulty));
    loadPuzzle(puzzle.tiles, puzzle.solution);
  }

  function chooseDifficulty(value: Difficulty) {
    difficulty = value;
    newPuzzle();
  }

  function selectTile(id: number) {
    if (outcome === "correct") return;
    // Tapping the selected tile again deselects it.
    if (selectedId === id) {
      selectedId = null;
      pendingOperator = null;
      message = "";
      return;
    }
    // With no tile chosen, or no operation yet, this tap just picks a tile.
    if (selectedId === null || pendingOperator === null) {
      selectedId = id;
      message = "";
      return;
    }
    combine(selectedId, id, pendingOperator);
  }

  function chooseOperator(operator: Operator) {
    if (outcome === "correct") return;
    if (selectedId === null) {
      message = "Pick a tile first, then an operation.";
      return;
    }
    pendingOperator = operator;
    message = "";
  }

  function combine(firstId: number, secondId: number, operator: Operator) {
    const firstIndex = tiles.findIndex((tile) => tile.id === firstId);
    const secondIndex = tiles.findIndex((tile) => tile.id === secondId);
    if (firstIndex === -1 || secondIndex === -1) return;
    const first = tiles[firstIndex];
    const second = tiles[secondIndex];

    if (operator === "/" && second.value.n === 0) {
      message = "You cannot divide by zero.";
      return;
    }

    let value: Fraction;
    if (operator === "+") value = addFractions(first.value, second.value);
    else if (operator === "-") value = subtractFractions(first.value, second.value);
    else if (operator === "*") value = multiplyFractions(first.value, second.value);
    else value = divideFractions(first.value, second.value);

    const combined = makeTile(value, `(${first.expr} ${operatorSymbols[operator]} ${second.expr})`);

    history = [...history, tiles];
    const low = Math.min(firstIndex, secondIndex);
    const high = Math.max(firstIndex, secondIndex);
    const next = [...tiles.slice(0, low), combined, ...tiles.slice(low + 1, high), ...tiles.slice(high + 1)];
    tiles = next;
    // Select the newly produced tile by default so it is ready for the next operation.
    selectedId = next.length > 1 ? combined.id : null;
    pendingOperator = null;
    message = "";

    if (next.length === 1) {
      if (equalFractions(next[0].value, fraction(24))) {
        outcome = "correct";
        solved++;
        showConfetti = true;
        setTimeout(() => (showConfetti = false), 4000);
      } else {
        outcome = "wrong";
        message = `That makes ${formatFraction(next[0].value)}, not 24. Undo and try again.`;
      }
    } else {
      outcome = null;
    }
  }

  function undo() {
    if (history.length === 0) return;
    tiles = history[history.length - 1];
    history = history.slice(0, -1);
    resetInteraction();
    outcome = null;
  }

  function restart() {
    loadPuzzle(startingNumbers, solution);
  }

  const operators: Operator[] = ["+", "-", "*", "/"];
  const difficulties: Difficulty[] = ["easy", "normal", "hard"];
</script>

{#if showConfetti}
  <div class="pointer-events-none fixed left-0 top-[-50px] z-50 flex h-screen w-screen justify-center overflow-hidden">
    <Confetti x={[-5, 5]} y={[0, 0.1]} delay={[500, 2000]} infinite duration={4000} amount={400} fallDistance="100vh" />
  </div>
{/if}

<div class="mathex-shell relative isolate min-h-full overflow-hidden py-8 sm:py-12">
  <div class="mathex-grid pointer-events-none absolute inset-x-0 top-0 h-[32rem] opacity-65"></div>
  <div class="pointer-events-none absolute -right-24 top-40 h-72 w-72 rounded-full bg-primary/10 blur-3xl"></div>

  <div class="relative mx-auto max-w-3xl px-4 sm:px-6">
    <header class="text-center">
      <div
        class="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/75 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary backdrop-blur-sm"
      >
        <Calculator class="h-3.5 w-3.5" /> Arithmetic puzzle
      </div>
      <h1 class="mt-5 text-5xl font-bold tracking-[-0.06em] sm:text-6xl">24 Game<span class="text-primary">.</span></h1>
      <p class="mt-3 text-muted-foreground sm:text-lg">
        Combine all four numbers with +, −, × and ÷ to reach exactly 24.
      </p>
      <div class="mt-5 flex justify-center">
        <Button href="/tools/24-game/online" variant="outline" class="gap-1.5">
          <Swords class="h-4 w-4" /> Play 1v1 or multiplayer
        </Button>
      </div>
    </header>

    <main class="mathex-panel mx-auto mt-8 max-w-xl rounded-3xl p-5 sm:p-8">
      <div class="flex items-center justify-between">
        <div>
          <p class="mathex-kicker">Rounds solved</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">{solved}</p>
        </div>
        <Button variant="ghost" size="sm" class="gap-1.5" onclick={newPuzzle}>
          <RefreshCw class="h-3.5 w-3.5" /> New puzzle
        </Button>
      </div>

      <div class="mt-5 flex flex-wrap gap-2">
        {#each difficulties as level}
          <button
            onclick={() => chooseDifficulty(level)}
            class={`rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors ${difficulty === level ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}
          >
            {level}
          </button>
        {/each}
      </div>

      <div class="mt-8 flex min-h-28 flex-wrap items-center justify-center gap-3">
        {#each tiles as tile (tile.id)}
          <button
            onclick={() => selectTile(tile.id)}
            aria-pressed={selectedId === tile.id}
            disabled={outcome === "correct"}
            class={`flex h-20 w-20 flex-col items-center justify-center rounded-2xl border text-3xl font-bold tabular-nums transition-all sm:h-24 sm:w-24 sm:text-4xl ${
              selectedId === tile.id
                ? "border-primary bg-primary/20 text-primary ring-2 ring-primary/40 -translate-y-0.5"
                : "border-primary/30 bg-primary/8 text-primary hover:-translate-y-0.5 hover:border-primary hover:bg-primary/15"
            } disabled:opacity-60`}
            aria-label={`Select the tile ${formatFraction(tile.value)}`}
          >
            {formatFraction(tile.value)}
            {#if tile.expr !== formatFraction(tile.value)}
              <span class="mt-1 max-w-full truncate px-1 font-mono text-[10px] font-medium text-muted-foreground"
                >{tile.expr}</span
              >
            {/if}
          </button>
        {/each}
      </div>

      <div class="mt-6 grid grid-cols-4 gap-2">
        {#each operators as operator}
          <button
            onclick={() => chooseOperator(operator)}
            disabled={outcome === "correct"}
            aria-pressed={pendingOperator === operator}
            class={`flex h-12 items-center justify-center rounded-xl border text-2xl font-bold transition-colors disabled:opacity-40 ${
              pendingOperator === operator
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-primary/5"
            }`}
          >
            {operatorSymbols[operator]}
          </button>
        {/each}
      </div>

      <p class="mt-4 min-h-5 text-center text-sm text-muted-foreground">
        {#if pendingOperator && selectedId !== null}
          Now pick a second tile to apply <span class="font-semibold text-foreground"
            >{operatorSymbols[pendingOperator]}</span
          >.
        {:else if selectedId !== null}
          Now choose an operation.
        {:else}
          Pick a tile, then an operation, then another tile to combine them.
        {/if}
      </p>

      <div class="mt-3 flex gap-2">
        <Button
          variant="outline"
          class="flex-1 gap-1.5"
          onclick={undo}
          disabled={history.length === 0 || outcome === "correct"}
        >
          <RotateCcw class="h-4 w-4" /> Undo
        </Button>
        <Button variant="outline" class="flex-1" onclick={restart} disabled={history.length === 0}>Restart</Button>
      </div>

      {#if outcome === "correct"}
        <div class="mt-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-center">
          <Trophy class="mx-auto h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          <p class="mt-2 text-lg font-semibold text-emerald-700 dark:text-emerald-400">Exactly 24!</p>
          {#if tiles[0]}
            <p class="mt-1 font-mono text-sm font-semibold text-foreground">{tiles[0].expr} = 24</p>
          {/if}
          <Button onclick={newPuzzle} size="sm" class="mt-3 gap-1.5"
            ><RefreshCw class="h-3.5 w-3.5" /> Next puzzle</Button
          >
        </div>
      {:else}
        <p
          class={`mt-4 min-h-5 text-center text-sm font-medium ${outcome === "wrong" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {message || " "}
        </p>

        <div class="mt-1 text-center">
          {#if showHint && solution}
            <p class="rounded-2xl bg-primary/8 p-3 font-mono text-sm font-semibold text-foreground">
              One answer: {solution}
            </p>
          {:else}
            <Button
              variant="ghost"
              size="sm"
              class="gap-1.5 text-muted-foreground"
              onclick={() => (showHint = true)}
              disabled={!solution}
            >
              <Lightbulb class="h-3.5 w-3.5" /> Reveal a solution
            </Button>
          {/if}
        </div>
      {/if}
    </main>

    <p class="mx-auto mt-6 max-w-xl text-center text-xs text-muted-foreground">
      Every puzzle is checked for a solution before it is shown. There may be more than one way to make 24.
    </p>
  </div>
</div>
