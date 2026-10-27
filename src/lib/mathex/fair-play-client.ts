import { FAIR_PLAY_WARNING_COOLDOWN_MS, type FairPlaySettings, type FairPlayWarningKind } from "./fair-play";

/** Installed only while actively playing. Question/answer controls leave chat unrestricted. */
export function installFairPlayControls(
  settings: FairPlaySettings,
  report: (kind: FairPlayWarningKind) => void,
  notify: (kind: FairPlayWarningKind) => void
): () => void {
  const removers: (() => void)[] = [];
  // Explicit cleanup also works in older browsers that ignore listener AbortSignals.
  function listen(target: EventTarget, type: string, listener: EventListener) {
    target.addEventListener(type, listener, true);
    removers.push(() => target.removeEventListener(type, listener, true));
  }
  const lastReported = new Map<FairPlayWarningKind, number>();
  let focusTimer: ReturnType<typeof setTimeout> | undefined;

  function warn(kind: FairPlayWarningKind) {
    const now = Date.now();
    const previous = lastReported.get(kind);
    if (previous !== undefined && now - previous < FAIR_PLAY_WARNING_COOLDOWN_MS) return;
    lastReported.set(kind, now);
    report(kind);
    notify(kind);
  }

  function within(event: Event, selector: string): boolean {
    // composedPath also covers answer widgets that use shadow DOM.
    if (typeof event.composedPath === "function") {
      return event.composedPath().some((target) => target instanceof Element && target.matches(selector));
    }
    return event.target instanceof Element && event.target.closest(selector) !== null;
  }

  function questionSelected(): boolean {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed) return false;
    return [...document.querySelectorAll("[data-fair-play-question]")].some((question) =>
      selection.containsNode(question, true)
    );
  }

  function block(event: Event, kind: FairPlayWarningKind) {
    event.preventDefault();
    event.stopImmediatePropagation();
    warn(kind);
  }

  if (settings.blockClipboard) {
    for (const kind of ["copy", "cut"] as const) {
      listen(document, kind, (event) => {
        if (within(event, "[data-fair-play-question]") || questionSelected()) block(event, kind);
      });
    }
    for (const kind of ["paste", "drop"] as const) {
      listen(document, kind, (event) => {
        if (within(event, "[data-fair-play-answers]")) block(event, kind);
      });
    }
    listen(document, "beforeinput", (event) => {
      const input = event as InputEvent;
      if (!within(event, "[data-fair-play-answers]")) return;
      if (input.inputType === "insertFromPaste") block(event, "paste");
      if (input.inputType === "insertFromDrop") block(event, "drop");
    });
  }
  if (settings.protectQuestionContent) {
    listen(document, "contextmenu", (event) => {
      if (within(event, "[data-fair-play-question]")) block(event, "context-menu");
    });
    listen(document, "dragstart", (event) => {
      if (within(event, "[data-fair-play-question]") || questionSelected()) block(event, "drag");
    });
  }
  if (settings.warnOnFocusLoss) {
    listen(window, "blur", () => {
      // A tab switch already produces a visibility flag. Avoid double-reporting it.
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        if (!document.hidden && !document.hasFocus()) warn("focus-loss");
      }, 250);
    });
    listen(window, "focus", () => clearTimeout(focusTimer));
  }

  return () => {
    for (const remove of removers) remove();
    clearTimeout(focusTimer);
  };
}
