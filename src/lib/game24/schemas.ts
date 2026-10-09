import { z } from "zod";
import type { ToastT } from "svelte-sonner";
import type { Difficulty } from "./engine";

export const Game24Mode = z.enum(["time", "hit"]);
export type Game24Mode = z.infer<typeof Game24Mode>;

export const Game24Format = z.enum(["1v1", "multi"]);
export type Game24Format = z.infer<typeof Game24Format>;

export const Game24Visibility = z.enum(["public", "password"]);
export type Game24Visibility = z.infer<typeof Game24Visibility>;

export const Game24Difficulty = z.enum(["easy", "normal", "hard"]);

export const Game24Code = z.string().regex(/^\d{6}$/);
export const PlayerName = z.string().trim().min(1).max(20);
export const PlayerId = z.string().trim().min(1).max(128);
export const RoomName = z.string().trim().min(1).max(60);
export const RoomPassword = z.string().min(3).max(60);
export const TotalRounds = z.number().int().min(1).max(50);
export const RoundTimeMs = z
  .number()
  .int()
  .min(5_000)
  .max(30 * 60 * 1_000);
export const MaxPlayers = z.number().int().min(2).max(16);

export const CreateGame24RoomInput = z.object({
  playerId: PlayerId,
  playerName: PlayerName,
  name: RoomName,
  format: Game24Format,
  visibility: Game24Visibility.default("public"),
  password: RoomPassword.optional(),
  mode: Game24Mode,
  difficulty: Game24Difficulty,
  totalRounds: TotalRounds,
  roundTimeMs: RoundTimeMs,
  maxPlayers: MaxPlayers.default(2),
  autoAdvance: z.boolean().default(true),
  autoAdvanceSeconds: z.number().int().min(5).max(60).default(10)
});
export type CreateGame24RoomInput = z.infer<typeof CreateGame24RoomInput>;

export const JoinGame24RoomInput = z.object({
  code: Game24Code,
  playerId: PlayerId,
  playerName: PlayerName,
  password: z.string().max(60).optional()
});
export type JoinGame24RoomInput = z.infer<typeof JoinGame24RoomInput>;

export const ConfigureGame24RoomInput = z.object({
  name: RoomName.optional(),
  mode: Game24Mode.optional(),
  difficulty: Game24Difficulty.optional(),
  totalRounds: TotalRounds.optional(),
  roundTimeMs: RoundTimeMs.optional(),
  maxPlayers: MaxPlayers.optional(),
  visibility: Game24Visibility.optional(),
  password: RoomPassword.optional(),
  autoAdvance: z.boolean().optional(),
  autoAdvanceSeconds: z.number().int().min(5).max(60).optional()
});
export type ConfigureGame24RoomInput = z.infer<typeof ConfigureGame24RoomInput>;

export const FractionSchema = z.object({
  n: z.number().int(),
  d: z.number().int().refine((value) => value !== 0, "Denominator cannot be zero")
});

export const MoveSchema = z.object({
  a: FractionSchema,
  b: FractionSchema,
  op: z.enum(["+", "-", "*", "/"])
});

export const SubmitSolutionInput = z.object({
  round: z.number().int().min(1).max(50),
  moves: z.array(MoveSchema).min(1).max(10),
  expression: z.string().max(500).default(""),
  elapsedMs: z.number().min(0).max(30 * 60 * 1_000).default(0)
});
export type SubmitSolutionInput = z.infer<typeof SubmitSolutionInput>;

export type Game24OperationResult = { ok: true } | { ok: false; error: string };
export type Game24JoinResult = { ok: true; code: string } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Room model (server side)
// ---------------------------------------------------------------------------

export type Game24RoomState = "lobby" | "playing" | "finished";

export interface Game24Player {
  id: string;
  name: string;
  connected: boolean;
  /** Cumulative time in time mode, including a penalty for unsolved rounds. */
  totalTimeMs: number;
  /** Time reported for the current round (time mode), null until solved. */
  roundTimeMs: number | null;
  solvedThisRound: boolean;
  /** Hit mode: locked out of the current round after a failed hit. */
  lockedThisRound: boolean;
  /** Hit mode: rounds won. */
  score: number;
  /** Hit mode: failed hits. */
  failedHits: number;
  joinedAt: number;
}

