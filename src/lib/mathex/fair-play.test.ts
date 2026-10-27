import { describe, expect, test } from "bun:test";
import {
  DEFAULT_FAIR_PLAY_SETTINGS,
  FAIR_PLAY_WARNING_LABELS,
  isFairPlayWarningEnabled,
  recordFairPlayWarning,
  type FairPlayWarningSummary
} from "./fair-play";
import { DEFAULT_ROOM_SETTINGS, type Room } from "./schemas";
import { RoomStore } from "./rooms.server";

describe("fair play warnings", () => {
  test("controls are opt-in and unknown event kinds are rejected", () => {
    for (const kind of Object.keys(FAIR_PLAY_WARNING_LABELS)) {
      expect(isFairPlayWarningEnabled(DEFAULT_ROOM_SETTINGS, kind)).toBe(false);
    }
    const enabled = { blockClipboard: true, protectQuestionContent: true, warnOnFocusLoss: true };
    for (const value of ["extension", "__proto__", "constructor", "", null, {}, 1]) {
      expect(isFairPlayWarningEnabled(enabled, value)).toBe(false);
    }
  });

  test("each event requires its own host-selected control", () => {
    const clipboard = { ...DEFAULT_FAIR_PLAY_SETTINGS, blockClipboard: true };
    for (const kind of ["copy", "cut", "paste", "drop"]) expect(isFairPlayWarningEnabled(clipboard, kind)).toBe(true);
    expect(isFairPlayWarningEnabled(clipboard, "context-menu")).toBe(false);
    expect(isFairPlayWarningEnabled(clipboard, "focus-loss")).toBe(false);
    const content = { ...DEFAULT_FAIR_PLAY_SETTINGS, protectQuestionContent: true };
    expect(isFairPlayWarningEnabled(content, "context-menu")).toBe(true);
    expect(isFairPlayWarningEnabled(content, "drag")).toBe(true);
    expect(isFairPlayWarningEnabled(content, "paste")).toBe(false);
    expect(isFairPlayWarningEnabled({ ...DEFAULT_FAIR_PLAY_SETTINGS, warnOnFocusLoss: true }, "focus-loss")).toBe(true);
  });

  test("repeated events are grouped without losing the latest question or timestamp", () => {
    const warnings: FairPlayWarningSummary[] = [];
    expect(recordFairPlayWarning(warnings, "copy", 1, 10000)).toBe(true);
    expect(recordFairPlayWarning(warnings, "copy", 2, 14999)).toBe(false);
    expect(warnings[0]).toEqual({ kind: "copy", count: 1, lastAt: 10000, questionNumber: 1 });
    expect(recordFairPlayWarning(warnings, "copy", 2, 15000)).toBe(true);
    expect(warnings[0]).toEqual({ kind: "copy", count: 2, lastAt: 15000, questionNumber: 2 });
    expect(recordFairPlayWarning(warnings, "paste", 2, 15001)).toBe(true);
    expect(warnings).toHaveLength(2);
  });

  test("room settings and warning summaries survive saving and loading", () => {
    const store = new RoomStore(":memory:");
    const player = {
      playerId: "player",
      name: "Player",
      currentQuestion: 2,
      totalQuestions: 3,
      startingTime: 1,
      finishingTime: null,
      isRunning: false,
      runningUntil: null,
      awaySince: null,
      visibilityFlags: 0,
      skips: 0,
      correctCount: 1,
      fairPlayWarnings: [{ kind: "copy" as const, count: 2, lastAt: 20000, questionNumber: 2 }]
    };
    const room: Room = {
      id: "123456",
      name: "Test room",
      questions: [],
      runToken: "secret",
      state: "started",
      runningTimeMs: 1000,
      visibilityTracking: false,
      players: new Map([["player", player]]),
      logs: [],
      settings: { ...DEFAULT_ROOM_SETTINGS, blockClipboard: true },
      endsAt: null,
      chat: []
    };
    store.save(room);
    const restored = store.loadRooms().get(room.id)!;
    expect(restored.settings.blockClipboard).toBe(true);
    expect(restored.settings.protectQuestionContent).toBe(false);
    expect(restored.players.get("player")?.fairPlayWarnings).toEqual(player.fairPlayWarnings);
    // Legacy rooms missing both settings and summaries still load safely.
    delete (room.settings as Partial<typeof room.settings>).blockClipboard;
    delete (player as Partial<typeof player>).fairPlayWarnings;
    store.save(room);
    expect(store.loadRooms().get(room.id)?.settings.blockClipboard).toBe(false);
    expect(store.loadRooms().get(room.id)?.players.get("player")?.fairPlayWarnings).toBeUndefined();
  });
});
