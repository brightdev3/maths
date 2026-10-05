import { z } from "zod";
import type { ToastT } from "svelte-sonner";

export const RoomName = z
  .string()
  .min(3, "The room name has to be at least 3 characters long")
  .max(60, "The room name cannot be greater than 60 characters long");

export type State = "connecting" | "choose-name" | "waiting_start" | "started" | "finished" | "kicked";

export interface RoomServerToClientEvents {
  alert: (type: ToastT["type"], message: string) => void;
  lobby: () => void;
  gameStart: (startingTime: number) => void;
  gameFinish: () => void;
  kicked: () => void;
  roomSettings: (settings: RoomSettings) => void;
  gameEndsAt: (endsAt: number | null) => void;
  chatMessage: (message: ChatMessage) => void;
  chatHistory: (messages: ChatMessage[]) => void;
  chatDelete: (id: string) => void;
  joinDenied: (reason: string) => void;
  running: (durationMs: number) => void;
  answerResult: (correct: boolean) => void;
  stopRunning: () => void;
  newQuestion: (
    question: string,
    answerGroups: SolutionType[][],
    requireAllSolutionGroups: boolean,
    solutionOrderMatters: boolean,
    questionNumber: number,
    skippable: boolean
  ) => void;
  confetti: () => void;
  questionCount: (data: number) => void;
  joined: (name: string) => void;
  leaderboard: (data: LeaderboardEntry[]) => void;
}

export interface RoomClientToServerEvents {
  join: (name: string, playerId: string) => void;
  answer: (value: string | number | (string | number)[]) => void;
  skip: () => void;
  visibilityChange: (hidden: boolean) => void;
  sendChat: (text: string) => void;
}

export interface RoomInterServerEvents {}

export interface RoomSocketData {
  playerId: string | null;
  name: string | null;
  currentQuestion: number;
  totalQuestions: number;
  startingTime: number | null;
  finishingTime: number | null;
  isRunning: boolean;
  runningUntil: number | null;
  awaySince: number | null;
  visibilityFlags: number;
  skips: number;
  correctCount: number;
}

export type LogVerbosity = "all" | "submissions" | "finished";

export interface LogEntry {
  timestamp: number;
  playerName: string;
  type: "submitted" | "running" | "correct" | "wrong" | "finished" | "visibility" | "skipped" | "kicked";
  questionNumber: number;
  detail?: string;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  totalMs: number | null;
  questionsCompleted: number;
  totalQuestions: number;
  visibilityFlags: number;
  skips: number;
}

export interface RoomCreateClientToServerEvents {
  newRoom: (
    name: string,
    questions: z.infer<typeof Question>[],
    runningTimeMs: number,
    visibilityTracking: boolean,
    settings: RoomSettings
  ) => void;
  checkRoom: (id: string, callback: (exists: boolean) => void) => void;
}

export interface RoomCreateServerToClientEvents {
  goto: (path: string) => void;
}

export interface RoomCreateInterServerEvents {}

export interface RoomCreateSocketData {}

export interface RoomManageClientToServerEvents {
  start: () => void;
  finish: () => void;
  alertAll: (type: ToastT["type"], message: string) => void;
  kick: (playerId: string) => void;
  updateSettings: (settings: Partial<RoomSettings>) => void;
  setGameTimer: (minutes: number | null) => void;
  sendChat: (text: string) => void;
  deleteChat: (id: string) => void;
}

export interface RoomManageServerToClientEvents {
  alert: (type: ToastT["type"], message: string) => void;
  state: (state: RoomState) => void;
  playerData: (data: RoomSocketData[]) => void;
  logs: (data: LogEntry[]) => void;
  log: (entry: LogEntry) => void;
  leaderboard: (data: LeaderboardEntry[]) => void;
  roomSettings: (settings: RoomSettings) => void;
  gameEndsAt: (endsAt: number | null) => void;
  chatMessage: (message: ChatMessage) => void;
  chatHistory: (messages: ChatMessage[]) => void;
  chatDelete: (id: string) => void;
}

export interface RoomManageInterServerEvents {}

export interface RoomManageSocketData {}

export const SolutionItem = z.union([
  z.object({
    type: z.literal("number"),
    value: z.number(),
    group: z.number().int().min(0).max(99).default(0)
  }),
  z.object({
    type: z.literal("text"),
    value: z.string(),
    group: z.number().int().min(0).max(99).default(0)
  }),
  z.object({
    type: z.literal("expression"),
    value: z.string(),
    group: z.number().int().min(0).max(99).default(0)
  })
]);

export type SolutionType = z.infer<typeof SolutionItem>["type"];

export const Question = z.preprocess(
  (val) => {
    if (val && typeof val === "object" && "type" in val && "data" in val) {
      const q = val as any;
      return {
        contents: q.data.contents || "",
        solutions: q.data.solutions || [],
        allowEquivalent: q.data.allowEquivalent ?? true,
        answerComment: q.data.answerComment || "",
        requireAllSolutionGroups: q.data.requireAllSolutionGroups ?? false,
        solutionOrderMatters: q.data.solutionOrderMatters ?? false,
        skippable: q.data.skippable ?? true
      };
    }
    return val;
  },
  z.object({
    contents: z.string(),
    solutions: z.array(SolutionItem),
    allowEquivalent: z.boolean(),
    answerComment: z.string().max(2000).default(""),
    requireAllSolutionGroups: z.boolean().default(false),
    solutionOrderMatters: z.boolean().default(false),
    skippable: z.boolean().default(true)
  })
);

export const QuestionSet = z.object({
  name: z.string().max(120),
  instructions: z.string(),
  questions: z.array(Question).max(100),
  pdfOptions: z
    .object({
      questionTextSize: z.number().min(6).max(18),
      answerTextSize: z.number().min(6).max(16),
      imageHeight: z.number().min(5).max(35),
      slipHeight: z.number().min(1).max(297),
      cutMargin: z.number().min(0).max(80)
    })
    .default({ questionTextSize: 11, answerTextSize: 11, imageHeight: 30, slipHeight: 49.5, cutMargin: 50 })
});

export type RoomState = "lobby" | "started" | "finished";

export interface RoomSettings {
  allowLateJoin: boolean;
  showLeaderboard: boolean;
  allowCalculator: boolean;
  allowChat: boolean;
  allowSketch: boolean;
  /** Configured game length in ms (from setup). Null means no timer. */
  gameTimerMs: number | null;
  endOnPerfectScore: boolean;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  allowLateJoin: true,
  showLeaderboard: true,
  allowCalculator: true,
  allowChat: false,
  allowSketch: true,
  gameTimerMs: null,
  endOnPerfectScore: false
};

export interface ChatMessage {
  id: string;
  name: string;
  text: string;
  timestamp: number;
}

export interface Room {
  id: string;
  name: string;
  questions: z.infer<typeof Question>[];
  runToken: string;
  state: RoomState;
  runningTimeMs: number;
  visibilityTracking: boolean;
  players: Map<string, RoomSocketData>;
  logs: LogEntry[];
  settings: RoomSettings;
  /** Live deadline timestamp. Null when no timer is running. */
  endsAt: number | null;
  chat: ChatMessage[];
}

export interface ClientKnownRoom {
  id: string;
  playerCount: number;
  name: string;
  questionCount: number;
}
