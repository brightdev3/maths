<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import Eraser from "@lucide/svelte/icons/eraser";
  import Trash from "@lucide/svelte/icons/trash";
  import Type from "@lucide/svelte/icons/type";
  import X from "@lucide/svelte/icons/x";

  let { open = true, onclose = () => {} }: { open?: boolean; onclose?: () => void } = $props();

  type Point = { x: number; y: number };
  type Stroke = { id: string; points: Point[]; color: string; width: number };
  type StampedText = { id: string; x: number; y: number; text: string; color: string; size: number };

  let canvas: HTMLCanvasElement | null = $state(null);
  // Every line is stored individually so the eraser can remove whole lines.
  let strokes: Stroke[] = $state([]);
  let stamps: StampedText[] = $state([]);
  let currentStroke: Stroke | null = null;
  let nextId = 1;

  let drawing = $state(false);
  let color = $state("#171717");
  let erasing = $state(false);
  let textArmed = $state(false);
  let lineWidth = $state(4);
  let editor: { x: number; y: number } | null = $state(null);
  let editorText = $state("");
  let textInput: HTMLInputElement | null = $state(null);

  const colors = ["#171717", "#ffffff", "#dc2626", "#2563eb", "#16a34a", "#9333ea", "#ea580c"];

  function context() {
    return canvas?.getContext("2d") ?? null;
  }

  function redraw() {
    const ctx = context();
    if (!ctx || !canvas) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes) {
      if (stroke.points.length === 1) {
        ctx.beginPath();
        ctx.fillStyle = stroke.color;
        ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (stroke.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.width;
        ctx.stroke();
      }
    }
    ctx.textBaseline = "top";
    for (const stamp of stamps) {
      ctx.font = `600 ${stamp.size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = stamp.color;
      ctx.fillText(stamp.text, stamp.x, stamp.y);
    }
    ctx.restore();
  }

  function sizeCanvas() {
    if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * ratio);
    canvas.height = Math.floor(canvas.clientHeight * ratio);
    const ctx = context();
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    redraw();
  }

  $effect(() => {
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);
    return () => window.removeEventListener("resize", sizeCanvas);
  });

  // The canvas has no size while hidden, so (re)size every time it opens.
  $effect(() => {
    if (open) sizeCanvas();
  });

  function position(event: PointerEvent) {
    const rect = canvas!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function distToSegment(p: Point, a: Point, b: Point) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  function strokeHit(stroke: Stroke, p: Point, threshold: number) {
    if (stroke.points.length === 1) {
      return Math.hypot(p.x - stroke.points[0].x, p.y - stroke.points[0].y) <= threshold;
    }
    for (let i = 1; i < stroke.points.length; i++) {
      if (distToSegment(p, stroke.points[i - 1], stroke.points[i]) <= threshold) return true;
    }
    return false;
  }

  function eraseAt(p: Point) {
    const before = strokes.length;
    strokes = strokes.filter((stroke) => !strokeHit(stroke, p, Math.max(10, stroke.width / 2 + 6)));
    if (strokes.length !== before) redraw();
  }

  function startStroke(event: PointerEvent) {
    const ctx = context();
    if (!ctx || !canvas) return;
    if (erasing) {
      eraseAt(position(event));
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
      return;
    }
    if (textArmed && !editor) {
      const { x, y } = position(event);
      editorText = "";
      editor = { x, y };
      return;
    }
    if (editor) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    drawing = true;
    const { x, y } = position(event);
    currentStroke = { id: `s-${nextId++}`, points: [{ x, y }], color, width: lineWidth };
    strokes.push(currentStroke);
    redraw();
  }

  function continueStroke(event: PointerEvent) {
    if (erasing) {
      if (event.buttons > 0) eraseAt(position(event));
      return;
    }
    if (!drawing || !currentStroke) return;
    currentStroke.points.push(position(event));
    redraw();
  }

  function endStroke() {
    drawing = false;
    currentStroke = null;
  }

  function commitText() {
    if (!editor) return;
    const text = editorText.trim();
    if (text) {
      stamps.push({
        id: `t-${nextId++}`,
        x: editor.x,
        y: editor.y,
        text,
        color,
        size: 14 + lineWidth * 2
      });
      redraw();
    }
    editor = null;
    editorText = "";
  }

  function cancelText() {
    editor = null;
    editorText = "";
  }

  $effect(() => {
    if (editor) textInput?.focus();
  });

  function clearCanvas() {
    strokes = [];
    stamps = [];
    editor = null;
    editorText = "";
    redraw();
  }
</script>

<div
  class="fixed inset-0 z-50 flex flex-col {open ? '' : 'hidden'}"
  role="dialog"
  aria-label="Sketch pad"
  aria-hidden={open ? undefined : "true"}
>
  <div class="relative min-h-0 flex-1">
    <canvas
      bind:this={canvas}
      class="absolute inset-0 h-full w-full touch-none {textArmed ? 'cursor-text' : 'cursor-crosshair'}"
      onpointerdown={startStroke}
      onpointermove={continueStroke}
      onpointerup={endStroke}
      onpointercancel={endStroke}
      onpointerleave={endStroke}
    ></canvas>
    {#if editor}
      <input
        bind:this={textInput}
        bind:value={editorText}
        maxlength={120}
        size={Math.max(10, editorText.length + 2)}
        placeholder="Type…"
        aria-label="Textbox content"
        class="absolute max-w-[80vw] rounded border border-primary bg-card px-1.5 py-0.5 shadow-lg outline-none"
        style="left: {editor.x}px; top: {editor.y}px; color: {color}; font-size: {14 + lineWidth * 2}px;"
        onkeydown={(e) => {
          if (e.key === "Enter") commitText();
          else if (e.key === "Escape") cancelText();
        }}
      />
    {/if}
  </div>
  <div
    class="absolute bottom-4 left-1/2 z-10 flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-2.5 py-1.5 shadow-xl sm:gap-2"
    role="toolbar"
    aria-label="Sketch tools"
  >
    <div class="flex items-center gap-1" role="group" aria-label="Pen colour">
      {#each colors as swatch}
        <button
          type="button"
          class="h-6 w-6 rounded-full border-2 {color === swatch && !erasing
            ? 'border-primary'
            : 'border-border'}"
          style="background-color: {swatch};"
          aria-label="Pen colour {swatch}"
          aria-pressed={color === swatch && !erasing}
          onclick={() => {
            color = swatch;
            erasing = false;
            textArmed = false;
          }}
        ></button>
      {/each}
    </div>
    <div class="flex items-center gap-1.5">
      <Label for="sketch-width" class="text-xs text-muted-foreground">Size</Label>
      <input
        id="sketch-width"
        type="range"
        min={2}
        max={16}
        step={1}
        bind:value={lineWidth}
        class="h-1 w-16 accent-primary"
      />
    </div>
    <Button
      variant={erasing ? "default" : "outline"}
      size="sm"
      onclick={() => {
        erasing = !erasing;
        textArmed = false;
      }}
      aria-pressed={erasing}
    >
      <Eraser class="h-4 w-4" /> Eraser
    </Button>
    <Button
      variant={textArmed ? "default" : "outline"}
      size="sm"
      onclick={() => {
        textArmed = !textArmed;
        erasing = false;
      }}
      aria-pressed={textArmed}
    >
      <Type class="h-4 w-4" /> Text
    </Button>
    <Button variant="outline" size="sm" onclick={clearCanvas}>
      <Trash class="h-4 w-4" /> Clear
    </Button>
    <Button size="sm" onclick={onclose}>
      <X class="h-4 w-4" /> Done
    </Button>
  </div>
</div>
