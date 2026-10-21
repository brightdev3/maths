<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { renderMath } from "$lib/mathex/content";
  import NumberAnswer from "$lib/mathex/answers/NumberAnswer.svelte";
  import TextAnswer from "$lib/mathex/answers/TextAnswer.svelte";
  import ExpressionAnswer from "$lib/mathex/answers/ExpressionAnswer.svelte";
  import Eraser from "@lucide/svelte/icons/eraser";
  import Trash from "@lucide/svelte/icons/trash";
  import Type from "@lucide/svelte/icons/type";
  import Pen from "@lucide/svelte/icons/pen";
  import Undo from "@lucide/svelte/icons/undo";
  import Redo from "@lucide/svelte/icons/redo";
  import MousePointer2 from "@lucide/svelte/icons/mouse-pointer-2";
  import Shapes from "@lucide/svelte/icons/shapes";
  import Lock from "@lucide/svelte/icons/lock";
  import LockOpen from "@lucide/svelte/icons/lock-open";
  import Move from "@lucide/svelte/icons/move";
  import Eye from "@lucide/svelte/icons/eye";
  import Layers2 from "@lucide/svelte/icons/layers-2";
  import StickyNote from "@lucide/svelte/icons/sticky-note";
  import FileQuestion from "@lucide/svelte/icons/file-question";
  import X from "@lucide/svelte/icons/x";

  type AnswerType = "number" | "text" | "expression";
  type AnswerValue = string | number | null;

  let {
    open = true,
    onclose = () => {},
    question = "",
    answerType = null,
    onanswersubmit = undefined
  }: {
    open?: boolean;
    onclose?: () => void;
    question?: string;
    answerType?: AnswerType | null;
    onanswersubmit?: (answer: string | number) => void;
  } = $props();

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
  type ShapeKind = "line" | "rect" | "ellipse" | "circle" | "polygon";
  type Shape = {
    id: string;
    kind: ShapeKind;
    // line: (x, y) -> (x + w, y + h); rect/ellipse: bounding box;
    // circle: x/y is the centre and (w, h) points at the circumference;
    // polygon: points holds the vertices and x/y/w/h its bounding box.
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
    width: number;
    points?: Point[];
  };
  type ShapeHandle = "start" | "end" | "nw" | "ne" | "sw" | "se" | "center" | "radius" | `vertex-${number}`;
  type Tool = "pen" | "eraser" | "text" | "interact" | "shape" | "move";
  type ViewMode = "overlay" | "grid" | "question";

  const MIN_W = 60;
  const MIN_H = 36;
  const PAD = 6;
  const BORDER_TOL = 7;
  const HANDLE_R = 14;

  let canvas: HTMLCanvasElement | null = $state(null);
  // Every stroke, textbox and shape is stored individually so they can be
  // erased, moved, resized and re-edited after the fact.
  let strokes: Stroke[] = $state([]);
  let boxes: TextBox[] = $state([]);
  let shapes: Shape[] = $state([]);
  let nextId = 1;

  type Scene = { strokes: Stroke[]; boxes: TextBox[]; shapes: Shape[] };
  let history: Scene[] = $state([{ strokes: [], boxes: [], shapes: [] }]);
  let historyIndex = $state(0);

  // structuredClone throws on $state proxies (DataCloneError), so scenes
  // are copied through JSON: the scene is plain data (no functions/DOM).
  function cloneScene(scene: Scene): Scene {
    return JSON.parse(JSON.stringify(scene)) as Scene;
  }

  function snapshot() {
    history = [...history.slice(0, historyIndex + 1), cloneScene({ strokes, boxes, shapes })].slice(-50);
    historyIndex = history.length - 1;
  }

  function restoreScene(index: number) {
    const scene = history[index];
    if (!scene) return;
    const copy = cloneScene(scene);
    historyIndex = index;
    strokes = copy.strokes;
    boxes = copy.boxes;
    shapes = copy.shapes;
    selectedId = null;
    hoverId = null;
    editor = null;
    editorText = "";
    currentStroke = null;
    drawing = false;
    moveDrag = null;
    resizeDrag = null;
    shapeDraw = null;
    shapeHandleDrag = null;
    shapeMoveDrag = null;
    redraw();
  }

  function undo() {
    if (historyIndex > 0) restoreScene(historyIndex - 1);
  }

  function redo() {
    if (historyIndex < history.length - 1) restoreScene(historyIndex + 1);
  }

  let drawing = $state(false);
  let currentStroke: Stroke | null = null;
  let tool = $state<Tool>("pen");
  let shapeKind: ShapeKind = $state("line");
  let polygonSides = $state(3);
  let shapesOpen = $state(false);
  let viewOpen = $state(false);
  let view: ViewMode = $state("overlay");
  let regularShapes = $state(false);
  let sketchAnswer = $state<AnswerValue>(null);
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
  let hoverId: string | null = $state(null);
  let hoverShapeId: string | null = $state(null);
  let moveDrag: { id: string; lastX: number; lastY: number } | null = null;
  let resizeDrag: { id: string; startW: number; startH: number; startX: number; startY: number } | null = null;
  let shapeDraw: { id: string; startX: number; startY: number } | null = null;
  let shapeHandleDrag: {
    id: string;
    handle: ShapeHandle;
    anchorX: number;
    anchorY: number;
    startW: number;
    startH: number;
    dirX: number;
    dirY: number;
  } | null = null;
  let shapeMoveDrag: { id: string; lastX: number; lastY: number } | null = null;

  const colors = ["#171717", "#ffffff", "#dc2626", "#2563eb", "#16a34a", "#9333ea", "#ea580c"];

  const selectedBox = $derived(boxes.find((b) => b.id === selectedId) ?? null);
  const selectedShape = $derived(shapes.find((s) => s.id === selectedId) ?? null);
  const hoverBox = $derived(boxes.find((b) => b.id === hoverId) ?? null);
  const hoverShape = $derived(shapes.find((s) => s.id === hoverShapeId) ?? null);
  const canShowQuestion = $derived(question.trim() !== "" && !!answerType && !!onanswersubmit);
  const pageInteraction = $derived(tool === "interact" && view === "overlay");
  const canSubmitSketch = $derived(sketchAnswer !== null && sketchAnswer !== "");

  $effect(() => {
    question;
    answerType;
    sketchAnswer = null;
  });

  $effect(() => {
    if (!canShowQuestion && view === "question") view = "overlay";
  });
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
    // Break opportunities after whitespace and after punctuation, mirroring
    // how the browser wraps the editor textarea (e.g. after ! ? ; : , . -).
    const BREAK_AFTER = new Set(["-", "!", "?", ";", ":", ",", ".", ")", "]", "}", "…", "—", "–", "/"]);
    const isOpener = (ch: string) => ch === "(" || ch === "[" || ch === "{";
    const tokens: string[] = [];
    for (const para of text.split("\n")) {
      for (const part of para.match(/\S+|\s+/g) ?? [""]) {
        if (/^\s+$/.test(part) || part === "") {
          tokens.push(part);
          continue;
        }
        let cur = "";
        const chars = [...part];
        for (let i = 0; i < chars.length; i++) {
          if (cur && isOpener(chars[i])) {
            tokens.push(cur);
            cur = "";
          }
          cur += chars[i];
          const last = i === chars.length - 1;
          const next = chars[i + 1];
          if (last || (BREAK_AFTER.has(chars[i]) && next !== undefined && !/\s/.test(next))) {
            tokens.push(cur);
            cur = "";
          }
        }
        if (cur) tokens.push(cur);
      }
      tokens.push("\n");
    }
    const lines: string[] = [];
    let line = "";
    const pushLine = () => {
      lines.push(line.replace(/\s+$/, ""));
      line = "";
    };
    for (const tok of tokens) {
      if (tok === "\n") {
        pushLine();
        continue;
      }
      if (/^\s+$/.test(tok)) {
        if (line && ctx.measureText(line + tok).width > maxW) {
          pushLine();
          continue;
        }
        line += tok;
        continue;
      }
      if (line && ctx.measureText(line + tok).width > maxW) pushLine();
      let rest = tok;
      while (rest && ctx.measureText(line + rest).width > maxW) {
        let cut = rest.length;
        while (cut > 1 && ctx.measureText(line + rest.slice(0, cut)).width > maxW) cut--;
        cut = Math.max(1, cut);
        line += rest.slice(0, cut);
        rest = rest.slice(cut);
        if (rest) pushLine();
      }
      line += rest;
    }
    return lines;
  }

  function drawShape(ctx: CanvasRenderingContext2D, shape: Shape) {
    ctx.beginPath();
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.width;
    if (shape.kind === "line") {
      ctx.moveTo(shape.x, shape.y);
      ctx.lineTo(shape.x + shape.w, shape.y + shape.h);
    } else if (shape.kind === "rect") {
      ctx.rect(shape.x, shape.y, shape.w, shape.h);
    } else if (shape.kind === "ellipse") {
      ctx.ellipse(
        shape.x + shape.w / 2,
        shape.y + shape.h / 2,
        Math.abs(shape.w) / 2,
        Math.abs(shape.h) / 2,
        0,
        0,
        Math.PI * 2
      );
    } else if (shape.kind === "polygon") {
      const points = shape.points ?? [];
      if (points.length < 2) return;
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
    } else {
      ctx.arc(shape.x, shape.y, Math.hypot(shape.w, shape.h), 0, Math.PI * 2);
    }
    ctx.stroke();
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
    for (const shape of shapes) drawShape(ctx, shape);
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

  function shapeBox(shape: Shape) {
    const x = Math.min(shape.x, shape.x + shape.w);
    const y = Math.min(shape.y, shape.y + shape.h);
    return { x, y, w: Math.abs(shape.w), h: Math.abs(shape.h) };
  }

  function refreshPolygonBox(shape: Shape) {
    const points = shape.points ?? [];
    if (points.length === 0) {
      shape.w = 0;
      shape.h = 0;
      return;
    }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    shape.x = Math.min(...xs);
    shape.y = Math.min(...ys);
    shape.w = Math.max(...xs) - shape.x;
    shape.h = Math.max(...ys) - shape.y;
  }

  function translateShape(shape: Shape, dx: number, dy: number) {
    shape.x += dx;
    shape.y += dy;
    if (shape.kind === "polygon") {
      for (const point of shape.points ?? []) {
        point.x += dx;
        point.y += dy;
      }
    }
  }

  function shapeHit(shape: Shape, p: Point, tol = 6) {
    const reach = tol + shape.width / 2;
    if (shape.kind === "line") {
      return distToSegment(p, { x: shape.x, y: shape.y }, { x: shape.x + shape.w, y: shape.y + shape.h }) <= reach;
    }
    if (shape.kind === "circle") {
      return Math.abs(Math.hypot(p.x - shape.x, p.y - shape.y) - Math.hypot(shape.w, shape.h)) <= reach;
    }
    if (shape.kind === "polygon") {
      const points = shape.points ?? [];
      if (points.length < 2) return false;
      for (let i = 0; i < points.length; i++) {
        if (distToSegment(p, points[i], points[(i + 1) % points.length]) <= reach) return true;
      }
      return false;
    }
    const box = shapeBox(shape);
    if (shape.kind === "rect") {
      const outer =
        p.x >= box.x - reach && p.x <= box.x + box.w + reach && p.y >= box.y - reach && p.y <= box.y + box.h + reach;
      const inner =
        p.x > box.x + reach && p.x < box.x + box.w - reach && p.y > box.y + reach && p.y < box.y + box.h - reach;
      return outer && !inner;
    }
    const rx = box.w / 2;
    const ry = box.h / 2;
    const cx = box.x + rx;
    const cy = box.y + ry;
    if (rx < 1 || ry < 1) return Math.hypot(p.x - cx, p.y - cy) <= reach;
    const nx = (p.x - cx) / rx;
    const ny = (p.y - cy) / ry;
    const norm = Math.hypot(nx, ny);
    if (norm === 0) return false;
    return Math.hypot(p.x - (cx + (nx / norm) * rx), p.y - (cy + (ny / norm) * ry)) <= reach;
  }

  function shapeHandlePoints(shape: Shape): { key: ShapeHandle; x: number; y: number }[] {
    if (shape.kind === "line") {
      return [
        { key: "start", x: shape.x, y: shape.y },
        { key: "end", x: shape.x + shape.w, y: shape.y + shape.h }
      ];
    }
    if (shape.kind === "circle") {
      return [
        { key: "center", x: shape.x, y: shape.y },
        { key: "radius", x: shape.x + shape.w, y: shape.y + shape.h }
      ];
    }
    if (shape.kind === "polygon") {
      return (shape.points ?? []).map((point, index) => ({
        key: `vertex-${index}` as ShapeHandle,
        x: point.x,
        y: point.y
      }));
    }
    const box = shapeBox(shape);
    return [
      { key: "nw", x: box.x, y: box.y },
      { key: "ne", x: box.x + box.w, y: box.y },
      { key: "sw", x: box.x, y: box.y + box.h },
      { key: "se", x: box.x + box.w, y: box.y + box.h }
    ];
  }

  function shapeHandleAt(p: Point, shape: Shape) {
    return shapeHandlePoints(shape).find((h) => Math.hypot(p.x - h.x, p.y - h.y) <= HANDLE_R)?.key ?? null;
  }

  // Eraser disc radius. A stroke is erased when the disc touches it.
  function eraserRadius() {
    return lineWidth * 1.5;
  }

  function eraseAt(p: Point) {
    const radius = eraserRadius();
    const strokeHits = new Set(strokes.filter((s) => strokeHit(s, p, radius + s.width / 2)).map((s) => s.id));
    const boxHits = boxes.filter((b) => insideBox(p, b, radius)).map((b) => b.id);
    const shapeHits = new Set(shapes.filter((s) => shapeHit(s, p, radius)).map((s) => s.id));
    if (strokeHits.size === 0 && boxHits.length === 0 && shapeHits.size === 0) return;
    strokes = strokes.filter((s) => !strokeHits.has(s.id));
    boxes = boxes.filter((b) => !boxHits.includes(b.id));
    shapes = shapes.filter((s) => !shapeHits.has(s.id));
    if (selectedId && (boxHits.includes(selectedId) || shapeHits.has(selectedId))) selectedId = null;
    if (editor && editor.id && boxHits.includes(editor.id)) {
      editor = null;
      editorText = "";
    }
    snapshot();
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
      if (existing) {
        // Clicked away with nothing typed: remove the box entirely.
        boxes = boxes.filter((b) => b.id !== existing.id);
        if (selectedId === existing.id) selectedId = null;
        snapshot();
        redraw();
      }
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
    snapshot();
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

  function setTool(next: Exclude<Tool, "shape">) {
    // Switching tools always stamps pending text first, so an open
    // editor can never strand the pad. Stray blurs (dialogs, devtools)
    // intentionally leave the text alone.
    commitText();
    hoverId = null;
    shapesOpen = false;
    viewOpen = false;
    tool = tool === next ? "pen" : next;
  }

  function chooseShape(kind: ShapeKind) {
    commitText();
    hoverId = null;
    hoverShapeId = null;
    colorOpen = false;
    viewOpen = false;
    shapeKind = kind;
    tool = "shape";
  }

  function chooseMove() {
    commitText();
    hoverId = null;
    hoverShapeId = null;
    colorOpen = false;
    viewOpen = false;
    tool = "move";
  }

  function toggleShapes() {
    commitText();
    hoverId = null;
    colorOpen = false;
    viewOpen = false;
    if (shapesOpen) {
      shapesOpen = false;
    } else {
      shapesOpen = true;
      if (tool !== "move") tool = "shape";
    }
  }

  function toggleView() {
    commitText();
    hoverId = null;
    colorOpen = false;
    shapesOpen = false;
    viewOpen = !viewOpen;
  }

  function chooseView(next: ViewMode) {
    commitText();
    view = next;
    viewOpen = false;
  }

  function submitSketchAnswer() {
    if (!onanswersubmit || !canSubmitSketch || sketchAnswer === null) return;
    onanswersubmit(sketchAnswer);
  }

  function clampPolygonSides(value: number) {
    return Math.min(24, Math.max(3, Math.round(value) || 3));
  }

  function onPolygonSidesInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const raw = input.valueAsNumber;
    if (!Number.isFinite(raw) || raw < 3) return;
    if (raw > 24) {
      polygonSides = 24;
      input.value = "24";
    } else {
      polygonSides = raw;
    }
  }

  function onPolygonSidesChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    polygonSides = clampPolygonSides(input.valueAsNumber);
    input.value = String(polygonSides);
  }

  function lineEnd(startX: number, startY: number, endX: number, endY: number, constrain: boolean): Point {
    if (!constrain) return { x: endX, y: endY };
    const angle = Math.atan2(endY - startY, endX - startX);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(endX - startX, endY - startY);
    return { x: startX + Math.cos(snapped) * length, y: startY + Math.sin(snapped) * length };
  }

  function updateShapeDraw(shape: Shape, draw: { startX: number; startY: number }, p: Point, constrain: boolean) {
    if (shape.kind === "line") {
      const end = lineEnd(draw.startX, draw.startY, p.x, p.y, constrain);
      shape.x = draw.startX;
      shape.y = draw.startY;
      shape.w = end.x - draw.startX;
      shape.h = end.y - draw.startY;
      return;
    }
    if (shape.kind === "circle") {
      shape.x = draw.startX;
      shape.y = draw.startY;
      shape.w = p.x - draw.startX;
      shape.h = p.y - draw.startY;
      return;
    }
    if (shape.kind === "polygon") {
      const sides = Math.min(24, Math.max(3, Math.round(polygonSides) || 3));
      const radius = Math.hypot(p.x - draw.startX, p.y - draw.startY);
      if (radius < 1) {
        shape.points = [];
        refreshPolygonBox(shape);
        return;
      }
      const startAngle = Math.atan2(p.y - draw.startY, p.x - draw.startX);
      shape.points = Array.from({ length: sides }, (_, index) => {
        const angle = startAngle + (index * Math.PI * 2) / sides;
        return {
          x: draw.startX + Math.cos(angle) * radius,
          y: draw.startY + Math.sin(angle) * radius
        };
      });
      refreshPolygonBox(shape);
      return;
    }
    let dx = p.x - draw.startX;
    let dy = p.y - draw.startY;
    if (constrain) {
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      dx = Math.sign(dx || 1) * side;
      dy = Math.sign(dy || 1) * side;
    }
    shape.x = Math.min(draw.startX, draw.startX + dx);
    shape.y = Math.min(draw.startY, draw.startY + dy);
    shape.w = Math.abs(dx);
    shape.h = Math.abs(dy);
  }

  function updateShapeHandle(
    shape: Shape,
    handle: ShapeHandle,
    p: Point,
    constrain: boolean,
    anchorX: number,
    anchorY: number,
    startW: number,
    startH: number,
    dirX: number,
    dirY: number
  ) {
    if (shape.kind === "polygon") {
      const points = shape.points ?? [];
      const index = Number(handle.replace("vertex-", ""));
      const vertex = points[index];
      if (!vertex) return;
      if (constrain) {
        // Scale every vertex around the polygon's centre so the whole
        // shape grows or shrinks proportionally.
        const centre = points.reduce(
          (acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }),
          { x: 0, y: 0 }
        );
        const oldRadius = Math.hypot(vertex.x - centre.x, vertex.y - centre.y);
        if (oldRadius < 0.001) return;
        const scale = Math.max(0.05, Math.hypot(p.x - centre.x, p.y - centre.y) / oldRadius);
        shape.points = points.map((point) => ({
          x: centre.x + (point.x - centre.x) * scale,
          y: centre.y + (point.y - centre.y) * scale
        }));
      } else {
        vertex.x = p.x;
        vertex.y = p.y;
      }
      refreshPolygonBox(shape);
      return;
    }
    if (shape.kind === "line") {
      if (handle === "start") {
        const endX = shape.x + shape.w;
        const endY = shape.y + shape.h;
        const start = lineEnd(endX, endY, p.x, p.y, constrain);
        shape.x = start.x;
        shape.y = start.y;
        shape.w = endX - start.x;
        shape.h = endY - start.y;
      } else {
        const end = lineEnd(shape.x, shape.y, p.x, p.y, constrain);
        shape.w = end.x - shape.x;
        shape.h = end.y - shape.y;
      }
      return;
    }
    if (shape.kind === "circle") {
      if (handle === "center") {
        shape.x = p.x;
        shape.y = p.y;
      } else {
        shape.w = p.x - shape.x;
        shape.h = p.y - shape.y;
      }
      return;
    }
    let dx = p.x - anchorX;
    let dy = p.y - anchorY;
    if (constrain && startW > 0 && startH > 0) {
      const scale = Math.max(Math.abs(dx) / startW, Math.abs(dy) / startH);
      const width = Math.max(1, startW * scale);
      const height = Math.max(1, startH * scale);
      const xDir = Math.sign(dx) || dirX;
      const yDir = Math.sign(dy) || dirY;
      shape.w = width;
      shape.h = height;
      shape.x = xDir < 0 ? anchorX - width : anchorX;
      shape.y = yDir < 0 ? anchorY - height : anchorY;
    } else {
      shape.x = Math.min(anchorX, anchorX + dx);
      shape.y = Math.min(anchorY, anchorY + dy);
      shape.w = Math.abs(dx);
      shape.h = Math.abs(dy);
    }
  }

  function moveShapeDown(event: PointerEvent, p: Point) {
    const selected = selectedShape;
    if (selected) {
      const handle = shapeHandleAt(p, selected);
      if (handle) {
        let anchorX = 0;
        let anchorY = 0;
        let startW = 0;
        let startH = 0;
        let dirX = 1;
        let dirY = 1;
        if (selected.kind === "rect" || selected.kind === "ellipse") {
          const box = shapeBox(selected);
          anchorX = box.x;
          anchorY = box.y;
          startW = box.w;
          startH = box.h;
          if (handle === "nw") {
            anchorX = box.x + box.w;
            anchorY = box.y + box.h;
            dirX = -1;
            dirY = -1;
          } else if (handle === "ne") {
            anchorY = box.y + box.h;
            dirY = -1;
          } else if (handle === "sw") {
            anchorX = box.x + box.w;
            dirX = -1;
          }
        }
        shapeHandleDrag = {
          id: selected.id,
          handle,
          anchorX,
          anchorY,
          startW,
          startH,
          dirX,
          dirY
        };
        capturePointer(event.target, event.pointerId);
        return;
      }
    }
    const hit = [...shapes].reverse().find((s) => shapeHit(s, p));
    if (hit) {
      selectedId = hit.id;
      hoverShapeId = hit.id;
      shapeMoveDrag = { id: hit.id, lastX: p.x, lastY: p.y };
      capturePointer(event.target, event.pointerId);
      return;
    }
    selectedId = null;
    hoverShapeId = null;
  }

  function shapeDown(event: PointerEvent, p: Point) {
    colorOpen = false;
    shapesOpen = false;
    commitText();
    if (tool === "move") {
      moveShapeDown(event, p);
      return;
    }
    selectedId = null;
    const id = `sh-${Date.now().toString(36)}-${nextId++}`;
    const shape: Shape = { id, kind: shapeKind, x: p.x, y: p.y, w: 0, h: 0, color, width: lineWidth };
    if (shapeKind === "polygon") shape.points = [];
    shapes.push(shape);
    shapeDraw = { id, startX: p.x, startY: p.y };
    capturePointer(event.target, event.pointerId);
    redraw();
  }

  function doneSketch() {
    commitText();
    onclose();
  }

  function textDown(event: PointerEvent, p: Point) {
    if (editor) {
      // Clicking anywhere while typing stamps the text instead of
      // starting anything new at the click point.
      commitText();
      selectedId = null;
      return;
    }
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
    shapesOpen = false;
    viewOpen = false;
    if (tool === "interact") {
      commitText();
      return;
    }
    const p = position(event);
    if (tool === "eraser") {
      selectedId = null;
      hoverShapeId = null;
      commitText();
      eraseAt(p);
      capturePointer(event.target, event.pointerId);
      return;
    }
    if (tool === "text") {
      hoverShapeId = null;
      textDown(event, p);
      return;
    }
    if (tool === "shape" || tool === "move") {
      shapeDown(event, p);
      return;
    }
    selectedId = null;
    hoverShapeId = null;
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
      if (drawing || currentStroke || moveDrag || resizeDrag || shapeDraw || shapeHandleDrag || shapeMoveDrag) onUp();
      if (tool === "eraser") eraserPos = position(event);
      if (tool === "text") {
        const p = position(event);
        hoverId = [...boxes].reverse().find((b) => insideBox(p, b, 0))?.id ?? null;
      }
      if (tool === "move") {
        const p = position(event);
        hoverShapeId = [...shapes].reverse().find((s) => shapeHit(s, p))?.id ?? null;
      } else {
        hoverShapeId = null;
      }
      return;
    }
    const shapeMove = shapeMoveDrag;
    if (shapeMove) {
      const shape = shapes.find((s) => s.id === shapeMove.id);
      if (shape) {
        const p = position(event);
        translateShape(shape, p.x - shapeMove.lastX, p.y - shapeMove.lastY);
        shapeMove.lastX = p.x;
        shapeMove.lastY = p.y;
        redraw();
      }
      return;
    }
    const shapeHandle = shapeHandleDrag;
    if (shapeHandle) {
      const shape = shapes.find((s) => s.id === shapeHandle.id);
      if (shape) {
        updateShapeHandle(
          shape,
          shapeHandle.handle,
          position(event),
          regularShapes || event.shiftKey,
          shapeHandle.anchorX,
          shapeHandle.anchorY,
          shapeHandle.startW,
          shapeHandle.startH,
          shapeHandle.dirX,
          shapeHandle.dirY
        );
        redraw();
      }
      return;
    }
    if (shapeDraw) {
      const shape = shapes.find((s) => s.id === shapeDraw!.id);
      if (shape) {
        updateShapeDraw(shape, shapeDraw, position(event), regularShapes || event.shiftKey);
        redraw();
      }
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

  // In interact mode the canvas ignores pointer events, so the window
  // listeners below claim clicks that land in a textbox (opening it for
  // editing) and track hover state; everything else passes through.
  function interactPoint(event: PointerEvent): Point | null {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function interactDown(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest?.('[role="toolbar"]')) return;
    const p = interactPoint(event);
    if (!p) return;
    const hit = [...boxes].reverse().find((b) => insideBox(p, b, 0));
    if (!hit) {
      // Clicking away exits the open editor (stamping first) but the
      // click itself still reaches the page behind.
      if (editor) commitText();
      selectedId = null;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    commitText();
    selectedId = hit.id;
    editor = { id: hit.id, x: hit.x, y: hit.y };
    editorText = hit.text;
  }

  function interactHover(event: PointerEvent) {
    if (!canvas || event.buttons !== 0) {
      hoverId = null;
      return;
    }
    if ((event.target as HTMLElement | null)?.closest?.('[role="toolbar"]')) {
      hoverId = null;
      return;
    }
    const p = interactPoint(event);
    hoverId = p ? ([...boxes].reverse().find((b) => insideBox(p, b, 0))?.id ?? null) : null;
  }

  // In interact mode the page behind receives pointer events, so watch
  // for an answer being submitted and close the pad afterwards.
  $effect(() => {
    if (pageInteraction && open) {
      const close = () => onclose();
      window.addEventListener("submit", close, true);
      window.addEventListener("pointerdown", interactDown, true);
      window.addEventListener("pointermove", interactHover, true);
      return () => {
        window.removeEventListener("submit", close, true);
        window.removeEventListener("pointerdown", interactDown, true);
        window.removeEventListener("pointermove", interactHover, true);
      };
    }
  });

  function finishShape(id: string) {
    const shape = shapes.find((s) => s.id === id);
    if (!shape) return;
    const span =
      shape.kind === "line"
        ? Math.hypot(shape.w, shape.h)
        : shape.kind === "circle"
          ? Math.hypot(shape.w, shape.h)
          : shape.kind === "polygon"
            ? Math.max(Math.abs(shape.w), Math.abs(shape.h))
            : Math.min(Math.abs(shape.w), Math.abs(shape.h));
    const tooSmall = shape.kind === "polygon" ? (shape.points?.length ?? 0) < 3 || span < 2 : span < 2;
    if (tooSmall) {
      shapes = shapes.filter((s) => s.id !== id);
      if (selectedId === id) selectedId = null;
      return;
    }
    selectedId = null;
  }

  function onUp() {
    const shapeDrawn = shapeDraw;
    if (shapeDrawn) finishShape(shapeDrawn.id);
    const finished =
      (drawing && currentStroke) || moveDrag || resizeDrag || shapeHandleDrag || shapeMoveDrag || shapeDrawn;
    drawing = false;
    currentStroke = null;
    moveDrag = null;
    resizeDrag = null;
    shapeDraw = null;
    shapeHandleDrag = null;
    shapeMoveDrag = null;
    eraserPos = null;
    if (finished) snapshot();
  }

  function clearCanvas() {
    strokes = [];
    boxes = [];
    shapes = [];
    selectedId = null;
    hoverId = null;
    editor = null;
    editorText = "";
    snapshot();
    redraw();
  }
</script>

<div
  class="fixed inset-0 z-50 flex flex-col {open ? '' : 'hidden'} {pageInteraction ? 'pointer-events-none' : ''}"
  role="dialog"
  aria-label="Sketch pad"
  aria-hidden={open ? undefined : "true"}
>
  {#if view !== "overlay"}
    <div
      class="absolute inset-0 bg-white dark:bg-black {view === 'grid' ? 'sketch-grid' : ''}"
      aria-hidden="true"
    ></div>
  {/if}
  {#if view === "question" && canShowQuestion}
    <div
      class="{tool === 'interact'
        ? 'pointer-events-auto z-10'
        : 'pointer-events-none'} absolute top-4 left-4 max-h-[45vh] w-[min(30rem,calc(100vw-2rem))] overflow-auto rounded-md border border-border bg-card/90 p-4 shadow-sm"
    >
      <p class="mb-2 text-[0.65rem] font-bold tracking-[0.16em] text-primary uppercase">Question</p>
      <div class="prose prose-stone max-w-none text-sm dark:prose-invert">
        {@html renderMath(question)}
      </div>
      {#if tool === "interact"}
        <form
          class="mt-4 flex flex-col gap-2 border-t border-border pt-3"
          onsubmit={(event) => {
            event.preventDefault();
            submitSketchAnswer();
          }}
        >
          {#if answerType === "number"}
            <NumberAnswer bind:answer={sketchAnswer} />
          {:else if answerType === "text"}
            <TextAnswer bind:answer={sketchAnswer} />
          {:else}
            <ExpressionAnswer bind:answer={sketchAnswer} />
          {/if}
          <Button type="submit" size="sm" class="self-end" disabled={!canSubmitSketch}>Submit</Button>
        </form>
      {/if}
    </div>
  {/if}
  <div class="relative min-h-0 flex-1">
    <canvas
      bind:this={canvas}
      class="absolute inset-0 h-full w-full touch-none {pageInteraction ? 'pointer-events-none' : ''}"
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
    {#if selectedShape && tool === "move"}
      {@const shape = selectedShape}
      {@const handles = shapeHandlePoints(shape)}
      {#if shape.kind === "circle"}
        <svg class="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <line
            x1={shape.x}
            y1={shape.y}
            x2={shape.x + shape.w}
            y2={shape.y + shape.h}
            class="text-primary"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-dasharray="4 4"
          />
        </svg>
      {:else if shape.kind === "ellipse"}
        {@const box = shapeBox(shape)}
        <div
          class="pointer-events-none absolute rounded-sm border-2 border-dashed border-primary"
          style="left: {box.x}px; top: {box.y}px; width: {box.w}px; height: {box.h}px;"
        ></div>
      {/if}
      {#each handles as handle (handle.key)}
        <div
          class="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card shadow"
          style="left: {handle.x}px; top: {handle.y}px;"
        ></div>
      {/each}
    {/if}
    {#if hoverShape && tool === "move" && hoverShape.id !== selectedId}
      {@const shape = hoverShape}
      <svg class="pointer-events-none absolute inset-0 h-full w-full" fill="none" aria-hidden="true">
        {#if shape.kind === "line"}
          <line
            x1={shape.x}
            y1={shape.y}
            x2={shape.x + shape.w}
            y2={shape.y + shape.h}
            class="text-primary/70"
            stroke="currentColor"
            stroke-width="2"
            stroke-dasharray="4 4"
          />
        {:else if shape.kind === "rect"}
          <rect
            x={shape.x}
            y={shape.y}
            width={shape.w}
            height={shape.h}
            class="text-primary/70"
            stroke="currentColor"
            stroke-width="2"
            stroke-dasharray="4 4"
          />
        {:else if shape.kind === "ellipse"}
          <ellipse
            cx={shape.x + shape.w / 2}
            cy={shape.y + shape.h / 2}
            rx={Math.abs(shape.w) / 2}
            ry={Math.abs(shape.h) / 2}
            class="text-primary/70"
            stroke="currentColor"
            stroke-width="2"
            stroke-dasharray="4 4"
          />
        {:else if shape.kind === "circle"}
          <circle
            cx={shape.x}
            cy={shape.y}
            r={Math.hypot(shape.w, shape.h)}
            class="text-primary/70"
            stroke="currentColor"
            stroke-width="2"
            stroke-dasharray="4 4"
          />
        {:else if shape.kind === "polygon"}
          <polygon
            points={(shape.points ?? []).map((point) => `${point.x},${point.y}`).join(" ")}
            class="text-primary/70"
            stroke="currentColor"
            stroke-width="2"
            stroke-dasharray="4 4"
            stroke-linejoin="round"
          />
        {/if}
      </svg>
    {/if}
    {#if hoverBox && hoverBox.id !== selectedId && (tool === "text" || tool === "interact")}
      <div
        class="pointer-events-none absolute"
        style="left: {hoverBox.x}px; top: {hoverBox.y}px; width: {hoverBox.w}px; height: {hoverBox.h}px;"
      >
        <div class="absolute inset-0 rounded-sm border-2 border-dashed border-primary/70"></div>
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
        aria-label="Textbox content"
        class="absolute block resize-none overflow-hidden rounded-sm bg-card p-0 leading-[1.25] shadow-lg outline outline-2 outline-primary/60 pointer-events-auto"
        style="left: {ex}px; top: {ey}px; color: {editorBox
          ? editorBox.color
          : color}; font: 600 {size}px/1.25 ui-sans-serif, system-ui, sans-serif;"
        onkeydown={(e) => {
          if (e.key === "Escape") {
            cancelText();
          }
        }}
      ></textarea>
    {/if}
  </div>
  <div
    class="absolute bottom-4 left-1/2 z-10 flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 border border-border bg-card px-2.5 py-1.5 sm:gap-2 pointer-events-auto"
    role="toolbar"
    aria-label="Sketch tools"
    tabindex={-1}
    onpointerdown={() => {
      if (editor) commitText();
      selectedId = null;
      hoverId = null;
      hoverShapeId = null;
    }}
  >
    <div class="flex items-center gap-0.5">
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-[3px] transition-colors {tool === 'interact'
          ? 'bg-primary text-primary-foreground shadow'
          : 'text-muted-foreground hover:bg-muted'}"
        onclick={() => setTool("interact")}
        aria-pressed={tool === "interact"}
        aria-label="Interact with the page"
        title="Scroll, answer and submit on the page behind the sketch"
      >
        <MousePointer2 class="h-4 w-4" />
      </button>
      <div class="relative">
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-[3px] text-muted-foreground transition-colors hover:bg-muted"
          onclick={toggleView}
          aria-haspopup="true"
          aria-expanded={viewOpen}
          aria-label="View"
          title="View"
        >
          <Eye class="h-4 w-4" />
        </button>
        {#if viewOpen}
          <div
            class="absolute bottom-10 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-border bg-card p-2 shadow"
            role="group"
            aria-label="View options"
          >
            <Button
              variant={view === "overlay" ? "default" : "ghost"}
              size="icon"
              class="size-8"
              onclick={() => chooseView("overlay")}
              aria-label="On top of page"
              aria-pressed={view === "overlay"}
              title="On top of page"
            >
              <Layers2 class="h-4 w-4" />
            </Button>
            <Button
              variant={view === "grid" ? "default" : "ghost"}
              size="icon"
              class="size-8"
              onclick={() => chooseView("grid")}
              aria-label="Dot grid"
              aria-pressed={view === "grid"}
              title="Dot grid background"
            >
              <StickyNote class="h-4 w-4" />
            </Button>
            {#if canShowQuestion}
              <Button
                variant={view === "question" ? "default" : "ghost"}
                size="icon"
                class="size-8"
                onclick={() => chooseView("question")}
                aria-label="Question view"
                aria-pressed={view === "question"}
                title="Question view"
              >
                <FileQuestion class="h-4 w-4" />
              </Button>
            {/if}
          </div>
        {/if}
      </div>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-full transition-colors text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        onclick={undo}
        disabled={historyIndex <= 0}
        aria-label="Undo"
        title="Undo"
      >
        <Undo class="h-4 w-4" />
      </button>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-full transition-colors text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        onclick={redo}
        disabled={historyIndex >= history.length - 1}
        aria-label="Redo"
        title="Redo"
      >
        <Redo class="h-4 w-4" />
      </button>
    </div>
    <div class="relative">
      <button
        type="button"
        class="block h-7 w-7 rounded-full border-2 border-border shadow-inner"
        style="background-color: {color};"
        aria-label="Pen colour, currently {color}"
        aria-haspopup="true"
        aria-expanded={colorOpen}
        onclick={() => {
          colorOpen = !colorOpen;
          shapesOpen = false;
          viewOpen = false;
        }}
      ></button>
      {#if colorOpen}
        <div
          class="absolute bottom-10 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-border bg-card p-2"
          role="group"
          aria-label="Choose pen colour"
        >
          {#each colors as swatch}
            <button
              type="button"
              class="h-6 w-6 shrink-0 rounded-full border-2 {color === swatch ? 'border-primary' : 'border-border'}"
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
    <div class="flex items-center">
      <input
        id="sketch-width"
        type="range"
        min={2}
        max={16}
        step={1}
        bind:value={lineWidth}
        aria-label="Pen size"
        class="h-1 w-16 accent-primary"
      />
    </div>
    <Button
      variant={tool === "pen" ? "default" : "ghost"}
      size="icon"
      class="size-8"
      onclick={() => setTool("pen")}
      aria-label="Pen"
      aria-pressed={tool === "pen"}
      title="Pen"
    >
      <Pen class="h-4 w-4" />
    </Button>
    <Button
      variant={tool === "eraser" ? "default" : "ghost"}
      size="icon"
      class="size-8"
      onclick={() => setTool("eraser")}
      aria-label="Eraser"
      aria-pressed={tool === "eraser"}
      title="Eraser"
    >
      <Eraser class="h-4 w-4" />
    </Button>
    <Button
      variant={tool === "text" ? "default" : "ghost"}
      size="icon"
      class="size-8"
      onclick={() => setTool("text")}
      aria-label="Text"
      aria-pressed={tool === "text"}
      title="Text"
    >
      <Type class="h-4 w-4" />
    </Button>
    <div class="relative">
      <Button
        variant={tool === "shape" || tool === "move" ? "default" : "ghost"}
        size="icon"
        class="size-8"
        onclick={toggleShapes}
        aria-label="Shapes"
        aria-haspopup="true"
        aria-expanded={shapesOpen}
        title="Shapes"
      >
        <Shapes class="h-4 w-4" />
      </Button>
      {#if shapesOpen}
        <div
          class="absolute bottom-10 left-1/2 z-20 flex -translate-x-1/2 flex-col gap-1 rounded-xl border border-border bg-card p-2 shadow"
          role="group"
          aria-label="Shape tools"
        >
          <div class="flex items-center gap-1.5">
            <Button
              variant={regularShapes ? "default" : "ghost"}
              size="icon"
              class="size-8"
              onclick={() => (regularShapes = !regularShapes)}
              aria-label={regularShapes ? "Unlock regular shapes" : "Lock regular shapes"}
              aria-pressed={regularShapes}
              title={regularShapes ? "Regular shapes locked" : "Regular shapes unlocked (freeform)"}
            >
              {#if regularShapes}
                <Lock class="h-4 w-4" />
              {:else}
                <LockOpen class="h-4 w-4" />
              {/if}
            </Button>
            <Button
              variant={tool === "move" ? "default" : "ghost"}
              size="icon"
              class="size-8"
              onclick={chooseMove}
              aria-label="Move"
              aria-pressed={tool === "move"}
              title="Move and adjust shapes"
            >
              <Move class="h-4 w-4" />
            </Button>
            <div class="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden="true"></div>
            <Button
              variant={tool === "shape" && shapeKind === "line" ? "default" : "ghost"}
              size="icon"
              class="size-8"
              onclick={() => chooseShape("line")}
              aria-label="Line"
              aria-pressed={tool === "shape" && shapeKind === "line"}
              title="Line (drag between endpoints)"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <line x1="5" y1="19" x2="19" y2="5" />
              </svg>
            </Button>
            <Button
              variant={tool === "shape" && shapeKind === "ellipse" ? "default" : "ghost"}
              size="icon"
              class="size-8"
              onclick={() => chooseShape("ellipse")}
              aria-label="Ellipse"
              aria-pressed={tool === "shape" && shapeKind === "ellipse"}
              title="Ellipse (drag a box)"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <ellipse cx="12" cy="12" rx="9" ry="6" />
              </svg>
            </Button>
            <Button
              variant={tool === "shape" && shapeKind === "rect" ? "default" : "ghost"}
              size="icon"
              class="size-8"
              onclick={() => chooseShape("rect")}
              aria-label="Rectangle"
              aria-pressed={tool === "shape" && shapeKind === "rect"}
              title="Rectangle (drag a box)"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="4" y="6" width="16" height="12" rx="1" />
              </svg>
            </Button>
            <Button
              variant={tool === "shape" && shapeKind === "circle" ? "default" : "ghost"}
              size="icon"
              class="size-8"
              onclick={() => chooseShape("circle")}
              aria-label="Circle"
              aria-pressed={tool === "shape" && shapeKind === "circle"}
              title="Circle (drag from the centre)"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="7.5" />
              </svg>
            </Button>
            <Button
              variant={tool === "shape" && shapeKind === "polygon" ? "default" : "ghost"}
              size="icon"
              class="size-8"
              onclick={() => chooseShape("polygon")}
              aria-label="Polygon"
              aria-pressed={tool === "shape" && shapeKind === "polygon"}
              title="Polygon (drag from the centre)"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m12.828 4.813 5.344 2.375" />
                <path d="m15.769 18.153 3.461-8.306" />
                <path d="m5.687 14.074 7.625 4.852" />
                <path d="M9.772 5.579 5.228 11.42" />
                <circle cx="11" cy="4" r="2" />
                <circle cx="15" cy="20" r="2" />
                <circle cx="20" cy="8" r="2" />
                <circle cx="4" cy="13" r="2" />
              </svg>
            </Button>
          </div>
          {#if shapeKind === "polygon"}
            <div class="flex items-center justify-center gap-1.5 border-t border-border pt-1">
              <span class="text-[10px] uppercase tracking-wide text-muted-foreground">Sides</span>
              <input
                type="number"
                min={3}
                max={24}
                value={polygonSides}
                oninput={onPolygonSidesInput}
                onchange={onPolygonSidesChange}
                aria-label="Polygon sides"
                title="Number of polygon sides"
                class="h-7 w-12 rounded-[3px] border border-border bg-transparent text-center text-xs"
              />
            </div>
          {/if}
        </div>
      {/if}
    </div>
    <Button variant="ghost" size="icon" class="size-8" onclick={clearCanvas} aria-label="Clear" title="Clear">
      <Trash class="h-4 w-4" />
    </Button>
    <Button
      variant="destructive"
      size="icon"
      class="size-8 rounded-full"
      onclick={doneSketch}
      aria-label="Done"
      title="Done"
    >
      <X class="h-4 w-4" />
    </Button>
  </div>
</div>

<style>
  .sketch-grid {
    background-image: radial-gradient(circle, rgb(0 0 0 / 0.14) 1px, transparent 1px);
    background-size: 20px 20px;
  }

  :global(.dark) .sketch-grid {
    background-image: radial-gradient(circle, rgb(255 255 255 / 0.18) 1px, transparent 1px);
  }
</style>
