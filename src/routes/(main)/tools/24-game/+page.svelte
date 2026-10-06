<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Confetti } from "svelte-confetti";
  import { Calculator, Delete, Lightbulb, RefreshCw, Trophy } from "@lucide/svelte/icons";

  type Fraction = { n: number; d: number };
  type Difficulty = "easy" | "normal" | "hard";

  const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

  const fraction = (n: number, d = 1): Fraction => {
    if (d < 0) {
      n = -n;
      d = -d;
    }
    const divisor = gcd(n, d) || 1;
    return { n: n / divisor, d: d / divisor };
  };

  const addFractions = (a: Fraction, b: Fraction) => fraction(a.n * b.d + b.n * a.d, a.d * b.d);
  const subtractFractions = (a: Fraction, b: Fraction) => fraction(a.n * b.d - b.n * a.d, a.d * b.d);
  const multiplyFractions = (a: Fraction, b: Fraction) => fraction(a.n * b.n, a.d * b.d);
  const divideFractions = (a: Fraction, b: Fraction) => fraction(a.n * b.d, a.d * b.n);
  const equalFractions = (a: Fraction, b: Fraction) => a.n * b.d === b.n * a.d;

  const formatFraction = (value: Fraction) => (value.d === 1 ? String(value.n) : `${value.n}/${value.d}`);

  type Token =
    { kind: "number"; value: number } | { kind: "operator"; value: string } | { kind: "paren"; value: string };

  function tokenize(input: string): Token[] | null {
    const tokens: Token[] = [];
    let index = 0;
    while (index < input.length) {
      const char = input[index];
      if (char === " ") {
        index++;
        continue;
      }
      if (/\d/.test(char)) {
        let end = index;
        while (end < input.length && /\d/.test(input[end])) end++;
        const value = Number(input.slice(index, end));
        if (!Number.isFinite(value)) return null;
        tokens.push({ kind: "number", value });
        index = end;
        continue;
      }
      const normalised = char === "×" ? "*" : char === "÷" ? "/" : char === "−" ? "-" : char;
      if (["+", "-", "*", "/"].includes(normalised)) {
        tokens.push({ kind: "operator", value: normalised });
        index++;
        continue;
      }
      if (char === "(" || char === ")") {
        tokens.push({ kind: "paren", value: char });
        index++;
        continue;
      }
      return null;
    }
    return tokens;
  }

  function evaluateExpression(input: string): { value: Fraction; numbers: number[] } | { error: string } {
    const tokens = tokenize(input);
    if (!tokens || tokens.length === 0) return { error: "Type an expression using all four numbers." };

    const numbers: number[] = [];
    let position = 0;

    const parseExpression = (): Fraction => {
      let left = parseTerm();
      while (position < tokens.length) {
        const token = tokens[position];
        if (token.kind !== "operator" || (token.value !== "+" && token.value !== "-")) break;
        position++;
        const right = parseTerm();
        left = token.value === "+" ? addFractions(left, right) : subtractFractions(left, right);
      }
      return left;
    };

    const parseTerm = (): Fraction => {
      let left = parseFactor();
      while (position < tokens.length) {
        const token = tokens[position];
        if (token.kind !== "operator" || (token.value !== "*" && token.value !== "/")) break;
        position++;
        const right = parseFactor();
        if (token.value === "/" && right.n === 0) throw new Error("Division by zero");
        left = token.value === "*" ? multiplyFractions(left, right) : divideFractions(left, right);
      }
      return left;
    };

    const parseFactor = (): Fraction => {
      const token = tokens[position];
      if (!token) throw new Error("Unexpected end");
      if (token.kind === "operator" && (token.value === "-" || token.value === "+")) {
        position++;
        const value = parseFactor();
        return token.value === "-" ? multiplyFractions(fraction(-1), value) : value;
      }
      if (token.kind === "number") {
        position++;
        numbers.push(token.value);
        return fraction(token.value);
      }
      if (token.kind === "paren" && token.value === "(") {
        position++;
        const value = parseExpression();
        const closing = tokens[position];
        if (!closing || closing.kind !== "paren" || closing.value !== ")") throw new Error("Missing bracket");
        position++;
        return value;
      }
      throw new Error("Unexpected token");
    };

    try {
      const value = parseExpression();
      if (position !== tokens.length) return { error: "That expression has a mistake in it." };
      return { value, numbers };
    } catch {
      return { error: "That expression is not valid." };
    }
  }

  function findSolution(values: number[]): string | null {
    type Item = { value: Fraction; expr: string };
    const target = fraction(24);
    const items: Item[] = values.map((value) => ({ value: fraction(value), expr: String(value) }));

    const recurse = (list: Item[]): string | null => {
      if (list.length === 1) return equalFractions(list[0].value, target) ? list[0].expr : null;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const rest = list.filter((_, index) => index !== i && index !== j);
          const candidates: Item[] = [
            { value: addFractions(a.value, b.value), expr: `(${a.expr} + ${b.expr})` },
            { value: subtractFractions(a.value, b.value), expr: `(${a.expr} - ${b.expr})` },
            { value: subtractFractions(b.value, a.value), expr: `(${b.expr} - ${a.expr})` },
            { value: multiplyFractions(a.value, b.value), expr: `(${a.expr} × ${b.expr})` }
          ];
          if (b.value.n !== 0)
            candidates.push({ value: divideFractions(a.value, b.value), expr: `(${a.expr} ÷ ${b.expr})` });
          if (a.value.n !== 0)
            candidates.push({ value: divideFractions(b.value, a.value), expr: `(${b.expr} ÷ ${a.expr})` });
          for (const candidate of candidates) {
            const found = recurse([...rest, candidate]);
            if (found) return found;
          }
        }
      }
      return null;
    };

    return recurse(items);
  }

  function maxFor(difficulty: Difficulty): number {
    if (difficulty === "easy") return 6;
    if (difficulty === "hard") return 13;
    return 9;
  }

  function generatePuzzle(max: number): { tiles: number[]; solution: string } {
    for (let attempt = 0; attempt < 300; attempt++) {
      const tiles = Array.from({ length: 4 }, () => Math.floor(Math.random() * max) + 1);
      const solution = findSolution(tiles);
      if (solution) return { tiles, solution };
    }
    return { tiles: [4, 6, 2, 3], solution: findSolution([4, 6, 2, 3]) ?? "" };
  }

  const initial = generatePuzzle(maxFor("normal"));

  let difficulty = $state<Difficulty>("normal");
  let tiles = $state<number[]>(initial.tiles);
  let solution = $state<string | null>(initial.solution);
  let expression = $state("");
  let outcome = $state<"correct" | "wrong" | null>(null);
  let message = $state("");
  let solved = $state(0);
  let showHint = $state(false);
  let showConfetti = $state(false);

  const usedTiles = $derived.by(() => {
    const used = tiles.map(() => false);
    const matches = expression.match(/\d+/g) ?? [];
    for (const token of matches) {
      const value = Number(token);
      const index = tiles.findIndex((tile, tileIndex) => !used[tileIndex] && tile === value);
      if (index !== -1) used[index] = true;
    }
    return used;
  });

  function newPuzzle() {
    const puzzle = generatePuzzle(maxFor(difficulty));
    tiles = puzzle.tiles;
    solution = puzzle.solution;
    expression = "";
    outcome = null;
    message = "";
    showHint = false;
    showConfetti = false;
  }

  function chooseDifficulty(value: Difficulty) {
    difficulty = value;
    newPuzzle();
  }

  function insert(text: string) {
    if (outcome === "correct") return;
    expression += text;
    outcome = null;
    message = "";
  }

  function clearExpression() {
    expression = "";
    outcome = null;
    message = "";
  }

  function backspace() {
    expression = expression.slice(0, -1);
    outcome = null;
    message = "";
  }

  function submit() {
    const result = evaluateExpression(expression);
    if ("error" in result) {
      outcome = "wrong";
      message = result.error;
      return;
    }
    const used = [...result.numbers].sort((a, b) => a - b);
    const expected = [...tiles].sort((a, b) => a - b);
    if (used.length !== expected.length || used.some((value, index) => value !== expected[index])) {
      outcome = "wrong";
      message = "Use each of the four numbers exactly once.";
      return;
    }
    if (equalFractions(result.value, fraction(24))) {
      outcome = "correct";
      message = "";
      solved++;
      showConfetti = true;
      setTimeout(() => (showConfetti = false), 4000);
    } else {
      outcome = "wrong";
      message = `That makes ${formatFraction(result.value)}, not 24.`;
    }
  }

  const operators = [
    { label: "+", value: "+" },
    { label: "−", value: "-" },
    { label: "×", value: "*" },
    { label: "÷", value: "/" },
    { label: "(", value: "(" },
    { label: ")", value: ")" }
  ];

  const difficulties: Difficulty[] = ["easy", "normal", "hard"];
