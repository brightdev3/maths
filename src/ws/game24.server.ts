import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import type { Namespace, Server, Socket } from "socket.io";

import {
  ConfigureGame24RoomInput,
  CreateGame24RoomInput,
  JoinGame24RoomInput,
  SubmitSolutionInput,
  type Game24ClientToServerEvents,
  type Game24InterServerEvents,
  type Game24JoinResult,
  type Game24OnlineUser,
  type Game24OperationResult,
  type Game24Player,
  type Game24PlayerView,
  type Game24Room,
  type Game24RoomSummary,
  type Game24ServerToClientEvents,
  type Game24Snapshot,
  type Game24SocketData
} from "../lib/game24/schemas";
import { generatePuzzleFor, verifyMoves } from "../lib/game24/engine";

type AnyServer = Server<any, any, any, any>;
type Game24Socket = Socket<
  Game24ClientToServerEvents,
  Game24ServerToClientEvents,
  Game24InterServerEvents,
  Game24SocketData
>;
type OperationAck = ((result: Game24OperationResult) => void) | undefined;
type JoinAck = ((result: Game24JoinResult) => void) | undefined;

const NAMESPACE = "/game24";
/** How long a player has to prove a hit actually solved the puzzle. */
export const HIT_WINDOW_MS = 5_000;
/** Lobby rooms with nobody connected are removed after this long. */
const CLEANUP_DELAY_MS = 30_000;

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32);
  return `${salt.toString("hex")}:${digest.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, digestHex, extra] = stored.split(":");
  if (!saltHex || !digestHex || extra) return false;
  try {
    const expected = Buffer.from(digestHex, "hex");
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return expected.length > 0 && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function newReconnectToken(): string {
  return randomBytes(32).toString("base64url");
}

function reconnectTokensEqual(value: string | undefined, expected: string): boolean {
  if (!value || !expected) return false;
  const actual = Buffer.from(value);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export function registerGame24Server(io: AnyServer): void {
  const rooms = new Map<string, Game24Room>();
  const roundTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const hitTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const reassignTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const autoAdvanceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const online = new Map<string, { playerId: string | null; name: string | null; roomCode: string | null }>();

  const ns: Namespace<
    Game24ClientToServerEvents,
    Game24ServerToClientEvents,
    Game24InterServerEvents,
    Game24SocketData
  > = io.of(NAMESPACE);

  const channel = (code: string) => `room:${code}`;

  function clearRound(code: string) {
    const timer = roundTimers.get(code);
    if (timer) clearTimeout(timer);
    roundTimers.delete(code);
  }
  function clearHit(code: string) {
    const timer = hitTimers.get(code);
    if (timer) clearTimeout(timer);
    hitTimers.delete(code);
  }
  function clearCleanup(code: string) {
    const timer = cleanupTimers.get(code);
    if (timer) clearTimeout(timer);
    cleanupTimers.delete(code);
  }
  function clearReassign(code: string) {
    const timer = reassignTimers.get(code);
    if (timer) clearTimeout(timer);
    reassignTimers.delete(code);
  }
  function clearAuto(code: string) {
    const timer = autoAdvanceTimers.get(code);
    if (timer) clearTimeout(timer);
    autoAdvanceTimers.delete(code);
  }

  function currentRoom(socket: Game24Socket): Game24Room | null {
    return socket.data.roomCode ? (rooms.get(socket.data.roomCode) ?? null) : null;
  }

  function summary(room: Game24Room): Game24RoomSummary {
    const owner = room.players.get(room.ownerId);
    return {
      code: room.code,
      name: room.name,
      format: room.format,
      mode: room.mode,
      difficulty: room.difficulty,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
      locked: room.passwordHash !== null,
      ownerName: owner?.name ?? "—",
      createdAt: room.createdAt
    };
  }

  function lobbySummaries(): Game24RoomSummary[] {
    return [...rooms.values()]
      .filter((room) => room.state === "lobby")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(summary);
  }

  function onlineUsers(): Game24OnlineUser[] {
    return [...online.entries()].map(([socketId, entry]) => ({
      socketId,
      playerId: entry.playerId,
      name: entry.name,
      inRoom: entry.roomCode !== null
    }));
  }

  function broadcastLobby() {
    ns.emit("lobby", lobbySummaries(), onlineUsers());
  }

  function toPlayerView(room: Game24Room, player: Game24Player): Game24PlayerView {
    return {
      id: player.id,
      name: player.name,
      isOwner: player.id === room.ownerId,
      connected: player.connected,
      score: player.score,
      totalTimeMs: player.totalTimeMs,
      roundTimeMs: player.roundTimeMs,
      solvedThisRound: player.solvedThisRound,
      lockedThisRound: player.lockedThisRound,
      failedHits: player.failedHits
    };
  }

  function sortPlayers(room: Game24Room): Game24Player[] {
    const players = [...room.players.values()];
    if (room.mode === "hit") {
      players.sort((a, b) => b.score - a.score || a.failedHits - b.failedHits || a.joinedAt - b.joinedAt);
    } else {
      players.sort((a, b) => a.totalTimeMs - b.totalTimeMs || a.joinedAt - b.joinedAt);
    }
    return players;
  }

  function snapshot(room: Game24Room): Game24Snapshot {
    return {
      code: room.code,
      name: room.name,
      ownerId: room.ownerId,
      format: room.format,
      mode: room.mode,
      difficulty: room.difficulty,
      totalRounds: room.totalRounds,
      round: room.round,
      state: room.state,
      maxPlayers: room.maxPlayers,
      locked: room.passwordHash !== null,
      roundTimeMs: room.roundTimeMs,
      players: sortPlayers(room).map((player) => toPlayerView(room, player)),
      puzzle: room.puzzle ? { numbers: room.puzzle.numbers } : null,
      roundEndsAt: room.roundEndsAt,
      roundComplete: room.state === "playing" && room.puzzle !== null && room.roundEndsAt === null,
      hit: room.hit,
      autoAdvance: room.autoAdvance,
      autoAdvanceSeconds: Math.round(room.autoAdvanceMs / 1000),
      nextRoundAt: room.nextRoundAt,
      serverNow: Date.now()
    };
  }

  function broadcastRoom(room: Game24Room) {
    ns.to(channel(room.code)).emit("room", snapshot(room));
  }

  function deleteRoom(room: Game24Room) {
    clearRound(room.code);
    clearHit(room.code);
    clearCleanup(room.code);
    clearReassign(room.code);
    clearAuto(room.code);
    rooms.delete(room.code);
    ns.to(channel(room.code)).emit("room", null);
    broadcastLobby();
  }

  function scheduleCleanup(room: Game24Room) {
    clearCleanup(room.code);
    cleanupTimers.set(
      room.code,
      setTimeout(() => {
        cleanupTimers.delete(room.code);
        const current = rooms.get(room.code);
        if (!current) return;
        if ([...current.players.values()].some((player) => player.connected)) return;
        deleteRoom(current);
      }, CLEANUP_DELAY_MS)
    );
  }

  function scheduleReassign(room: Game24Room) {
    clearReassign(room.code);
    reassignTimers.set(
      room.code,
      setTimeout(() => {
        reassignTimers.delete(room.code);
        const current = rooms.get(room.code);
        if (!current) return;
        const owner = current.players.get(current.ownerId);
        if (owner && owner.connected) return;
        const next = [...current.players.values()].find((candidate) => candidate.connected);
        if (!next) return;
        current.ownerId = next.id;
        broadcastRoom(current);
        broadcastLobby();
      }, 6_000)
    );
  }

  function enterRoom(socket: Game24Socket, room: Game24Room, playerId: string, name: string) {
    clearCleanup(room.code);
    clearReassign(room.code);
    socket.data.playerId = playerId;
    socket.data.roomCode = room.code;
    const entry = online.get(socket.id);
    if (entry) {
      entry.playerId = playerId;
      entry.name = name;
      entry.roomCode = room.code;
    }
    socket.join(channel(room.code));
    socket.emit("joined", name, room.code);
  }

  function scheduleAutoAdvance(room: Game24Room) {
    clearAuto(room.code);
    room.nextRoundAt = null;
    if (!room.autoAdvance) return;
    room.nextRoundAt = Date.now() + room.autoAdvanceMs;
    autoAdvanceTimers.set(
      room.code,
      setTimeout(() => {
        autoAdvanceTimers.delete(room.code);
        const current = rooms.get(room.code);
        if (!current || current.state !== "playing" || current.roundEndsAt !== null) return;
        if (current.round >= current.totalRounds) {
          finishRoom(current);
        } else {
          current.round += 1;
          beginRound(current);
        }
      }, room.autoAdvanceMs)
    );
  }

  function beginRound(room: Game24Room) {
    clearRound(room.code);
    clearHit(room.code);
    clearAuto(room.code);
    room.nextRoundAt = null;
    room.roundStartedAt = Date.now();
    room.roundEndsAt = room.roundStartedAt + room.roundTimeMs;
    room.hit = null;
    const puzzle = generatePuzzleFor(room.difficulty);
    room.puzzle = { numbers: puzzle.tiles, solution: puzzle.solution };
    for (const player of room.players.values()) {
      player.roundTimeMs = null;
      player.solvedThisRound = false;
      player.lockedThisRound = false;
    }
    roundTimers.set(
      room.code,
      setTimeout(() => {
        const current = rooms.get(room.code);
        if (current) endRound(current);
      }, room.roundTimeMs)
    );
    broadcastRoom(room);
  }

  function startGame(room: Game24Room) {
    room.state = "playing";
    room.round = 1;
    beginRound(room);
    broadcastLobby();
  }

  function endRound(room: Game24Room) {
    if (room.state !== "playing" || room.roundEndsAt === null) return;
    clearRound(room.code);
    clearHit(room.code);
    room.roundEndsAt = null;
    room.hit = null;
    if (room.mode === "time") {
      for (const player of room.players.values()) {
        if (!player.solvedThisRound) player.totalTimeMs += room.roundTimeMs;
      }
    }
    scheduleAutoAdvance(room);
    broadcastRoom(room);
  }

  function finishRoom(room: Game24Room) {
    clearRound(room.code);
    clearHit(room.code);
    clearAuto(room.code);
    room.state = "finished";
    room.roundEndsAt = null;
    room.nextRoundAt = null;
    room.hit = null;
    broadcastRoom(room);
    broadcastLobby();
  }

  function failHit(room: Game24Room, player: Game24Player, message: string) {
    clearHit(room.code);
    room.hit = null;
    player.lockedThisRound = true;
    player.failedHits += 1;
    ns.to(channel(room.code)).emit("alert", "error", message);
    const remaining = [...room.players.values()].filter(
      (candidate) => candidate.connected && !candidate.solvedThisRound && !candidate.lockedThisRound
    );
    if (remaining.length === 0) endRound(room);
    else broadcastRoom(room);
  }

  function hitTimeout(room: Game24Room) {
    const active = room.hit;
    if (!active) return;
    const player = room.players.get(active.playerId);
    if (!player) {
      room.hit = null;
      broadcastRoom(room);
      return;
    }
    failHit(room, player, `${player.name} ran out of time to show a solution`);
  }

  function leaveRoom(room: Game24Room, playerId: string, socket?: Game24Socket) {
    if (!room.players.has(playerId)) return;
    room.players.delete(playerId);
    if (socket) {
      socket.leave(channel(room.code));
      socket.data.roomCode = null;
      const entry = online.get(socket.id);
      if (entry) entry.roomCode = null;
    }
    if (room.ownerId === playerId) room.ownerId = [...room.players.keys()][0] ?? "";
    if (room.players.size === 0) {
      deleteRoom(room);
      return;
    }
    broadcastRoom(room);
    broadcastLobby();
  }

  ns.on("connection", (socket) => {
    socket.data = { playerId: null, roomCode: null };
    online.set(socket.id, { playerId: null, name: null, roomCode: null });
    broadcastLobby();

    const reject = (ack: OperationAck, error: string) => {
      if (typeof ack === "function") ack({ ok: false, error });
    };
    const accept = (ack: OperationAck) => {
      if (typeof ack === "function") ack({ ok: true });
    };

    socket.on("createRoom", (rawInput, ack) => {
      if (typeof ack !== "function") return;
      const input = CreateGame24RoomInput.safeParse(rawInput);
      if (!input.success) return ack?.({ ok: false, error: input.error.issues[0]?.message || "Invalid room settings" });
      if (input.data.visibility === "password" && !input.data.password) {
        return ack?.({ ok: false, error: "Choose a password for this room" });
      }

      let code: string;
      do code = randomInt(1_000_000).toString().padStart(6, "0");
      while (rooms.has(code));

      const now = Date.now();
      const ownerReconnectToken = newReconnectToken();
      const owner: Game24Player = {
        id: input.data.playerId,
        reconnectToken: ownerReconnectToken,
        name: input.data.playerName,
        connected: true,
        totalTimeMs: 0,
        roundTimeMs: null,
        solvedThisRound: false,
        lockedThisRound: false,
        score: 0,
        failedHits: 0,
        joinedAt: now
      };
      const room: Game24Room = {
        code,
        name: input.data.name,
        ownerId: owner.id,
        visibility: input.data.visibility,
        passwordHash: input.data.visibility === "password" ? hashPassword(input.data.password!) : null,
        format: input.data.format,
        mode: input.data.mode,
        difficulty: input.data.difficulty,
        totalRounds: input.data.totalRounds,
        roundTimeMs: input.data.roundTimeMs,
        maxPlayers: input.data.format === "1v1" ? 2 : input.data.maxPlayers,
        state: "lobby",
        round: 0,
        puzzle: null,
        roundStartedAt: null,
        roundEndsAt: null,
        hit: null,
        autoAdvance: input.data.autoAdvance,
        autoAdvanceMs: input.data.autoAdvanceSeconds * 1000,
        nextRoundAt: null,
        players: new Map([[owner.id, owner]]),
        createdAt: now
      };
      rooms.set(code, room);
      enterRoom(socket, room, owner.id, owner.name);
      ack?.({ ok: true, code, reconnectToken: ownerReconnectToken });
      broadcastRoom(room);
      broadcastLobby();
    });

    socket.on("joinRoom", (rawInput, ack) => {
      if (typeof ack !== "function") return;
      const input = JoinGame24RoomInput.safeParse(rawInput);
      if (!input.success) return ack?.({ ok: false, error: "Invalid join request" });
      const room = rooms.get(input.data.code);
      if (!room) return ack?.({ ok: false, error: "That room no longer exists" });

      const existing = room.players.get(input.data.playerId);
      if (existing) {
        if (!reconnectTokensEqual(input.data.reconnectToken, existing.reconnectToken)) {
          return ack?.({ ok: false, error: "That player is already in this room" });
        }
        existing.connected = true;
        enterRoom(socket, room, existing.id, existing.name);
        ack?.({ ok: true, code: room.code, reconnectToken: existing.reconnectToken });
        broadcastRoom(room);
        broadcastLobby();
        return;
      }

      if (room.state !== "lobby") return ack?.({ ok: false, error: "This game has already started" });
      if (room.players.size >= room.maxPlayers) return ack?.({ ok: false, error: "This room is full" });
      if (room.passwordHash && !verifyPassword(input.data.password ?? "", room.passwordHash)) {
        return ack?.({ ok: false, error: "Incorrect password" });
      }
      const duplicate = [...room.players.values()].some(
        (player) => player.name.toLowerCase() === input.data.playerName.toLowerCase()
      );
      if (duplicate) return ack?.({ ok: false, error: "That name is already in use" });

      const playerReconnectToken = newReconnectToken();
      const player: Game24Player = {
        id: input.data.playerId,
        reconnectToken: playerReconnectToken,
        name: input.data.playerName,
        connected: true,
        totalTimeMs: 0,
        roundTimeMs: null,
        solvedThisRound: false,
        lockedThisRound: false,
        score: 0,
        failedHits: 0,
        joinedAt: Date.now()
      };
      room.players.set(player.id, player);
      enterRoom(socket, room, player.id, player.name);
      ack?.({ ok: true, code: room.code, reconnectToken: playerReconnectToken });

      // 1v1 begins the moment an opponent accepts.
      if (room.format === "1v1" && room.players.size >= 2) startGame(room);
      else {
        broadcastRoom(room);
        broadcastLobby();
      }
    });

    socket.on("leaveRoom", (ack) => {
      const room = currentRoom(socket);
      if (room && socket.data.playerId) leaveRoom(room, socket.data.playerId, socket);
      accept(ack);
    });

    socket.on("start", (ack) => {
      const room = currentRoom(socket);
      if (!room || !socket.data.playerId) return reject(ack, "You are not in a room");
      if (room.ownerId !== socket.data.playerId) return reject(ack, "Only the host can start the game");
      if (room.state !== "lobby") return reject(ack, "The game has already started");
      if (room.players.size < 2) return reject(ack, "You need at least 2 players");
      startGame(room);
      accept(ack);
    });

    socket.on("advance", (ack) => {
      const room = currentRoom(socket);
      if (!room || !socket.data.playerId) return reject(ack, "You are not in a room");
      if (room.ownerId !== socket.data.playerId) return reject(ack, "Only the host can continue");
      if (room.state !== "playing") return reject(ack, "No round is in progress");
      clearRound(room.code);
      clearHit(room.code);
      clearAuto(room.code);
      room.nextRoundAt = null;
      room.round += 1;
      if (room.round > room.totalRounds) finishRoom(room);
      else beginRound(room);
      accept(ack);
    });

    socket.on("finish", (ack) => {
      const room = currentRoom(socket);
      if (!room || !socket.data.playerId) return reject(ack, "You are not in a room");
      if (room.ownerId !== socket.data.playerId) return reject(ack, "Only the host can close the room");
      if (room.state === "lobby") {
        ns.to(channel(room.code)).emit("alert", "info", "The host closed this room");
        deleteRoom(room);
      } else {
        finishRoom(room);
      }
      accept(ack);
    });

    socket.on("restart", (ack) => {
      const room = currentRoom(socket);
      if (!room || !socket.data.playerId) return reject(ack, "You are not in a room");
      if (room.ownerId !== socket.data.playerId) return reject(ack, "Only the host can start a new game");
      if (room.state !== "finished") return reject(ack, "The game has not finished");
      for (const player of room.players.values()) {
        player.totalTimeMs = 0;
        player.roundTimeMs = null;
        player.solvedThisRound = false;
        player.lockedThisRound = false;
        player.score = 0;
        player.failedHits = 0;
      }
      clearRound(room.code);
      clearHit(room.code);
      clearAuto(room.code);
      room.state = "lobby";
      room.round = 0;
      room.puzzle = null;
      room.roundStartedAt = null;
      room.roundEndsAt = null;
      room.nextRoundAt = null;
      room.hit = null;
      broadcastRoom(room);
      broadcastLobby();
      accept(ack);
    });

    socket.on("kick", async (playerId, ack) => {
      const room = currentRoom(socket);
      if (!room || !socket.data.playerId) return reject(ack, "You are not in a room");
      if (room.ownerId !== socket.data.playerId) return reject(ack, "Only the host can remove players");
      if (playerId === socket.data.playerId) return reject(ack, "You cannot remove yourself");
      if (!room.players.has(playerId)) return reject(ack, "That player is no longer here");
      leaveRoom(room, playerId);
      for (const playerSocket of await ns.fetchSockets()) {
        if (playerSocket.data.playerId === playerId) {
          playerSocket.emit("kicked");
          playerSocket.leave(channel(room.code));
          playerSocket.data.roomCode = null;
          const entry = online.get(playerSocket.id);
          if (entry) entry.roomCode = null;
        }
      }
      accept(ack);
    });

    socket.on("configure", (rawInput, ack) => {
      const room = currentRoom(socket);
      if (!room || !socket.data.playerId) return reject(ack, "You are not in a room");
      if (room.ownerId !== socket.data.playerId) return reject(ack, "Only the host can change settings");
      if (room.state !== "lobby") return reject(ack, "Settings can only be changed in the lobby");
      const input = ConfigureGame24RoomInput.safeParse(rawInput);
      if (!input.success) return reject(ack, input.error.issues[0]?.message || "Invalid settings");
      if (input.data.name !== undefined) room.name = input.data.name;
      if (input.data.mode !== undefined) room.mode = input.data.mode;
      if (input.data.difficulty !== undefined) room.difficulty = input.data.difficulty;
      if (input.data.totalRounds !== undefined) room.totalRounds = input.data.totalRounds;
      if (input.data.roundTimeMs !== undefined) room.roundTimeMs = input.data.roundTimeMs;
      if (input.data.autoAdvance !== undefined) room.autoAdvance = input.data.autoAdvance;
      if (input.data.autoAdvanceSeconds !== undefined) room.autoAdvanceMs = input.data.autoAdvanceSeconds * 1000;
      if (input.data.maxPlayers !== undefined) {
        if (input.data.maxPlayers < room.players.size) return reject(ack, "More players have already joined");
        room.maxPlayers = room.format === "1v1" ? 2 : input.data.maxPlayers;
      }
      if (input.data.visibility !== undefined) {
        room.visibility = input.data.visibility;
        if (input.data.visibility === "public") {
          room.passwordHash = null;
        } else if (input.data.password) {
          room.passwordHash = hashPassword(input.data.password);
        } else if (!room.passwordHash) {
          return reject(ack, "Choose a password for this room");
        }
      } else if (input.data.password) {
        room.passwordHash = hashPassword(input.data.password);
        room.visibility = "password";
      }
      broadcastRoom(room);
      broadcastLobby();
      accept(ack);
    });

    socket.on("hit", (ack) => {
      const room = currentRoom(socket);
      const player = room && socket.data.playerId ? room.players.get(socket.data.playerId) : null;
      if (!room || !player) return reject(ack, "You are not in a room");
      if (room.state !== "playing" || room.roundEndsAt === null) return reject(ack, "No round is active");
      if (room.mode !== "hit") return reject(ack, "This room is scored on time");
      if (room.hit) return reject(ack, "Someone else hit first");
      if (player.solvedThisRound) return reject(ack, "You already solved this round");
      if (player.lockedThisRound) return reject(ack, "You are out of this round");

      room.hit = { playerId: player.id, deadline: Date.now() + HIT_WINDOW_MS };
      clearHit(room.code);
      hitTimers.set(
        room.code,
        setTimeout(() => {
          const current = rooms.get(room.code);
          if (current) hitTimeout(current);
        }, HIT_WINDOW_MS)
      );
      ns.to(channel(room.code)).emit("alert", "info", `${player.name} hit! They have 5 seconds to solve it.`);
      broadcastRoom(room);
      accept(ack);
    });

    socket.on("submit", (rawInput, ack) => {
      const room = currentRoom(socket);
      const player = room && socket.data.playerId ? room.players.get(socket.data.playerId) : null;
      if (!room || !player) return reject(ack, "You are not in a room");
      if (room.state !== "playing" || room.roundEndsAt === null || !room.puzzle) {
        return reject(ack, "No round is active");
      }
      const input = SubmitSolutionInput.safeParse(rawInput);
      if (!input.success) return reject(ack, "Invalid solution");
      if (input.data.round !== room.round) return reject(ack, "That round has already ended");
      if (room.mode === "time" && player.solvedThisRound) return reject(ack, "You already solved this round");

      if (room.mode === "hit") {
        if (room.hit?.playerId !== player.id) return reject(ack, "Hit first, then show your solution");
        if (Date.now() > room.hit.deadline) {
          failHit(room, player, `${player.name} was too slow`);
          return reject(ack, "Too slow!");
        }
      }

      const valid = verifyMoves(room.puzzle.numbers, input.data.moves);
      if (!valid) {
        if (room.mode === "hit") {
          failHit(room, player, `${player.name}'s solution did not make 24`);
          return reject(ack, "That does not make 24 — you are locked out this round");
        }
        return reject(ack, "That does not make 24");
      }

      const elapsedMs =
        room.roundStartedAt === null ? 0 : Math.min(Math.max(0, Date.now() - room.roundStartedAt), room.roundTimeMs);
      if (room.mode === "time") {
        player.roundTimeMs = elapsedMs;
        player.solvedThisRound = true;
        player.totalTimeMs += player.roundTimeMs;
        const contenders = [...room.players.values()].filter((candidate) => candidate.connected);
        if (contenders.length > 0 && contenders.every((candidate) => candidate.solvedThisRound)) endRound(room);
        else broadcastRoom(room);
      } else {
        player.solvedThisRound = true;
        player.score += 1;
        player.roundTimeMs = Math.min(elapsedMs, HIT_WINDOW_MS);
        endRound(room);
      }
      accept(ack);
    });

    socket.on("disconnect", () => {
      online.delete(socket.id);
      const room = currentRoom(socket);
      const playerId = socket.data.playerId;
      if (!room || !playerId) {
        broadcastLobby();
        return;
      }
      const player = room.players.get(playerId);
      if (!player) {
        broadcastLobby();
        return;
      }
      player.connected = false;
      if (room.state === "lobby") {
        // A quick refresh or a lobby-to-room navigation disconnects and
        // reconnects almost immediately, so defer handing over host rights.
        if (room.ownerId === playerId) scheduleReassign(room);
        if ([...room.players.values()].every((candidate) => !candidate.connected)) scheduleCleanup(room);
      }
      broadcastRoom(room);
      broadcastLobby();
    });
  });
}
