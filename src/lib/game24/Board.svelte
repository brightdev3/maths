<script lang="ts">
  import { untrack } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { RotateCcw } from "@lucide/svelte/icons";
  import {
    addFractions,
    divideFractions,
    equalFractions,
    fraction,
    formatFraction,
    multiplyFractions,
    operatorSymbols,
    subtractFractions,
    type Fraction,
    type Move,
    type Operator
  } from "./engine";

  interface Props {
    numbers: number[];
    /** Externally blocks interaction (e.g. an opponent has the floor). */
    disabled?: boolean;
    /** Timestamp the round began, used to report elapsed time. */
    startedAt?: number | null;
    /** Externally mark the round solved (e.g. by another player). */
    solved?: boolean;
    onSolved?: (payload: { moves: Move[]; expression: string; elapsedMs: number }) => void;
  }

  let { numbers, disabled = false, startedAt = null, solved = false, onSolved }: Props = $props();

  type Tile = { id: number; value: Fraction; expr: string };
  type Snapshot = { tiles: Tile[]; moves: Move[] };

  let nextTileId = 0;
  const makeTile = (value: Fraction, expr: string): Tile => ({ id: nextTileId++, value, expr });
  const makeTiles = (values: number[]) => values.map((value) => makeTile(fraction(value), String(value)));

  let tiles = $state<Tile[]>(untrack(() => makeTiles(numbers)));
  let moves = $state<Move[]>([]);
  let history = $state<Snapshot[]>([]);
  let selectedId = $state<number | null>(null);
  let pendingOperator = $state<Operator | null>(null);
  let outcome = $state<"correct" | "wrong" | null>(null);
  let message = $state("");
  let frozen = $state(false);

  // Re-initialise whenever the parent feeds a new puzzle.
  let currentKey = untrack(() => numbers.join(","));
  $effect(() => {
    const key = numbers.join(",");
    if (key !== currentKey) {
      currentKey = key;
      tiles = makeTiles(numbers);
      moves = [];
      history = [];
      selectedId = null;
      pendingOperator = null;
      outcome = null;
      message = "";
      frozen = false;
    }
  });

  const locked = $derived(disabled || frozen || solved);

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

    history = [...history, { tiles, moves }];
    moves = [...moves, { a: first.value, b: second.value, op: operator }];
    const low = Math.min(firstIndex, secondIndex);
    const high = Math.max(firstIndex, secondIndex);
    const next = [...tiles.slice(0, low), combined, ...tiles.slice(low + 1, high), ...tiles.slice(high + 1)];
    tiles = next;
    selectedId = next.length > 1 ? combined.id : null;
    pendingOperator = null;
    message = "";

    if (next.length === 1) {
      if (equalFractions(next[0].value, fraction(24))) {
        outcome = "correct";
        frozen = true;
        const elapsedMs = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
        onSolved?.({ moves, expression: next[0].expr, elapsedMs });
      } else {
        outcome = "wrong";
        message = `That makes ${formatFraction(next[0].value)}, not 24. Undo and try again.`;
      }
    } else {
      outcome = null;
    }
  }

  function selectTile(id: number) {
    if (locked || outcome === "correct") return;
    if (selectedId === id) {
      selectedId = null;
      pendingOperator = null;
      message = "";
      return;
    }
    if (selectedId === null || pendingOperator === null) {
      selectedId = id;
      message = "";
      return;
    }
    combine(selectedId, id, pendingOperator);
  }

  function chooseOperator(operator: Operator) {
    if (locked || outcome === "correct") return;
    if (selectedId === null) {
      message = "Pick a tile first, then an operation.";
      return;
    }
    pendingOperator = operator;
    message = "";
  }

  function undo() {
    if (locked || history.length === 0) return;
    const previous = history[history.length - 1];
    tiles = previous.tiles;
    moves = previous.moves;
    history = history.slice(0, -1);
    selectedId = null;
    pendingOperator = null;
    outcome = null;
    message = "";
  }

  const operators: Operator[] = ["+", "-", "*", "/"];
</script>

<div class="flex min-h-28 flex-wrap items-center justify-center gap-3">
  {#each tiles as tile (tile.id)}
    <button
      onclick={() => selectTile(tile.id)}
      aria-pressed={selectedId === tile.id}
      disabled={locked || outcome === "correct"}
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
      disabled={locked || outcome === "correct"}
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
  {#if locked && !solved && outcome !== "correct"}
    Waiting…
  {:else if pendingOperator && selectedId !== null}
    Now pick a second tile to apply <span class="font-semibold text-foreground">{operatorSymbols[pendingOperator]}</span>.
  {:else if selectedId !== null}
    Now choose an operation.
  {:else}
    Pick a tile, then an operation, then another tile to combine them.
  {/if}
</p>

{#if !locked}
  <div class="mt-3">
    <Button variant="outline" class="w-full gap-1.5" onclick={undo} disabled={history.length === 0}>
      <RotateCcw class="h-4 w-4" /> Undo
    </Button>
  </div>
{/if}

{#if outcome === "wrong" && message}
  <p class="mt-4 text-center text-sm font-medium text-destructive">{message}</p>
{/if}