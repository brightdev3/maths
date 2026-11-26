import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";

import type { Room, RoomSocketData } from "./schemas";
import { DEFAULT_ROOM_SETTINGS } from "./schemas";

type Score = Pick<RoomSocketData, "correctCount" | "scoreReachedAt">;
type StoredPlayer = Omit<RoomSocketData, keyof Score> & Partial<Score>;
type StoredRoom = Omit<Room, "players"> & { players: [string, StoredPlayer][] };

export class RoomStore {
  private database: Database;

  constructor(path = process.env.MATHEX_DB_PATH || "data/mathex.sqlite") {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new Database(path, { create: true });
    this.database.run(`
      CREATE TABLE IF NOT EXISTS mathex_rooms (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  loadRooms(): Map<string, Room> {
    const rooms = new Map<string, Room>();
    const rows = this.database.query<{ id: string; data: string }, []>("SELECT id, data FROM mathex_rooms").all();
    for (const row of rows) {
      try {
        const stored = JSON.parse(row.data) as StoredRoom;
        // Recover score data for older rooms from the log of accepted answers.
        const scoresByName = new Map<string, Score>();
        for (const { type, playerName, timestamp } of stored.logs) {
          if (type === "kicked") scoresByName.delete(playerName);
          if (type === "correct") {
            const correctCount = (scoresByName.get(playerName)?.correctCount ?? 0) + 1;
            scoresByName.set(playerName, { correctCount, scoreReachedAt: timestamp });
          }
        }
        const players = new Map<string, RoomSocketData>();
        for (const [id, player] of stored.players) {
          const loggedScore = scoresByName.get(player.name ?? "");
          const correctCount = player.correctCount ?? loggedScore?.correctCount ?? 0;
          players.set(id, {
            ...player,
            correctCount,
            scoreReachedAt: correctCount > 0 ? (player.scoreReachedAt ?? loggedScore?.scoreReachedAt ?? null) : null,
            // Pending answer timers cannot survive a restart.
            isRunning: false,
            runningUntil: null
          });
        }
        rooms.set(row.id, {
          ...stored,
          players,
          // Rooms saved before game options existed get sensible defaults.
          settings: { ...DEFAULT_ROOM_SETTINGS, ...(stored.settings ?? {}) },
          endsAt: null,
          chat: Array.isArray(stored.chat) ? stored.chat : []
        });
      } catch {
        // Keep a corrupt historical row from preventing active rooms from loading.
      }
    }
    return rooms;
  }

  save(room: Room) {
    const stored: StoredRoom = { ...room, players: [...room.players.entries()] };
    this.database
      .query("INSERT OR REPLACE INTO mathex_rooms (id, data, updated_at) VALUES (?, ?, ?)")
      .run(room.id, JSON.stringify(stored), Date.now());
  }
}
