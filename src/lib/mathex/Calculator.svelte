<script lang="ts">
  import { evaluate } from "mathjs";
  import { Button } from "$lib/components/ui/button";
  import X from "@lucide/svelte/icons/x";
  import History from "@lucide/svelte/icons/history";
  import { onMount } from "svelte";
  import type { Component } from "svelte";

  let { onclose = () => {} }: { onclose?: () => void } = $props();

  let expr = $state("");
  let result: string | null = $state(null);
  let degrees = $state(true);
  let inverse = $state(false);
  let hyp = $state(false);
  let showHistory = $state(false);
  let history: { expr: string; result: string }[] = $state([]);
  let lastAns: number | null = $state(null);
  let inputEl: HTMLInputElement | null = $state(null);

  const HISTORY_KEY = "mathex-calculator-history";
  const ANS_KEY = "mathex-calculator-ans";

  onMount(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          history = parsed.filter((h) => h && typeof h.expr === "string" && typeof h.result === "string").slice(0, 50);
        }
      }
      const ansRaw = localStorage.getItem(ANS_KEY);
      if (ansRaw !== null) {
        const n = Number(ansRaw);
        if (Number.isFinite(n)) lastAns = n;
      }
    } catch {}
  });

  $effect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
    } catch {}
  });

  $effect(() => {
    try {
      if (lastAns === null) localStorage.removeItem(ANS_KEY);
      else localStorage.setItem(ANS_KEY, String(lastAns));
    } catch {}
  });

  // Keep the end of a long expression visible when buttons edit it.
  // Typing directly in the focused input already follows the cursor natively.
  $effect(() => {
    void expr;
    const el = inputEl;
    if (!el) return;
    if (typeof document !== "undefined" && document.activeElement === el) return;
    queueMicrotask(() => {
      try {
        el.scrollLeft = el.scrollWidth;
      } catch {}
    });
  });

  // Floating position. Null means docked bottom-right.
  let pos: { x: number; y: number } | null = $state(null);
  let dragging = $state(false);
  let dragOffset = { x: 0, y: 0 };

  function onHeaderPointerDown(event: PointerEvent) {
    if ((event.target as HTMLElement).closest("button")) return;
    dragging = true;
    const panel = (event.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    dragOffset = { x: event.clientX - panel.left, y: event.clientY - panel.top };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onHeaderPointerMove(event: PointerEvent) {
    if (!dragging) return;
    pos = {
      x: Math.min(Math.max(event.clientX - dragOffset.x, 0), window.innerWidth - 80),
      y: Math.min(Math.max(event.clientY - dragOffset.y, 0), window.innerHeight - 60)
    };
  }

  function onHeaderKeyDown(event: KeyboardEvent) {
    const step = event.shiftKey ? 10 : 1;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -step;
    else if (event.key === "ArrowRight") dx = step;
    else if (event.key === "ArrowUp") dy = -step;
    else if (event.key === "ArrowDown") dy = step;
    else return;
    event.preventDefault();
    const panel = (event.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
    const base = pos ?? { x: panel.left, y: panel.top };
    pos = { x: Math.max(0, base.x + dx), y: Math.max(0, base.y + dy) };
  }

  function insertAtCursor(token: string) {
    const el = inputEl;
    if (
      el &&
      document.activeElement === el &&
      typeof el.selectionStart === "number" &&
      typeof el.selectionEnd === "number"
    ) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      expr = expr.slice(0, start) + token + expr.slice(end);
      const newPos = start + token.length;
      queueMicrotask(() => {
        try {
          el.focus();
          el.setSelectionRange(newPos, newPos);
        } catch {}
      });
    } else {
      expr += token;
    }
  }

  function insert(token: string) {
    // Editing after an error should edit the previous expression,
    // not move the word "Error" into the input.
    if (result === "Error") {
      result = null;
      insertAtCursor(token);
      return;
    }
    if (result !== null) {
      if (/^[0-9.]$/.test(token)) {
        expr = token;
      } else {
        expr = result + token;
      }
      result = null;
      queueMicrotask(() => {
        try {
          const el = inputEl;
          if (el && document.activeElement === el) {
            const len = expr.length;
            el.setSelectionRange(len, len);
          }
        } catch {}
      });
      return;
    }
    insertAtCursor(token);
  }

  function backspace() {
    if (result !== null) {
      result = null;
      return;
    }
    const el = inputEl;
    if (
      el &&
      document.activeElement === el &&
      typeof el.selectionStart === "number" &&
      typeof el.selectionEnd === "number"
    ) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start !== end) {
        expr = expr.slice(0, start) + expr.slice(end);
        const newPos = start;
        queueMicrotask(() => {
          try {
            el.focus();
            el.setSelectionRange(newPos, newPos);
          } catch {}
        });
      } else if (start > 0) {
        expr = expr.slice(0, start - 1) + expr.slice(end);
        const newPos = start - 1;
        queueMicrotask(() => {
          try {
            el.focus();
            el.setSelectionRange(newPos, newPos);
          } catch {}
        });
      }
    } else {
      expr = expr.slice(0, -1);
    }
  }

  function clearAll() {
    expr = "";
    result = null;
  }

  // Display form uses ln( / log( / √(/ π / ÷ / × / −.
  // Convert to mathjs-compatible ASCII before evaluating.
  function toMathjs(raw: string): string {
    let s = raw;
    s = s.replaceAll("÷", "/").replaceAll("×", "*").replaceAll("−", "-").replaceAll("–", "-").replaceAll("—", "-");
    s = s.replaceAll("π", "pi");
    s = s.replaceAll("²", "^2").replaceAll("³", "^3");
    s = s.replace(/√\s*\(\s*/g, "sqrt(");
    s = s.replace(/√\s*([0-9]+(?:\.[0-9]*)?|\.[0-9]+|pi|e|Ans|ans)\b/g, "sqrt($1)");
    s = s.replaceAll("√", "sqrt");
    // ln( is natural log (mathjs log), log( is base-10 (mathjs log10).
    // Use a placeholder so the ln replacement is not re-matched as log.
    const PLACEHOLDER = "__NATLOG__";
    s = s.replace(/\bln\s*\(/gi, `${PLACEHOLDER}(`);
    s = s.replace(/\blog\s*\(/gi, "log10(");
    s = s.replaceAll(PLACEHOLDER, "log");
    // Bracket lenience: auto-close any unclosed "(".
    let open = 0;
    let close = 0;
    for (const ch of s) {
      if (ch === "(") open++;
      else if (ch === ")") close++;
    }
    if (open > close) s += ")".repeat(open - close);
    return s;
  }

  function calculate() {
    if (!expr.trim()) return;
    try {
      const normalized = toMathjs(expr);
      const scope: Record<string, unknown> = {
        Ans: lastAns ?? 0,
        ans: lastAns ?? 0
      };
      if (degrees) {
        scope.sin = (x: number) => Math.sin((Number(x) * Math.PI) / 180);
        scope.cos = (x: number) => Math.cos((Number(x) * Math.PI) / 180);
        scope.tan = (x: number) => Math.tan((Number(x) * Math.PI) / 180);
        scope.asin = (x: number) => (Math.asin(Number(x)) * 180) / Math.PI;
        scope.acos = (x: number) => (Math.acos(Number(x)) * 180) / Math.PI;
        scope.atan = (x: number) => (Math.atan(Number(x)) * 180) / Math.PI;
      }
      const value = evaluate(normalized, scope);
      const num = Number(value);
      if (typeof value === "function" || !Number.isFinite(num)) throw new Error("bad result");
      const rounded = Math.abs(num) < 1e-12 ? 0 : num;
      const out = String(Number(rounded.toPrecision(10)));
      result = out;
      const ansNum = Number(out);
      lastAns = Number.isFinite(ansNum) ? ansNum : null;
      const entry = { expr, result: out };
      history = [entry, ...history.filter((h) => h.expr !== entry.expr || h.result !== entry.result)].slice(0, 50);
    } catch {
      result = "Error";
    }
  }

  function trigToken(base: "sin" | "cos" | "tan"): string {
    if (hyp && inverse) return `a${base}h(`;
    if (hyp) return `${base}h(`;
    if (inverse) return `a${base}(`;
    return `${base}(`;
  }

  function trigLabel(base: "sin" | "cos" | "tan"): string {
    if (hyp && inverse) return `${base}h⁻¹`;
    if (hyp) return `${base}h`;
    if (inverse) return `${base}⁻¹`;
    return base;
  }

  function restoreEntry(entry: { expr: string; result: string }) {
    expr = entry.expr;
    result = null;
    showHistory = false;
    queueMicrotask(() => {
      try {
        const el = inputEl;
        if (!el) return;
        el.focus();
        el.setSelectionRange(entry.expr.length, entry.expr.length);
        el.scrollLeft = el.scrollWidth;
      } catch {}
    });
  }

  function clearHistory() {
    history = [];
  }

  // Keyboard support when focus is inside the calculator.
  // Typing/pasting directly in the input box works natively;
  // this handler adds Enter/Backspace/Escape plus single-key
  // entry when a button (not the input) has focus.
  function onCalcKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const isInput = target instanceof HTMLInputElement;
    const isButton = target instanceof HTMLButtonElement;
    if (isInput) {
      if (event.key === "Enter") {
        event.preventDefault();
        calculate();
      } else if (event.key === "Escape") {
        event.preventDefault();
        clearAll();
      }
      return;
    }
    if (isButton && (event.key === "Enter" || event.key === " ")) return;
    if (event.key === "Enter" || event.key === "=") {
      event.preventDefault();
      calculate();
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      backspace();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      clearAll();
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const k = event.key;
      if (/^[0-9+\-*/^().%! ]$/.test(k) || /^[a-zA-Z]$/.test(k)) {
        event.preventDefault();
        let token = k;
        if (k === "*") token = "×";
        else if (k === "/") token = "÷";
        else if (k === "-") token = "−";
        insert(token);
      }
    }
  }

  type KeyVariant = "default" | "outline" | "secondary";
  type CalcKey = {
    label: string;
    action: () => void;
    variant: KeyVariant;
    title?: string;
    accent?: boolean;
    icon?: Component;
  };

  const keys: CalcKey[] = $derived([
    {
      label: "INV",
      action: () => (inverse = !inverse),
      variant: inverse ? "secondary" : "outline",
      title: "Inverse functions"
    },
    { label: "HYP", action: () => (hyp = !hyp), variant: hyp ? "secondary" : "outline", title: "Hyperbolic functions" },
    {
      label: degrees ? "DEG" : "RAD",
      action: () => (degrees = !degrees),
      variant: "outline",
      title: "Toggle degrees / radians"
    },
    {
      label: "History",
      icon: History,
      action: () => (showHistory = !showHistory),
      variant: showHistory ? "secondary" : "outline",
      title: "Calculation history"
    },
    { label: "C", action: clearAll, variant: "outline", title: "Clear" },
    { label: trigLabel("sin"), action: () => insert(trigToken("sin")), variant: "outline", title: "Sine" },
    { label: trigLabel("cos"), action: () => insert(trigToken("cos")), variant: "outline", title: "Cosine" },
    { label: trigLabel("tan"), action: () => insert(trigToken("tan")), variant: "outline", title: "Tangent" },
    { label: "(", action: () => insert("("), variant: "outline" },
    { label: ")", action: () => insert(")"), variant: "outline" },
    {
      label: inverse ? "eˣ" : "ln",
      action: () => insert(inverse ? "exp(" : "ln("),
      variant: "outline",
      title: inverse ? "Exponential" : "Natural log"
    },
    {
      label: inverse ? "10ˣ" : "log",
      action: () => insert(inverse ? "10^(" : "log("),
      variant: "outline",
      title: inverse ? "Power of 10" : "Base-10 log"
    },
    {
      label: inverse ? "x²" : "√",
      action: () => insert(inverse ? "^2" : "√("),
      variant: "outline",
      title: inverse ? "Square" : "Square root"
    },
    { label: "|x|", action: () => insert("abs("), variant: "outline", title: "Absolute value" },
    { label: "⌫", action: backspace, variant: "outline", title: "Backspace" },
    { label: "7", action: () => insert("7"), variant: "outline" },
    { label: "8", action: () => insert("8"), variant: "outline" },
    { label: "9", action: () => insert("9"), variant: "outline" },
    { label: "^", action: () => insert("^"), variant: "outline", title: "Power" },
    { label: "÷", action: () => insert("÷"), variant: "outline" },
    { label: "4", action: () => insert("4"), variant: "outline" },
    { label: "5", action: () => insert("5"), variant: "outline" },
    { label: "6", action: () => insert("6"), variant: "outline" },
    { label: "π", action: () => insert("π"), variant: "outline", title: "Pi" },
    { label: "×", action: () => insert("×"), variant: "outline" },
    { label: "1", action: () => insert("1"), variant: "outline" },
    { label: "2", action: () => insert("2"), variant: "outline" },
    { label: "3", action: () => insert("3"), variant: "outline" },
    { label: "e", action: () => insert("e"), variant: "outline", title: "Euler's number" },
    { label: "−", action: () => insert("−"), variant: "outline" },
    { label: "0", action: () => insert("0"), variant: "outline" },
    { label: ".", action: () => insert("."), variant: "outline" },
    { label: "Ans", action: () => insert("Ans"), variant: "outline", title: "Last answer" },
    { label: "+", action: () => insert("+"), variant: "outline" },
    { label: "=", action: calculate, variant: "default", accent: true, title: "Equals" }
  ]);
</script>

<div
  class="fixed right-4 bottom-24 z-50 w-72 rounded-2xl border border-border bg-card shadow-2xl"
  style={pos ? `left: ${pos.x}px; top: ${pos.y}px; bottom: auto; right: auto;` : ""}
  role="dialog"
  aria-label="Calculator"
  tabindex={-1}
  onkeydown={onCalcKeyDown}
>
  <div
    class="flex cursor-move touch-none items-center justify-between rounded-t-2xl bg-muted/60 px-3 py-2"
    role="toolbar"
    aria-label="Move calculator"
    tabindex={0}
    onpointerdown={onHeaderPointerDown}
    onkeydown={onHeaderKeyDown}
    onpointermove={onHeaderPointerMove}
    onpointerup={() => (dragging = false)}
    onpointercancel={() => (dragging = false)}
  >
    <span class="text-xs font-bold tracking-wider text-muted-foreground uppercase">Calculator</span>
    <button
      type="button"
      class="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      onclick={onclose}
      aria-label="Close calculator"
    >
      <X class="h-4 w-4" />
    </button>
  </div>
  <div class="p-3">
    <div class="min-h-14 rounded-xl bg-muted/50 px-3 py-2 text-right">
      <input
        bind:this={inputEl}
        bind:value={expr}
        oninput={() => {
          if (result !== null) result = null;
        }}
        placeholder="0"
        autocapitalize="off"
        autocomplete="off"
        autocorrect="off"
        spellcheck={false}
        aria-label="Calculator input. Type or paste an expression, then press Enter."
        class="w-full bg-transparent text-right font-mono text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/50 focus:text-foreground"
      />
      <div class="truncate font-mono text-xl font-bold tabular-nums {result === 'Error' ? 'text-destructive' : ''}">
        {result ?? " "}
      </div>
    </div>
    {#if showHistory}
      <div class="mt-2 rounded-xl border border-border bg-muted/30 p-2">
        <div class="flex items-center justify-between px-1 pb-1">
          <span class="text-[0.65rem] font-bold tracking-wider text-muted-foreground uppercase">History</span>
          <button
            type="button"
            class="rounded-md px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            onclick={clearHistory}
          >
            Clear
          </button>
        </div>
        <div class="flex max-h-28 min-h-0 flex-col gap-1 overflow-x-hidden overflow-y-auto scrollbar-thin">
          {#each history as entry}
            <button
              type="button"
              class="shrink-0 truncate rounded-lg px-2 py-1 text-right font-mono text-xs hover:bg-muted"
              onclick={() => restoreEntry(entry)}
              title="Reuse this expression"
            >
              <span class="text-muted-foreground">{entry.expr} =</span>
              <span class="font-bold"> {entry.result}</span>
            </button>
          {:else}
            <p class="px-2 py-1 text-center text-xs text-muted-foreground">No history yet</p>
          {/each}
        </div>
      </div>
    {/if}
    <div class="mt-2 grid grid-cols-5 gap-1">
      {#each keys as key}
        {@const Icon = key.icon}
        <Button
          variant={key.variant}
          size="sm"
          class="h-9 px-0 font-mono text-xs {key.accent ? '' : ''}"
          onclick={key.action}
          title={key.title ?? key.label}
          aria-label={key.icon ? (key.title ?? key.label) : undefined}
        >
          {#if Icon}
            <Icon class="h-4 w-4" />
            <span class="sr-only">{key.label}</span>
          {:else}
            {key.label}
          {/if}
        </Button>
      {/each}
    </div>
  </div>
</div>
