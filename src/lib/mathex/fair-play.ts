export interface FairPlaySettings {
  blockClipboard: boolean;
  protectQuestionContent: boolean;
  warnOnFocusLoss: boolean;
}

export const DEFAULT_FAIR_PLAY_SETTINGS: FairPlaySettings = {
  blockClipboard: false,
  protectQuestionContent: false,
  warnOnFocusLoss: false
};

export const FAIR_PLAY_OPTIONS = [
  {
    key: "blockClipboard",
    label: "Restrict question copying and answer pasting",
    description: "Block copying/cutting questions and pasting or dropping answers during play. Chat is unaffected."
  },
  {
    key: "protectQuestionContent",
    label: "Restrict question context menus and dragging",
    description: "Disable question text selection, right-click menus and dragging (including images) during play."
  },
  {
    key: "warnOnFocusLoss",
    label: "Warn when the game window loses focus",
    description:
      "Record focus loss while the tab is still visible. Browser dialogs and other innocent actions may trigger this."
  }
] as const;

export const FAIR_PLAY_LIMITATIONS =
  "These browser controls are deterrents, not a lockdown. They cannot reliably detect extensions or prevent Google Lens, screenshots, developer tools or another device. Warnings are activity signals, not proof of cheating; review them with the player. No automatic penalties apply.";

export const FAIR_PLAY_WARNING_LABELS = {
  copy: "Question copy blocked",
  cut: "Question cut blocked",
  paste: "Answer paste blocked",
  drop: "Answer drop blocked",
  "context-menu": "Question context menu blocked",
  drag: "Question drag blocked",
  "focus-loss": "Game window lost focus"
} as const;

export type FairPlayWarningKind = keyof typeof FAIR_PLAY_WARNING_LABELS;

export interface FairPlayWarningSummary {
  kind: FairPlayWarningKind;
  count: number;
  lastAt: number;
  questionNumber: number;
}

// Stored per player and kind, so reconnecting does not reset the cooldown.
export const FAIR_PLAY_WARNING_COOLDOWN_MS = 5000;

export function isFairPlayWarningEnabled(settings: FairPlaySettings, kind: unknown): kind is FairPlayWarningKind {
  switch (kind) {
    case "copy":
    case "cut":
    case "paste":
    case "drop":
      return settings.blockClipboard === true;
    case "context-menu":
    case "drag":
      return settings.protectQuestionContent === true;
    case "focus-loss":
      return settings.warnOnFocusLoss === true;
    default:
      return false;
  }
}

export function recordFairPlayWarning(
  warnings: FairPlayWarningSummary[],
  kind: FairPlayWarningKind,
  questionNumber: number,
  now: number
): boolean {
  const previous = warnings.find((warning) => warning.kind === kind);
  if (previous) {
    if (now - previous.lastAt < FAIR_PLAY_WARNING_COOLDOWN_MS) return false;
    previous.count++;
    previous.lastAt = now;
    previous.questionNumber = questionNumber;
  } else {
    warnings.push({ kind, count: 1, lastAt: now, questionNumber });
  }
  return true;
}
