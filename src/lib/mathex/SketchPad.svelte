<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import Eraser from "@lucide/svelte/icons/eraser";
  import Trash from "@lucide/svelte/icons/trash";
  import X from "@lucide/svelte/icons/x";

  let { onclose = () => {} }: { onclose?: () => void } = $props();

  let canvas: HTMLCanvasElement | null = $state(null);
  let drawing = $state(false);
  let color = $state("#171717");
  let erasing = $state(false);
  let lineWidth = $state(4);

  const colors = ["#171717", "#dc2626", "#2563eb", "#16a34a", "#9333ea", "#ea580c"];

  function context() {
    return canvas?.getContext("2d") ?? null;
  }

  function sizeCanvas() {
    if (!canvas) return;
    const snapshot = canvas.width > 0 ? canvas.toDataURL() : null;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    const ctx = context();
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (snapshot) {
      const img = new Image();
      img.onload = () => {
        const target = context();
        if (target) target.drawImage(img, 0, 0, window.innerWidth, window.innerHeight);
      };
      img.src = snapshot;
    }
  }

  $effect(() => {
    sizeCanvas();
    window.addEventListener("resize", sizeCanvas);
    return () => window.removeEventListener("resize", sizeCanvas);
  });

  function position(event: PointerEvent) {
    const rect = canvas!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startStroke(event: PointerEvent) {
    const ctx = context();
    if (!ctx || !canvas) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    drawing = true;
    const { x, y } = position(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y + 0.01);
    ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = erasing ? lineWidth * 3 : lineWidth;
    ctx.stroke();
  }

  function continueStroke(event: PointerEvent) {
    if (!drawing) return;
    const ctx = context();
    if (!ctx) return;
    const { x, y } = position(event);
    ctx.lineTo(x, y);
    ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.lineWidth = erasing ? lineWidth * 3 : lineWidth;
    ctx.stroke();
  }

  function clearCanvas() {
    const ctx = context();
    if (!ctx || !canvas) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
</script>

<div class="fixed inset-0 z-50 flex flex-col bg-white dark:bg-zinc-950" role="dialog" aria-label="Sketch pad">
  <div class="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2 sm:gap-3">
    <span class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sketch pad</span>
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
        class="h-1 w-20 accent-primary"
      />
    </div>
    <Button
      variant={erasing ? "default" : "outline"}
      size="sm"
      onclick={() => (erasing = !erasing)}
      aria-pressed={erasing}
    >
      <Eraser class="h-4 w-4" /> Eraser
    </Button>
    <Button variant="outline" size="sm" onclick={clearCanvas}>
      <Trash class="h-4 w-4" /> Clear
    </Button>
    <Button size="sm" class="ml-auto" onclick={onclose}>
      <X class="h-4 w-4" /> Done
    </Button>
  </div>
  <canvas
    bind:this={canvas}
    class="min-h-0 flex-1 touch-none cursor-crosshair"
    onpointerdown={startStroke}
    onpointermove={continueStroke}
    onpointerup={() => (drawing = false)}
    onpointercancel={() => (drawing = false)}
    onpointerleave={() => (drawing = false)}
  ></canvas>
</div>
