<script lang="ts">
  import { evaluate } from "mathjs";
  import { Button } from "$lib/components/ui/button";
  import X from "@lucide/svelte/icons/x";

  let { onclose = () => {} }: { onclose?: () => void } = $props();

  let expr = $state("");
  let result: string | null = $state(null);
  let degrees = $state(true);

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

  function insert(token: string) {
    if (result !== null) {
      expr = token.match(/^[0-9.]$/) ? token : result + token;
      result = null;
    } else {
      expr += token;
    }
  }

  function backspace() {
    if (result !== null) {
      result = null;
      return;
    }
    expr = expr.slice(0, -1);
  }

  function clearAll() {
    expr = "";
    result = null;
  }

  function calculate() {
    if (!expr.trim()) return;
    try {
      const scope = degrees
        ? {
            sin: (x: number) => Math.sin((Number(x) * Math.PI) / 180),
            cos: (x: number) => Math.cos((Number(x) * Math.PI) / 180),
            tan: (x: number) => Math.tan((Number(x) * Math.PI) / 180),
            asin: (x: number) => (Math.asin(Number(x)) * 180) / Math.PI,
            acos: (x: number) => (Math.acos(Number(x)) * 180) / Math.PI,
            atan: (x: number) => (Math.atan(Number(x)) * 180) / Math.PI
          }
        : {};
      const value = evaluate(expr, scope);
      const num = Number(value);
      if (typeof value === "function" || !Number.isFinite(num)) throw new Error("bad result");
      const rounded = Math.abs(num) < 1e-12 ? 0 : num;
      result = String(Number(rounded.toPrecision(10)));
    } catch {
      result = "Error";
    }
  }

  const keys: { label: string; action: () => void; accent?: boolean }[] = $derived([
    { label: "C", action: clearAll },
    { label: "(", action: () => insert("(") },
    { label: ")", action: () => insert(")") },
    { label: "⌫", action: backspace },
    { label: "÷", action: () => insert("/") },
    { label: "sin", action: () => insert("sin(") },
    { label: "7", action: () => insert("7") },
    { label: "8", action: () => insert("8") },
    { label: "9", action: () => insert("9") },
    { label: "×", action: () => insert("*") },
    { label: "cos", action: () => insert("cos(") },
    { label: "4", action: () => insert("4") },
    { label: "5", action: () => insert("5") },
    { label: "6", action: () => insert("6") },
    { label: "−", action: () => insert("-") },
    { label: "tan", action: () => insert("tan(") },
    { label: "1", action: () => insert("1") },
    { label: "2", action: () => insert("2") },
    { label: "3", action: () => insert("3") },
    { label: "+", action: () => insert("+") },
    { label: "ln", action: () => insert("log(") },
    { label: "log", action: () => insert("log10(") },
    { label: "√", action: () => insert("sqrt(") },
    { label: "^", action: () => insert("^") },
    { label: "=", action: calculate, accent: true },
    { label: degrees ? "DEG" : "RAD", action: () => (degrees = !degrees) },
    { label: "π", action: () => insert("pi") },
    { label: "e", action: () => insert("e") },
    { label: "0", action: () => insert("0") },
    { label: ".", action: () => insert(".") }
  ]);
</script>

<div
  class="fixed bottom-24 right-4 z-50 w-64 rounded-2xl border border-border bg-card shadow-2xl"
  style={pos ? `left: ${pos.x}px; top: ${pos.y}px; bottom: auto; right: auto;` : ""}
  role="dialog"
  aria-label="Calculator"
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
    <span class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Calculator</span>
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
      <div class="truncate font-mono text-sm text-muted-foreground">{expr || " "}</div>
      <div class="truncate font-mono text-xl font-bold tabular-nums">{result ?? " "}</div>
    </div>
    <div class="mt-2 grid grid-cols-5 gap-1">
      {#each keys as key}
        <Button
          variant={key.accent ? "default" : "outline"}
          size="sm"
          class="h-9 px-0 font-mono text-xs"
          onclick={key.action}>{key.label}</Button
        >
      {/each}
    </div>
  </div>
</div>
