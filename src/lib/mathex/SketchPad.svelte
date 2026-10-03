<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import Eraser from "@lucide/svelte/icons/eraser";
  import Trash from "@lucide/svelte/icons/trash";
  import Type from "@lucide/svelte/icons/type";
  import Pen from "@lucide/svelte/icons/pen";
  import Mouse from "@lucide/svelte/icons/mouse";
  import X from "@lucide/svelte/icons/x";

  let { open = true, onclose = () => {} }: { open?: boolean; onclose?: () => void } = $props();

  type Point = { x: number; y: number };
  type Stroke = { id: string; points: Point[]; color: string; width: number };
  type TextBox = {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    text: string;
    color: string;
    fontSize: number;
  };
  type EditorState = { id: string | null; x: number; y: number };

  const MIN_W = 60;
  const MIN_H = 36;
  const PAD = 6;
  const BORDER_TOL = 7;
  const HANDLE_R = 14;

  let canvas: HTMLCanvasElement | null = $state(null);
  // Every line and textbox is stored individually so they can be
  // erased, moved, resized and re-edited after the fact.
  let strokes: Stroke[] = $state([]);
  let boxes: TextBox[] = $state([]);
  let nextId = 1;

  let drawing = $state(false);
  let currentStroke: Stroke | null = null;
  let tool: "pen" | "eraser" | "text" | "interact" = $state("pen");
  let color = $state("#171717");
  let colorTouched = false;

  // White ink by default in dark mode so strokes stay visible.
  function syncDefaultColor() {
    if (colorTouched) return;
    try {
      color = document.documentElement.classList.contains("dark") ? "#ffffff" : "#171717";
    } catch {
      // No DOM (SSR): keep the light-mode default.
    }
  }

  onMount(() => {
    syncDefaultColor();
    const observer = new MutationObserver(syncDefaultColor);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  });
  let lineWidth = $state(4);

  let selectedId: string | null = $state(null);
  let editor: EditorState | null = $state(null);
  let editorText = $state("");
  let textInput: HTMLTextAreaElement | null = $state(null);
  let editorW = $state(MIN_W);
  let editorH = $state(MIN_H);
  let colorOpen = $state(false);
  let eraserPos: Point | null = $state(null);
  let moveDrag: { id: string; lastX: number; lastY: number } | null = null;
  let resizeDrag: { id: string; startW: number; startH: number; startX: number; startY: number } | null = null;

  const colors = ["#171717", "#ffffff", "#dc2626", "#2563eb", "#16a34a", "#9333ea", "#ea580c"];

  const selectedBox = $derived(boxes.find((b) => b.id === selectedId) ?? null);
  const editorBox = $derived.by(() => {
    const ed = editor;
    if (!ed || !ed.id) return null;
    return boxes.find((b) => b.id === ed.id) ?? null;
  });
  const chromeBox = $derived.by(() => {
    const box = selectedBox;
    if (!box) return null;
    if (editor && editor.id === box.id) {
      return {
        x: box.x,
        y: box.y,
        w: Math.max(box.w, editorW + PAD * 2),
        h: Math.max(box.h, editorH + PAD * 2)
      };
    }
    return { x: box.x, y: box.y, w: box.w, h: box.h };
  });

  function context() {
    return canvas?.getContext("2d") ?? null;
  }

  function fontOf(size: number) {
    return `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
  }

  function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    const lines: string[] = [];
    for (const para of text.split("\n")) {
      const words = para.match(/\S+\s*/g) ?? [""];
      let line = "";
      for (const word of words) {
        const trial = line + word;
        if (line && ctx.measureText(trial).width > maxW) {
          lines.push(line.replace(/\s+$/, ""));
          line = word.replace(/^\s+/, "");
          while (line && ctx.measureText(line).width > maxW) {
            let cut = line.length;
            while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxW) cut--;
            cut = Math.max(1, cut);
            lines.push(line.slice(0, cut));
            line = line.slice(cut).replace(/^\s+/, "");
          }
        } else {
          line = trial;
        }
      }
      lines.push(line.replace(/\s+$/, ""));
    }
    return lines;
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
    for (const box of boxes) {
      if (editor && editor.id === box.id) continue;
      ctx.font = fontOf(box.fontSize);
      ctx.fillStyle = box.color;
      const lines = wrapText(ctx, box.text, Math.max(10, box.w - PAD * 2));
      const lh = box.fontSize * 1.25;
      lines.forEach((line, i) => ctx.fillText(line, box.x + PAD, box.y + PAD + i * lh));
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

  function position(event: PointerEvent): Point {
    const rect = canvas!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function insideBox(p: Point, b: TextBox, tol = 0) {
    return p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol;
  }

  function onBorder(p: Point, b: TextBox, tol = BORDER_TOL) {
    if (!insideBox(p, b, tol)) return false;
    if (!insideBox(p, b, 0)) return true;
    const edge = Math.min(p.x - b.x, b.x + b.w - p.x, p.y - b.y, b.y + b.h - p.y);
    return edge <= tol;
  }

  function onHandle(p: Point, b: TextBox) {
    return Math.hypot(p.x - (b.x + b.w), p.y - (b.y + b.h)) <= HANDLE_R;
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

  // Eraser disc radius. A stroke is erased when the disc touches it.
  function eraserRadius() {
    return lineWidth * 1.5;
  }

  function eraseAt(p: Point) {
    const radius = eraserRadius();
    const strokeHits = new Set(
      strokes.filter((s) => strokeHit(s, p, radius + s.width / 2)).map((s) => s.id)
    );
    const boxHits = boxes.filter((b) => insideBox(p, b, radius)).map((b) => b.id);
    if (strokeHits.size === 0 && boxHits.length === 0) return;
    strokes = strokes.filter((s) => !strokeHits.has(s.id));
    boxes = boxes.filter((b) => !boxHits.includes(b.id));
    if (selectedId && boxHits.includes(selectedId)) selectedId = null;
    if (editor && editor.id && boxHits.includes(editor.id)) {
      editor = null;
      editorText = "";
    }
    redraw();
  }

  function fitEditor() {
    const el = textInput;
    const ed = editor;
    if (!el || !ed) return;
    const existing = ed.id ? (boxes.find((b) => b.id === ed.id) ?? null) : null;
    if (existing) {
      el.style.width = `${Math.max(10, existing.w - PAD * 2)}px`;
      el.style.whiteSpace = "pre-wrap";
    } else {
      // A fresh box grows lengthwise with the text until it hits the screen edge.
      const containerW = canvas?.clientWidth || window.innerWidth;
      const maxW = Math.max(MIN_W, containerW - ed.x - 12);
      el.style.width = "auto";
      el.style.whiteSpace = "pre";
      const need = el.scrollWidth + 4;
      if (need >= maxW) {
        el.style.width = `${maxW}px`;
        el.style.whiteSpace = "pre-wrap";
      } else {
        el.style.width = `${Math.max(MIN_W, need)}px`;
      }
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    editorW = el.offsetWidth;
    editorH = el.offsetHeight;
  }

  $effect(() => {
    if (editor) {
      editorText;
      textInput?.focus();
      fitEditor();
    }
  });

  function commitText() {
    const ed = editor;
    if (!ed) return;
    const text = editorText.replace(/\s+$/, "");
    const existing = ed.id ? (boxes.find((b) => b.id === ed.id) ?? null) : null;
    if (!text) {
      // Nothing to stamp: drop a fresh box, leave an edited one as it was.
      editor = null;
      editorText = "";
      return;
    }
    const fontSize = existing?.fontSize ?? 14 + lineWidth * 2;
    const containerW = canvas?.clientWidth || window.innerWidth;
    let w = existing
      ? Math.max(existing.w, editorW + PAD * 2)
      : Math.min(Math.max(editorW + PAD * 2, MIN_W), Math.max(MIN_W, containerW - ed.x - 8));
    let h = Math.max(existing?.h ?? MIN_H, editorH + PAD * 2, MIN_H);
    const ctx = context();
    if (ctx) {
      ctx.save();
      ctx.font = fontOf(fontSize);
      const lines = wrapText(ctx, text, Math.max(10, w - PAD * 2));
      h = Math.max(h, lines.length * fontSize * 1.25 + PAD * 2);
      ctx.restore();
    }
    if (existing) {
      existing.text = text;
      existing.w = w;
      existing.h = h;
      selectedId = existing.id;
    } else {
      const id = `tb-${Date.now().toString(36)}-${nextId++}`;
      boxes.push({ id, x: ed.x, y: ed.y, w, h, text, color, fontSize });
      selectedId = id;
    }
    editor = null;
    editorText = "";
    redraw();
  }

  function cancelText() {
    editor = null;
    editorText = "";
  }

  function capturePointer(target: EventTarget | null, pointerId: number) {
    try {
      (target as Element | null)?.setPointerCapture?.(pointerId);
    } catch {
      // Synthetic or already-released pointers have nothing to capture;
      // gestures still work, they just won't be retargeted.
    }
  }

  function setTool(next: "pen" | "eraser" | "text" | "interact") {
    tool = tool === next ? "pen" : next;
  }

  function textDown(event: PointerEvent, p: Point) {
    commitText();
    const ordered = [...boxes].reverse();
    const sel = selectedBox;
    if (sel && onHandle(p, sel)) {
      resizeDrag = { id: sel.id, startW: sel.w, startH: sel.h, startX: p.x, startY: p.y };
      capturePointer(event.target, event.pointerId);
      return;
    }
    const border = ordered.find((b) => onBorder(p, b));
    if (border) {
      selectedId = border.id;
      moveDrag = { id: border.id, lastX: p.x, lastY: p.y };
      capturePointer(event.target, event.pointerId);
      return;
    }
    const inner = ordered.find((b) => insideBox(p, b, 0));
    if (inner) {
      selectedId = inner.id;
      editor = { id: inner.id, x: inner.x, y: inner.y };
      editorText = inner.text;
      return;
    }
    selectedId = null;
    editor = { id: null, x: p.x, y: p.y };
    editorText = "";
  }

  function onDown(event: PointerEvent) {
    if (!canvas) return;
    colorOpen = false;
    const p = position(event);
    if (tool === "eraser") {
      commitText();
      eraseAt(p);
      capturePointer(event.target, event.pointerId);
      return;
    }
    if (tool === "text") {
      textDown(event, p);
      return;
    }
    commitText();
    capturePointer(event.target, event.pointerId);
    drawing = true;
    currentStroke = { id: `s-${nextId++}`, points: [p], color, width: lineWidth };
    strokes.push(currentStroke);
    // Re-acquire the stored reference: values entering $state can come
    // back wrapped, so the pre-push object must not be mutated afterwards.
    currentStroke = strokes[strokes.length - 1];
    redraw();
  }

  function onMove(event: PointerEvent) {
    if (event.buttons === 0) {
      // No button held: end any stale gesture (e.g. a pointerup missed
      // outside the canvas) and just track the eraser ring.
      if (drawing || currentStroke || moveDrag || resizeDrag) onUp();
      if (tool === "eraser") eraserPos = position(event);
      return;
    }
    const drag = moveDrag;
    if (drag) {
      const box = boxes.find((b) => b.id === drag.id);
      if (box) {
        const p = position(event);
        box.x += p.x - drag.lastX;
        box.y += p.y - drag.lastY;
        drag.lastX = p.x;
        drag.lastY = p.y;
        redraw();
      }
      return;
    }
    const resize = resizeDrag;
    if (resize) {
      const box = boxes.find((b) => b.id === resize.id);
      if (box) {
        const p = position(event);
        box.w = Math.max(MIN_W, resize.startW + (p.x - resize.startX));
        box.h = Math.max(MIN_H, resize.startH + (p.y - resize.startY));
        if (editor && editor.id === box.id) fitEditor();
        redraw();
      }
      return;
    }
    if (drawing && currentStroke) {
      // Re-resolve the stored stroke every move: the held reference can
      // detach from what $state actually stores.
      const stored = strokes.find((s) => s.id === currentStroke!.id);
      if (stored) {
        currentStroke = stored;
        stored.points.push(position(event));
        redraw();
      }
      return;
    }
    if (tool === "eraser") {
      const p = position(event);
      eraserPos = p;
      eraseAt(p);
      return;
    }
  }

  // In interact mode the page behind receives pointer events, so watch
  // for an answer being submitted and close the pad afterwards.
  $effect(() => {
    if (tool === "interact" && open) {
      const close = () => onclose();
      window.addEventListener("submit", close, true);
      return () => window.removeEventListener("submit", close, true);
    }
  });

  function onUp() {
    drawing = false;
    currentStroke = null;
    moveDrag = null;
    resizeDrag = null;
    eraserPos = null;
  }

  function clearCanvas() {
    strokes = [];
    boxes = [];
    selectedId = null;
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
      class="absolute inset-0 h-full w-full touch-none {tool === 'interact' ? 'pointer-events-none' : ''}"
      onpointerdown={onDown}
      onpointermove={onMove}
      onpointerup={onUp}
      onpointercancel={onUp}
      onlostpointercapture={onUp}
    ></canvas>
    {#if tool === "eraser" && eraserPos}
      {@const diameter = eraserRadius() * 2}
      <div
        class="pointer-events-none absolute rounded-full border-2 border-dashed border-foreground/70"
        style="left: {eraserPos.x - eraserRadius()}px; top: {eraserPos.y -
          eraserRadius()}px; width: {diameter}px; height: {diameter}px;"
        aria-hidden="true"
      ></div>
    {/if}
    {#if chromeBox}
      <div
        class="pointer-events-none absolute"
        style="left: {chromeBox.x}px; top: {chromeBox.y}px; width: {chromeBox.w}px; height: {chromeBox.h}px;"
      >
        <div class="absolute inset-0 rounded-sm border-2 border-dashed border-primary"></div>
        <div
          class="absolute -right-2.5 -bottom-2.5 h-5 w-5 rounded-full border-2 border-primary bg-card shadow"
          title="Drag to resize"
        ></div>
      </div>
    {/if}
    {#if editor}
      {@const size = editorBox ? editorBox.fontSize : 14 + lineWidth * 2}
      {@const ex = editorBox ? editorBox.x + PAD : editor.x}
      {@const ey = editorBox ? editorBox.y + PAD : editor.y}
      <textarea
        bind:this={textInput}
        bind:value={editorText}
        rows={1}
        maxlength={500}
        placeholder="Type…"
        aria-label="Textbox content"
        class="absolute block resize-none overflow-hidden rounded-sm bg-card p-0 leading-[1.25] shadow-lg outline outline-2 outline-primary/60"
        style="left: {ex}px; top: {ey}px; color: {editorBox ? editorBox.color : color}; font: 600 {size}px ui-sans-serif, system-ui, sans-serif;"
        onblur={commitText}
        onkeydown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitText();
          } else if (e.key === "Escape") {
            cancelText();
          }
        }}
      ></textarea>
    {/if}
  </div>
  <div
    class="absolute bottom-4 left-1/2 z-10 flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-2.5 py-1.5 shadow-xl sm:gap-2"
    role="toolbar"
    aria-label="Sketch tools"
  >
    <div class="relative">
      <button
        type="button"
        class="block h-8 w-8 rounded-full border-2 border-border shadow-inner"
        style="background-color: {color};"
        aria-label="Pen colour, currently {color}"
        aria-haspopup="true"
        aria-expanded={colorOpen}
        onclick={() => (colorOpen = !colorOpen)}
      ></button>
      {#if colorOpen}
        <div
          class="absolute bottom-10 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-border bg-card p-2 shadow-xl"
          role="group"
          aria-label="Choose pen colour"
        >
          {#each colors as swatch}
            <button
              type="button"
              class="h-6 w-6 shrink-0 rounded-full border-2 {color === swatch
                ? 'border-primary'
                : 'border-border'}"
              style="background-color: {swatch};"
              aria-label="Pen colour {swatch}"
              aria-pressed={color === swatch}
              onclick={() => {
                color = swatch;
                colorTouched = true;
                colorOpen = false;
              }}
            ></button>
          {/each}
          <label
            class="relative h-6 w-6 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-muted-foreground"
            title="Custom colour"
          >
            <span class="sr-only">Custom colour</span>
            <input
              type="color"
              value={color}
              class="absolute inset-0 h-full w-full cursor-pointer opacity-100"
              aria-label="Custom colour"
              oninput={(e) => {
                color = e.currentTarget.value;
                colorTouched = true;
              }}
              onchange={() => (colorOpen = false)}
            />
          </label>
        </div>
      {/if}
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
      variant={tool === "pen" ? "default" : "outline"}
      size="sm"
      onclick={() => setTool("pen")}
      aria-pressed={tool === "pen"}
    >
      <Pen class="h-4 w-4" /> Pen
    </Button>
    <Button
      variant={tool === "eraser" ? "default" : "outline"}
      size="sm"
      onclick={() => setTool("eraser")}
      aria-pressed={tool === "eraser"}
    >
      <Eraser class="h-4 w-4" /> Eraser
    </Button>
    <Button
      variant={tool === "text" ? "default" : "outline"}
      size="sm"
      onclick={() => setTool("text")}
      aria-pressed={tool === "text"}
    >
      <Type class="h-4 w-4" /> Text
    </Button>
    <Button
      variant={tool === "interact" ? "default" : "outline"}
      size="sm"
      onclick={() => setTool("interact")}
      aria-pressed={tool === "interact"}
      title="Scroll, answer and submit on the page behind the sketch"
    >
      <Mouse class="h-4 w-4" /> Interact
    </Button>
    <Button variant="outline" size="sm" onclick={clearCanvas}>
      <Trash class="h-4 w-4" /> Clear
    </Button>
    <Button size="sm" onclick={onclose}>
      <X class="h-4 w-4" /> Done
    </Button>
  </div>
</div>
