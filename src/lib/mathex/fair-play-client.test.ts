import { expect, test } from "bun:test";
import { installFairPlayControls } from "./fair-play-client";
import { DEFAULT_FAIR_PLAY_SETTINGS } from "./fair-play";

test("clipboard and content restrictions are scoped and removed when play ends", () => {
  class TestElement {
    constructor(private selector: string) {}
    matches(selector: string) {
      return this.selector === selector;
    }
  }
  const question = new TestElement("[data-fair-play-question]");
  const answer = new TestElement("[data-fair-play-answers]");
  const chat = new TestElement("[data-chat]");
  let selectionIncludesQuestion = false;
  const fakeDocument = Object.assign(new EventTarget(), {
    getSelection: () => ({
      isCollapsed: !selectionIncludesQuestion,
      containsNode: (node: unknown) => selectionIncludesQuestion && node === question
    }),
    querySelectorAll: () => [question]
  });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ document: fakeDocument, Element: TestElement })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  const reported: string[] = [];
  let cleanup = () => {};
  const fire = (type: string, target: TestElement, inputType?: string) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, {
      composedPath: { value: () => [target] },
      inputType: { value: inputType }
    });
    fakeDocument.dispatchEvent(event);
    return event.defaultPrevented;
  };
  try {
    cleanup = installFairPlayControls(
      DEFAULT_FAIR_PLAY_SETTINGS,
      (kind) => reported.push(kind),
      () => {}
    );
    expect(fire("copy", question)).toBe(false);
    expect(fire("paste", answer)).toBe(false);
    expect(reported).toEqual([]);
    cleanup();
    cleanup = installFairPlayControls(
      { ...DEFAULT_FAIR_PLAY_SETTINGS, blockClipboard: true, protectQuestionContent: true },
      (kind) => reported.push(kind),
      () => {}
    );
    expect(fire("copy", question)).toBe(true);
    expect(fire("copy", question)).toBe(true); // still blocked, but only one warning
    expect(fire("cut", question)).toBe(true);
    expect(fire("paste", answer)).toBe(true);
    expect(fire("drop", answer)).toBe(true);
    expect(fire("beforeinput", answer, "insertFromPaste")).toBe(true);
    expect(fire("beforeinput", answer, "insertText")).toBe(false);
    expect(fire("contextmenu", question)).toBe(true);
    expect(fire("dragstart", question)).toBe(true);
    expect(fire("copy", answer)).toBe(false);
    expect(fire("contextmenu", answer)).toBe(false);
    expect(fire("paste", chat)).toBe(false);
    expect(fire("contextmenu", chat)).toBe(false);
    expect(reported).toEqual(["copy", "cut", "paste", "drop", "context-menu", "drag"]);
    // Keyboard copy can target the document/body instead of the selected question.
    selectionIncludesQuestion = true;
    expect(fire("copy", chat)).toBe(true);
    cleanup();
    expect(fire("copy", question)).toBe(false);
    expect(fire("paste", answer)).toBe(false);
    expect(fire("contextmenu", question)).toBe(false);
  } finally {
    cleanup();
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("focus warnings ignore hidden tabs, restored focus and end-of-game cleanup", async () => {
  const fakeWindow = new EventTarget();
  let focused = false;
  const fakeDocument = { hidden: false, hasFocus: () => focused };
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: fakeWindow, document: fakeDocument })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  const reported: string[] = [];
  const cleanup = installFairPlayControls(
    { ...DEFAULT_FAIR_PLAY_SETTINGS, warnOnFocusLoss: true },
    (kind) => reported.push(kind),
    () => {}
  );
  const waitForFocusCheck = () => new Promise((resolve) => setTimeout(resolve, 300));
  try {
    fakeDocument.hidden = true;
    fakeWindow.dispatchEvent(new Event("blur"));
    await waitForFocusCheck();
    expect(reported).toEqual([]);

    fakeDocument.hidden = false;
    fakeWindow.dispatchEvent(new Event("blur"));
    focused = true;
    fakeWindow.dispatchEvent(new Event("focus"));
    await waitForFocusCheck();
    expect(reported).toEqual([]);

    focused = false;
    fakeWindow.dispatchEvent(new Event("blur"));
    await waitForFocusCheck();
    expect(reported).toEqual(["focus-loss"]);

    fakeWindow.dispatchEvent(new Event("blur"));
    cleanup();
    await waitForFocusCheck();
    expect(reported).toEqual(["focus-loss"]);
  } finally {
    cleanup();
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
