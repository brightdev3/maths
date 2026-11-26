import { describe, expect, test } from "bun:test";
import { RoomStore } from "./rooms.server";
import { DEFAULT_ROOM_SETTINGS, type Room, type RoomSocketData } from "./schemas";
import { playerPoints } from "./scoring";

describe("playerPoints", () => {
  test("awards five points per correct answer", () => {
    expect(playerPoints({ questionsCompleted: 4, skips: 0 })).toBe(20);
  });

  test("does not award points for skipped questions", () => {
    expect(playerPoints({ questionsCompleted: 4, skips: 2 })).toBe(10);
    expect(playerPoints({ questionsCompleted: 4, skips: 4 })).toBe(0);
  });

  test("never displays a negative score", () => {
    expect(playerPoints({ questionsCompleted: 0, skips: 0 })).toBe(0);
    expect(playerPoints({ questionsCompleted: 0, skips: 1 })).toBe(0);
  });
});

test("older rooms recover the last score timestamp and correct count from accepted answers", () => {
  const store = new RoomStore(":memory:");
  const player = {
    playerId: "new-player",
    name: "Player",
    currentQuestion: 4,
    totalQuestions: 4,
    startingTime: null,
    finishingTime: null,
    isRunning: false,
    runningUntil: null,
    awaySince: null,
    visibilityFlags: 0,
    skips: 1
  } as RoomSocketData;
  const room: Room = {
    id: "123456",
    name: "Legacy standings",
    questions: [],
    runToken: "secret",
    state: "started",
    runningTimeMs: 1000,
    visibilityTracking: false,
    players: new Map([[player.playerId!, player]]),
    logs: [
      { timestamp: 1000, playerName: "Player", type: "correct", questionNumber: 1 },
      { timestamp: 2000, playerName: "Player", type: "kicked", questionNumber: 2 },
      { timestamp: 3000, playerName: "Player", type: "correct", questionNumber: 1 },
      { timestamp: 4000, playerName: "Player", type: "correct", questionNumber: 2 },
      { timestamp: 5000, playerName: "Player", type: "skipped", questionNumber: 3 },
      { timestamp: 6000, playerName: "Player", type: "wrong", questionNumber: 4 }
    ],
    settings: DEFAULT_ROOM_SETTINGS,
    endsAt: null,
    chat: []
  };

  store.save(room);
  const restored = store.loadRooms().get(room.id)!.players.get(player.playerId!)!;
  expect(restored.correctCount).toBe(2);
  expect(restored.scoreReachedAt).toBe(4000);
});