</script>

{#if showConfetti}
  <div class="pointer-events-none fixed left-0 top-[-50px] z-50 flex h-screen w-screen justify-center overflow-hidden">
    <Confetti x={[-5, 5]} y={[0, 0.1]} delay={[500, 2000]} infinite duration={4000} amount={400} fallDistance="100vh" />
  </div>
{/if}

<svelte:window
  onkeydown={(event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  }}
/>

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

      <div class="mt-7 grid grid-cols-4 gap-3">
        {#each tiles as tile, index}
          <button
            onclick={() => insert(String(tile))}
            disabled={usedTiles[index] || outcome === "correct"}
            class={`flex aspect-square items-center justify-center rounded-2xl border text-3xl font-bold tabular-nums transition-all sm:text-4xl ${usedTiles[index] ? "border-border/50 bg-muted/60 text-muted-foreground/50" : "border-primary/30 bg-primary/8 text-primary hover:-translate-y-0.5 hover:border-primary hover:bg-primary/15"}`}
            aria-label={`Use the number ${tile}`}
          >
            {tile}
          </button>
        {/each}
      </div>

      <div class="mt-7">
        <label class="mathex-kicker" for="expression">Your expression</label>
        <input
          id="expression"
          bind:value={expression}
          readonly={outcome === "correct"}
          autocomplete="off"
          spellcheck={false}
          placeholder="e.g. (6 × 4) + 2 - 2"
          class={`mt-2 h-14 w-full rounded-xl border bg-background px-4 text-center font-mono text-xl font-bold tracking-wide outline-none transition-colors focus:ring-2 focus:ring-ring ${outcome === "wrong" ? "border-destructive/60" : outcome === "correct" ? "border-emerald-500/60" : "border-input"}`}
          aria-label="Your expression"
        />
      </div>

      <div class="mt-4 grid grid-cols-6 gap-2">
        {#each operators as operator}
          <button
            onclick={() => insert(operator.value)}
            disabled={outcome === "correct"}
            class="flex h-11 items-center justify-center rounded-xl border border-border bg-background text-lg font-bold text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-40"
          >
            {operator.label}
          </button>
        {/each}
      </div>

      <div class="mt-3 flex gap-2">
        <Button
          variant="outline"
          class="flex-1 gap-1.5"
          onclick={backspace}
          disabled={outcome === "correct" || !expression}
        >
          <Delete class="h-4 w-4" /> Delete
        </Button>
        <Button
          variant="outline"
          class="flex-1"
          onclick={clearExpression}
          disabled={outcome === "correct" || !expression}
        >
          Clear
        </Button>
        <Button class="flex-[1.4]" onclick={submit} disabled={outcome === "correct" || !expression}>Check</Button>
      </div>

      {#if outcome === "correct"}
        <div class="mt-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-center">
          <Trophy class="mx-auto h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          <p class="mt-2 text-lg font-semibold text-emerald-700 dark:text-emerald-400">Exactly 24!</p>
          {#if solution}
            <p class="mt-1 font-mono text-sm font-semibold text-foreground">One answer: {solution}</p>
          {/if}
          <Button onclick={newPuzzle} size="sm" class="mt-3 gap-1.5"
            ><RefreshCw class="h-3.5 w-3.5" /> Next puzzle</Button
          >
        </div>
      {:else}
        <p
          class={`mt-4 min-h-5 text-center text-sm font-medium ${outcome === "wrong" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {message || "Every number must be used once. Brackets are allowed."}
        </p>

        <div class="mt-3 text-center">
          {#if showHint && solution}
            <p class="rounded-2xl bg-primary/8 p-3 font-mono text-sm font-semibold text-foreground">
              Try working towards: {solution}
            </p>
          {:else}
            <Button variant="ghost" size="sm" class="gap-1.5 text-muted-foreground" onclick={() => (showHint = true)}>
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