export interface Game24RoundPuzzle {
  numbers: number[];
  solution: string | null;
}

export interface Game24Room {
  code: string;
  name: string;
  ownerId: string;
  visibility: Game24Visibility;
  passwordHash: string | null;
  format: Game24Format;
  mode: Game24Mode;
  difficulty: Difficulty;
  totalRounds: number;
  roundTimeMs: number;
  maxPlayers: number;
  state: Game24RoomState;
  /** 0 while in the lobby, otherwise the 1-based round number. */
  round: number;
  puzzle: Game24RoundPuzzle | null;
  roundStartedAt: number | null;
  /** Deadline for the current round, null when the round is not active. */
  roundEndsAt: number | null;
  /** Hit mode: who currently holds the buzz, and their deadline. */
  hit: { playerId: string; deadline: number } | null;
  /** Automatically start the next round once a round ends. */
  autoAdvance: boolean;
  autoAdvanceMs: number;
  /** When the next round starts automatically, null when not scheduled. */
  nextRoundAt: number | null;
  players: Map<string, Game24Player>;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Snapshots sent to clients
// ---------------------------------------------------------------------------

/** A joinable room as shown in the lobby. */
export interface Game24RoomSummary {
  code: string;
  name: string;
  format: Game24Format;
  mode: Game24Mode;
  difficulty: Difficulty;
  playerCount: number;
  maxPlayers: number;
  locked: boolean;
  ownerName: string;
  createdAt: number;
}

/** Someone connected to the game server, shown in the lobby sidebar. */
export interface Game24OnlineUser {
  socketId: string;
  playerId: string | null;
  name: string | null;
  inRoom: boolean;
}

export interface Game24PlayerView {
  id: string;
  name: string;
  isOwner: boolean;
  connected: boolean;
  score: number;
  totalTimeMs: number;
  roundTimeMs: number | null;
  solvedThisRound: boolean;
  lockedThisRound: boolean;
  failedHits: number;
}

export interface Game24Snapshot {
  code: string;
  name: string;
  ownerId: string;
  format: Game24Format;
  mode: Game24Mode;
  difficulty: Difficulty;
  totalRounds: number;
  round: number;
  state: Game24RoomState;
  maxPlayers: number;
  locked: boolean;
  roundTimeMs: number;
  players: Game24PlayerView[];
  puzzle: { numbers: number[] } | null;
  roundEndsAt: number | null;
  roundComplete: boolean;
  hit: { playerId: string; deadline: number } | null;
  autoAdvance: boolean;
  autoAdvanceSeconds: number;
  nextRoundAt: number | null;
  serverNow: number;
}

// ---------------------------------------------------------------------------
// Socket event contracts
// ---------------------------------------------------------------------------

export interface Game24ClientToServerEvents {
  createRoom: (input: unknown, callback?: (result: Game24JoinResult) => void) => void;
  joinRoom: (input: unknown, callback?: (result: Game24JoinResult) => void) => void;
  leaveRoom: (callback?: (result: Game24OperationResult) => void) => void;
  start: (callback?: (result: Game24OperationResult) => void) => void;
  advance: (callback?: (result: Game24OperationResult) => void) => void;
  finish: (callback?: (result: Game24OperationResult) => void) => void;
  restart: (callback?: (result: Game24OperationResult) => void) => void;
  kick: (playerId: string, callback?: (result: Game24OperationResult) => void) => void;
  configure: (input: unknown, callback?: (result: Game24OperationResult) => void) => void;
  hit: (callback?: (result: Game24OperationResult) => void) => void;
  submit: (input: unknown, callback?: (result: Game24OperationResult) => void) => void;
}

export interface Game24ServerToClientEvents {
  lobby: (rooms: Game24RoomSummary[], online: Game24OnlineUser[]) => void;
  room: (snapshot: Game24Snapshot | null) => void;
  alert: (type: ToastT["type"], message: string) => void;
  joined: (name: string, code: string) => void;
  kicked: () => void;
}

export interface Game24InterServerEvents {}
export interface Game24SocketData {
  playerId: string | null;
  roomCode: string | null;
}